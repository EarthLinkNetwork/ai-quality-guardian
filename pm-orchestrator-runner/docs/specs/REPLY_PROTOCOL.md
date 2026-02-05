# Reply Protocol Specification

## Version
1.0.0 (2026-02-06)

## Overview

This document specifies how users can reply to AWAITING_RESPONSE tasks through the Web UI.

## Problem Statement

Previous implementation only allowed YES/NO responses or forced users to create new tasks.
This spec enables:
- Free-form text replies (multi-line)
- Continuation of the **same task** (not a new task)

## Reply Flow

```
1. Task reaches AWAITING_RESPONSE status
   └─ Output contains a question requiring user input

2. UI displays Reply box in Task Detail
   └─ Multi-line textarea
   └─ Shift+Enter = newline, Enter = submit

3. User submits reply via POST /api/tasks/:taskId/reply
   └─ Server stores reply in task.user_reply
   └─ Server changes status from AWAITING_RESPONSE to QUEUED

4. QueuePoller claims the task
   └─ Executor receives task with user_reply populated
   └─ Executor processes as continuation (not fresh start)

5. Task completes
   └─ COMPLETE: Final output produced
   └─ AWAITING_RESPONSE: Another question (repeat from step 2)
   └─ ERROR: Execution failed
```

## API Specification

### POST /api/tasks/:taskId/reply

**Request:**
```http
POST /api/tasks/abc123/reply
Content-Type: application/json

{
  "reply": "Yes, please use the flat structure.\nAlso add index files."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "task_id": "abc123",
  "old_status": "AWAITING_RESPONSE",
  "new_status": "QUEUED"
}
```

**Error Responses:**
- 400: Missing reply content
- 404: Task not found
- 409: Task not in AWAITING_RESPONSE status

### Status Transition

```
AWAITING_RESPONSE -> QUEUED (via reply)
QUEUED -> RUNNING (via poller claim)
RUNNING -> COMPLETE | AWAITING_RESPONSE | ERROR
```

## Data Model Changes

### QueueItem Extension
```typescript
interface QueueItem {
  // ... existing fields
  user_reply?: string;          // Reply content from user
  reply_history?: ReplyEntry[]; // History of all replies (optional)
}

interface ReplyEntry {
  content: string;
  timestamp: string;
}
```

## Executor Continuation

When executor receives a task with `user_reply`:

1. Build continuation prompt:
```
[Previous Output]
{task.output}

[User Reply]
{task.user_reply}

[Continue Task]
Continue processing based on the user's reply.
```

2. Execute with continuation prompt
3. Clear `user_reply` after processing
4. Set new output/status

## UI Requirements

### Task Detail Page

**When status = AWAITING_RESPONSE:**
```
┌─────────────────────────────────────┐
│ Task: abc123                        │
│ Status: AWAITING_RESPONSE           │
├─────────────────────────────────────┤
│ [Assistant Output]                  │
│ I need clarification:               │
│ - Which structure do you prefer?    │
│   A) Flat                           │
│   B) Nested                         │
├─────────────────────────────────────┤
│ Reply:                              │
│ ┌─────────────────────────────────┐ │
│ │ [Multi-line textarea]           │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ [Send Reply] (Shift+Enter: newline) │
└─────────────────────────────────────┘
```

### Textarea Behavior
- Auto-expand as content grows
- Max height with scroll
- Placeholder: "Type your reply..."
- Submit: Enter key (or button click)
- Newline: Shift+Enter

## Edge Cases

### Reply to non-AWAITING_RESPONSE task
- Return 409 Conflict
- UI should hide reply box for other statuses

### Empty reply
- Return 400 Bad Request
- UI should disable submit for empty input

### Task transitions while typing
- Before submit, re-fetch task status
- If no longer AWAITING_RESPONSE, show error message

### Multiple rapid replies
- Only one reply processed at a time
- Subsequent replies queue behind status changes
