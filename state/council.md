# Design Council Protocol (state/council.md)

## Purpose
Centralized decision-making for high-impact tasks. All council decisions are recorded here and logged in `state/team_log.md`.

## Process
1. Task is flagged for council review.
2. Council members (agents) evaluate the task against criteria.
3. Decision recorded in this file.
4. Task status updated accordingly (APPROVED, REJECTED, REVISE).

## Council Decisions
| Task ID | Decision | Date | Decided By | Rationale |
|---------|----------|------|------------|-----------|

## Inbox Notification
When a task requires council review, notify via `state/inbox/council_decision.json`:
```json
{
  "task_id": "TASK-XXX",
  "type": "council_review_requested",
  "sender": "<YOUR_ID>",
  "timestamp": "<UTC_ISO8601>"
}
```

## Audit
All council decisions are logged in `state/team_log.md`.
