#!/usr/bin/env bash

set -euo pipefail

# Configuration
TASKS_DIR="state/tasks"
JOURNAL_LOG="state/journal.log"
SNAPSHOT_FILE="state/snapshot.json"

# Get machine identity
get_machine_info() {
    local machine=""
    if [ -f ".kiro/steering/00-identity.md" ]; then
        machine=$(grep "MACHINE: " ".kiro/steering/00-identity.md" | cut -d' ' -f2)
    fi
    
    if [ -z "$machine" ] || [ "$machine" = "<REPLACE_ME>" ]; then
        machine=$(hostname)
    fi
    
    echo "$machine"
}

# Get agent information
get_agent_info() {
    local agent_id="$1"
    local agent_info="{}"
    
    # Try to get agent from agents.json if it exists
    if [ -f "state/agents.json" ]; then
        agent_info=$(jq -r --arg agent_id "$agent_id" '.agents[] | select(.id == $agent_id) // empty' "state/agents.json" 2>/dev/null || echo "{}")
    fi
    
    echo "$agent_info"
}

# Get task information
get_task_info() {
    local task_id="$1"
    local task_file="$TASKS_DIR/$task_id.json"
    
    if [ ! -f "$task_file" ]; then
        echo "{}"
        return
    fi
    
    cat "$task_file"
}

# Get last journal lines for an agent
get_last_journal_lines() {
    local agent_id="$1"
    local limit="${2:-5}"
    
    if [ ! -f "$JOURNAL_LOG" ]; then
        echo "[]"
        return
    fi
    
    # Get last N lines for this agent, format as JSON array
    grep " $agent_id " "$JOURNAL_LOG" | tail -n "$limit" | while IFS= read -r line; do
        local timestamp=$(echo "$line" | cut -d' ' -f1)
        local task_id=$(echo "$line" | cut -d' ' -f3)
        local action=$(echo "$line" | cut -d' ' -f4)
        local detail=$(echo "$line" | cut -d' ' -f5- | jq -R -s '.')
        
        jq -n \
            --arg timestamp "$timestamp" \
            --arg task_id "$task_id" \
            --arg action "$action" \
            --argjson detail "$detail" \
            '{
                timestamp: $timestamp,
                task_id: $task_id,
                action: $action,
                detail: $detail
            }'
    done | jq -s '.'
}

# Generate snapshot
generate_snapshot() {
    local generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local machine=$(get_machine_info)
    
    # Find all agents with active tasks
    declare -A agents_map
    local agents_json="[]"
    
    # Scan tasks to find active agents
    for task_file in "$TASKS_DIR"/*.json; do
        [ -f "$task_file" ] || continue
        
        local task_id=$(jq -r '.id' "$task_file")
        local owner=$(jq -r '.owner' "$task_file")
        local status=$(jq -r '.status' "$task_file")
        
        if [ "$owner" != "null" ] && [ -n "$owner" ]; then
            agents_map["$owner"]=1
        fi
    done
    
    # Build agents array
    for agent_id in "${!agents_map[@]}"; do
        # Find tasks owned by this agent
        local agent_tasks="[]"
        for task_file in "$TASKS_DIR"/*.json; do
            [ -f "$task_file" ] || continue
            
            local task_owner=$(jq -r '.owner' "$task_file")
            if [ "$task_owner" = "$agent_id" ]; then
                local task_id=$(jq -r '.id' "$task_file")
                local task_status=$(jq -r '.status' "$task_file")
                local task_branch=$(jq -r '.branch' "$task_file")
                local task_worktree=$(jq -r '.worktree' "$task_file")
                local blocked_reason=$(jq -r '.blocked_reason' "$task_file")
                
                # Get last activity from task history
                local last_activity=$(jq -r '.history[-1].timestamp // ""' "$task_file")
                
                # Get last journal lines
                local last_journal_lines=$(get_last_journal_lines "$agent_id" 5)
                
                local task_json=$(jq -n \
                    --arg task_id "$task_id" \
                    --arg status "$task_status" \
                    --arg branch "$task_branch" \
                    --arg worktree "$task_worktree" \
                    --arg last_activity "$last_activity" \
                    --arg blocked_reason "$blocked_reason" \
                    --argjson last_journal_lines "$last_journal_lines" \
                    '{
                        task_id: $task_id,
                        status: $status,
                        branch: $branch,
                        worktree: $worktree,
                        last_activity: $last_activity,
                        blocked_reason: $blocked_reason,
                        last_journal_lines: $last_journal_lines
                    }')
                
                agent_tasks=$(echo "$agent_tasks" | jq --argjson task "$task_json" '. + [$task]')
            fi
        done
        
        # Get agent info
        local agent_info=$(get_agent_info "$agent_id")
        local agent_name=$(echo "$agent_info" | jq -r '.name // ""')
        local agent_role=$(echo "$agent_info" | jq -r '.role // ""')
        
        # Create agent entry
        local agent_json=$(jq -n \
            --arg agent_id "$agent_id" \
            --arg agent_name "$agent_name" \
            --arg agent_role "$agent_role" \
            --argjson tasks "$agent_tasks" \
            '{
                agent_id: $agent_id,
                name: $agent_name,
                role: $agent_role,
                tasks: $tasks
            }')
        
        agents_json=$(echo "$agents_json" | jq --argjson agent "$agent_json" '. + [$agent]')
    done
    
    # Get system stats
    local total_tasks=$(ls "$TASKS_DIR"/*.json 2>/dev/null | wc -l)
    local active_tasks=0
    local blocked_tasks=0
    
    for task_file in "$TASKS_DIR"/*.json; do
        [ -f "$task_file" ] || continue
        
        local status=$(jq -r '.status' "$task_file")
        case "$status" in
            IN_PROGRESS|NEEDS_QA|IN_REVIEW)
                active_tasks=$((active_tasks + 1))
                ;;
            BLOCKED)
                blocked_tasks=$((blocked_tasks + 1))
                ;;
        esac
    done
    
    # Create final snapshot
    jq -n \
        --arg generated_at "$generated_at" \
        --arg machine "$machine" \
        --argjson agents "$agents_json" \
        --arg total_tasks "$total_tasks" \
        --arg active_tasks "$active_tasks" \
        --arg blocked_tasks "$blocked_tasks" \
        '{
            generated_at: $generated_at,
            machine: $machine,
            agents: $agents,
            stats: {
                total_tasks: $total_tasks | tonumber,
                active_tasks: $active_tasks | tonumber,
                blocked_tasks: $blocked_tasks | tonumber
            }
        }'
}

# Main execution
main() {
    local command="${1:-generate}"
    
    case "$command" in
        generate)
            generate_snapshot
            ;;
        save)
            local snapshot=$(generate_snapshot)
            mkdir -p "$(dirname "$SNAPSHOT_FILE")"
            echo "$snapshot" > "$SNAPSHOT_FILE"
            echo "Snapshot saved to $SNAPSHOT_FILE"
            ;;
        watch)
            # Continuous monitoring mode
            echo "Starting snapshot watch (Ctrl+C to stop)..."
            while true; do
                clear
                echo "=== Multi-Agent System Snapshot ==="
                echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
                echo ""
                
                generate_snapshot | jq '.'
                
                echo ""
                echo "Refreshing in 10 seconds..."
                sleep 10
            done
            ;;
        help|--help|-h)
            cat << EOF
Usage: $0 <command>

Commands:
  generate    Generate snapshot JSON to stdout
  save        Generate and save snapshot to $SNAPSHOT_FILE
  watch       Continuous monitoring mode (refresh every 10s)
  help        Show this help

Output format:
  {
    "generated_at": "ISO8601 timestamp",
    "machine": "machine name",
    "agents": [
      {
        "agent_id": "agent identifier",
        "name": "agent name (if available)",
        "role": "agent role (if available)",
        "tasks": [
          {
            "task_id": "task identifier",
            "status": "task status",
            "branch": "git branch",
            "worktree": "worktree path",
            "last_activity": "last activity timestamp",
            "blocked_reason": "block reason (if blocked)",
            "last_journal_lines": ["journal entries"]
          }
        ]
      }
    ],
    "stats": {
      "total_tasks": N,
      "active_tasks": N,
      "blocked_tasks": N
    }
  }

EOF
            ;;
        *)
            echo "Error: Unknown command: $command"
            echo "Use: $0 help"
            return 1
            ;;
    esac
}

# Run main function
main "$@"