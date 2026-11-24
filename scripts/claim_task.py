#!/usr/bin/env python3
"""Claim a task: assign it to the current worker and set status IN_PROGRESS."""
import json, os, sys

STATE_DIR = os.environ.get("STATE_DIR", "/tmp/kilo/work/state/sima")
YOUR_ID = os.environ.get("YOUR_ID", "agent-unknown")
TASK_ID = os.environ.get("TASK_ID")
if not TASK_ID:
    print("❌ TASK_ID environment variable is required", file=sys.stderr)
    sys.exit(1)

TASKS_PATH = os.path.join(STATE_DIR, "tasks.json")

with open(TASKS_PATH) as f:
    data = json.load(f)

claimed = False
for task in data.get("tasks", []):
    if task.get("id") == TASK_ID:
        if task.get("status") not in ("TODO", "REVISE"):
            print(f"{TASK_ID} not actionable: status={task.get('status')}", file=sys.stderr)
            sys.exit(1)
        task["assigned_to"] = YOUR_ID
        task["status"] = "IN_PROGRESS"
        task["attempts"] = task.get("attempts", 0) + 1
        claimed = True
        print(f"Claimed {TASK_ID}")
        break

if not claimed:
    print(f"{TASK_ID} not found or not actionable", file=sys.stderr)
    sys.exit(1)

with open(TASKS_PATH, "w") as f:
    json.dump(data, f, indent=2)
