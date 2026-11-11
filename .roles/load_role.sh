#!/bin/bash
# load_role.sh - Role entry script for GitOps swarm
# Usage: source .roles/load_role.sh <role>
# Roles: product-owner, scrum-master, architect-cto, frontend-dev, backend-dev, qa-engineer, code-reviewer

set -e

ROLES_DIR="$(dirname "${BASH_SOURCE[0]}")"
VALID_ROLES=("product-owner" "scrum-master" "architect-cto" "frontend-dev" "backend-dev" "qa-engineer" "code-reviewer")

show_usage() {
    echo "Usage: source .roles/load_role.sh <role>"
    echo ""
    echo "Available roles:"
    for role in "${VALID_ROLES[@]}"; do
        echo "  - $role"
    done
    echo ""
    echo "This script sets up your environment for the selected role."
    echo "It exports ROLE and ROLE_PLAYBOOK variables and displays the playbook."
}

if [ $# -eq 0 ]; then
    show_usage
    return 1 2>/dev/null || exit 1
fi

ROLE="$1"

# Validate role
if [[ ! " ${VALID_ROLES[@]} " =~ " ${ROLE} " ]]; then
    echo "Error: Invalid role '$ROLE'"
    show_usage
    return 1 2>/dev/null || exit 1
fi

PLAYBOOK_FILE="$ROLES_DIR/${ROLE}.md"

if [ ! -f "$PLAYBOOK_FILE" ]; then
    echo "Error: Playbook not found for role '$ROLE'"
    return 1 2>/dev/null || exit 1
fi

# Export role variables
export ROLE="$ROLE"
export ROLE_PLAYBOOK="$PLAYBOOK_FILE"

# Display playbook
echo "=========================================="
echo "  Role: $ROLE"
echo "=========================================="
echo ""
cat "$PLAYBOOK_FILE"
echo ""
echo "=========================================="
echo "  Environment configured for $ROLE"
echo "  ROLE=$ROLE"
echo "  ROLE_PLAYBOOK=$ROLE_PLAYBOOK"
echo "=========================================="

# Quick reference commands
echo ""
echo "Quick commands for $ROLE:"
case "$ROLE" in
    product-owner)
        echo "  View requirements: cat REQUIREMENT.md"
        echo "  View tasks: cat state/tasks.json | jq '.tasks[] | select(.status != \"DONE\") | {id, title, status}'"
        echo "  Claim task: ./scripts/acquire_lease_partitioned.sh sima && ./scripts/claim_task.sh TASK-XXX"
        ;;
    scrum-master)
        echo "  Check leases: cat state/leases.json"
        echo "  View team log: tail -f state/team_log.md"
        echo "  Acquire lease: ./scripts/acquire_lease_partitioned.sh sima"
        ;;
    architect-cto)
        echo "  View spec: cat docs/SPEC.md"
        echo "  View architecture: cat architectural_analysis.md"
        ;;
    frontend-dev|backend-dev)
        echo "  View tasks: cat state/tasks.json | jq '.tasks[] | select(.assigned_to == \"'${YOUR_ID:-agent-1}'\") | {id, title, status}'"
        echo "  Run tests: (project-specific)"
        echo "  Claim task: ./scripts/acquire_lease_partitioned.sh sima && ./scripts/claim_task.sh TASK-XXX"
        ;;
    qa-engineer)
        echo "  View QA tasks: cat state/tasks.json | jq '.tasks[] | select(.status == \"NEEDS_QA\") | {id, title, status}'"
        echo "  Run tests: (project-specific)"
        ;;
    code-reviewer)
        echo "  View review tasks: cat state/tasks.json | jq '.tasks[] | select(.status == \"NEEDS_REVIEW\") | {id, title, status}'"
        echo "  Review code: git diff"
        ;;
esac