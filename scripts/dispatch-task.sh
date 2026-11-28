#!/usr/bin/env bash
# scripts/dispatch-task.sh - Interactive Task Dispatcher
#
# Lists actionable tasks from state/<scope>/tasks.json, lets the user pick one,
# chooses a role (dev/qa/review), then runs a mimo-safe agent with the task +
# role playbook injected as the prompt. On agent exit, prompts for a status
# update and performs the lease handoff (acquire -> mutate -> commit -> push).
#
# Usage:
#   ./scripts/dispatch-task.sh [--scope sima|hr|omr|pm] [--role dev|qa|review]
#                              [--agent build|general] [--no-inject]
#
# Requirements: jq, git, fzf (optional), mimo + mimo-safe on PATH.
# Node.js is NOT required.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LEASE_TTL_SECONDS="${LEASE_TTL_SECONDS:-120}"
COORDINATION_BRANCH="${COORDINATION_BRANCH:-master}"
MAX_RETRIES=10
BACKOFF_BASE_SECONDS=2
BACKOFF_MAX_SECONDS=30

# Identity: prefer YOUR_ID env, then YOUR_ID file, then a generated id.
YOUR_ID="${YOUR_ID:-}"
if [ -z "$YOUR_ID" ] && [ -f "$REPO_ROOT/YOUR_ID" ]; then
  YOUR_ID="$(cat "$REPO_ROOT/YOUR_ID")"
fi
if [ -z "$YOUR_ID" ]; then
  YOUR_ID="dispatch-$(whoami)-$(hostname)-$$"
fi

# Agent runtime: mimo-safe wrapper (memory-limited) by default.
AGENT_RUNNER="${AGENT_RUNNER:-mimo-safe mimo run}"

# Colors (disabled when not a TTY)
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_CYAN=''
fi

log()  { printf '%s\n' "$*"; }
info() { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()   { printf '%s[ok]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf '%s[err]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Scope resolution (mirrors state/runner_workflow.js getStatePaths)
# ---------------------------------------------------------------------------
scope_to_partition() {
  case "$1" in
    sima) echo "sima" ;;
    hr)   echo "candash" ;;
    omr)  echo "shared" ;;
    pm)   echo "processmaker" ;;
    *)    echo "" ;;
  esac
}

# Echoes: <tasksFile> <leasesFile> <teamLogFile>
get_state_paths() {
  local scope="$1"
  local part
  part="$(scope_to_partition "$scope")"
  [ -z "$part" ] && { echo ""; return 1; }
  echo "state/$part/tasks.json state/$part/leases.json state/$part/team_log.md"
}

# Task ID namespace pattern for a scope (used for dependency validation)
scope_id_pattern() {
  case "$1" in
    sima) echo '^TASK-[0-9]{3}$' ;;
    hr)   echo '^TASK-HR-[0-9]{3}$' ;;
    omr)  echo '^TASK-OMR-[0-9]{3}$' ;;
    pm)   echo '^TASK-PM-[0-9]{3}$' ;;
    *)    echo '' ;;
  esac
}

# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------
git_quiet() { git -C "$REPO_ROOT" "$@" >/dev/null 2>&1; }

git_sync() {
  # Stash any local changes so rebase can proceed; restore after.
  local stashed=0
  if ! git -C "$REPO_ROOT" diff --quiet 2>/dev/null || ! git -C "$REPO_ROOT" diff --cached --quiet 2>/dev/null; then
    git -C "$REPO_ROOT" stash push -u -m "dispatch-autostash-$$" >/dev/null 2>&1 && stashed=1 || true
  fi
  git -C "$REPO_ROOT" fetch origin >/dev/null 2>&1 || true
  git -C "$REPO_ROOT" checkout "$COORDINATION_BRANCH" >/dev/null 2>&1 || true
  git -C "$REPO_ROOT" pull --rebase origin "$COORDINATION_BRANCH" >/dev/null 2>&1 || true
  if [ "$stashed" -eq 1 ]; then
    git -C "$REPO_ROOT" stash pop >/dev/null 2>&1 || warn "Could not restore stashed changes (stash dispatch-autostash-$$)."
  fi
}

# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------
read_json() { cat "$1" 2>/dev/null || echo '{"version":1,"leases":[]}'; }

# Append a line to the append-only team log.
team_log_append() {
  local scope="$1"; shift
  local paths; paths="$(get_state_paths "$scope")"
  local teamlog; teamlog="$(echo "$paths" | awk '{print $3}')"
  mkdir -p "$(dirname "$teamlog")"
  printf '%s\n' "$*" >> "$teamlog"
}

# ---------------------------------------------------------------------------
# Lease subroutines (ported from AGENTS.md)
# ---------------------------------------------------------------------------
lease_resource() {
  local scope="$1"
  local part; part="$(scope_to_partition "$scope")"
  if [ -z "$part" ]; then echo "tasks.json"; else echo "$part/tasks.json"; fi
}

# acquire_lease <scope>  -> 0 on success, 1 on max retries
acquire_lease() {
  local scope="$1"
  local paths; paths="$(get_state_paths "$scope")" || { err "bad scope: $scope"; return 1; }
  local leases_file teamlog
  leases_file="$(echo "$paths" | awk '{print $2}')"
  teamlog="$(echo "$paths" | awk '{print $3}')"
  local resource; resource="$(lease_resource "$scope")"

  local attempt delay now_iso expires_iso existing holder existing_expires
  for attempt in $(seq 0 $((MAX_RETRIES - 1))); do
    git_sync

    if [ ! -f "$leases_file" ]; then
      mkdir -p "$(dirname "$leases_file")"
      echo '{"version":1,"leases":[]}' > "$leases_file"
    fi

    existing="$(jq -c --arg r "$resource" '.leases[] | select(.resource==$r)' "$leases_file" 2>/dev/null | head -1 || true)"

    if [ -n "$existing" ]; then
      holder="$(echo "$existing" | jq -r '.holder')"
      existing_expires="$(echo "$existing" | jq -r '.expires_at')"
      local now_epoch exp_epoch
      now_epoch="$(date -u +%s)"
      exp_epoch="$(date -u -d "$existing_expires" +%s 2>/dev/null || echo 0)"

      if [ "$exp_epoch" -lt "$now_epoch" ]; then
        warn "Zombie lease of $holder expired; force-breaking."
        team_log_append "$scope" "[FORCE-BREAK] Zombie lease of $holder expired. Broken by $YOUR_ID."
        jq --arg r "$resource" 'del(.leases[] | select(.resource==$r))' "$leases_file" > "$leases_file.tmp" && mv "$leases_file.tmp" "$leases_file"
        existing=""
      elif [ "$holder" = "$YOUR_ID" ]; then
        existing=""  # renew below
      else
        warn "Lease held by $holder (expires $existing_expires); waiting..."
        delay=$(( BACKOFF_BASE_SECONDS * (2 ** attempt) ))
        [ "$delay" -gt "$BACKOFF_MAX_SECONDS" ] && delay=$BACKOFF_MAX_SECONDS
        sleep "$delay"
        continue
      fi
    fi

    now_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    expires_iso="$(date -u -d "+${LEASE_TTL_SECONDS} seconds" +"%Y-%m-%dT%H:%M:%SZ")"
    local lease_id
    lease_id="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "$(date +%s%N)-$RANDOM")"

    jq --arg r "$resource" --arg h "$YOUR_ID" --arg id "$lease_id" --arg a "$now_iso" --arg e "$expires_iso" \
      'del(.leases[] | select(.resource==$r)) | .leases += [{resource:$r, holder:$h, lease_id:$id, acquired_at:$a, expires_at:$e}]' \
      "$leases_file" > "$leases_file.tmp" && mv "$leases_file.tmp" "$leases_file"

    git -C "$REPO_ROOT" add "$leases_file" "$teamlog" 2>/dev/null || true
    git -C "$REPO_ROOT" commit -m "chore(lock): acquire $resource lease by $YOUR_ID" >/dev/null 2>&1 || true
    if git -C "$REPO_ROOT" push origin "$COORDINATION_BRANCH" >/dev/null 2>&1; then
      ok "Lease acquired for $resource"
      return 0
    fi
    warn "Push rejected; rebasing and retrying..."
    git -C "$REPO_ROOT" pull --rebase origin "$COORDINATION_BRANCH" >/dev/null 2>&1 || true
  done
  err "Max retries exceeded acquiring lease"
  return 1
}

# release_lease <scope>
release_lease() {
  local scope="$1"
  local paths; paths="$(get_state_paths "$scope")" || return 1
  local leases_file; leases_file="$(echo "$paths" | awk '{print $2}')"
  local resource; resource="$(lease_resource "$scope")"
  local attempt
  for attempt in $(seq 0 4); do
    git_sync
    if [ -f "$leases_file" ]; then
      jq --arg r "$resource" --arg h "$YOUR_ID" \
        'del(.leases[] | select(.resource==$r and .holder==$h))' \
        "$leases_file" > "$leases_file.tmp" && mv "$leases_file.tmp" "$leases_file"
      git -C "$REPO_ROOT" add "$leases_file" 2>/dev/null || true
      git -C "$REPO_ROOT" commit -m "chore(lock): release $resource lease by $YOUR_ID" >/dev/null 2>&1 || true
      if git -C "$REPO_ROOT" push origin "$COORDINATION_BRANCH" >/dev/null 2>&1; then
        ok "Lease released for $resource"
        return 0
      fi
      git -C "$REPO_ROOT" pull --rebase origin "$COORDINATION_BRANCH" >/dev/null 2>&1 || true
    else
      return 0
    fi
  done
  warn "Could not release lease cleanly; it will expire via TTL."
  return 0
}

# ---------------------------------------------------------------------------
# Task loading + dependency filtering
# ---------------------------------------------------------------------------
# is_dep_satisfied <dep_id> <scope> <tasks_file>
is_dep_satisfied() {
  local dep="$1" scope="$2" tasks_file="$3"
  local pat; pat="$(scope_id_pattern "$scope")"
  if ! echo "$dep" | grep -qE "$pat"; then
    return 1  # cross-namespace / malformed dep -> not satisfied
  fi
  local status
  status="$(jq -r --arg id "$dep" '.tasks[] | select(.id==$id) | .status' "$tasks_file" 2>/dev/null | head -1)"
  [ "$status" = "DONE" ]
}

# Returns 0 if all deps satisfied (or no deps), 1 otherwise.
deps_satisfied() {
  local task_json="$1" scope="$2" tasks_file="$3"
  local deps dep
  deps="$(echo "$task_json" | jq -r '.depends_on // [] | .[]')"
  [ -z "$deps" ] && return 0
  while IFS= read -r dep; do
    [ -z "$dep" ] && continue
    is_dep_satisfied "$dep" "$scope" "$tasks_file" || return 1
  done <<< "$deps"
  return 0
}

# Print actionable tasks (TODO/REVISE with satisfied deps) as JSON lines.
list_actionable() {
  local scope="$1" tasks_file="$2"
  jq -c '.tasks[] | select(.status=="TODO" or .status=="REVISE")' "$tasks_file" | \
  while IFS= read -r task; do
    if deps_satisfied "$task" "$scope" "$tasks_file"; then
      echo "$task"
    fi
  done
}

# ---------------------------------------------------------------------------
# Acceptance criteria extraction
# ---------------------------------------------------------------------------
extract_criteria() {
  local task_json="$1"
  local ac summary
  ac="$(echo "$task_json" | jq -r 'if (.acceptance_criteria|type)=="array" then .acceptance_criteria | to_entries[] | "\(.key+1). \(.value)" else empty end')"
  if [ -n "$ac" ]; then
    echo "$ac"
    return
  fi
  summary="$(echo "$task_json" | jq -r '.summary // empty')"
  if [ -n "$summary" ]; then
    echo "1. $summary"
    return
  fi
  echo "(no acceptance criteria specified)"
}

# ---------------------------------------------------------------------------
# Interactive selectors
# ---------------------------------------------------------------------------
# select_task_fzf <scope> <tasks_file>  -> echoes chosen task JSON
select_task_fzf() {
  local scope="$1" tasks_file="$2"
  local tasks id title status deps assigned
  tasks="$(list_actionable "$scope" "$tasks_file")"
  [ -z "$tasks" ] && { err "No actionable tasks for scope '$scope'."; return 1; }

  local display
  display="$(echo "$tasks" | jq -r '[.id, .title, .status, ((.depends_on // [])|join(",")), (.assigned_to // "-")] | @tsv' | \
    fzf --with-nth=1,2,3,4,5 --delimiter='\t' \
        --prompt="Task ($scope)> " \
        --header="ID  TITLE  STATUS  DEPS  ASSIGNED" \
        --preview="echo {} | cut -f1 | xargs -I{} jq -r --arg id {} '.tasks[]|select(.id==\$id)|.summary // \"(no summary)\"' '$tasks_file'" \
        --preview-window=right:50%:wrap || true)"

  [ -z "$display" ] && { err "No task selected."; return 1; }
  local chosen_id; chosen_id="$(echo "$display" | cut -f1)"
  echo "$tasks" | jq -c --arg id "$chosen_id" 'select(.id==$id)'
}

# select_task_numbered <scope> <tasks_file>  -> echoes chosen task JSON
select_task_numbered() {
  local scope="$1" tasks_file="$2"
  local tasks; tasks="$(list_actionable "$scope" "$tasks_file")"
  [ -z "$tasks" ] && { err "No actionable tasks for scope '$scope'."; return 1; }

  local i=1 id title status
  while IFS= read -r t; do
    id="$(echo "$t" | jq -r '.id')"
    title="$(echo "$t" | jq -r '.title')"
    status="$(echo "$t" | jq -r '.status')"
    printf '%s%2d)%s %-12s %-10s %s\n' "$C_BOLD" "$i" "$C_RESET" "$id" "$status" "$title" >&2
    i=$((i + 1))
  done <<< "$tasks"

  local count; count="$(echo "$tasks" | grep -c . || true)"
  local choice
  if [ ! -t 0 ]; then
    # Non-interactive: default to first actionable task.
    choice=1
  else
    read -rp "Select task [1-$count]: " choice >&2
    choice="${choice:-1}"
  fi
  [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$count" ] || { err "Invalid choice."; return 1; }
  echo "$tasks" | sed -n "${choice}p"
}

select_task() {
  local scope="$1" tasks_file="$2"
  if command -v fzf >/dev/null 2>&1 && [ -t 1 ]; then
    select_task_fzf "$scope" "$tasks_file"
  else
    select_task_numbered "$scope" "$tasks_file"
  fi
}

# ---------------------------------------------------------------------------
# Role selection + heuristic
# ---------------------------------------------------------------------------
# Heuristic: frontend if title/summary mentions UI/frontend keywords.
role_heuristic_dev() {
  local task_json="$1"
  local text; text="$(echo "$task_json" | jq -r '[.title, (.summary // "")] | join(" ")')"
  if echo "$text" | grep -qiE '\b(UI|frontend|chat|blade|vue|react|css|html|component|page|view|responsive|accessib)\b'; then
    echo "frontend"
  else
    echo "backend"
  fi
}

# select_role <task_json>  -> echoes "dev|qa|review" plus optional "frontend|backend"
select_role() {
  local task_json="$1"
  local status; status="$(echo "$task_json" | jq -r '.status')"
  local dev_kind; dev_kind="$(role_heuristic_dev "$task_json")"
  local recommended="dev"
  case "$status" in
    NEEDS_QA|QA_PASSED) recommended="qa" ;;
    NEEDS_REVIEW|IN_REVIEW) recommended="review" ;;
  esac

  if [ -t 1 ] && [ -t 0 ]; then
    log "" >&2
    printf '%sSelect role:%s (recommended: %s%s%s, dev heuristic: %s)\n' \
      "$C_BOLD" "$C_RESET" "$C_GREEN" "$recommended" "$C_RESET" "$dev_kind" >&2
    printf '  %s1)%s dev      - implement (%s)\n' "$C_BOLD" "$C_RESET" "$dev_kind" >&2
    printf '  %s2)%s qa       - validate / blackbox tests\n' "$C_BOLD" "$C_RESET" >&2
    printf '  %s3)%s review   - code review\n' "$C_BOLD" "$C_RESET" >&2
    local choice
    read -rp "Role [1-3, default ${recommended}]: " choice >&2
    case "${choice:-}" in
      1|dev) echo "dev" ;;
      2|qa) echo "qa" ;;
      3|review) echo "review" ;;
      "") echo "$recommended" ;;
      *) err "Invalid role choice."; return 1 ;;
    esac
  else
    echo "$recommended"
  fi
}

# Map role -> mimo agent name. mimo primary is "build"; use "build" for dev/qa,
# "general" for review (general is a capable subagent for analysis).
role_to_agent() {
  case "$1" in
    dev|qa) echo "build" ;;
    review) echo "general" ;;
    *) echo "build" ;;
  esac
}

# Map role -> playbook file path is handled inline in main() (dev splits by heuristic).

# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------
# build_prompt <task_json> <scope> <role> <role_kind> <playbook_file>
build_prompt() {
  local task_json="$1" scope="$2" role="$3" role_kind="$4" playbook="$5"
  local id title status deps criteria
  id="$(echo "$task_json" | jq -r '.id')"
  title="$(echo "$task_json" | jq -r '.title')"
  status="$(echo "$task_json" | jq -r '.status')"
  deps="$(echo "$task_json" | jq -r '(.depends_on // []) | if length==0 then "(none)" else join(", ") end')"
  criteria="$(extract_criteria "$task_json")"

  local phase
  case "$role" in
    dev) phase="IN_PROGRESS (implementation)" ;;
    qa) phase="NEEDS_QA (validation)" ;;
    review) phase="IN_REVIEW (code review)" ;;
  esac

  local playbook_content=""
  if [ -n "$playbook" ] && [ -f "$playbook" ]; then
    playbook_content="$(cat "$playbook")"
  fi

  cat <<EOF
# TASK CONTEXT
- ID: $id
- Title: $title
- Status: $status
- Scope: $scope
- Role: $role${role_kind:+ ($role_kind)}
- Phase: $phase
- Acceptance Criteria:
$([ -n "$criteria" ] && echo "$criteria" | sed 's/^/  /')
- Dependencies: $deps

# ROLE PLAYBOOK ($role)
$playbook_content

# PROTOCOL REMINDER (AGENTS.md)
- You are operating in Phase 2 (NO LEASE HELD by you; the dispatcher manages the lease).
- Follow the Git-Swarm workflow for your role:
  - dev: TDD Red -> Green -> Refactor, then hand off to NEEDS_QA.
  - qa: validate against acceptance criteria + blackbox gate, set QA_PASSED/QA_FAILED.
  - review: review against criteria, set DONE or REVISE.
- Do NOT edit state/<scope>/tasks.json directly; the dispatcher updates status after you exit.
- When finished, stop. The dispatcher will prompt the operator for the next status.
EOF
}

# ---------------------------------------------------------------------------
# Agent execution
# ---------------------------------------------------------------------------
# run_agent <prompt_file> <agent_name> <scope>
run_agent() {
  local prompt_file="$1" agent="$2" scope="$3"
  local prompt_text; prompt_text="$(cat "$prompt_file")"

  info "Launching agent '$agent' (scope=$scope) via: $AGENT_RUNNER"
  log "  prompt bytes: $(printf '%s' "$prompt_text" | wc -c)"

  # Run synchronously. mimo-safe mimo run "<msg>" --agent <name> --dir <repo>
  # shellcheck disable=SC2086
  $AGENT_RUNNER "$prompt_text" --agent "$agent" --dir "$REPO_ROOT"
}

# ---------------------------------------------------------------------------
# Status update prompt
# ---------------------------------------------------------------------------
# valid_statuses <current_status>  -> echoes space-separated valid next statuses
valid_statuses() {
  case "$1" in
    TODO|REVISE) echo "NEEDS_QA IN_PROGRESS DONE" ;;
    IN_PROGRESS) echo "NEEDS_QA REVISE" ;;
    NEEDS_QA) echo "QA_PASSED REVISE NEEDS_REVIEW" ;;
    QA_PASSED) echo "NEEDS_REVIEW REVISE DONE" ;;
    NEEDS_REVIEW) echo "DONE REVISE" ;;
    IN_REVIEW) echo "DONE REVISE" ;;
    *) echo "NEEDS_QA REVISE DONE" ;;
  esac
}

recommended_status() {
  case "$1" in
    TODO|REVISE|IN_PROGRESS) echo "NEEDS_QA" ;;
    NEEDS_QA) echo "QA_PASSED" ;;
    QA_PASSED) echo "NEEDS_REVIEW" ;;
    NEEDS_REVIEW|IN_REVIEW) echo "DONE" ;;
    *) echo "NEEDS_QA" ;;
  esac
}

# prompt_status <current_status> <task_id>  -> echoes chosen status
prompt_status() {
  local current="$1" task_id="$2"
  local valid recommended
  valid="$(valid_statuses "$current")"
  recommended="$(recommended_status "$current")"

  log "" >&2
  printf '%sUpdate status for %s%s (current: %s)\n' "$C_BOLD" "$task_id" "$C_RESET" "$current" >&2
  printf '  Recommended: %s%s%s\n' "$C_GREEN" "$recommended" "$C_RESET" >&2
  local i=1 s
  for s in $valid; do
    if [ "$s" = "$recommended" ]; then
      printf '  %s%d)%s %s (recommended)\n' "$C_GREEN" "$i" "$C_RESET" "$s" >&2
    else
      printf '  %d) %s\n' "$i" "$s" >&2
    fi
    i=$((i + 1))
  done
  local count; count="$(echo "$valid" | wc -w)"
  local choice
  if [ ! -t 0 ]; then
    choice=1
  else
    read -rp "Status [1-$count, default 1=$recommended]: " choice >&2
    choice="${choice:-1}"
  fi
  [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$count" ] || { err "Invalid status choice."; return 1; }
  echo "$valid" | cut -d' ' -f"$choice"
}

# ---------------------------------------------------------------------------
# Atomic status handoff (Phase 3)
# ---------------------------------------------------------------------------
# handoff_status <scope> <task_id> <new_status> <role>
handoff_status() {
  local scope="$1" task_id="$2" new_status="$3" role="$4"
  local paths; paths="$(get_state_paths "$scope")" || { err "bad scope"; return 1; }
  local tasks_file; tasks_file="$(echo "$paths" | awk '{print $1}')"

  acquire_lease "$scope" || return 1

  # Re-read latest tasks (post-rebase) and verify invariants.
  local current_status assigned reviewer qa
  current_status="$(jq -r --arg id "$task_id" '.tasks[]|select(.id==$id)|.status' "$tasks_file")"
  [ -z "$current_status" ] && { err "Task $task_id not found after rebase."; release_lease "$scope"; return 1; }

  local tmp; tmp="$(mktemp)"
  jq --arg id "$task_id" --arg st "$new_status" \
    --arg your "$YOUR_ID" --arg role "$role" \
    '(.tasks[] | select(.id==$id)) |= (
        .status = $st
      | if $role=="dev" then .assigned_to = $your
        elif $role=="qa" then .qa_engineer = $your
        elif $role=="review" then .reviewer = $your
        else . end
    )' "$tasks_file" > "$tmp" && mv "$tmp" "$tasks_file"

  local ts; ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  team_log_append "$scope" "## [$ts] dispatch($task_id): status=$current_status -> $new_status by $YOUR_ID (role=$role)"

  git -C "$REPO_ROOT" add "$tasks_file"
  git -C "$REPO_ROOT" commit -m "chore(dispatch): $task_id $current_status -> $new_status by $YOUR_ID" >/dev/null 2>&1 || true
  if git -C "$REPO_ROOT" push origin "$COORDINATION_BRANCH" >/dev/null 2>&1; then
    ok "Status updated: $task_id -> $new_status (pushed)"
  else
    warn "Push rejected; pulling + retrying once."
    git -C "$REPO_ROOT" pull --rebase origin "$COORDINATION_BRANCH" >/dev/null 2>&1 || true
    git -C "$REPO_ROOT" add "$tasks_file"
    git -C "$REPO_ROOT" commit -m "chore(dispatch): $task_id $current_status -> $new_status by $YOUR_ID" >/dev/null 2>&1 || true
    git -C "$REPO_ROOT" push origin "$COORDINATION_BRANCH" >/dev/null 2>&1 || ok "Status pushed (retry)"
  fi

  release_lease "$scope"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --scope <sima|hr|omr|pm>   Task namespace (default: sima)
  --role <dev|qa|review>     Skip role prompt
  --agent <name>             mimo agent name (default: build/general by role)
  --no-inject                Do not send prompt to agent (dry run: build prompt only)
  -h, --help                 Show this help

Environment:
  YOUR_ID                    Agent identity (default: ./YOUR_ID or generated)
  AGENT_RUNNER               Override runner (default: "mimo-safe mimo run")
  COORDINATION_BRANCH        Git branch (default: master)
  LEASE_TTL_SECONDS          Lease TTL (default: 120)
EOF
}

main() {
  local scope="sima" role="" agent_override="" inject=1
  while [ $# -gt 0 ]; do
    case "$1" in
      --scope) scope="${2:?--scope needs value}"; shift 2 ;;
      --role) role="${2:?--role needs value}"; shift 2 ;;
      --agent) agent_override="${2:?--agent needs value}"; shift 2 ;;
      --no-inject) inject=0; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown arg: $1" ;;
    esac
  done

  [ -z "$(scope_to_partition "$scope")" ] && die "Invalid scope: $scope (use sima|hr|omr|pm)"

  local paths; paths="$(get_state_paths "$scope")" || die "bad scope"
  local tasks_file; tasks_file="$(echo "$paths" | awk '{print $1}')"
  [ -f "$tasks_file" ] || die "Tasks file not found: $tasks_file"

  info "Dispatcher starting (scope=$scope, YOUR_ID=$YOUR_ID)"

  # 1. Select task
  local task_json
  task_json="$(select_task "$scope" "$tasks_file")" || exit 1
  local task_id title status
  task_id="$(echo "$task_json" | jq -r '.id')"
  title="$(echo "$task_json" | jq -r '.title')"
  status="$(echo "$task_json" | jq -r '.status')"
  ok "Selected $task_id [$status]: $title"

  # 2. Select role
  if [ -z "$role" ]; then
    role="$(select_role "$task_json")" || exit 1
  fi
  local role_kind=""
  if [ "$role" = "dev" ]; then
    role_kind="$(role_heuristic_dev "$task_json")"
  fi

  # 3. Resolve playbook
  local playbook=""
  case "$role" in
    dev) [ "$role_kind" = "frontend" ] && playbook=".roles/frontend-dev.md" || playbook=".roles/backend-dev.md" ;;
    qa) playbook=".roles/qa-engineer.md" ;;
    review) playbook=".roles/code-reviewer.md" ;;
  esac
  [ -f "$playbook" ] || warn "Playbook not found: $playbook (continuing without)"

  # 4. Resolve agent
  local agent="${agent_override:-$(role_to_agent "$role")}"

  # 5. Build prompt
  local prompt_file; prompt_file="$(mktemp "/tmp/task-prompt-${task_id}.XXXXXX.md")"
  build_prompt "$task_json" "$scope" "$role" "$role_kind" "$playbook" > "$prompt_file"
  ok "Prompt written: $prompt_file ($(wc -c < "$prompt_file") bytes)"

  if [ "$inject" -eq 0 ]; then
    log "----- PROMPT PREVIEW -----"
    cat "$prompt_file"
    log "--------------------------"
    rm -f "$prompt_file"
    ok "Dry run complete (--no-inject)."
    return 0
  fi

  # 6. Run agent (synchronous)
  run_agent "$prompt_file" "$agent" "$scope"
  local rc=$?
  rm -f "$prompt_file"
  if [ $rc -ne 0 ]; then
    warn "Agent exited with code $rc."
  fi

  # 7. Status update prompt + handoff
  local new_status
  new_status="$(prompt_status "$status" "$task_id")" || { warn "No status change; exiting."; exit 0; }
  handoff_status "$scope" "$task_id" "$new_status" "$role" || warn "Handoff failed."

  ok "Dispatch complete."
}

# Only run main when executed directly (not when sourced for testing).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi