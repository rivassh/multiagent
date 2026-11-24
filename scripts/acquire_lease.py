#!/usr/bin/env python3
"""Acquire the tasks.json lease for the current worker."""
import json, os, uuid
from datetime import datetime, timezone

STATE_DIR = os.environ.get("STATE_DIR", "/tmp/kilo/work/state/sima")
YOUR_ID = os.environ.get("YOUR_ID", "agent-unknown")
LEASE_PATH = os.path.join(STATE_DIR, "leases.json")

with open(LEASE_PATH) as f:
    data = json.load(f)

now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
expires_ts = datetime.now(timezone.utc).timestamp() + 120
expires_iso = datetime.fromtimestamp(expires_ts, timezone.utc).isoformat().replace("+00:00", "Z")

# Replace any existing tasks.json lease (clears zombie / own lease)
data["leases"] = [l for l in data.get("leases", []) if l.get("resource") != "tasks.json"]
data.setdefault("leases", []).append({
    "resource": "tasks.json",
    "holder": YOUR_ID,
    "lease_id": str(uuid.uuid4()),
    "acquired_at": now,
    "expires_at": expires_iso,
})

with open(LEASE_PATH, "w") as f:
    json.dump(data, f, indent=2)

print(f"Lease acquired by {YOUR_ID}")
