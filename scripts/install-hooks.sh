#!/usr/bin/env bash

set -euo pipefail

echo "Installing multi-agent coordination git hooks..."

# Make hooks executable
chmod +x .githooks/pre-commit

# Configure git to use our hooks directory
if git config core.hooksPath .githooks; then
    echo "✓ Git hooks path configured: .githooks/"
else
    echo "✗ Failed to configure git hooks path"
    exit 1
fi

# Verify configuration
HOOKS_PATH=$(git config core.hooksPath)
if [ "$HOOKS_PATH" = ".githooks" ]; then
    echo "✓ Git hooks configured successfully"
else
    echo "✗ Git hooks configuration failed (got: $HOOKS_PATH)"
    exit 1
fi

# List installed hooks
echo ""
echo "Installed hooks:"
ls -la .githooks/ | grep -v "^total" | while read -r line; do
    echo "  $line"
done

echo ""
echo "Hook rules installed:"
echo "  1. Commit message format: ^\[[A-Z0-9-]+\]\[[a-z0-9._-]+\] .+"
echo "  2. Agent ID verification"
echo "  3. Task ownership validation"
echo "  4. Lease violation checking"
echo "  5. Scope boundary checking"

echo ""
echo "To test hooks, try committing with invalid format:"
echo "  git commit -m \"test commit\"  # Should fail"
echo ""
echo "To bypass hooks temporarily (for emergency fixes only):"
echo "  git commit --no-verify -m \"[EMERGENCY][agent-id] Emergency fix\""

# Make this script executable
chmod +x "$0"