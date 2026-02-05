# Session / TaskGroup / Task Model Specification

## Version
1.0.0 (2026-02-06)

## Overview

This document defines the data model for Web Chat conversations in PM Orchestrator Runner.

## Terminology

### Project
- Top-level unit for the runner
- Contains multiple Sessions

### Session (= Chat Thread)
- **What users perceive as a "chat"**
- 1 Session = 1 TaskGroup (1:1 mapping)
- Contains multiple Tasks (messages)
- Identified by `session_id`

### TaskGroup
- Queue grouping key
- **Synonymous with Session**
- UI displays TaskGroups as "Sessions" or "Chats"

### Task
- Single execution unit: user input -> processing -> output
- Accumulates within a Session (TaskGroup)
- Has status: QUEUED, RUNNING, COMPLETE, ERROR, AWAITING_RESPONSE, CANCELLED

### Message
- UI display unit (user/assistant roles)
- Task's prompt/output converted to messages for display

## Session Lifecycle

### 1. Chat Start (Open Chat)
- Opens the currently selected Session
- If no Session exists, creates one with `session_id = web-YYYYMMDD-XXXXXX`
- Subsequent messages add Tasks to the **same Session**

### 2. New Chat
- Creates a **new Session**
- Creates one TaskGroup linked to that Session
- **Bug: TaskGroup proliferating per message is incorrect** - fixed by this spec

### 3. Within a Session
- Each user message creates 1 Task
- Task transitions to terminal state (COMPLETE/AWAITING_RESPONSE/ERROR/CANCELLED)
- User can reply to AWAITING_RESPONSE tasks

## Data Model

### Session
```typescript
interface Session {
  session_id: string;           // Primary key: web-YYYYMMDD-XXXXXX
  task_group_id: string;        // = session_id (1:1)
  title?: string;               // Auto-generated from first message
  created_at: string;           // ISO 8601
  updated_at: string;           // ISO 8601
  status: 'active' | 'archived';
}
```

### Task (existing, extended)
```typescript
interface QueueItem {
  task_id: string;
  session_id: string;
  task_group_id: string;        // = session_id
  prompt: string;
  status: QueueItemStatus;
  output?: string;
  error_message?: string;
  user_reply?: string;          // NEW: Reply content for continuation
  created_at: string;
  updated_at: string;
  // ... other fields
}
```

## API Changes

### POST /api/tasks
- Uses existing `task_group_id` as `session_id`
- If session doesn't exist, creates it
- If session exists, adds Task to it (no new TaskGroup)

### GET /api/sessions
- Lists all Sessions (wraps TaskGroups)
- Returns Session metadata + task count

### GET /api/sessions/:sessionId/tasks
- Lists all Tasks in a Session
- Ordered by created_at ASC

## UI Requirements

### Sidebar
- Display "Sessions" or "Chats" (not "Task Groups")
- Each row shows:
  - Session title (first message excerpt or auto-summary)
  - Last updated timestamp
  - Task count / status indicators

### Task List
- Show all Tasks in selected Session chronologically
- Each Task displays as user message + assistant response
