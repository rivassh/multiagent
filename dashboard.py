#!/usr/bin/env python3
"""Minimal task Kanban dashboard — reads state/tasks.json files directly from disk."""

import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from html import escape as html_escape
from datetime import datetime, timezone

STATE_ROOT = os.environ.get("STATE_ROOT", os.path.join(os.getcwd(), "state"))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("DASHBOARD_PORT", "8080"))

STATUS_ORDER = ["TODO", "IN_PROGRESS", "NEEDS_QA", "QA_PASSED", "QA_FAILED",
                "NEEDS_REVIEW", "IN_REVIEW", "STAGE", "DONE", "REVISE"]
STATUS_COLORS = {
    "TODO": "#cccccc",
    "IN_PROGRESS": "#f7b26b",
    "NEEDS_QA": "#f7b26b",
    "QA_PASSED": "#d4edda",
    "QA_FAILED": "#f8d7da",
    "NEEDS_REVIEW": "#f7b26b",
    "IN_REVIEW": "#e2d1c3",
    "STAGE": "#e2d1c3",
    "DONE": "#d4edda",
    "REVISE": "#f8d7da",
}


def load_all_statuses():
    rows = []
    if not os.path.isdir(STATE_ROOT):
        return rows
    for root, dirs, files in os.walk(STATE_ROOT):
        for fn in sorted(files):
            if not fn.endswith("tasks.json"):
                continue
            fp = os.path.join(root, fn)
            try:
                with open(fp) as f:
                    data = json.load(f)
                for t in data.get("tasks", []):
                    rel = os.path.relpath(fp, STATE_ROOT)
                    t["source_file"] = html_escape(rel)
                    rows.append({**t})
            except (json.JSONDecodeError, OSError):
                continue
    return rows


def color_style(status):
    bg = STATUS_COLORS.get(status, "#ffffff")
    return f"style='background:{bg};font-weight:bold'"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(self._render().encode("utf-8"))
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Not found\n")

    def _render(self):
        rows = load_all_statuses()
        cards = ""
        for r in rows:
            st = r.get("status", "")
            if st not in STATUS_ORDER:
                continue
            title = html_escape(r.get("title", ""))
            aid = html_escape(r.get("id", ""))
            assignee = html_escape(r.get("assigned_to", "") or "—")
            summary = html_escape(r.get("summary", "")[:120])
            src = html_escape(r.get("source_file", ""))
            cards += (
                f"<tr>"
                f"<td>{aid}</td><td>{title}</td>"
                f"<td>👤 {assignee}</td><td>{summary}</td>"
                f"<td>{f'<span style=\"{color_style(st)}\">{st}</span>'}</td>"
                f"<td>← {src}"
                f"</tr>"
            )

        groups = {}
        if os.path.isdir(STATE_ROOT):
            for fn in os.listdir(STATE_ROOT):
                if fn.endswith("tasks.json") and fn != "tasks.json":
                    parts = fn.split("/")
                    root = parts[0] if len(parts) > 1 else fn
                    groups[root] = groups.get(root, 0) + 1

        bar_lines = []
        for name, count in sorted(groups.items()):
            pct = 100 * count // max(groups[name], 1)
            label = html_escape(name)
            bars = "".join(
                f'<div class="bar" style="width:{pct}%;background:#4CAF50"></div>'
                for _ in range(pct)
            )
            bar_lines.append(
                f"<h3>{label} <span class='count'>({count})</span></h3>\n{bars}"
            )
        bar_section = "\n".join(bar_lines) or "<p>No task files in state</p>"

        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Swarm Task Dashboard</title>
<style>
body {{ font-family: sans-serif; margin: 1em; background:#fafafa; }}
h1 {{ font-size:1.2em; }}
table {{ border-collapse: collapse; width:100%; }}
th, td {{ border:1px solid #ddd; padding:6px 10px; text-align:left; vertical-align:top; }}
tr:nth-child(even) {{ background:#f5f5f5; }}
.badge {{ display:inline-block; padding:2px 8px; border-radius:4px; text-transform:uppercase; font-size:0.8em; }}
.count {{ color:#666; font-weight:normal; }}
.bar {{ height:12px; margin:1px 0; }}
</style>
</head>
<body>
<h1>Swarm Task Dashboard</h1>
<p>Updated: {ts}</p>
<h2>By state directory</h2>
{bar_section}
<h2>All tasks</h2>
<table>
<tr><th>ID</th><th>Title</th><th>Assigned</th><th>Summary</th><th>Status</th><th>Source</th></tr>
<tbody>{cards}</tbody>
</table>
</body></html>"""

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    httpd = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Dashboard listening on :{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()
