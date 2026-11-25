#!/bin/bash
# Acquire lease for partitioned state
# Usage: ./acquire_lease_partitioned.sh [scope]
# scope: sima, hr (candash), omr (shared), or default (global)

set -e

LEASE_TTL_SECONDS=120
YOUR_ID="agent-noabatgircom-2254092"
COORDINATION_BRANCH="master"
SCOPE="${1:-global}"

# Map scope to partition
case "$SCOPE" in
  sima) PARTITION="sima" ;;
  hr) PARTITION="candash" ;;
  omr) PARTITION="shared" ;;
  pm) PARTITION="processmaker" ;;
  *) PARTITION="global" ;;
esac

if [ "$PARTITION" = "global" ]; then
  LEASES_FILE="state/leases.json"
  RESOURCE="tasks.json"
else
  LEASES_FILE="state/$PARTITION/leases.json"
  RESOURCE="$PARTITION/tasks.json"
fi

NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXPIRES_AT=$(date -u -d "+${LEASE_TTL_SECONDS} seconds" +"%Y-%m-%dT%H:%M:%SZ")
LEASE_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "$(date +%s%N)-$(shuf -i 1000-9999 -n 1)")

# Read existing leases
if [ -f "$LEASES_FILE" ]; then
  LEASES_JSON=$(cat "$LEASES_FILE")
else
  LEASES_JSON='{"version":1,"leases":[]}'
fi

# Check for existing lease on the resource
EXISTING_LEASE=$(echo "$LEASES_JSON" | jq -r --arg resource "$RESOURCE" '.leases[] | select(.resource==$resource) | @base64' | head -1)

if [ -n "$EXISTING_LEASE" ]; then
  HOLDER=$(echo "$EXISTING_LEASE" | base64 -d | jq -r '.holder')
  EXPIRES_AT_EXISTING=$(echo "$EXISTING_LEASE" | base64 -d | jq -r '.expires_at')
  ACQUIRED_AT_EXISTING=$(echo "$EXISTING_LEASE" | base64 -d | jq -r '.acquired_at')
  
  # Check if expired or acquired in future (clock skew)
  EXPIRES_EPOCH=$(date -d "$EXPIRES_AT_EXISTING" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$EXPIRES_AT_EXISTING" +%s 2>/dev/null)
  ACQUIRED_EPOCH=$(date -d "$ACQUIRED_AT_EXISTING" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ACQUIRED_AT_EXISTING" +%s 2>/dev/null)
  NOW_EPOCH=$(date +%s)
  
  if [ "$EXPIRES_EPOCH" -lt "$NOW_EPOCH" ] || [ "$ACQUIRED_EPOCH" -gt "$NOW_EPOCH" ]; then
    # ZOMBIE LEASE or FUTURE LEASE - force break
    echo "[FORCE-BREAK] Zombie/future lease of $HOLDER expired. Broken by $YOUR_ID." >> state/team_log.md
    LEASES_JSON=$(echo "$LEASES_JSON" | jq --arg resource "$RESOURCE" 'del(.leases[] | select(.resource==$resource))')
  elif [ "$HOLDER" = "$YOUR_ID" ]; then
    # Our lease - renew
    LEASES_JSON=$(echo "$LEASES_JSON" | jq --arg resource "$RESOURCE" --arg acquired "$NOW_ISO" --arg expires "$EXPIRES_AT" '.leases[] |= if .resource==$resource then .acquired_at=$acquired | .expires_at=$expires else . end')
  else
    echo "Active lease held by $HOLDER, expires at $EXPIRES_AT_EXISTING"
    exit 1
  fi
fi

# Add/update our lease
NEW_LEASE=$(jq -n --arg resource "$RESOURCE" --arg holder "$YOUR_ID" --arg lease_id "$LEASE_ID" --arg acquired "$NOW_ISO" --arg expires "$EXPIRES_AT" '{resource:$resource, holder:$holder, lease_id:$lease_id, acquired_at:$acquired, expires_at:$expires}')
LEASES_JSON=$(echo "$LEASES_JSON" | jq --argjson new "$NEW_LEASE" '.leases += [$new]')

echo "$LEASES_JSON" > "$LEASES_FILE"

git add "$LEASES_FILE" state/team_log.md
git commit -m "chore(lock): acquire $RESOURCE lease by $YOUR_ID"
git push origin "$COORDINATION_BRANCH"

echo "Lease acquired successfully for $RESOURCE"