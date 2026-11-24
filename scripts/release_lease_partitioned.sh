#!/bin/bash
# Release lease for partitioned state
# Usage: ./release_lease_partitioned.sh [scope]

set -e

YOUR_ID="agent-noabatgircom-2254092"
COORDINATION_BRANCH="master"
SCOPE="${1:-global}"

# Map scope to partition
case "$SCOPE" in
  sima) PARTITION="sima" ;;
  hr) PARTITION="candash" ;;
  omr) PARTITION="shared" ;;
  *) PARTITION="global" ;;
esac

if [ "$PARTITION" = "global" ]; then
  LEASES_FILE="state/leases.json"
  RESOURCE="tasks.json"
else
  LEASES_FILE="state/$PARTITION/leases.json"
  RESOURCE="$PARTITION/tasks.json"
fi

git fetch origin && git checkout master && git pull --rebase origin master

# Remove our lease
if [ -f "$LEASES_FILE" ]; then
  LEASES_JSON=$(cat "$LEASES_FILE")
  NEW_LEASES=$(echo "$LEASES_JSON" | jq --arg holder "$YOUR_ID" --arg resource "$RESOURCE" 'del(.leases[] | select(.resource==$resource and .holder==$holder))')
  echo "$NEW_LEASES" > "$LEASES_FILE"

  git add "$LEASES_FILE"
  git commit -m "chore(lock): release $RESOURCE lease by $YOUR_ID"
  git push origin "$COORDINATION_BRANCH"
fi

echo "Lease released successfully for $RESOURCE"