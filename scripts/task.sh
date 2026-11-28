#!/usr/bin/env bash

set -euo pipefail

TASKS_DIR="state/tasks"
JOURNAL_LOG="state/journal.log"
AGENT_ID=""
MACHINE=""

# Load identity from steering file
load_identity() {
    if [ -f ".kiro/steering/00-identity.md" ]; then
        AGENT_ID=$(grep "AGENT_ID: " ".kiro/steering/00-identity.md" | cut -d' ' -f2)
        MACHINE=$(grep "MACHINE: " ".kiro/steering/00-identity.md" | cut -d' ' -f2)
    elif [ -f ".env" ]; then
        source .env 2>/dev/null || true
    fi
    
    if [ -z "$AGENT_ID" ] || [ "$AGENT_ID" = "<REPLACE_ME>" ]; then
        echo "Error: AGENT_ID not set. Run scripts/set-identity.sh first."
        exit 1
    fi
}

# Append to journal
journal_append() {
    local task_id="$1"
    local action="$2"
    local detail="$3"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    mkdir -p "$(dirname "$JOURNAL_LOG")"
    echo "$timestamp $AGENT_ID $task_id $action $detail" >> "$JOURNAL_LOG"
}

# Get task file path
task_file() {
    local task_id="$1"
    echo "$TASKS_DIR/$task_id.json"
}

# Validate task ID format
validate_task_id() {
    local task_id="$1"
    if [[ ! "$task_id" =~ ^[A-Z0-9-]+$ ]]; then
        echo "Error: Invalid task ID format. Use uppercase letters, numbers, and hyphens."
        return 1
    fi
    return 0
}

# Create new task
task_new() {
    local task_id="$1"
    local title="$2"
    
    load_identity
    validate_task_id "$task_id" || return 1
    
    local file=$(task_file "$task_id")
    
    if [ -f "$file" ]; then
        echo "Error: Task $task_id already exists."
        return 1
    fi
    
    local created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    cat > "$file" << EOF
{
    "id": "$task_id",
    "title": "$title",
    "status": "TODO",
    "owner": null,
    "branch": null,
    "worktree": null,
    "created_at": "$created_at",
    "updated_at": "$created_at",
    "depends_on": [],
    "acceptance": [],
    "blocked_reason": null,
    "history": [
        {
            "timestamp": "$created_at",
            "agent_id": "$AGENT_ID",
            "action": "CREATE",
            "details": "Task created: $title"
        }
    ]
}
EOF
    
    journal_append "$task_id" "CREATE" "Task created: $title"
    echo "Created task $task_id: $title"
}

# Claim a task
task_claim() {
    local task_id="$1"
    
    load_identity
    validate_task_id "$task_id" || return 1
    
    local file=$(task_file "$task_id")
    
    if [ ! -f "$file" ]; then
        echo "Error: Task $task_id not found."
        return 1
    fi
    
    # Read current task state
    local status=$(jq -r '.status' "$file")
    local owner=$(jq -r '.owner' "$file")
    
    if [ "$status" != "TODO" ]; then
        echo "Error: Task $task_id status is $status, must be TODO to claim."
        return 1
    fi
    
    if [ "$owner" != "null" ] && [ "$owner" != "$AGENT_ID" ]; then
        echo "Error: Task $task_id already owned by $owner."
        return 1
    fi
    
    # Update task
    local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file="${file}.tmp"
    
    jq \
        --arg status "IN_PROGRESS" \
        --arg owner "$AGENT_ID" \
        --arg updated_at "$updated_at" \
        --arg agent_id "$AGENT_ID" \
        --arg timestamp "$updated_at" \
        '
        .status = $status |
        .owner = $owner |
        .updated_at = $updated_at |
        .history += [{
            "timestamp": $timestamp,
            "agent_id": $agent_id,
            "action": "CLAIM",
            "details": "Task claimed by agent"
        }]
        ' "$file" > "$temp_file"
    
    mv "$temp_file" "$file"
    
    journal_append "$task_id" "CLAIM" "Task claimed by $AGENT_ID"
    echo "Claimed task $task_id"
}

# Update task status
task_status() {
    local task_id="$1"
    local new_status="$2"
    
    load_identity
    validate_task_id "$task_id" || return 1
    
    # Validate status
    case "$new_status" in
        TODO|IN_PROGRESS|NEEDS_QA|IN_REVIEW|DONE|BLOCKED|ABANDONED)
            ;;
        *)
            echo "Error: Invalid status: $new_status"
            echo "Valid statuses: TODO, IN_PROGRESS, NEEDS_QA, IN_REVIEW, DONE, BLOCKED, ABANDONED"
            return 1
            ;;
    esac
    
    local file=$(task_file "$task_id")
    
    if [ ! -f "$file" ]; then
        echo "Error: Task $task_id not found."
        return 1
    fi
    
    # Check ownership for certain transitions
    local owner=$(jq -r '.owner' "$file")
    if [ "$owner" != "$AGENT_ID" ] && [ "$owner" != "null" ]; then
        echo "Error: Task $task_id owned by $owner. Only owner can update status."
        return 1
    fi
    
    # Update task
    local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file="${file}.tmp"
    local details="Status changed from $(jq -r '.status' "$file") to $new_status"
    
    jq \
        --arg status "$new_status" \
        --arg updated_at "$updated_at" \
        --arg agent_id "$AGENT_ID" \
        --arg timestamp "$updated_at" \
        --arg details "$details" \
        '
        .status = $status |
        .updated_at = $updated_at |
        .history += [{
            "timestamp": $timestamp,
            "agent_id": $agent_id,
            "action": "STATUS_CHANGE",
            "details": $details
        }]
        ' "$file" > "$temp_file"
    
    mv "$temp_file" "$file"
    
    journal_append "$task_id" "STATUS" "Changed to $new_status"
    echo "Updated task $task_id status to $new_status"
}

# Block a task
task_block() {
    local task_id="$1"
    local reason="$2"
    
    load_identity
    validate_task_id "$task_id" || return 1
    
    local file=$(task_file "$task_id")
    
    if [ ! -f "$file" ]; then
        echo "Error: Task $task_id not found."
        return 1
    fi
    
    # Update task
    local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file="${file}.tmp"
    
    jq \
        --arg status "BLOCKED" \
        --arg updated_at "$updated_at" \
        --arg agent_id "$AGENT_ID" \
        --arg timestamp "$updated_at" \
        --arg reason "$reason" \
        '
        .status = $status |
        .blocked_reason = $reason |
        .updated_at = $updated_at |
        .history += [{
            "timestamp": $timestamp,
            "agent_id": $agent_id,
            "action": "BLOCK",
            "details": ("Blocked: " + $reason)
        }]
        ' "$file" > "$temp_file"
    
    mv "$temp_file" "$file"
    
    journal_append "$task_id" "BLOCK" "Blocked: $reason"
    echo "Blocked task $task_id: $reason"
}

# Mark task as done
task_done() {
    local task_id="$1"
    
    load_identity
    validate_task_id "$task_id" || return 1
    
    local file=$(task_file "$task_id")
    
    if [ ! -f "$file" ]; then
        echo "Error: Task $task_id not found."
        return 1
    fi
    
    # Check if task is in reviewable state
    local status=$(jq -r '.status' "$file")
    if [ "$status" != "IN_REVIEW" ]; then
        echo "Error: Task $task_id status is $status, must be IN_REVIEW to mark as DONE."
        return 1
    fi
    
    # Update task
    local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file="${file}.tmp"
    
    jq \
        --arg status "DONE" \
        --arg updated_at "$updated_at" \
        --arg agent_id "$AGENT_ID" \
        --arg timestamp "$updated_at" \
        '
        .status = $status |
        .updated_at = $updated_at |
        .history += [{
            "timestamp": $timestamp,
            "agent_id": $agent_id,
            "action": "DONE",
            "details": "Task completed"
        }]
        ' "$file" > "$temp_file"
    
    mv "$temp_file" "$file"
    
    journal_append "$task_id" "DONE" "Task completed"
    echo "Marked task $task_id as DONE"
}

# List tasks
task_list() {
    local filter="${1:-all}"
    
    echo "Tasks ($filter):"
    echo "ID                 STATUS         OWNER                  TITLE"
    echo "------------------ -------------- ---------------------- --------------------"
    
    for file in "$TASKS_DIR"/*.json; do
        [ -f "$file" ] || continue
        
        local id=$(jq -r '.id' "$file")
        local status=$(jq -r '.status' "$file")
        local owner=$(jq -r '.owner' "$file")
        local title=$(jq -r '.title' "$file")
        
        if [ "$owner" = "null" ]; then
            owner=""
        fi
        
        case "$filter" in
            all)
                printf "%-18s %-14s %-22s %s\n" "$id" "$status" "$owner" "$title"
                ;;
            todo)
                [ "$status" = "TODO" ] && printf "%-18s %-14s %-22s %s\n" "$id" "$status" "$owner" "$title"
                ;;
            in_progress)
                [ "$status" = "IN_PROGRESS" ] && printf "%-18s %-14s %-22s %s\n" "$id" "$status" "$owner" "$title"
                ;;
            mine)
                load_identity >/dev/null 2>&1
                [ "$owner" = "$AGENT_ID" ] && printf "%-18s %-14s %-22s %s\n" "$id" "$status" "$owner" "$title"
                ;;
            *)
                echo "Error: Invalid filter: $filter"
                echo "Valid filters: all, todo, in_progress, mine"
                return 1
                ;;
        esac
    done
}

# Migrate from monolithic state files
task_migrate() {
    echo "Starting migration from monolithic state files..."
    
    # Find all monolithic task files
    local monoliths=(
        "state/tasks.json"
        "state/sima/tasks.json"
        "state/candash/tasks.json"
        "state/omr/tasks.json"
        "state/shared/tasks.json"
        "state/processmaker/tasks.json"
        "state/answer/tasks.json"
    )
    
    for monolith in "${monoliths[@]}"; do
        if [ -f "$monolith" ]; then
            echo "Migrating $monolith..."
            
            # Create backup
            local backup="state/legacy/$(basename "$monolith").bak"
            cp "$monolith" "$backup"
            echo "  Backup created: $backup"
            
            # Extract and migrate tasks
            local task_count=$(jq -r '.tasks | length' "$monolith" 2>/dev/null || echo "0")
            
            if [ "$task_count" -gt 0 ]; then
                for i in $(seq 0 $((task_count - 1))); do
                    local task_json=$(jq -r ".tasks[$i]" "$monolith")
                    local task_id=$(echo "$task_json" | jq -r '.id')
                    
                    if [ -n "$task_id" ] && [ "$task_id" != "null" ]; then
                        # Convert to new format
                        local new_json=$(echo "$task_json" | jq '
                            {
                                id: .id,
                                title: .title,
                                status: (
                                    if .status == "STAGE" then "IN_REVIEW"
                                    elif .status == "QA_PASSED" then "IN_REVIEW"
                                    elif .status == "QA_FAILED" then "BLOCKED"
                                    elif .status == "NEEDS_QA" then "NEEDS_QA"
                                    else .status end
                                ),
                                owner: .assigned_to,
                                branch: null,
                                worktree: null,
                                created_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
                                updated_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
                                depends_on: (.depends_on // []),
                                acceptance: [],
                                blocked_reason: .last_error,
                                history: [{
                                    timestamp: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
                                    agent_id: "migration",
                                    action: "MIGRATE",
                                    details: "Migrated from monolithic state"
                                }]
                            }
                        ')
                        
                        echo "$new_json" > "$TASKS_DIR/$task_id.json"
                        echo "  Migrated task: $task_id"
                    fi
                done
            fi
        fi
    done
    
    echo "Migration complete. Original files backed up in state/legacy/"
}

# Main command handler
main() {
    local command="${1:-help}"
    
    case "$command" in
        new)
            if [ $# -lt 3 ]; then
                echo "Usage: $0 new <TASK_ID> \"<TITLE>\""
                return 1
            fi
            task_new "$2" "$3"
            ;;
        claim)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 claim <TASK_ID>"
                return 1
            fi
            task_claim "$2"
            ;;
        status)
            if [ $# -lt 3 ]; then
                echo "Usage: $0 status <TASK_ID> <STATUS>"
                echo "Valid statuses: TODO, IN_PROGRESS, NEEDS_QA, IN_REVIEW, DONE, BLOCKED, ABANDONED"
                return 1
            fi
            task_status "$2" "$3"
            ;;
        block)
            if [ $# -lt 3 ]; then
                echo "Usage: $0 block <TASK_ID> \"<REASON>\""
                return 1
            fi
            task_block "$2" "$3"
            ;;
        done)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 done <TASK_ID>"
                return 1
            fi
            task_done "$2"
            ;;
        list)
            task_list "${2:-all}"
            ;;
        migrate)
            task_migrate
            ;;
        help|--help|-h)
            cat << EOF
Usage: $0 <command> [args]

Commands:
  new <TASK_ID> "<TITLE>"      Create a new task
  claim <TASK_ID>              Claim a TODO task
  status <TASK_ID> <STATUS>    Update task status
  block <TASK_ID> "<REASON>"   Block a task with reason
  done <TASK_ID>               Mark task as DONE (must be IN_REVIEW)
  list [filter]                List tasks (all|todo|in_progress|mine)
  migrate                      Migrate from monolithic state files
  help                         Show this help

Examples:
  $0 new TASK-101 "Implement feature"
  $0 claim TASK-101
  $0 status TASK-101 NEEDS_QA
  $0 list mine
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