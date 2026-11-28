#!/usr/bin/env bash

set -euo pipefail

IDENTITY_FILE=".kiro/steering/00-identity.md"

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <AGENT_ID> <MACHINE_NAME>"
    echo ""
    echo "Example: $0 \"agent-\$(hostname)-\$\$\" \"\$(hostname)\""
    exit 1
fi

AGENT_ID="$1"
MACHINE="$2"
WORKSPACE_ROOT="$(pwd)"

# Validate AGENT_ID is not empty
if [ -z "$AGENT_ID" ]; then
    echo "Error: AGENT_ID cannot be empty"
    exit 1
fi

# Check if identity file exists
if [ ! -f "$IDENTITY_FILE" ]; then
    echo "Error: Identity file not found: $IDENTITY_FILE"
    echo "Create it first with the template."
    exit 1
fi

# Create backup
cp "$IDENTITY_FILE" "${IDENTITY_FILE}.backup.$(date +%s)"

# Update identity file using sed
sed -i \
    -e "s/AGENT_ID: <REPLACE_ME>/AGENT_ID: $AGENT_ID/" \
    -e "s/MACHINE: <REPLACE_ME>/MACHINE: $MACHINE/" \
    -e "s|WORKSPACE_ROOT: /mnt/Projects/multiagent|WORKSPACE_ROOT: $WORKSPACE_ROOT|" \
    "$IDENTITY_FILE"

# Verify changes
echo "Identity updated successfully:"
echo "  AGENT_ID: $AGENT_ID"
echo "  MACHINE: $MACHINE"
echo "  WORKSPACE_ROOT: $WORKSPACE_ROOT"
echo ""
echo "File: $IDENTITY_FILE"

# Set executable permission for the script
chmod +x "$0"