#!/usr/bin/env bash
# Report live kilo agent processes on this host, including idle/sleeping and
# stopped (Ctrl+Z, T state) processes. "Live" here means the OS process exists
# and is not a zombie; this is distinct from Git-Swarm lease/task coordination.
set -euo pipefail

json=false
update=false
for arg in "$@"; do
  case "$arg" in
    --json) json=true ;;
    --update-agents) update=true ;;
    -h|--help)
      echo "Usage: $0 [--json] [--update-agents]"
      echo "  --json           Print machine-readable JSON"
      echo "  --update-agents  Rewrite state/agents.json with currently detected local agents"
      exit 0
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
host="$(hostname)"
now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

mapfile -t rows < <(ps -eo pid=,stat=,tty=,etime=,cmd= | awk '
  /\/kilo( |$|-s)/ && !/awk/ {
    pid=$1; stat=$2; tty=$3; etime=$4;
    cmd=""; for(i=5;i<=NF;i++) cmd=cmd (i==5?"":" ") $i;
    if (stat ~ /Z/) next;
    state="running";
    if (stat ~ /T/) state="stopped";
    else if (stat ~ /S/ || stat ~ /I/) state="sleeping_or_idle";
    else if (stat ~ /R/ || stat ~ /D/) state="running";
    gsub(/\t/, " ", cmd);
    print pid "\t" stat "\t" tty "\t" etime "\t" state "\t" cmd;
  }')

if $json; then
  python3 - "$host" "$now" "${rows[@]}" <<'PY'
import json, sys
host, now = sys.argv[1], sys.argv[2]
agents=[]
for line in sys.argv[3:]:
    try:
        pid, stat, tty, etime, state, cmd = line.split('\t', 5)
    except ValueError:
        continue
    agents.append({
        "agent_id": f"agent-{host}-{pid}",
        "pid": int(pid),
        "stat": stat,
        "state": state,
        "tty": tty,
        "etime": etime,
        "command": cmd,
    })
print(json.dumps({"host": host, "checked_at": now, "live_count": len(agents), "agents": agents}, ensure_ascii=False, indent=2))
PY
else
  echo "Host: $host"
  echo "Checked at (UTC): $now"
  echo "Live agents: ${#rows[@]}"
  if ((${#rows[@]} > 0)); then
    printf "%-8s %-6s %-8s %-12s %-16s %s\n" "PID" "STAT" "TTY" "ELAPSED" "STATE" "AGENT_ID"
    for line in "${rows[@]}"; do
      IFS=$'\t' read -r pid stat tty etime state cmd <<<"$line"
      printf "%-8s %-6s %-8s %-12s %-16s %s\n" "$pid" "$stat" "$tty" "$etime" "$state" "agent-${host}-${pid}"
    done
  fi
fi

if $update; then
  python3 - "$repo_root/state/agents.json" "$host" "$now" "${rows[@]}" <<'PY'
import json, os, sys
path, host, now = sys.argv[1], sys.argv[2], sys.argv[3]
agents=[]
for line in sys.argv[4:]:
    try:
        pid, stat, tty, etime, state, cmd = line.split('\t', 5)
    except ValueError:
        continue
    agents.append({
        "agent_id": f"agent-{host}-{pid}",
        "pid": int(pid),
        "tty": tty,
        "stat": stat,
        "process_state": state,
        "registered_at": now,
        "last_heartbeat": now,
        "status": "stopped" if state == "stopped" else "active",
        "command": cmd,
    })
data={"version": 1, "checked_at": now, "host": host, "agents": agents}
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
PY
  echo "Updated: $repo_root/state/agents.json"
fi
