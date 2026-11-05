#!/usr/bin/env bash
# load_role.sh — Role-based contract loader for stateless agents
#
# Usage: . .roles/load_role.sh <role-name>
#   or:  source .roles/load_role.sh <role-name>
#
# Available roles:
#   product-owner  - Requirement decomposition & acceptance criteria
#   scrum-master   - Triage, blocking resolution, dependency checks
#   architect-cto  - System specs, ADRs, global constraints
#   frontend-dev   - Strict TDD, frontend implementation
#   backend-dev    - Strict TDD, backend implementation
#   qa-engineer    - Verification against acceptance criteria
#   code-reviewer  - Independent review protocol

set -euo pipefail

ROLE="${1:-}"
ROLES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$ROLE" ]; then
    echo "Usage: source .roles/load_role.sh <role-name>"
    echo ""
    echo "Available roles:"
    for f in "$ROLES_DIR"/*.md; do
        name=$(basename "$f" .md)
        if [ "$name" != "README" ]; then
            desc=$(grep -m1 '^## Role' "$f" 2>/dev/null | sed 's/^## Role //')
            echo "  $name  - $desc"
        fi
    done
    exit 1
fi

ROLE_FILE="$ROLES_DIR/$ROLE.md"

if [ ! -f "$ROLE_FILE" ]; then
    echo "Error: Unknown role '$ROLE'"
    echo "Available roles:"
    for f in "$ROLES_DIR"/*.md; do
        name=$(basename "$f" .md)
        if [ "$name" != "README" ]; then
            echo "  $name"
        fi
    done
    exit 1
fi

export AGENT_ROLE="$ROLE"
export AGENT_ROLE_FILE="$ROLE_FILE"
export AGENT_ROLE_DIR="$ROLES_DIR"

echo "============================================"
echo "Role loaded: $ROLE"
echo "============================================"
echo ""
echo "Scope: $(grep -m1 '^## Scope' "$ROLE_FILE" | sed 's/^## Scope //')"
echo ""
echo "Full playbook: $ROLE_FILE"
echo ""
echo "--- Playbook contents ---"
cat "$ROLE_FILE"
echo ""
echo "--- End playbook ---"
echo ""
echo "You are now operating as $ROLE. Follow the playbook above."
echo "Run 'source .roles/load_role.sh' without arguments to list available roles."