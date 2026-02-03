# 02_SESSION_MODEL.md - Session and Thread Model Specification

## 1. Overview

The Session model represents a continuous interaction context within a project.
Sessions contain threads (conversation units) and track user activity over time.

## 2. Hierarchy

```
Project
  └── Session (daily/weekly grouping)
        └── Thread (conversation unit)
              └── Run (single task execution)
                    └── TaskEvent (state transitions)
                          └── Log (output lines)
```

## 3. Session Entity

### 3.1 Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | S | Y | UUID (format: `sess_<uuid>`) |
| projectId | S | Y | Parent project ID |
| orgId | S | Y | Organization ID |
| name | S | N | Session name (auto or manual) |
| status | S | Y | `active` / `idle` / `closed` |
| startedAt | S | Y | ISO8601 timestamp |
| lastActivityAt | S | Y | ISO8601 timestamp |
| closedAt | S | N | ISO8601 timestamp |
| threadCount | N | Y | Number of threads in session |
| metadata | M | N | Additional session metadata |

### 3.2 Session Status

| Status | Condition |
|--------|-----------|
| `active` | Has running tasks or recent activity (< 1 hour) |
| `idle` | No activity for > 1 hour |
| `closed` | Explicitly closed by user |

### 3.3 Auto-Naming

```typescript
function generateSessionName(startedAt: Date): string {
  // Format: "Session - Jan 29, 2025 10:00 AM"
  return `Session - ${startedAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })}`;
}
```

## 4. Thread Entity

### 4.1 Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| threadId | S | Y | UUID (format: `thrd_<uuid>`) |
| sessionId | S | Y | Parent session ID |
| projectId | S | Y | Project ID |
| orgId | S | Y | Organization ID |
| title | S | N | Thread title (from first prompt) |
| status | S | Y | `active` / `paused` / `complete` |
| createdAt | S | Y | ISO8601 timestamp |
| updatedAt | S | Y | ISO8601 timestamp |
| runCount | N | Y | Number of runs in thread |

### 4.2 Thread Status

| Status | Condition |
|--------|-----------|
| `active` | Has running or queued runs |
| `paused` | Has AWAITING_RESPONSE run |
| `complete` | All runs are COMPLETE or CANCELLED |

## 5. Run Entity

A Run is essentially a Task execution within a Thread context.

### 5.1 Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| runId | S | Y | UUID (format: `run_<uuid>`) |
| threadId | S | Y | Parent thread ID |
| taskId | S | Y | Associated task ID |
| sessionId | S | Y | Session ID |
| projectId | S | Y | Project ID |
| sequence | N | Y | Run sequence within thread |
| createdAt | S | Y | ISO8601 timestamp |

**Note:** Run is a lightweight linking entity. Most execution data is in the Task.

## 6. DynamoDB Keys

### 6.1 Sessions Table

| Access Pattern | PK | SK |
|----------------|----|----|
| Sessions by project | `PROJ#<projectId>` | `SESS#<sessionId>` |
| Session detail | `PROJ#<projectId>` | `SESS#<sessionId>` |

### 6.2 Threads Table

| Access Pattern | PK | SK |
|----------------|----|----|
| Threads by session | `SESS#<sessionId>` | `THRD#<threadId>` |
| Thread detail | `SESS#<sessionId>` | `THRD#<threadId>` |

### 6.3 Runs Table

| Access Pattern | PK | SK |
|----------------|----|----|
| Runs by thread | `THRD#<threadId>` | `RUN#<sequence>#<runId>` |
| Run detail | `THRD#<threadId>` | `RUN#<sequence>#<runId>` |

## 7. Session Operations

### 7.1 Create Session

```typescript
async function createSession(projectId: string, orgId: string): Promise<Session> {
  const sessionId = `sess_${uuid()}`;
  const now = new Date();
  
  const session: Session = {
    PK: `PROJ#${projectId}`,
    SK: `SESS#${sessionId}`,
    sessionId,
    projectId,
    orgId,
    name: generateSessionName(now),
    status: 'active',
    startedAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    threadCount: 0
  };
  
  await ddb.putItem({ TableName: 'Sessions', Item: session });
  return session;
}
```

### 7.2 Get or Create Current Session

```typescript
async function getOrCreateCurrentSession(projectId: string, orgId: string): Promise<Session> {
  // Find active session for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const result = await ddb.query({
    TableName: 'Sessions',
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    FilterExpression: '#status <> :closed AND startedAt >= :today',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':pk': `PROJ#${projectId}`,
      ':prefix': 'SESS#',
      ':closed': 'closed',
      ':today': today.toISOString()
    }
  });
  
  if (result.Items.length > 0) {
    return result.Items[0] as Session;
  }
  
  return createSession(projectId, orgId);
}
```

### 7.3 Close Session

```typescript
async function closeSession(projectId: string, sessionId: string): Promise<void> {
  const now = new Date().toISOString();
  
  await ddb.updateItem({
    TableName: 'Sessions',
    Key: { PK: `PROJ#${projectId}`, SK: `SESS#${sessionId}` },
    UpdateExpression: 'SET #status = :closed, closedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':closed': 'closed',
      ':now': now
    }
  });
}
```

## 8. Thread Operations

### 8.1 Create Thread

```typescript
async function createThread(session: Session, firstPrompt: string): Promise<Thread> {
  const threadId = `thrd_${uuid()}`;
  const now = new Date().toISOString();
  
  const thread: Thread = {
    PK: `SESS#${session.sessionId}`,
    SK: `THRD#${threadId}`,
    threadId,
    sessionId: session.sessionId,
    projectId: session.projectId,
    orgId: session.orgId,
    title: generateTitle(firstPrompt),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    runCount: 0
  };
  
  // Atomic: Create thread + increment session threadCount
  await ddb.transactWrite({
    TransactItems: [
      { Put: { TableName: 'Threads', Item: thread } },
      {
        Update: {
          TableName: 'Sessions',
          Key: { PK: `PROJ#${session.projectId}`, SK: `SESS#${session.sessionId}` },
          UpdateExpression: 'SET threadCount = threadCount + :one, lastActivityAt = :now',
          ExpressionAttributeValues: { ':one': 1, ':now': now }
        }
      }
    ]
  });
  
  return thread;
}
```

## 9. Dashboard Integration

### 9.1 Session Tree View

```
Project: my-app
├── Session - Jan 29, 2025 (3 threads) [active]
│   ├── Thread: "Add user auth" (2 runs) [complete]
│   ├── Thread: "Fix login bug" (1 run) [active]
│   └── Thread: "Add tests" (0 runs) [paused]
└── Session - Jan 28, 2025 (5 threads) [closed]
    └── ...
```

### 9.2 Query for Tree View

```typescript
async function getSessionTreeView(projectId: string): Promise<SessionTreeNode[]> {
  // Get all non-closed sessions
  const sessions = await listActiveSessions(projectId);
  
  // For each session, get threads
  return Promise.all(sessions.map(async (session) => {
    const threads = await listThreads(session.sessionId);
    return {
      ...session,
      threads: threads.map(t => ({
        ...t,
        // Optionally include run summaries
      }))
    };
  }));
}
```

## 10. Acceptance Criteria

- **AC-SESS-1**: Sessions are auto-created per day/activity boundary
- **AC-SESS-2**: Sessions can be manually named
- **AC-SESS-3**: Sessions can be closed to prevent new threads
- **AC-SESS-4**: Threads are created when new conversation starts
- **AC-SESS-5**: Thread title is derived from first prompt
- **AC-SESS-6**: Dashboard shows session/thread hierarchy in tree view
- **AC-SESS-7**: Runs link threads to tasks
