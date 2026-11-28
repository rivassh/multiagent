# Adapter Interface

Read-only adapters for external tools that maintain their own history databases.

## Purpose

External tools (OpenCode, Kilo CLI, Mimo Code) often store task history, logs, or state in their own databases. Adapters provide read-only access to this data, mapping it to the common coordination system schema without allowing writes back to the external tools.

## Architecture

```
[External Tool DB] → [Adapter] → [Common Event Schema] → [Supervisor/Coordination System]
      ↓                            ↓
  Read-only                    Read-only
  Connection                   Integration
```

## Common Requirements

All adapters MUST:

1. **Read-Only Access**: Open databases with read-only flags
2. **No Writes**: Never modify the external tool's database
3. **Schema Mapping**: Convert to common event schema
4. **Error Isolation**: Fail gracefully without affecting coordination
5. **Resource Cleanup**: Close connections properly

## Common Event Schema

All adapters output events in this format:

```json
{
  "timestamp": "2026-11-28T15:30:00Z",
  "agent_id": "tool-name",
  "task_id": "TASK-XXX",
  "action": "CREATE|UPDATE|DELETE|ERROR|INFO",
  "detail": "Human-readable description of what happened"
}
```

## Available Adapters

### 1. OpenCode Adapter

**Database**: SQLite (`opencode.db`)
**Location**: `~/.opencode/` or workspace-specific

**Implementation**:
```python
import sqlite3
import json
from datetime import datetime

class OpenCodeAdapter:
    def __init__(self, db_path):
        # Open read-only
        self.conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    
    def get_events(self, since=None):
        query = "SELECT * FROM events"
        if since:
            query += f" WHERE timestamp >= '{since}'"
        
        events = []
        for row in self.conn.execute(query):
            events.append({
                'timestamp': row['timestamp'],
                'agent_id': 'opencode',
                'task_id': row.get('task_id', '-'),
                'action': row['action'],
                'detail': json.dumps(row['details'])
            })
        return events
    
    def close(self):
        self.conn.close()
```

**Tables**:
- `events`: task creation, updates, completions
- `tasks`: task definitions and status
- `agents`: agent registration and activity

### 2. Kilo CLI Adapter

**Storage**: JSON files
**Location**: `~/.kilo/` or workspace `.kilo/`

**Implementation**:
```python
import json
import os
from pathlib import Path

class KiloAdapter:
    def __init__(self, kilo_dir):
        self.kilo_dir = Path(kilo_dir)
    
    def get_events(self):
        events = []
        
        # Read task files
        for task_file in self.kilo_dir.glob('tasks/*.json'):
            with open(task_file, 'r') as f:
                task = json.load(f)
                
            events.append({
                'timestamp': task['created_at'],
                'agent_id': 'kilo',
                'task_id': task['id'],
                'action': 'CREATE',
                'detail': f"Task created: {task['title']}"
            })
            
            # Add status changes
            for history in task.get('history', []):
                events.append({
                    'timestamp': history['timestamp'],
                    'agent_id': 'kilo',
                    'task_id': task['id'],
                    'action': history['action'],
                    'detail': history.get('details', '')
                })
        
        return sorted(events, key=lambda x: x['timestamp'])
```

**Files**:
- `tasks.json`: Task definitions
- `plans/`: Execution plans
- `state/`: Runtime state

### 3. Mimo Code Adapter

**Database**: MongoDB
**Connection**: `mongodb://localhost:27017/`

**Implementation**:
```python
from pymongo import MongoClient
from pymongo.read_preferences import ReadPreference

class MimoCodeAdapter:
    def __init__(self, connection_string):
        # Connect with read preference to secondary
        self.client = MongoClient(
            connection_string,
            readPreference=ReadPreference.SECONDARY_PREFERRED
        )
        self.db = self.client.mimo_code
    
    def get_events(self, limit=1000):
        events = []
        
        # Read from events collection
        cursor = self.db.events.find(
            {},
            {'_id': 0, 'timestamp': 1, 'agent': 1, 'task': 1, 'action': 1, 'details': 1}
        ).sort('timestamp', -1).limit(limit)
        
        for doc in cursor:
            events.append({
                'timestamp': doc['timestamp'].isoformat() + 'Z',
                'agent_id': f"mimo-{doc.get('agent', 'unknown')}",
                'task_id': doc.get('task', '-'),
                'action': doc['action'],
                'detail': json.dumps(doc.get('details', {}))
            })
        
        return events
    
    def close(self):
        self.client.close()
```

**Collections**:
- `events`: System events
- `tasks`: Task definitions
- `agents`: Agent sessions
- `artifacts`: Generated artifacts

## Integration

### Standalone Script

```bash
#!/usr/bin/env bash
# adapters/collect-events.sh

set -euo pipefail

OUTPUT_FILE="state/adapter-events.json"

# Collect from all adapters
EVENTS="[]"

# OpenCode
if [ -f "~/.opencode/opencode.db" ]; then
    python3 adapters/opencode.py >> "$OUTPUT_FILE.tmp"
fi

# Kilo
if [ -d ".kilo" ] || [ -d "~/.kilo" ]; then
    python3 adapters/kilo.py >> "$OUTPUT_FILE.tmp"
fi

# Mimo Code
if command -v mongo &> /dev/null; then
    python3 adapters/mimo.py >> "$OUTPUT_FILE.tmp"
fi

# Merge and deduplicate
jq -s 'add | unique_by(.timestamp + .agent_id + .action)' "$OUTPUT_FILE.tmp" > "$OUTPUT_FILE"
rm "$OUTPUT_FILE.tmp"

echo "Collected $(jq 'length' "$OUTPUT_FILE") events from adapters"
```

### Supervisor Integration

```python
# supervisor/adapters.py
import subprocess
import json

def collect_adapter_events():
    """Collect events from all adapters."""
    try:
        result = subprocess.run(
            ['bash', 'adapters/collect-events.sh'],
            capture_output=True,
            text=True,
            timeout=30  # Don't hang
        )
        
        if result.returncode == 0:
            with open('state/adapter-events.json', 'r') as f:
                return json.load(f)
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass
    
    return []
```

## Security Considerations

### 1. Database Permissions
```bash
# Set read-only permissions on SQLite
chmod 444 opencode.db

# MongoDB user with read-only role
db.createUser({
  user: "adapter",
  pwd: "password",
  roles: [{ role: "read", db: "mimo_code" }]
})
```

### 2. Connection Security
- Use SSH tunnels for remote databases
- Encrypt credentials (not in plain text)
- Validate TLS certificates
- Use connection pooling with limits

### 3. Input Validation
- Sanitize database queries (no raw string interpolation)
- Limit result sets (prevent memory exhaustion)
- Validate timestamps and IDs
- Escape special characters in output

## Testing

### Unit Tests
```python
def test_opencode_adapter():
    adapter = OpenCodeAdapter(":memory:")  # In-memory test DB
    events = adapter.get_events()
    assert isinstance(events, list)
    adapter.close()
```

### Integration Tests
```bash
# Test adapter collection
bash adapters/collect-events.sh

# Verify output
jq '.[0]' state/adapter-events.json
jq 'length' state/adapter-events.json
```

### Performance Tests
```python
# Ensure adapters don't slow down system
import time

start = time.time()
adapter.get_events()
elapsed = time.time() - start
assert elapsed < 2.0  # Should complete in under 2 seconds
```

## Adding New Adapters

1. **Create adapter class** in `adapters/<tool>.py`
2. **Implement** `get_events()` method returning common schema
3. **Add to** `collect-events.sh` integration script
4. **Write tests** in `tests/adapters/test_<tool>.py`
5. **Document** in this README

### Template
```python
# adapters/new_tool.py
class NewToolAdapter:
    def __init__(self, config):
        # Open read-only connection
        pass
    
    def get_events(self, since=None):
        # Return events in common schema
        return []
    
    def close(self):
        # Cleanup resources
        pass
```

## Troubleshooting

### Common Issues

1. **Permission denied**: Check file/database permissions
2. **Connection refused**: Verify service is running
3. **Schema mismatch**: Update mapping logic
4. **Memory exhaustion**: Add pagination/limits
5. **Timeout**: Increase timeout or optimize queries

### Debug Mode
```bash
# Verbose output
DEBUG=1 bash adapters/collect-events.sh

# Test individual adapter
python3 -m adapters.opencode --debug
```

## Monitoring

Track adapter health:
- Last successful collection time
- Event count per adapter
- Collection duration
- Error rate

```bash
# Health check
if [ -f "state/adapter-events.json" ]; then
    jq 'group_by(.agent_id) | map({agent: .[0].agent_id, count: length})' \
        state/adapter-events.json
fi
```

---

**Important**: Adapters are read-only bridges. They observe but never modify external tool state.