#!/usr/bin/env bash

set -euo pipefail

# Test runner for multi-agent coordination system
echo "Running multi-agent coordination system tests..."
echo "================================================"

# Configuration
TESTS_DIR="tests/unit"
FAILED_TESTS=()
PASSED_TESTS=()

# Check dependencies
echo "Checking dependencies..."
for cmd in jq bash; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "✗ Missing dependency: $cmd"
        exit 1
    else
        echo "✓ Found: $cmd"
    fi
done

# Run all unit tests
echo ""
echo "Running unit tests..."
echo "-------------------"

for test_file in "$TESTS_DIR"/*.sh; do
    if [ -f "$test_file" ] && [ -x "$test_file" ]; then
        test_name=$(basename "$test_file" .sh)
        echo "Running: $test_name..."
        
        if bash "$test_file"; then
            echo "✓ PASS: $test_name"
            PASSED_TESTS+=("$test_name")
        else
            echo "✗ FAIL: $test_name"
            FAILED_TESTS+=("$test_name")
        fi
        
        echo ""
    fi
done

# Summary
echo "Test Summary"
echo "============"
echo "Passed: ${#PASSED_TESTS[@]}"
echo "Failed: ${#FAILED_TESTS[@]}"

if [ ${#PASSED_TESTS[@]} -gt 0 ]; then
    echo ""
    echo "Passed tests:"
    for test in "${PASSED_TESTS[@]}"; do
        echo "  ✓ $test"
    done
fi

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo ""
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  ✗ $test"
    done
    echo ""
    echo "Some tests failed. Check the output above for details."
    exit 1
fi

# Integration test placeholder
echo ""
echo "Integration Tests"
echo "================="
echo "Note: Integration tests require a live git repository and agent coordination."
echo "Run these manually in a test environment:"
echo ""
echo "  1. Basic workflow test:"
echo "     bash scripts/set-identity.sh \"agent-test-1\" \"test-machine\""
echo "     bash scripts/install-hooks.sh"
echo "     bash scripts/task.sh new \"TASK-TEST-001\" \"Test task\""
echo "     bash scripts/task.sh claim \"TASK-TEST-001\""
echo "     bash scripts/worktree.sh new \"TASK-TEST-001\""
echo ""
echo "  2. Lease conflict test:"
echo "     # In terminal 1:"
echo "     bash scripts/lease.sh acquire \"test-files/*.txt\" \"TASK-TEST-001\""
echo "     # In terminal 2 (should fail):"
echo "     bash scripts/lease.sh acquire \"test-files/*.txt\" \"TASK-TEST-002\""
echo ""
echo "  3. Snapshot generation test:"
echo "     bash scripts/status-snapshot.sh generate | jq ."
echo "     bash scripts/status-snapshot.sh save"
echo "     jq . state/snapshot.json"
echo ""
echo "All unit tests passed! ✅"
echo ""
echo "Next steps:"
echo "  1. Run integration tests in a test environment"
echo "  2. Deploy to your multi-agent setup"
echo "  3. Monitor with: bash scripts/status-snapshot.sh watch"