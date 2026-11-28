# Supervisor Bridge Protocol

## Overview

The supervisor bridge provides read-only access to agent coordination state for monitoring, dashboards, and external tools. Supervisors can observe but not interfere with agent coordination.

## Security Model

### Supervisor Permissions

**ALLOWED** (Read-Only):
- Read snapshot JSON via `bash scripts/status-snapshot.sh`
- Read journal entries via `bash scripts/journal.sh tail`
- Read task state via `state/tasks/*.json`
- Read lease state via `state/shared/leases.json`
- Read human-readable journal via `state/journal.md`

**ALLOWED** (Write with Constraints):
- Write task state via `scripts/task.sh` (with agent_id `supervisor`)
- Block tasks via `scripts/task.sh block`
- Unblock tasks via `scripts/task.sh status <TASK_ID> IN_PROGRESS`

**PROHIBITED** (Never Allowed):
- Run arbitrary shell commands
- Merge branches or push to main
- Force-push or rewrite history
- Edit files outside `state/tasks/*.json` via scripts
- Bypass lease system
- Skip pre-commit hooks
- Access `.env`, secrets, or credentials

## Supervisor Identity

All supervisor actions use agent_id `supervisor`:

```bash
# Supervisor identity is hardcoded
SUPERVISOR_AGENT_ID="supervisor"

# All supervisor journal entries use this ID
bash scripts/journal.sh append "supervisor" "TASK-XXX" "ACTION" "details"
```

## Integration Methods

### Method 1: HTTP API (Recommended)

Create a simple HTTP server that:

1. **GET /snapshot** → `bash scripts/status-snapshot.sh generate`
2. **GET /journal?limit=100** → `bash scripts/journal.sh tail 100`
3. **POST /tasks/:id/block** → `bash scripts/task.sh block :id "reason"`
4. **POST /tasks/:id/unblock** → `bash scripts/task.sh status :id IN_PROGRESS`

Example Python server:
```python
from flask import Flask, jsonify, request
import subprocess
import json

app = Flask(__name__)

@app.route('/snapshot')
def snapshot():
    result = subprocess.run(
        ['bash', 'scripts/status-snapshot.sh', 'generate'],
        capture_output=True, text=True
    )
    return jsonify(json.loads(result.stdout))

@app.route('/tasks/<task_id>/block', methods=['POST'])
def block_task(task_id):
    reason = request.json.get('reason', 'No reason provided')
    subprocess.run(
        ['bash', 'scripts/task.sh', 'block', task_id, reason],
        capture_output=True
    )
    return jsonify({'status': 'blocked'})
```

### Method 2: Cron Monitoring

Regular snapshot collection:

```bash
# Collect snapshot every 5 minutes
*/5 * * * * cd /mnt/Projects/multiagent && bash scripts/status-snapshot.sh save

# Send to monitoring system
*/5 * * * * cd /mnt/Projects/multiagent && bash scripts/status-snapshot.sh generate | curl -X POST -H "Content-Type: application/json" -d @- https://monitoring.example.com/snapshot
```

### Method 3: WebSocket Real-time

For real-time monitoring:

```bash
# Watch mode (development)
bash scripts/status-snapshot.sh watch

# Or pipe to WebSocket server
bash scripts/status-snapshot.sh generate | websocketd --port=8080 bash -c 'while true; do bash scripts/status-snapshot.sh generate; sleep 10; done'
```

## Supervisor Actions

### Blocking Tasks

```bash
# Block a task (requires reason)
bash scripts/task.sh block "TASK-101" "Database migration failed: connection timeout"

# Journal entry automatically created:
# <timestamp> supervisor TASK-101 BLOCK "Database migration failed: connection timeout"
```

### Unblocking Tasks

```bash
# Unblock a task (after issue resolved)
bash scripts/task.sh status "TASK-101" IN_PROGRESS

# Journal entry automatically created:
# <timestamp> supervisor TASK-101 STATUS "Changed to IN_PROGRESS"
```

### Creating Supervisor Tasks

```bash
# Create coordination tasks
bash scripts/task.sh new "TASK-COORD-001" "Weekly system audit"

# Claim as supervisor (optional)
bash scripts/task.sh claim "TASK-COORD-001"

# Complete when done
bash scripts/task.sh status "TASK-COORD-001" DONE
```

## Adapter Interface

### Read-Only Adapters

Adapters provide read-only access to external tool databases:

#### OpenCode Adapter
```python
# OpenCode stores history in SQLite
import sqlite3

def read_opencode_history():
    conn = sqlite3.connect('opencode.db', uri=True)  # Read-only
    # Map to common event schema
    events = []
    for row in conn.execute('SELECT * FROM events'):
        events.append({
            'timestamp': row['timestamp'],
            'agent_id': 'opencode',
            'task_id': row['task_id'],
            'action': row['action'],
            'detail': row['detail']
        })
    return events
```

#### Kilo CLI Adapter
```bash
# Kilo stores tasks in JSON files
kilo_tasks=$(cat ~/.kilo/tasks.json | jq '.')
# Map to common task schema
```

#### Mimo Code Adapter
```python
# Mimo Code uses MongoDB
from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017/', readPreference='secondaryPreferred')
db = client.mimo_code
# Read-only queries only
```

### Common Event Schema

All adapters must map to:

```json
{
  "timestamp": "ISO8601",
  "agent_id": "tool-name",
  "task_id": "TASK-XXX or -",
  "action": "CREATE|UPDATE|DELETE|ERROR",
  "detail": "Human-readable description"
}
```

## Monitoring Dashboard

### Key Metrics

1. **Agent Activity**:
   - Active agents count
   - Tasks per agent
   - Last heartbeat per agent

2. **Task Health**:
   - Total tasks
   - Active tasks (IN_PROGRESS, NEEDS_QA, IN_REVIEW)
   - Blocked tasks count and reasons
   - Average task completion time

3. **System Health**:
   - Lease conflicts
   - Journal growth rate
   - Git synchronization status

### Alert Rules

```yaml
alerts:
  - metric: blocked_tasks
    threshold: 3
    condition: ">"
    action: "notify_supervisor"
    
  - metric: lease_conflicts
    threshold: 1
    condition: ">"
    action: "investigate"
    
  - metric: agent_inactivity
    threshold: "30 minutes"
    condition: ">"
    action: "ping_agent"
```

## Emergency Procedures

### Supervisor-Only Actions

In emergencies, supervisors can:

1. **Force lease cleanup** (with caution):
   ```bash
   bash scripts/lease.sh gc
   ```

2. **Reset zombie tasks** (after investigation):
   ```bash
   bash scripts/task.sh status "TASK-ZOMBIE" ABANDONED
   ```

3. **Create emergency coordination task**:
   ```bash
   bash scripts/task.sh new "TASK-EMERGENCY-001" "Emergency system intervention"
   bash scripts/task.sh claim "TASK-EMERGENCY-001"
   ```

### Supervisor Journal

All supervisor actions are journaled:

```bash
# Manual journal entry for supervisor actions
bash scripts/journal.sh append "supervisor" "SYSTEM" "MAINTENANCE" "Performed quarterly system audit"
```

## Implementation Checklist

- [ ] Supervisor identity configured (`supervisor`)
- [ ] HTTP API or monitoring system integrated
- [ ] Read-only adapters for external tools
- [ ] Alert rules defined
- [ ] Emergency procedures documented
- [ ] Dashboard displaying key metrics
- [ ] Regular snapshot collection configured
- [ ] Access controls in place (supervisor-only actions)

## Security Notes

1. **Network Exposure**: If exposing an HTTP API, use authentication and HTTPS.
2. **File Permissions**: Ensure supervisor cannot write to scripts or critical files.
3. **Database Access**: External tool adapters must use read-only connections.
4. **Secret Management**: Never expose `.env` or credentials to supervisor.
5. **Audit Trail**: All supervisor actions must be journaled.

---

**Remember**: The supervisor observes and coordinates, but does not interfere with agent autonomy unless absolutely necessary.