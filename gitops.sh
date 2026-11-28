#!/usr/bin/env bash
# Multiagent GitOps - Simple wrapper script
# Usage: ./gitops.sh <command>

REPO_ROOT="/home/hamid/multiagent"
WORKTREE="/tmp/kilo/work"
YOUR_ID="${YOUR_ID:-agent-$(whoami)-$(hostname)-$$}"

cmd_help() {
    echo "=== Multiagent GitOps Commands ==="
    echo ""
    echo "Setup:"
    echo "  ./gitops.sh sync          - Sync worktree with origin/main"
    echo "  ./gitops.sh status        - Show git status and current tasks"
    echo ""
    echo "Task Operations:"
    echo "  ./gitops.sh tasks         - List actionable tasks (TODO/REVISE)"
    echo "  ./gitops.sh claim-097     - Claim TASK-097 (trace_id migration)"
    echo "  ./gitops.sh release       - Release lease after claim/handoff"
    echo ""
    echo "Development:"
    echo "  ./gitops.sh plan          - Run Phase 1 planning (register new tasks)"
    echo "  ./gitops.sh dispatch      - Interactive task dispatcher (pick task+role, run mimo-safe agent)"
    echo "  ./gitops.sh qa            - Run blackbox QA against dev2.sima.adlr.ir"
    echo "  ./gitops.sh origin        - Show origin/main recent commits"
    echo ""
    echo "Identity:"
    echo "  Current YOUR_ID: $YOUR_ID"
}

cmd_sync() {
    echo "🔄 Syncing $WORKTREE with origin/main..."
    cd "$WORKTREE" && git fetch origin && git checkout main && git pull --rebase origin main
    echo "✅ Synced"
}

cmd_status() {
    echo "=== Git Status ==="
    cd "$WORKTREE" && git status --short
    echo ""
    echo "=== Current Lease ==="
    cat "$WORKTREE/state/sima/leases.json" 2>/dev/null | jq . || echo "No lease file"
    echo ""
    echo "=== Actionable Tasks ==="
    cat "$WORKTREE/state/sima/tasks.json" | jq '.tasks[] | select(.status=="TODO" or .status=="REVISE") | {id, title, status, depends_on}' -c
}

cmd_tasks() {
    cat "$WORKTREE/state/sima/tasks.json" | jq '.tasks[] | select(.status=="TODO" or .status=="REVISE" or .status=="IN_PROGRESS" or .status=="NEEDS_REVIEW") | {id, title, status, assigned_to, depends_on}' -c
}

cmd_claim_097() {
    echo "🔒 Acquiring lease for $YOUR_ID..."
    cd "$WORKTREE" && git fetch origin && git checkout main && git pull --rebase origin main

    python3 << 'EOF'
import json, uuid
from datetime import datetime, timezone

with open('$WORKTREE/state/sima/leases.json') as f:
    data = json.load(f)

now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
expires = (datetime.now(timezone.utc).timestamp() + 120)
expires_iso = datetime.fromtimestamp(expires, timezone.utc).isoformat().replace('+00:00', 'Z')

data['leases'] = [l for l in data['leases'] if l.get('resource') != 'tasks.json']

data['leases'].append({
    'resource': 'tasks.json',
    'holder': '$YOUR_ID',
    'lease_id': str(uuid.uuid4()),
    'acquired_at': now,
    'expires_at': expires_iso
})

with open('$WORKTREE/state/sima/leases.json', 'w') as f:
    json.dump(data, f, indent=2)

print('Lease acquired')
EOF

    cd "$WORKTREE" && git add state/sima/leases.json && git commit -m "chore(lock): acquire tasks.json lease by $YOUR_ID" && git push origin main

    echo "📋 Claiming TASK-097..."
    python3 << 'EOF'
import json

with open('$WORKTREE/state/sima/tasks.json') as f:
    data = json.load(f)

for task in data['tasks']:
    if task['id'] == 'TASK-097':
        task['assigned_to'] = '$YOUR_ID'
        task['status'] = 'IN_PROGRESS'
        task['attempts'] = task.get('attempts', 0) + 1
        print('Claimed TASK-097')
        break

with open('$WORKTREE/state/sima/tasks.json', 'w') as f:
    json.dump(data, f, indent=2)
EOF

    cd "$WORKTREE" && git add state/sima/tasks.json && git commit -m "chore(claim): claim TASK-097 by $YOUR_ID" && git push origin main
    echo "✅ TASK-097 claimed. Run './gitops.sh release' when done with Phase 2."
}

cmd_release() {
    echo "🔓 Releasing lease for $YOUR_ID..."
    cd "$WORKTREE" && git fetch origin && git checkout main && git pull --rebase origin main

    python3 << 'EOF'
import json

with open('$WORKTREE/state/sima/leases.json') as f:
    data = json.load(f)

data['leases'] = [l for l in data['leases'] if not (l.get('resource') == 'tasks.json' and l.get('holder') == '$YOUR_ID')]

with open('$WORKTREE/state/sima/leases.json', 'w') as f:
    json.dump(data, f, indent=2)
print('Lease released')
EOF

    cd "$WORKTREE" && git add state/sima/leases.json && git commit -m "chore(lock): release tasks.json lease by $YOUR_ID" && git push origin main
    echo "✅ Lease released"
}

cmd_dispatch() {
    shift || true
    exec "$REPO_ROOT/scripts/dispatch-task.sh" "$@"
}

cmd_plan() {
    echo "📋 Running Phase 1 Planning..."
    cd "$WORKTREE" && node state/runner_workflow.js 2>&1 | head -50
}

cmd_qa() {
    echo "🧪 Running Blackbox QA against dev2.sima.adlr.ir..."
    cd "$REPO_ROOT" && docker compose --profile qa up --build --abort-on-container-exit blackbox-qa
}

cmd_origin() {
    echo "=== origin/main recent commits ==="
    cd "$WORKTREE" && git log --oneline origin/main -15
}

case "${1:-help}" in
    sync) cmd_sync ;;
    status) cmd_status ;;
    tasks) cmd_tasks ;;
    claim-097) cmd_claim_097 ;;
    release) cmd_release ;;
    plan) cmd_plan ;;
    dispatch) cmd_dispatch "$@" ;;
    qa) cmd_qa ;;
    origin) cmd_origin ;;
    help|*) cmd_help ;;
esac