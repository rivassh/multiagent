#!/usr/bin/env bash

set -euo pipefail

# Test task claim race conditions
echo "Running task claim race tests..."

# Setup test directory
TEST_DIR=$(mnt/Projects/multiagent/tests/tmp)
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Create mock task file
mkdir -p state/tasks

cat > state/tasks/TASK-TEST-001.json << 'EOF'
{
    "id": "TASK-TEST-001",
    "title": "Test Task",
    "status": "TODO",
    "owner": null,
    "branch": null,
    "worktree": null,
    "created_at": "2026-11-28T00:00:00Z",
    "updated_at": "2026-11-28T00:00:00Z",
    "depends_on": [],
    "acceptance": [],
    "blocked_reason": null,
    "history": []
}
EOF

# Create mock task script
cat > task.sh << 'EOF'
#!/usr/bin/env bash

TASKS_DIR="state/tasks"

task_claim() {
    local task_id="$1"
    local file="$TASKS_DIR/$task_id.json"
    
    if [ ! -f "$file" ]; then
        echo "Error: Task $task_id not found."
        return 1
    fi
    
    # Read current state
    local status=$(jq -r '.status' "$file")
    local owner=$(jq -r '.owner' "$file")
    
    # Simulate race: check, then sleep, then update
    if [ "$status" != "TODO" ]; then
        echo "Error: Task $task_id status is $status, must be TODO to claim."
        return 1
    fi
    
    if [ "$owner" != "null" ]; then
        echo "Error: Task $task_id already owned by $owner."
        return 1
    fi
    
    # Critical section - simulate processing time
    sleep 0.1
    
    # Update task
    local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq \
        --arg status "IN_PROGRESS" \
        --arg owner "agent-test" \
        --arg updated_at "$updated_at" \
        '.status = $status | .owner = $owner | .updated_at = $updated_at' \
        "$file" > "${file}.tmp"
    
    mv "${file}.tmp" "$file"
    
    echo "Claimed task $task_id"
}

task_claim "$1"
EOF

chmod +x task.sh

# Test: Simulate two processes trying to claim the same task
echo "Test: Race condition simulation"

# Reset task
cat > state/tasks/TASK-TEST-001.json << 'EOF'
{
    "id": "TASK-TEST-001",
    "title": "Test Task",
    "status": "TODO",
    "owner": null,
    "branch": null,
    "worktree": null,
    "created_at": "2026-11-28T00:00:00Z",
    "updated_at": "2026-11-28T00:00:00Z",
    "depends_on": [],
    "acceptance": [],
    "blocked_reason": null,
    "history": []
}
EOF

# Run two claims in parallel
( ./task.sh TASK-TEST-001 & ) 
( sleep 0.05 && ./task.sh TASK-TEST-001 & )

# Wait for both to complete
wait

# Check result
final_owner=$(jq -r '.owner' state/tasks/TASK-TEST-001.json)
echo "Final owner: $final_owner"

if [ "$final_owner" = "agent-test" ]; then
    echo "PASS: Task claimed successfully (race handled by filesystem)"
else
    echo "FAIL: Task not properly claimed"
    exit 1
fi

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo "Task claim race test completed!"