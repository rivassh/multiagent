#!/usr/bin/env bash

set -euo pipefail

# Test commit message validation
echo "Running commit message validation tests..."

# Setup test directory
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

# Create mock pre-commit hook
cat > pre-commit << 'EOF'
#!/usr/bin/env bash

COMMIT_MSG="$1"

# Rule 1: Validate commit message format
if [[ ! "$COMMIT_MSG" =~ ^\[[A-Z0-9-]+\]\[[a-z0-9._-]+\].+ ]]; then
    echo "ERROR: Invalid commit message format."
    echo "Format must be: ^\[[A-Z0-9-]+\]\[[a-z0-9._-]+\] .+"
    exit 1
fi

echo "Commit message validation passed: $COMMIT_MSG"
exit 0
EOF

chmod +x pre-commit

# Test cases
test_cases=(
    # Valid cases
    "[TASK-101][agent-host-123] Implement feature" 0
    "[TASK-PM-001][agent.srv.1] Fix bug" 0
    "[TASK-202][agent-1] Update docs" 0
    
    # Invalid cases
    "plain message" 1
    "[TASK-101] missing agent id" 1
    "[agent-host-123] missing task id" 1
    "[] empty brackets" 1
    "[TASK-101][agent-host-123]" 1  # Missing description
    "[task-101][agent-host-123] lowercase task" 1  # Lowercase task id
    "[TASK-101][AGENT-HOST-123] uppercase agent" 1  # Uppercase agent id
    "[TASK-101][agent_host.123-test] valid special chars" 0
)

echo "Test cases:"
echo "-----------"

pass_count=0
fail_count=0

for ((i=0; i<${#test_cases[@]}; i+=2)); do
    msg="${test_cases[i]}"
    expected="${test_cases[i+1]}"
    
    if ./pre-commit "$msg" >/dev/null 2>&1; then
        actual=0
    else
        actual=1
    fi
    
    if [ "$actual" -eq "$expected" ]; then
        echo "✓ PASS: \"$msg\" (expected: $expected, got: $actual)"
        ((pass_count++))
    else
        echo "✗ FAIL: \"$msg\" (expected: $expected, got: $actual)"
        ((fail_count++))
    fi
done

echo ""
echo "Results: $pass_count passed, $fail_count failed"

# Cleanup
cd /
rm -rf "$TEST_DIR"

if [ "$fail_count" -gt 0 ]; then
    exit 1
fi

echo "All commit validation tests passed!"