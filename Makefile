# Multiagent GitOps - Simple Commands
# Usage: make <command>
# Reads configuration from .env (if present) and .env.qa

REPO_ROOT   := /home/hamid/multiagent4
WORKTREE    := /tmp/kilo/work
STATE_DIR   := $(WORKTREE)/state/sima
BLACKBOX_DIR:= $(REPO_ROOT)/sima-blackbox-tests
SCRIPTS_DIR := $(REPO_ROOT)/scripts

# Load .env if it exists (variables become make variables + exported to shell)
ifneq ($(wildcard .env),)
  include .env
  export $(shell sed 's/=.*//' .env)
endif

# Load QA env for BASE_URL etc. (does not fail if missing)
ifneq ($(wildcard .env.qa),)
  include .env.qa
  export $(shell sed 's/=.*//' .env.qa)
endif

YOUR_ID     ?= agent-$(USER)-$(shell hostname)-$$$$

# Export for helper scripts
export STATE_DIR
export YOUR_ID

.DEFAULT_GOAL := help

.PHONY: help sync status tasks claim release plan qa test-all origin

help:
	@echo "=== Multiagent GitOps Commands ==="
	@echo ""
	@echo "Setup:"
	@echo "  make sync          - Sync worktree with origin/main"
	@echo "  make status        - Show git status and current tasks"
	@echo ""
	@echo "Task Operations:"
	@echo "  make tasks         - List actionable tasks (TODO/REVISE/IN_PROGRESS/NEEDS_REVIEW)"
	@echo "  make claim TASK_ID=TASK-097   - Claim a task (acquire lease + assign)"
	@echo "  make release       - Release lease after claim/handoff"
	@echo ""
	@echo "Development:"
	@echo "  make plan          - Run Phase 1 planning (register new tasks)"
	@echo "  make qa            - Run blackbox QA (uses BASE_URL from .env.qa)"
	@echo "  make test-all      - Run all tests (local + blackbox)"
	@echo ""
	@echo "Identity:"
	@echo "  Current YOUR_ID: $(YOUR_ID)"
	@echo "  BASE_URL: $(BASE_URL)"

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
	@test -f $(STATE_DIR)/leases.json && cat $(STATE_DIR)/leases.json | jq . || echo "No lease file"
	@echo ""
	@echo "=== Actionable Tasks ==="
	@test -f $(STATE_DIR)/tasks.json && cat $(STATE_DIR)/tasks.json | jq '.tasks[] | select(.status=="TODO" or .status=="REVISE") | {id, title, status, depends_on}' -c || echo "No tasks file"

# List tasks
tasks:
	@test -f $(STATE_DIR)/tasks.json && cat $(STATE_DIR)/tasks.json | jq '.tasks[] | select(.status=="TODO" or .status=="REVISE" or .status=="IN_PROGRESS" or .status=="NEEDS_REVIEW") | {id, title, status, assigned_to, depends_on}' -c || echo "No tasks file"

# Generic claim any task: make claim TASK_ID=TASK-097
claim:
	@if [ -z "$(TASK_ID)" ]; then echo "❌ Usage: make claim TASK_ID=TASK-097"; exit 1; fi
	@echo "🔒 Acquiring lease for $(YOUR_ID)..."
	cd $(WORKTREE) && git fetch origin && git checkout main && git pull --rebase origin main
	python3 $(SCRIPTS_DIR)/acquire_lease.py
	cd $(WORKTREE) && git add state/sima/leases.json && git commit -m "chore(lock): acquire tasks.json lease by $(YOUR_ID)" && git push origin main
	@echo "📋 Claiming $(TASK_ID)..."
	cd $(WORKTREE) && TASK_ID=$(TASK_ID) python3 $(SCRIPTS_DIR)/claim_task.py
	cd $(WORKTREE) && git add state/sima/tasks.json && git commit -m "chore(claim): claim $(TASK_ID) by $(YOUR_ID)" && git push origin main
	@echo "✅ $(TASK_ID) claimed. Run 'make release' when done with Phase 2."

# Release lease (generic)
release:
	@echo "🔓 Releasing lease for $(YOUR_ID)..."
	cd $(WORKTREE) && git fetch origin && git checkout main && git pull --rebase origin main
	python3 $(SCRIPTS_DIR)/release_lease.py
	cd $(WORKTREE) && git add state/sima/leases.json && git commit -m "chore(lock): release tasks.json lease by $(YOUR_ID)" && git push origin main
	@echo "✅ Lease released"

# Phase 1 Planning
plan:
	@echo "📋 Running Phase 1 Planning..."
	@if command -v node >/dev/null 2>&1 && [ -f $(WORKTREE)/state/runner_workflow.js ]; then \
		cd $(WORKTREE) && node state/runner_workflow.js; \
	else \
		echo "⚠ node or state/runner_workflow.js not available; skipping plan"; \
	fi

# Blackbox QA - runs sima-blackbox-tests/compose.yaml (tester service) with BASE_URL from .env.qa
qa:
	@echo "🧪 Running Blackbox QA against $(BASE_URL)..."
	cd $(BLACKBOX_DIR) && docker compose up --build --abort-on-container-exit tester

# All tests
test-all:
	@echo "Running local tests..."
	@echo "Running blackbox QA..."
	$(MAKE) qa

# Quick check origin/main
origin:
	@echo "=== origin/main recent commits ==="
	cd $(WORKTREE) && git log --oneline origin/main -15
