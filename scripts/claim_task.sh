#!/bin/bash
# claim_task.sh - Claim a task for the current agent
# Usage: ./scripts/claim_task.sh <task-id>

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <task-id>"
    echo "Example: $0 TASK-REFACTOR-011"
    exit 1
fi

TASK_ID="$1"
YOUR_ID="agent-noabatgircom-2254092"
COORDINATION_BRANCH="master"

TASKS_JSON=$(cat state/tasks.json)

NEW_TASKS=$(echo "$TASKS_JSON" | jq --arg id "$TASK_ID" --arg holder "$YOUR_ID" '
  .tasks |= map(
    if .id == $id then
      .status = "IN_PROGRESS" |
      .assigned_to = $holder |
      .attempts = (.attempts + 1)
    else
      .
    end
  )
')

echo "$NEW_TASKS" > state/tasks.json

git add state/tasks.json
git commit -m "chore(claim): claim $TASK_ID by $YOUR_ID"
git push origin "$COORDINATION_BRANCH"

echo "Task $TASK_ID claimed successfully"