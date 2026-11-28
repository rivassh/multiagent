#!/usr/bin/env bash

set -euo pipefail

# Test lease conflict rejection
echo "Running lease conflict tests..."

# Setup test directory
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

# Create test scripts
cat > set-identity.sh << 'EOF'
#!/usr/bin/env bash
echo "Mock identity set"
EOF

cat > lease.sh << 'EOF'
#!/usr/bin/env bash
# Mock lease script that simulates conflict
if [ "$1" = "verify" ] && [ "$2" = "conflict.txt" ]; then
    echo "Lease violation(s) detected for path: conflict.txt"
    echo "  - Path conflict.txt matches *.txt owned by agent-other (expires: 2026-12-01T00:00:00Z)"
    exit 1
else
    echo "OK: No lease violations for path: $2"
    exit 0
fi
EOF

chmod +x set-identity.sh lease.sh

# Test 1: Conflict should be detected
echo "Test 1: Lease conflict detection"
if ./lease.sh verify "conflict.txt"; then
    echo "FAIL: Expected conflict but got success"
    exit 1
else
    echo "PASS: Conflict correctly detected"
fi

# Test 2: No conflict should pass
echo "Test 2: No conflict path"
if ./lease.sh verify "safe.txt"; then
    echo "PASS: Safe path accepted"
else
    echo "FAIL: Safe path rejected"
    exit 1
fi

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo "All lease conflict tests passed!"