#!/usr/bin/env bash

set -euo pipefail

TASKS_DIR="state/tasks"
JOURNAL_LOG="state/journal.log"
AGENT_ID=""

# Load identity from steering file
load_identity() {
    if [ -f ".kiro/steering/00-identity.md" ]; then
        AGENT_ID=$(grep "AGENT_ID: " ".kiro/steering/00-identity.md" | cut -d' ' -f2)
    elif [ -f ".env" ]; then
        source .env 2>/dev/null || true
    fi
    
    if [ -z "$AGENT_ID" ] || [ "$AGENT_ID" = "<REPLACE_ME>" ]; then
        echo "Error: AGENT_ID not set. Run scripts/set-identity.sh first."
        exit 1
    fi
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

# Create new worktree for a task
worktree_new() {
    local task_id="$1"
    
    load_identity
    validate_task_id "$task_id" || return 1
    
    local file=$(task_file "$task_id")
    
    if [ ! -f "$file" ]; then
        echo "Error: Task $task_id not found."
        return 1
    fi
    
    # Check task ownership
    local owner=$(jq -r '.owner' "$file")
    if [ "$owner" != "$AGENT_ID" ]; then
        echo "Error: Task $task_id owned by $owner. Only owner can create worktree."
        return 1
    fi
    
    # Check if worktree already exists
    local existing_worktree=$(jq -r '.worktree' "$file")
    if [ "$existing_worktree" != "null" ] && [ -d "$existing_worktree" ]; then
        echo "Error: Worktree already exists at $existing_worktree"
        return 1
    fi
    
    # Create worktree directory name
    local worktree_dir="../wt-$task_id"
    local branch_name="task/$task_id"
    
    echo "Creating worktree for task $task_id..."
    echo "  Directory: $worktree_dir"
    echo "  Branch: $branch_name"
    
    # Create worktree
    if ! git worktree add "$worktree_dir" -b "$branch_name"; then
        echo "Error: Failed to create worktree."
        return 1
    fi
    
    # Update task with worktree info
    local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file="${file}.tmp"
    
    jq \
        --arg worktree "$worktree_dir" \
        --arg branch "$branch_name" \
        --arg updated_at "$updated_at" \
        --arg agent_id "$AGENT_ID" \
        --arg timestamp "$updated_at" \
        '
        .worktree = $worktree |
        .branch = $branch |
        .updated_at = $updated_at |
        .history += [{
            "timestamp": $timestamp,
            "agent_id": $agent_id,
            "action": "WORKTREE_CREATE",
            "details": ("Worktree created at " + $worktree)
        }]
        ' "$file" > "$temp_file"
    
    mv "$temp_file" "$file"
    
    # Journal entry
    local detail="Worktree created at $worktree_dir for task $task_id"
    echo "$updated_at $AGENT_ID $task_id WORKTREE_NEW $detail" >> "$JOURNAL_LOG"
    
    echo ""
    echo "Worktree created successfully!"
    echo "To work on this task:"
    echo "  cd $worktree_dir"
    echo "  # Make your changes..."
    echo "  git add ."
    echo "  git commit -m \"[$task_id][$AGENT_ID] Your commit message\""
    echo "  git push origin $branch_name"
}

# Remove worktree
worktree_rm() {
    local task_id="$1"
    
    load_identity
    validate_task_id "$task_id" || return 1
    
    local file=$(task_file "$task_id")
    
    if [ ! -f "$file" ]; then
        echo "Error: Task $task_id not found."
        return 1
    fi
    
    # Check task ownership
    local owner=$(jq -r '.owner' "$file")
    if [ "$owner" != "$AGENT_ID" ]; then
        echo "Error: Task $task_id owned by $owner. Only owner can remove worktree."
        return 1
    fi
    
    # Get worktree info
    local worktree_dir=$(jq -r '.worktree' "$file")
    local branch_name=$(jq -r '.branch' "$file")
    
    if [ "$worktree_dir" = "null" ] || [ ! -d "$worktree_dir" ]; then
        echo "Error: No worktree found for task $task_id"
        return 1
    fi
    
    # Check for uncommitted changes
    echo "Checking for uncommitted changes in $worktree_dir..."
    
    pushd "$worktree_dir" > /dev/null
    
    local uncommitted_changes=false
    
    # Check for unstaged changes
    if ! git diff --quiet; then
        echo "  Unstaged changes found:"
        git diff --name-only
        uncommitted_changes=true
    fi
    
    # Check for staged but uncommitted changes
    if ! git diff --cached --quiet; then
        echo "  Staged but uncommitted changes found:"
        git diff --cached --name-only
        uncommitted_changes=true
    fi
    
    popd > /dev/null
    
    if [ "$uncommitted_changes" = true ]; then
        echo ""
        echo "Error: Worktree has uncommitted changes. Commit or stash them first."
        echo "Options:"
        echo "  1. Commit changes: cd $worktree_dir && git commit -m \"[WIP]\""
        echo "  2. Stash changes: cd $worktree_dir && git stash"
        echo "  3. Discard changes: cd $worktree_dir && git checkout . && git clean -fd"
        return 1
    fi
    
    # Confirm removal
    echo ""
    echo "Worktree to be removed:"
    echo "  Directory: $worktree_dir"
    echo "  Branch: $branch_name"
    echo ""
    read -p "Are you sure you want to remove this worktree? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Worktree removal cancelled."
        return 0
    fi
    
    # Remove worktree
    echo "Removing worktree..."
    
    if ! git worktree remove "$worktree_dir" --force; then
        echo "Error: Failed to remove worktree. Trying manual cleanup..."
        
        # Manual cleanup
        rm -rf "$worktree_dir"
        git worktree prune
        echo "Worktree removed manually (force)."
    fi
    
    # Delete remote branch if it exists
    if git ls-remote --exit-code origin "$branch_name" > /dev/null 2>&1; then
        echo "Note: Remote branch $branch_name still exists."
        echo "To delete it: git push origin --delete $branch_name"
    fi
    
    # Update task
    local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local temp_file="${file}.tmp"
    
    jq \
        --arg worktree "null" \
        --arg branch "null" \
        --arg updated_at "$updated_at" \
        --arg agent_id "$AGENT_ID" \
        --arg timestamp "$updated_at" \
        '
        .worktree = $worktree |
        .branch = $branch |
        .updated_at = $updated_at |
        .history += [{
            "timestamp": $timestamp,
            "agent_id": $agent_id,
            "action": "WORKTREE_REMOVE",
            "details": "Worktree removed"
        }]
        ' "$file" > "$temp_file"
    
    mv "$temp_file" "$file"
    
    # Journal entry
    local detail="Worktree removed for task $task_id"
    echo "$updated_at $AGENT_ID $task_id WORKTREE_RM $detail" >> "$JOURNAL_LOG"
    
    echo "Worktree removed successfully."
}

# List worktrees
worktree_list() {
    echo "Git Worktrees:"
    echo "TASK_ID         WORKTREE_DIR              BRANCH              OWNER                  STATUS"
    echo "--------------- ------------------------- ------------------- ---------------------- ---------"
    
    # Get all worktrees from git
    git worktree list | while read -r line; do
        local worktree_dir=$(echo "$line" | awk '{print $1}')
        local commit_hash=$(echo "$line" | awk '{print $2}')
        local branch_info=$(echo "$line" | awk '{print $3}' | sed "s/\[//;s/\]//")
        
        # Try to find matching task
        local task_match=""
        for file in "$TASKS_DIR"/*.json; do
            [ -f "$file" ] || continue
            
            local task_worktree=$(jq -r '.worktree' "$file")
            if [ "$task_worktree" = "$worktree_dir" ]; then
                local task_id=$(jq -r '.id' "$file")
                local owner=$(jq -r '.owner' "$file")
                local status=$(jq -r '.status' "$file")
                
                printf "%-15s %-25s %-20s %-22s %s\n" \
                    "$task_id" "$worktree_dir" "$branch_info" "$owner" "$status"
                task_match="found"
                break
            fi
        done
        
        # If no task match, show as orphaned
        if [ -z "$task_match" ]; then
            printf "%-15s %-25s %-20s %-22s %s\n" \
                "(orphaned)" "$worktree_dir" "$branch_info" "" ""
        fi
    done
    
    echo ""
    echo "Tasks with worktrees but no git worktree (should be cleaned up):"
    local orphaned_count=0
    for file in "$TASKS_DIR"/*.json; do
        [ -f "$file" ] || continue
        
        local worktree_dir=$(jq -r '.worktree' "$file")
        if [ "$worktree_dir" != "null" ] && [ ! -d "$worktree_dir" ]; then
            local task_id=$(jq -r '.id' "$file")
            local owner=$(jq -r '.owner' "$file")
            echo "  $task_id: $worktree_dir (owner: $owner)"
            orphaned_count=$((orphaned_count + 1))
        fi
    done
    
    if [ "$orphaned_count" -eq 0 ]; then
        echo "  (none)"
    fi
}

# Clean up orphaned worktrees
worktree_cleanup() {
    echo "Cleaning up orphaned worktrees..."
    
    local cleaned_count=0
    
    # Find tasks with worktrees that don't exist
    for file in "$TASKS_DIR"/*.json; do
        [ -f "$file" ] || continue
        
        local worktree_dir=$(jq -r '.worktree' "$file")
        local task_id=$(jq -r '.id' "$file")
        
        if [ "$worktree_dir" != "null" ] && [ ! -d "$worktree_dir" ]; then
            echo "Cleaning up orphaned worktree for task $task_id: $worktree_dir"
            
            # Update task
            local updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            local temp_file="${file}.tmp"
            
            jq \
                --arg worktree "null" \
                --arg branch "null" \
                --arg updated_at "$updated_at" \
                '
                .worktree = $worktree |
                .branch = $branch |
                .updated_at = $updated_at
                ' "$file" > "$temp_file"
            
            mv "$temp_file" "$file"
            
            cleaned_count=$((cleaned_count + 1))
        fi
    done
    
    # Prune git worktrees
    git worktree prune
    
    echo "Cleaned up $cleaned_count orphaned worktree(s)."
}

# Main command handler
main() {
    local command="${1:-help}"
    
    case "$command" in
        new)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 new <TASK_ID>"
                return 1
            fi
            worktree_new "$2"
            ;;
        rm)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 rm <TASK_ID>"
                return 1
            fi
            worktree_rm "$2"
            ;;
        list)
            worktree_list
            ;;
        cleanup)
            worktree_cleanup
            ;;
        help|--help|-h)
            cat << EOF
Usage: $0 <command> [args]

Commands:
  new <TASK_ID>      Create new worktree for task
  rm <TASK_ID>       Remove worktree (refuses if uncommitted changes)
  list               List all worktrees
  cleanup            Clean up orphaned worktrees
  help               Show this help

Worktree Rules:
  - Never edit the main checkout; always work in your worktree
  - Worktrees are created at ../wt-<TASK_ID>/
  - Each worktree has its own branch: task/<TASK_ID>
  - Commit format enforced: ^\[[A-Z0-9-]+\]\[[a-z0-9._-]+\] .+
  - Push immediately after commit

Examples:
  $0 new TASK-101
  $0 list
  $0 rm TASK-101
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