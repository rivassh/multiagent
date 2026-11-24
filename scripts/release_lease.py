#!/usr/bin/env python3
"""Release the tasks.json lease held by the current worker."""
import json, os

STATE_DIR = os.environ.get("STATE_DIR", "/tmp/kilo/work/state/sima")
YOUR_ID = os.environ.get("YOUR_ID", "agent-unknown")
LEASE_PATH = os.path.join(STATE_DIR, "leases.json")

with open(LEASE_PATH) as f:
    data = json.load(f)

before = len(data.get("leases", []))
data["leases"] = [
    l for l in data.get("leases", [])
    if not (l.get("resource") == "tasks.json" and l.get("holder") == YOUR_ID)
]
after = len(data.get("leases", []))

with open(LEASE_PATH, "w") as f:
    json.dump(data, f, indent=2)

if before > after:
    print(f"Lease released by {YOUR_ID}")
else:
    print("No lease held to release")
