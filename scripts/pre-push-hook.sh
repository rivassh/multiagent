#!/bin/bash
# Generic Git pre-push hook for Git-Swarm Protocol Enforcement
# Install: cp scripts/pre-push-hook.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -e

echo "🔍 Git-Swarm Protocol: Pre-push validation..."

# Find repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Check if validation scripts exist
if [ ! -f "scripts/validate_all.js" ]; then
  echo "⚠️  Validation scripts not found, skipping protocol check"
  exit 0
fi

# Check if node is available
if ! command -v node &> /dev/null; then
  echo "⚠️  Node.js not found, skipping protocol check"
  exit 0
fi

# Run validation
echo "Running protocol validation..."
if node scripts/validate_all.js; then
  echo "✅ Protocol validation passed"
  exit 0
else
  echo ""
  echo "❌ PROTOCOL VALIDATION FAILED"
  echo "Push rejected. Fix protocol violations before pushing."
  echo ""
  echo "To bypass (NOT RECOMMENDED): git push --no-verify"
  exit 1
fi