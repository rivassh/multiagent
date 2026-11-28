#!/usr/bin/env bash

set -euo pipefail

# Test snapshot schema validity
echo "Running snapshot schema tests..."

# Create test snapshot JSON
cat > test-snapshot.json << 'EOF'
{
    "generated_at": "2026-11-28T15:30:00Z",
    "machine": "test-machine",
    "agents": [
        {
            "agent_id": "agent-test-1",
            "name": "Test Agent 1",
            "role": "developer",
            "tasks": [
                {
                    "task_id": "TASK-001",
                    "status": "IN_PROGRESS",
                    "branch": "task/TASK-001",
                    "worktree": "../wt-TASK-001",
                    "last_activity": "2026-11-28T15:25:00Z",
                    "blocked_reason": null,
                    "last_journal_lines": [
                        {
                            "timestamp": "2026-11-28T15:20:00Z",
                            "task_id": "TASK-001",
                            "action": "CLAIM",
                            "detail": "Task claimed"
                        }
                    ]
                }
            ]
        }
    ],
    "stats": {
        "total_tasks": 1,
        "active_tasks": 1,
        "blocked_tasks": 0
    }
}
EOF

# Test 1: Validate JSON syntax
echo "Test 1: JSON syntax validation"
if jq empty test-snapshot.json >/dev/null 2>&1; then
    echo "✓ PASS: Valid JSON syntax"
else
    echo "✗ FAIL: Invalid JSON syntax"
    exit 1
fi

# Test 2: Validate required fields
echo "Test 2: Required fields validation"

required_fields=(
    ".generated_at"
    ".machine"
    ".agents"
    ".stats"
    ".stats.total_tasks"
    ".stats.active_tasks"
    ".stats.blocked_tasks"
)

for field in "${required_fields[@]}"; do
    if jq -e "$field" test-snapshot.json >/dev/null 2>&1; then
        echo "  ✓ Field exists: $field"
    else
        echo "  ✗ Missing field: $field"
        exit 1
    fi
done

# Test 3: Validate agent structure
echo "Test 3: Agent structure validation"

agent_fields=(
    ".agents[0].agent_id"
    ".agents[0].tasks"
    ".agents[0].tasks[0].task_id"
    ".agents[0].tasks[0].status"
)

for field in "${agent_fields[@]}"; do
    if jq -e "$field" test-snapshot.json >/dev/null 2>&1; then
        echo "  ✓ Agent field exists: $field"
    else
        echo "  ✗ Missing agent field: $field"
        exit 1
    fi
done

# Test 4: Validate status enum
echo "Test 4: Status enum validation"

valid_statuses=("TODO" "IN_PROGRESS" "NEEDS_QA" "IN_REVIEW" "DONE" "BLOCKED" "ABANDONED" "REVISE")
actual_status=$(jq -r '.agents[0].tasks[0].status' test-snapshot.json)

if [[ " ${valid_statuses[@]} " =~ " ${actual_status} " ]]; then
    echo "  ✓ Valid status: $actual_status"
else
    echo "  ✗ Invalid status: $actual_status"
    exit 1
fi

# Test 5: Validate timestamp format (ISO8601)
echo "Test 5: Timestamp format validation"

timestamp=$(jq -r '.generated_at' test-snapshot.json)
if [[ "$timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    echo "  ✓ Valid ISO8601 timestamp: $timestamp"
else
    echo "  ✗ Invalid timestamp format: $timestamp"
    exit 1
fi

# Test 6: Validate stats are numbers
echo "Test 6: Stats numeric validation"

total_tasks=$(jq -r '.stats.total_tasks' test-snapshot.json)
if [[ "$total_tasks" =~ ^[0-9]+$ ]]; then
    echo "  ✓ Valid total_tasks: $total_tasks"
else
    echo "  ✗ Invalid total_tasks (not a number): $total_tasks"
    exit 1
fi

# Test 7: Validate journal lines structure
echo "Test 7: Journal lines structure validation"

journal_fields=(
    ".agents[0].tasks[0].last_journal_lines[0].timestamp"
    ".agents[0].tasks[0].last_journal_lines[0].task_id"
    ".agents[0].tasks[0].last_journal_lines[0].action"
    ".agents[0].tasks[0].last_journal_lines[0].detail"
)

for field in "${journal_fields[@]}"; do
    if jq -e "$field" test-snapshot.json >/dev/null 2>&1; then
        echo "  ✓ Journal field exists: $field"
    else
        echo "  ✗ Missing journal field: $field"
        exit 1
    fi
done

# Cleanup
rm -f test-snapshot.json

echo ""
echo "All snapshot schema tests passed!"