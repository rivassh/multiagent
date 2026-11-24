#!/bin/bash
# scripts/run_agent.sh
# Wrapper that validates arguments and execs the configured agent runner.
#
# Usage: run_agent.sh <worktree> <prompt_file> <task_id> <role> <repo>
#
# The actual runner command is taken from AGENT_RUNNER_CMD (default: kilo).
# Placeholders in AGENT_RUNNER_CMD are substituted by the agent worker before
# this script is invoked, so this script primarily validates + executes.
#
# Tests use a fake runner (AGENT_RUNNER_CMD pointing to a stub script), so CI
# does not require a real model or kilo binary.

set -euo pipefail

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <worktree> <prompt_file> <task_id> <role> <repo>" >&2
  exit 2
fi

WORKTREE="$1"
PROMPT_FILE="$2"
TASK_ID="$3"
ROLE="$4"
REPO="$5"

if [ ! -d "$REPO" ]; then
  echo "Error: repo path does not exist: $REPO" >&2
  exit 2
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: prompt file does not exist: $PROMPT_FILE" >&2
  exit 2
fi

echo "[run_agent] task=$TASK_ID role=$ROLE repo=$REPO worktree=$WORKTREE"

# Exec the configured runner. AGENT_RUNNER_CMD should already have placeholders
# substituted by the agent worker; we pass the validated args for logging/forwarding.
exec env \
  AGENT_WORKTREE="$WORKTREE" \
  AGENT_PROMPT_FILE="$PROMPT_FILE" \
  AGENT_TASK_ID="$TASK_ID" \
  AGENT_ROLE="$ROLE" \
  AGENT_REPO="$REPO" \
  "${AGENT_RUNNER_CMD:-kilo}" "$WORKTREE" "$PROMPT_FILE" "$TASK_ID" "$ROLE" "$REPO"
