#!/usr/bin/env bash

set -euo pipefail

LEASES_FILE="state/shared/leases.json"
JOURNAL_LOG="state/journal.log"
AGENT_ID=""
DEFAULT_TTL_MINUTES=30
RENEW_INTERVAL_MINUTES=10
HEARTBEAT_INTERVAL_MINUTES=5

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

# Get current UTC timestamp
utc_now() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Convert minutes to seconds
minutes_to_seconds() {
    echo $(($1 * 60))
}

# Atomic file write (write to temp then move)
atomic_write() {
    local content="$1"
    local target_file="$2"
    local temp_file="${target_file}.tmp.$$"
    
    echo "$content" > "$temp_file"
    mv "$temp_file" "$target_file"
}

# Initialize leases file if it doesn't exist
init_leases() {
    if [ ! -f "$LEASES_FILE" ]; then
        mkdir -p "$(dirname "$LEASES_FILE")"
        atomic_write '{"version": 2, "leases": []}' "$LEASES_FILE"
    fi
}

# Check if a path matches a glob pattern
path_matches_glob() {
    local path="$1"
    local glob="$2"
    
    # Simple glob matching (supports * only for now)
    if [[ "$glob" == *"*"* ]]; then
        local pattern=$(echo "$glob" | sed 's/\*/.*/g')
        [[ "$path" =~ ^${pattern}$ ]] && return 0
    else
        [ "$path" = "$glob" ] && return 0
    fi
    
    return 1
}

# Acquire a lease
lease_acquire() {
    local path_glob="$1"
    local task_id="${2:-}"
    
    load_identity
    init_leases
    
    local current_time=$(utc_now)
    local expires_at=$(date -u -d "$current_time + $DEFAULT_TTL_MINUTES minutes" +"%Y-%m-%dT%H:%M:%SZ")
    
    # Read current leases
    local leases_json=$(cat "$LEASES_FILE")
    
    # Check for conflicts
    local conflicts=()
    while IFS= read -r lease; do
        if [ -n "$lease" ]; then
            local lease_path=$(echo "$lease" | jq -r '.path_glob')
            local lease_expires=$(echo "$lease" | jq -r '.expires_at')
            local lease_agent=$(echo "$lease" | jq -r '.agent_id')
            
            # Check if lease is still active
            if [[ "$lease_expires" > "$current_time" ]]; then
                # Check if path conflicts
                if path_matches_glob "$path_glob" "$lease_path" || path_matches_glob "$lease_path" "$path_glob"; then
                    if [ "$lease_agent" != "$AGENT_ID" ]; then
                        conflicts+=("$lease_agent holds $lease_path until $lease_expires")
                    fi
                fi
            fi
        fi
    done < <(echo "$leases_json" | jq -c '.leases[]')
    
    # If conflicts exist, report them
    if [ ${#conflicts[@]} -gt 0 ]; then
        echo "Lease conflict(s) detected:"
        for conflict in "${conflicts[@]}"; do
            echo "  - $conflict"
        done
        return 1
    fi
    
    # Create new lease
    local lease_id="lease-$(date +%s)-$(openssl rand -hex 4 2>/dev/null || echo $RANDOM)"
    local new_lease=$(cat << EOF
{
    "lease_id": "$lease_id",
    "path_glob": "$path_glob",
    "task_id": "$task_id",
    "agent_id": "$AGENT_ID",
    "acquired_at": "$current_time",
    "expires_at": "$expires_at",
    "heartbeat_at": "$current_time"
}
EOF
)
    
    # Add to leases
    local new_leases_json=$(echo "$leases_json" | jq \
        --argjson new_lease "$new_lease" \
        '.leases += [$new_lease]')
    
    # Write atomically
    atomic_write "$new_leases_json" "$LEASES_FILE"
    
    # Journal entry
    local detail="Lease $lease_id acquired for $path_glob (task: ${task_id:-none})"
    echo "$current_time $AGENT_ID $task_id LEASE_ACQUIRE $detail" >> "$JOURNAL_LOG"
    
    echo "Lease acquired: $lease_id"
    echo "  Path: $path_glob"
    echo "  Expires: $expires_at"
    echo "  Task: ${task_id:-none}"
}

# Release a lease
lease_release() {
    local path_glob="$1"
    
    load_identity
    init_leases
    
    local current_time=$(utc_now)
    local leases_json=$(cat "$LEASES_FILE")
    
    # Find and remove lease(s) for this agent and path
    local removed_count=0
    local new_leases_json=$(echo "$leases_json" | jq \
        --arg path_glob "$path_glob" \
        --arg agent_id "$AGENT_ID" \
        '[.leases[] | select(!(.path_glob == $path_glob and .agent_id == $agent_id))]' | \
        jq '{"version": 2, "leases": .}')
    
    # Count removed leases
    local old_count=$(echo "$leases_json" | jq '.leases | length')
    local new_count=$(echo "$new_leases_json" | jq '.leases | length')
    removed_count=$((old_count - new_count))
    
    if [ "$removed_count" -gt 0 ]; then
        atomic_write "$new_leases_json" "$LEASES_FILE"
        
        # Journal entry
        local detail="Released $removed_count lease(s) for $path_glob"
        echo "$current_time $AGENT_ID - LEASE_RELEASE $detail" >> "$JOURNAL_LOG"
        
        echo "Released $removed_count lease(s) for $path_glob"
    else
        echo "No active leases found for $path_glob owned by $AGENT_ID"
    fi
}

# Renew lease (extend expiration)
lease_renew() {
    local path_glob="$1"
    
    load_identity
    init_leases
    
    local current_time=$(utc_now)
    local new_expires_at=$(date -u -d "$current_time + $DEFAULT_TTL_MINUTES minutes" +"%Y-%m-%dT%H:%M:%SZ")
    
    local leases_json=$(cat "$LEASES_FILE")
    local renewed_count=0
    
    # Renew matching leases
    local new_leases_json=$(echo "$leases_json" | jq \
        --arg path_glob "$path_glob" \
        --arg agent_id "$AGENT_ID" \
        --arg expires_at "$new_expires_at" \
        --arg heartbeat_at "$current_time" \
        '.leases | map(
            if .path_glob == $path_glob and .agent_id == $agent_id then
                .expires_at = $expires_at |
                .heartbeat_at = $heartbeat_at
            else
                .
            end
        )' | jq '{"version": 2, "leases": .}')
    
    # Check if any were renewed
    local old_leases=$(echo "$leases_json" | jq -c '.leases[] | select(.path_glob == $path_glob and .agent_id == $AGENT_ID)' --arg path_glob "$path_glob" --arg agent_id "$AGENT_ID")
    if [ -n "$old_leases" ]; then
        renewed_count=$(echo "$old_leases" | wc -l)
        atomic_write "$new_leases_json" "$LEASES_FILE"
        
        # Journal entry
        local detail="Renewed $renewed_count lease(s) for $path_glob until $new_expires_at"
        echo "$current_time $AGENT_ID - LEASE_RENEW $detail" >> "$JOURNAL_LOG"
        
        echo "Renewed $renewed_count lease(s) for $path_glob"
        echo "  New expiration: $new_expires_at"
    else
        echo "No active leases found for $path_glob owned by $AGENT_ID"
    fi
}

# Send heartbeat (update heartbeat_at without extending expiration)
lease_heartbeat() {
    local path_glob="$1"
    
    load_identity
    init_leases
    
    local current_time=$(utc_now)
    local leases_json=$(cat "$LEASES_FILE")
    
    # Update heartbeat for matching leases
    local new_leases_json=$(echo "$leases_json" | jq \
        --arg path_glob "$path_glob" \
        --arg agent_id "$AGENT_ID" \
        --arg heartbeat_at "$current_time" \
        '.leases | map(
            if .path_glob == $path_glob and .agent_id == $agent_id then
                .heartbeat_at = $heartbeat_at
            else
                .
            end
        )' | jq '{"version": 2, "leases": .}')
    
    atomic_write "$new_leases_json" "$LEASES_FILE"
    
    echo "Heartbeat sent for $path_glob"
}

# Garbage collect expired leases
lease_gc() {
    load_identity
    init_leases
    
    local current_time=$(utc_now)
    local leases_json=$(cat "$LEASES_FILE")
    
    # Remove expired leases
    local expired_leases=$(echo "$leases_json" | jq \
        --arg current_time "$current_time" \
        '[.leases[] | select(.expires_at <= $current_time)]')
    
    local expired_count=$(echo "$expired_leases" | jq 'length')
    
    if [ "$expired_count" -gt 0 ]; then
        local new_leases_json=$(echo "$leases_json" | jq \
            --arg current_time "$current_time" \
            '[.leases[] | select(.expires_at > $current_time)]' | \
            jq '{"version": 2, "leases": .}')
        
        atomic_write "$new_leases_json" "$LEASES_FILE"
        
        # Journal entry for each expired lease
        echo "$expired_leases" | jq -c '.[]' | while read -r lease; do
            local lease_id=$(echo "$lease" | jq -r '.lease_id')
            local agent_id=$(echo "$lease" | jq -r '.agent_id')
            local path_glob=$(echo "$lease" | jq -r '.path_glob')
            
            local detail="GC removed expired lease $lease_id ($path_glob) owned by $agent_id"
            echo "$current_time system - LEASE_GC $detail" >> "$JOURNAL_LOG"
        done
        
        echo "Garbage collected $expired_count expired lease(s)"
    else
        echo "No expired leases to collect"
    fi
}

# Verify if a path is covered by any active lease
lease_verify() {
    local path="$1"
    
    load_identity
    init_leases
    
    local current_time=$(utc_now)
    local leases_json=$(cat "$LEASES_FILE")
    local violations=()
    
    # Check all active leases
    while IFS= read -r lease; do
        if [ -n "$lease" ]; then
            local lease_path=$(echo "$lease" | jq -r '.path_glob')
            local lease_expires=$(echo "$lease" | jq -r '.expires_at')
            local lease_agent=$(echo "$lease" | jq -r '.agent_id')
            
            # Check if lease is active
            if [[ "$lease_expires" > "$current_time" ]]; then
                # Check if path matches lease glob
                if path_matches_glob "$path" "$lease_path"; then
                    if [ "$lease_agent" != "$AGENT_ID" ]; then
                        violations+=("Path $path matches $lease_path owned by $lease_agent (expires: $lease_expires)")
                    fi
                fi
            fi
        fi
    done < <(echo "$leases_json" | jq -c '.leases[]')
    
    if [ ${#violations[@]} -gt 0 ]; then
        echo "Lease violation(s) detected for path: $path"
        for violation in "${violations[@]}"; do
            echo "  - $violation"
        done
        return 1
    else
        echo "OK: No lease violations for path: $path"
        return 0
    fi
}

# List active leases
lease_list() {
    init_leases
    
    local current_time=$(utc_now)
    local leases_json=$(cat "$LEASES_FILE")
    
    echo "Active Leases:"
    echo "LEASE_ID                     AGENT_ID                  PATH_GLOB              TASK_ID      EXPIRES_AT"
    echo "---------------------------- ------------------------- ---------------------- ------------ -------------------------"
    
    local active_count=0
    while IFS= read -r lease; do
        if [ -n "$lease" ]; then
            local lease_id=$(echo "$lease" | jq -r '.lease_id')
            local agent_id=$(echo "$lease" | jq -r '.agent_id')
            local path_glob=$(echo "$lease" | jq -r '.path_glob')
            local task_id=$(echo "$lease" | jq -r '.task_id')
            local expires_at=$(echo "$lease" | jq -r '.expires_at')
            
            # Check if lease is active
            if [[ "$expires_at" > "$current_time" ]]; then
                printf "%-28s %-25s %-22s %-12s %s\n" \
                    "$lease_id" "$agent_id" "$path_glob" "${task_id:-none}" "$expires_at"
                active_count=$((active_count + 1))
            fi
        fi
    done < <(echo "$leases_json" | jq -c '.leases[]')
    
    echo ""
    echo "Total active leases: $active_count"
}

# Main command handler
main() {
    local command="${1:-help}"
    
    case "$command" in
        acquire)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 acquire <PATH_GLOB> [TASK_ID]"
                return 1
            fi
            lease_acquire "$2" "${3:-}"
            ;;
        release)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 release <PATH_GLOB>"
                return 1
            fi
            lease_release "$2"
            ;;
        renew)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 renew <PATH_GLOB>"
                return 1
            fi
            lease_renew "$2"
            ;;
        heartbeat)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 heartbeat <PATH_GLOB>"
                return 1
            fi
            lease_heartbeat "$2"
            ;;
        gc)
            lease_gc
            ;;
        verify)
            if [ $# -lt 2 ]; then
                echo "Usage: $0 verify <PATH>"
                return 1
            fi
            lease_verify "$2"
            ;;
        list)
            lease_list
            ;;
        help|--help|-h)
            cat << EOF
Usage: $0 <command> [args]

Commands:
  acquire <PATH_GLOB> [TASK_ID]    Acquire lease for path pattern
  release <PATH_GLOB>              Release lease for path pattern
  renew <PATH_GLOB>                Renew lease (extend expiration)
  heartbeat <PATH_GLOB>            Update heartbeat timestamp
  gc                               Garbage collect expired leases
  verify <PATH>                    Verify if path violates any leases
  list                             List active leases
  help                             Show this help

Lease Rules:
  - Default TTL: $DEFAULT_TTL_MINUTES minutes
  - Renew interval: $RENEW_INTERVAL_MINUTES minutes
  - Heartbeat interval: $HEARTBEAT_INTERVAL_MINUTES minutes
  - Path globs support * wildcards
  - An agent may not edit a path covered by another agent's live lease

Examples:
  $0 acquire "state/tasks/*.json" TASK-101
  $0 acquire "src/**/*.py"
  $0 verify "state/tasks/TASK-101.json"
  $0 list
  $0 gc
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