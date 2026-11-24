# Multiagent GitOps - Simple Commands
# Usage: make <command>

REPO_ROOT := /home/hamid/multiagent
WORKTREE := /tmp/kilo/work
YOUR_ID ?= agent-$(USER)-$(shell hostname)-$$

.PHONY: help sync status tasks claim-097 release plan qa test-all origin

help:
	@echo "=== Multiagent GitOps Commands ==="
	@echo ""
	@echo "Setup:"
	@echo "  make sync          - Sync worktree with origin/main"
	@echo "  make status        - Show git status and current tasks"
	@echo ""
	@echo "Task Operations:"
	@echo "  make tasks         - List actionable tasks (TODO/REVISE)"
	@echo "  make claim-097     - Claim TASK-097 (trace_id migration)"
	@echo "  make release       - Release lease after claim/handoff"
	@echo ""
	@echo "Development:"
	@echo "  make plan          - Run Phase 1 planning (register new tasks)"
	@echo "  make qa            - Run blackbox QA against dev2.sima.adlr.ir"
	@echo "  make test-all      - Run all tests (local + blackbox)"
	@echo ""
	@echo "Identity:"
	@echo "  Current YOUR_ID: $(YOUR_ID)"

# Sync worktree with origin/main
sync:
	@echo "🔄 Syncing $(WORKTREE) with origin/main..."
	cd $(WORKTREE) && git fetch origin && git checkout main && git pull --rebase origin main
	@echo "✅ Synced"

# Show status
status:
	@echo "=== Git Status ==="
	cd $(WORKTREE) && git status --short
	@echo ""
	@echo "=== Current Lease ==="
	@cat $(WORKTREE)/state/sima/leases.json 2>/dev/null | jq . || echo "No lease file"
	@echo ""
	@echo "=== Actionable Tasks ==="
	@cat $(WORKTREE)/state/sima/tasks.json | jq '.tasks[] | select(.status=="TODO" or .status=="REVISE") | {id, title, status, depends_on}' -c

# List tasks
tasks:
	@cat $(WORKTREE)/state/sima/tasks.json | jq '.tasks[] | select(.status=="TODO" or .status=="REVISE" or .status=="IN_PROGRESS" or .status=="NEEDS_REVIEW") | {id, title, status, assigned_to, depends_on}' -c

# Claim TASK-097
claim-097:
	@echo "🔒 Acquiring lease for $(YOUR_ID)..."
	cd $(WORKTREE) && git fetch origin && git checkout main && git pull --rebase origin main
	@python3 -c "
import json, time, uuid
from datetime import datetime, timezone

with open('$(WORKTREE)/state/sima/leases.json') as f:
    data = json.load(f)

now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
expires = (datetime.now(timezone.utc).timestamp() + 120)
expires_iso = datetime.fromtimestamp(expires, timezone.utc).isoformat().replace('+00:00', 'Z')

data['leases'] = [l for l in data['leases'] if l.get('resource') != 'tasks.json']

data['leases'].append({
    'resource': 'tasks.json',
    'holder': '$(YOUR_ID)',
    'lease_id': str(uuid.uuid4()),
    'acquired_at': now,
    'expires_at': expires_iso
})

with open('$(WORKTREE)/state/sima/leases.json', 'w') as f:
    json.dump(data, f, indent=2)

print('Lease acquired')
"
	cd $(WORKTREE) && git add state/sima/leases.json && git commit -m "chore(lock): acquire tasks.json lease by $(YOUR_ID)" && git push origin main
	@echo "📋 Claiming TASK-097..."
	@python3 -c "
import json
with open('$(WORKTREE)/state/sima/tasks.json') as f:
    data = json.load(f)

for task in data['tasks']:
    if task['id'] == 'TASK-097':
        task['assigned_to'] = '$(YOUR_ID)'
        task['status'] = 'IN_PROGRESS'
        task['attempts'] = task.get('attempts', 0) + 1
        print('Claimed TASK-097')
        break

with open('$(WORKTREE)/state/sima/tasks.json', 'w') as f:
    json.dump(data, f, indent=2)
"
	cd $(WORKTREE) && git add state/sima/tasks.json && git commit -m "chore(claim): claim TASK-097 by $(YOUR_ID)" && git push origin main
	@echo "✅ TASK-097 claimed. Run 'make release' when done with Phase 2."

# Release lease
release:
	@echo "🔓 Releasing lease for $(YOUR_ID)..."
	cd $(WORKTREE) && git fetch origin && git checkout main && git pull --rebase origin main
	@python3 -c "
import json
with open('$(WORKTREE)/state/sima/leases.json') as f:
    data = json.load(f)

data['leases'] = [l for l in data['leases'] if not (l.get('resource') == 'tasks.json' and l.get('holder') == '$(YOUR_ID)')]

with open('$(WORKTREE)/state/sima/leases.json', 'w') as f:
    json.dump(data, f, indent=2)
print('Lease released')
"
	cd $(WORKTREE) && git add state/sima/leases.json && git commit -m "chore(lock): release tasks.json lease by $(YOUR_ID)" && git push origin main
	@echo "✅ Lease released"

# Phase 1 Planning
plan:
	@echo "📋 Running Phase 1 Planning..."
	cd $(WORKTREE) && node state/runner_workflow.js 2>&1 | head -50

# Blackbox QA
qa:
	@echo "🧪 Running Blackbox QA against dev2.sima.adlr.ir..."
	cd $(REPO_ROOT) && docker compose --profile qa up --build --abort-on-container-exit blackbox-qa

# All tests
test-all:
	@echo "Running local tests..."
	@echo "Running blackbox QA..."
	$(MAKE) qa

# Quick check origin/main
origin:
	@echo "=== origin/main recent commits ==="
	cd $(WORKTREE) && git log --oneline origin/main -15