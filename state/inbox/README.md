# Inbox Directory

FIFO mailbox for inter-agent message passing. Agents read from `state/inbox/` before processing new tasks to ensure no messages are lost.

## Message Format
Each message is a JSON file with metadata:
- `sender`: The agent ID
- `recipient`: Target agent/receiver
- `timestamp`: UTC ISO8601 timestamp
- `type`: Message type (reviewer_notification, codewriter_update, council_decision, etc.)
- `content`: Message body

## Current Messages
No messages in inbox.