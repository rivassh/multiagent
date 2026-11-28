---
inclusion: always
---

AGENT_ID: <REPLACE_ME>
MACHINE: <REPLACE_ME>
WORKSPACE_ROOT: /mnt/Projects/multiagent

## Identity Rules

1. **Identity Verification**: If AGENT_ID is still `<REPLACE_ME>`, STOP and ask the human to set it.
2. **Kiro vs Kilo**: Kiro reads identity from this steering file, not from environment variables. Kilo CLI reads from environment variables.
3. **Consistency**: Both AGENT_ID and MACHINE must be set for proper coordination across machines.
4. **Workspace**: WORKSPACE_ROOT is automatically set to the current workspace directory.

## Usage

- Set identity using: `bash scripts/set-identity.sh <AGENT_ID> <MACHINE_NAME>`
- Or manually edit this file with proper values
- Verify identity: `grep AGENT_ID .kiro/steering/00-identity.md`

## Notes

- AGENT_ID should be unique per agent instance (e.g., "agent-hostname-pid")
- MACHINE should identify the physical/virtual machine (e.g., "srv-4048378975")
- Never commit this file with `<REPLACE_ME>` values to the repository