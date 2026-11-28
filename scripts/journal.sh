#!/usr/bin/env bash

set -euo pipefail

JOURNAL_LOG="state/journal.log"
JOURNAL_MD="state/journal.md"

# Append to journal
journal_append() {
    local agent_id="$1"
    local task_id="$2"
    local action="$3"
    local detail="$4"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    mkdir -p "$(dirname "$JOURNAL_LOG")"
    mkdir -p "$(dirname "$JOURNAL_MD")"
    
    # Append to machine-readable log
    echo "$timestamp $agent_id $task_id $action $detail" >> "$JOURNAL_LOG"
    
    # Append to human-readable markdown
    if [ ! -f "$JOURNAL_MD" ]; then
        cat > "$JOURNAL_MD" << EOF
# Agent Activity Journal

This is an append-only record of agent activities. Never edit or delete entries.

## Recent Activity

EOF
    fi
    
    # Add entry to markdown
    local formatted_detail=$(echo "$detail" | sed 's/"/\\"/g')
    cat >> "$JOURNAL_MD" << EOF
- **$timestamp** | $agent_id | $task_id | $action  
  $formatted_detail

EOF
    
    echo "Journal entry added: $timestamp $agent_id $task_id $action"
}

# Tail journal entries
journal_tail() {
    local lines="${1:-20}"
    
    if [ ! -f "$JOURNAL_LOG" ]; then
        echo "Journal is empty."
        return 0
    fi
    
    echo "Last $lines journal entries:"
    echo "TIMESTAMP                  AGENT_ID                  TASK_ID    ACTION     DETAIL"
    echo "-------------------------- ------------------------- ---------- ---------- --------------------"
    tail -n "$lines" "$JOURNAL_LOG" | while IFS= read -r line; do
        local timestamp=$(echo "$line" | cut -d' ' -f1)
        local agent_id=$(echo "$line" | cut -d' ' -f2)
        local task_id=$(echo "$line" | cut -d' ' -f3)
        local action=$(echo "$line" | cut -d' ' -f4)
        local detail=$(echo "$line" | cut -d' ' -f5-)
        
        # Truncate for display
        local display_detail=$(echo "$detail" | cut -c1-20)
        if [ ${#detail} -gt 20 ]; then
            display_detail="${display_detail}..."
        fi
        
        printf "%-26s %-25s %-10s %-10s %s\n" "$timestamp" "$agent_id" "$task_id" "$action" "$display_detail"
    done
}

# Search journal
journal_grep() {
    local pattern="$1"
    
    if [ ! -f "$JOURNAL_LOG" ]; then
        echo "Journal is empty."
        return 0
    fi
    
    echo "Searching for: $pattern"
    echo "TIMESTAMP                  AGENT_ID                  TASK_ID    ACTION     DETAIL"
    echo "-------------------------- ------------------------- ---------- ---------- --------------------"
    
    grep "$pattern" "$JOURNAL_LOG" | while IFS= read -r line; do
        local timestamp=$(echo "$line" | cut -d' ' -f1)
        local agent_id=$(echo "$line" | cut -d' ' -f2)
        local task_id=$(echo "$line" | cut -d' ' -f3)
        local action=$(echo "$line" | cut -d' ' -f4)
        local detail=$(echo "$line" | cut -d' ' -f5-)
        
        # Truncate for display
        local display_detail=$(echo "$detail" | cut -c1-30)
        if [ ${#detail} -gt 30 ]; then
            display_detail="${display_detail}..."
        fi
        
        printf "%-26s %-25s %-10s %-10s %s\n" "$timestamp" "$agent_id" "$task_id" "$action" "$display_detail"
    done
}

# Show journal statistics
journal_stats() {
    if [ ! -f "$JOURNAL_LOG" ]; then
        echo "Journal is empty."
        return 0
    fi
    
    local total_entries=$(wc -l < "$JOURNAL_LOG")
    local first_entry=$(head -1 "$JOURNAL_LOG" | cut -d' ' -f1 || echo "N/A")
    local last_entry=$(tail -1 "$JOURNAL_LOG" | cut -d' ' -f1 || echo "N/A")
    
    echo "Journal Statistics:"
    echo "=================="
    echo "Total entries: $total_entries"
    echo "First entry: $first_entry"
    echo "Last entry: $last_entry"
    echo ""
    
    echo "Top agents by activity:"
    cut -d' ' -f2 "$JOURNAL_LOG" | sort | uniq -c | sort -rn | head -10 | while read count agent; do
        printf "  %-30s %d entries\n" "$agent" "$count"
    done
    echo ""
    
    echo "Top actions:"
    cut -d' ' -f4 "$JOURNAL_LOG" | sort | uniq -c | sort -rn | head -10 | while read count action; do
        printf "  %-15s %d\n" "$action" "$count"
    done
}

# Rotate journal (keep last 10000 entries)
journal_rotate() {
    if [ ! -f "$JOURNAL_LOG" ]; then
        echo "Journal is empty."
        return 0
    fi
    
    local current_size=$(wc -l < "$JOURNAL_LOG")
    local keep_lines=10000
    
    if [ "$current_size" -le "$keep_lines" ]; then
        echo "Journal has $current_size lines (below rotation threshold of $keep_lines)."
        return 0
    fi
    
    local backup_file="${JOURNAL_LOG}.backup.$(date +%s)"
    local temp_file="${JOURNAL_LOG}.tmp"
    
    echo "Rotating journal (current: $current_lines lines)"
    
    # Backup current journal
    cp "$JOURNAL_LOG" "$backup_file"
    echo "Backup created: $backup_file"
    
    # Keep only recent entries
    tail -n "$keep_lines" "$JOURNAL_LOG" > "$temp_file"
    mv "$temp_file" "$JOURNAL_LOG"
    
    echo "Journal rotated to $keep_lines lines"
    
    # Add rotation entry
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "$timestamp system - ROTATE Journal rotated from $current_size to $keep_lines lines" >> "$JOURNAL_LOG"
    
    echo "Rotation complete"
}

# Main command handler
main() {
    local command="${1:-help}"
    
    case "$command" in
        append)
            if [ $# -lt 5 ]; then
                echo "Usage: $0 append <AGENT_ID> <TASK_ID> <ACTION> \"<DETAIL>\""
                return 1
            fi
            journal_append "$2" "$3" "$4" "$5"
            ;;
        tail)
            journal_tail "${2:-20}"
            ;;
        grep)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 grep <PATTERN>"
                return 1
            fi
            journal_grep "$2"
            ;;
        stats)
            journal_stats
            ;;
        rotate)
            journal_rotate
            ;;
        help|--help|-h)
            cat << EOF
Usage: $0 <command> [args]

Commands:
  append <AGENT_ID> <TASK_ID> <ACTION> "<DETAIL>"  Add journal entry
  tail [lines]                                     Show recent entries
  grep <pattern>                                   Search journal
  stats                                            Show statistics
  rotate                                           Rotate journal (keep last 10000)
  help                                             Show this help

Examples:
  $0 append agent-host-123 TASK-101 CLAIM "Task claimed"
  $0 tail 50
  $0 grep "TASK-101"
  $0 stats
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