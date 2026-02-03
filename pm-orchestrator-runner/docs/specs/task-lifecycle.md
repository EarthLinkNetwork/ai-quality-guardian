# Task Lifecycle Specification

## 1. State Machine

```
                    ┌────────────────────────────────────────┐
                    │                                        │
                    ▼                                        │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌──────────┐   │
│ CREATED │───▶│ QUEUED  │───▶│ RUNNING │───▶│ COMPLETE │   │
└─────────┘    └────┬────┘    └────┬────┘    └──────────┘   │
                    │              │                         │
                    │              ├───▶┌─────────┐          │
                    │              │    │  ERROR  │──────────┘
                    │              │    └─────────┘   (retry)
                    │              │
                    │              ▼
                    │         ┌───────────────────┐
                    │         │ AWAITING_RESPONSE │
                    │         └─────────┬─────────┘
                    │                   │
                    │                   │ (response received)
                    │                   ▼
                    │              ┌─────────┐
                    │              │ RUNNING │
                    │              └─────────┘
                    │
                    ▼
               ┌───────────┐
               │ CANCELLED │
               └───────────┘
```

## 2. States

| State | Description |
|-------|-------------|
| `CREATED` | Task created, not yet queued (transient) |
| `QUEUED` | In queue, waiting for agent |
| `RUNNING` | Agent is executing |
| `AWAITING_RESPONSE` | Paused, waiting for user input |
| `COMPLETE` | Successfully finished |
| `ERROR` | Failed with error |
| `CANCELLED` | Cancelled by user |

## 3. Transitions

### 3.1 CREATED → QUEUED

**Trigger:** Task creation via API

**Actions:**
1. Create Task record in Tasks table
2. Create Queue record
3. Create TaskEvent: `CREATED`
4. Create TaskEvent: `QUEUED`

**Code:**
```javascript
async function createTask(orgId, projectId, prompt, priority) {
  const taskId = generateId("task");
  const correlationId = generateId("corr");
  const now = new Date().toISOString();

  // 1. Create Task
  await ddb.putItem({
    TableName: "Tasks",
    Item: {
      PK: `ORG#${orgId}`,
      SK: `TASK#${taskId}`,
      taskId,
      orgId,
      projectId,
      agentId: null,
      state: "QUEUED",
      title: generateTitle(prompt),
      prompt,
      priority,
      createdAt: now,
      updatedAt: now,
      correlationId
    }
  });

  // 2. Create Queue entry
  await ddb.putItem({
    TableName: "Queue",
    Item: {
      PK: `ORG#${orgId}`,
      SK: `QUEUE#${now}#${taskId}`,
      taskId,
      projectId
    }
  });

  // 3. Create events
  await createTaskEvent(taskId, "CREATED", "Task created", "user:...");
  await createTaskEvent(taskId, "QUEUED", "Task queued", "system");

  return taskId;
}
```

### 3.2 QUEUED → RUNNING

**Trigger:** Agent leases task from queue

**Actions:**
1. Update Queue: set leaseOwner, leaseExpiresAt
2. Update Task: state → RUNNING, agentId, startedAt
3. Update Agent: currentTaskId
4. Create TaskEvent: `LEASED`
5. Create TaskEvent: `STARTED`

**Code:**
```javascript
async function leaseTask(orgId, taskId, agentId) {
  const now = new Date().toISOString();
  const leaseExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Atomic lease acquisition (see agent.md for full implementation)

  // Update task
  await ddb.updateItem({
    TableName: "Tasks",
    Key: { PK: `ORG#${orgId}`, SK: `TASK#${taskId}` },
    UpdateExpression: "SET #state = :state, agentId = :agentId, startedAt = :now, updatedAt = :now",
    ExpressionAttributeNames: { "#state": "state" },
    ExpressionAttributeValues: {
      ":state": "RUNNING",
      ":agentId": agentId,
      ":now": now
    }
  });

  // Update agent
  await ddb.updateItem({
    TableName: "Agents",
    Key: { PK: `ORG#${orgId}`, SK: `AGENT#${agentId}` },
    UpdateExpression: "SET currentTaskId = :taskId",
    ExpressionAttributeValues: { ":taskId": taskId }
  });

  await createTaskEvent(taskId, "LEASED", `Leased by agent ${agentId}`, `agent:${agentId}`);
  await createTaskEvent(taskId, "STARTED", "Task execution started", `agent:${agentId}`);
}
```

### 3.3 RUNNING → AWAITING_RESPONSE

**Trigger:** Claude Code requests user input

**Actions:**
1. Update Task: state → AWAITING_RESPONSE, clarificationQuestion
2. Create TaskEvent: `AWAITING_RESPONSE`
3. Create Notification: `TASK_AWAITING_RESPONSE`

**Code:**
```javascript
async function requestClarification(orgId, taskId, question) {
  const now = new Date().toISOString();

  await ddb.updateItem({
    TableName: "Tasks",
    Key: { PK: `ORG#${orgId}`, SK: `TASK#${taskId}` },
    UpdateExpression: "SET #state = :state, clarificationQuestion = :q, updatedAt = :now",
    ExpressionAttributeNames: { "#state": "state" },
    ExpressionAttributeValues: {
      ":state": "AWAITING_RESPONSE",
      ":q": question,
      ":now": now
    }
  });

  await createTaskEvent(taskId, "AWAITING_RESPONSE", question, "agent:...");

  await createNotification(orgId, {
    type: "TASK_AWAITING_RESPONSE",
    title: "Task needs response",
    message: question,
    taskId,
    severity: "warning"
  });
}
```

### 3.4 AWAITING_RESPONSE → RUNNING

**Trigger:** User provides response via Web UI

**Actions:**
1. Update Task: responseText, state → RUNNING, clear clarificationQuestion
2. Create TaskEvent: `RESPONSE_RECEIVED`

**Code:**
```javascript
async function provideResponse(orgId, taskId, response) {
  const now = new Date().toISOString();

  await ddb.updateItem({
    TableName: "Tasks",
    Key: { PK: `ORG#${orgId}`, SK: `TASK#${taskId}` },
    UpdateExpression: "SET responseText = :r, #state = :state, clarificationQuestion = :null, updatedAt = :now",
    ConditionExpression: "#state = :awaitingState",
    ExpressionAttributeNames: { "#state": "state" },
    ExpressionAttributeValues: {
      ":r": response,
      ":state": "RUNNING",
      ":null": null,
      ":awaitingState": "AWAITING_RESPONSE",
      ":now": now
    }
  });

  await createTaskEvent(taskId, "RESPONSE_RECEIVED", response, "user:...");
}
```

### 3.5 RUNNING → COMPLETE

**Trigger:** Claude Code execution completes successfully

**Actions:**
1. Update Task: state → COMPLETE, result, endedAt
2. Update Agent: currentTaskId → null
3. Remove Queue entry
4. Create TaskEvent: `COMPLETED`
5. Optionally create Notification

**Code:**
```javascript
async function completeTask(orgId, taskId, agentId, result) {
  const now = new Date().toISOString();

  // Update task
  await ddb.updateItem({
    TableName: "Tasks",
    Key: { PK: `ORG#${orgId}`, SK: `TASK#${taskId}` },
    UpdateExpression: "SET #state = :state, #result = :result, endedAt = :now, updatedAt = :now",
    ExpressionAttributeNames: { "#state": "state", "#result": "result" },
    ExpressionAttributeValues: {
      ":state": "COMPLETE",
      ":result": result,
      ":now": now
    }
  });

  // Clear agent
  await ddb.updateItem({
    TableName: "Agents",
    Key: { PK: `ORG#${orgId}`, SK: `AGENT#${agentId}` },
    UpdateExpression: "SET currentTaskId = :null",
    ExpressionAttributeValues: { ":null": null }
  });

  // Remove from queue (query first to get SK)
  // ...

  await createTaskEvent(taskId, "COMPLETED", result, `agent:${agentId}`);
}
```

### 3.6 RUNNING → ERROR

**Trigger:** Claude Code execution fails

**Actions:**
1. Update Task: state → ERROR, error, endedAt
2. Update Agent: currentTaskId → null
3. Remove Queue entry
4. Create TaskEvent: `ERROR`
5. Create Notification: `TASK_ERROR`

**Code:**
```javascript
async function failTask(orgId, taskId, agentId, error) {
  const now = new Date().toISOString();

  await ddb.updateItem({
    TableName: "Tasks",
    Key: { PK: `ORG#${orgId}`, SK: `TASK#${taskId}` },
    UpdateExpression: "SET #state = :state, #error = :error, endedAt = :now, updatedAt = :now",
    ExpressionAttributeNames: { "#state": "state", "#error": "error" },
    ExpressionAttributeValues: {
      ":state": "ERROR",
      ":error": error,
      ":now": now
    }
  });

  // Clear agent, remove from queue...

  await createTaskEvent(taskId, "ERROR", error, `agent:${agentId}`);

  await createNotification(orgId, {
    type: "TASK_ERROR",
    title: "Task failed",
    message: error,
    taskId,
    severity: "error"
  });
}
```

### 3.7 ERROR → QUEUED (Retry)

**Trigger:** User clicks Retry in Web UI

**Actions:**
1. Update Task: state → QUEUED, clear error, agentId, startedAt, endedAt
2. Create new Queue entry
3. Create TaskEvent: `RETRIED`

**Code:**
```javascript
async function retryTask(orgId, taskId) {
  const now = new Date().toISOString();

  await ddb.updateItem({
    TableName: "Tasks",
    Key: { PK: `ORG#${orgId}`, SK: `TASK#${taskId}` },
    UpdateExpression: "SET #state = :state, #error = :null, agentId = :null, startedAt = :null, endedAt = :null, updatedAt = :now",
    ConditionExpression: "#state = :errorState",
    ExpressionAttributeNames: { "#state": "state", "#error": "error" },
    ExpressionAttributeValues: {
      ":state": "QUEUED",
      ":null": null,
      ":errorState": "ERROR",
      ":now": now
    }
  });

  // Create queue entry
  await ddb.putItem({
    TableName: "Queue",
    Item: {
      PK: `ORG#${orgId}`,
      SK: `QUEUE#${now}#${taskId}`,
      taskId
    }
  });

  await createTaskEvent(taskId, "RETRIED", "Task retried by user", "user:...");
}
```

### 3.8 QUEUED/RUNNING → CANCELLED

**Trigger:** User clicks Cancel in Web UI

**Actions:**
1. Update Task: state → CANCELLED, endedAt
2. If RUNNING: Update Agent: currentTaskId → null
3. Remove Queue entry (if exists)
4. Create TaskEvent: `CANCELLED`

## 4. Lease Expiry Handling

When agent fails to complete within lease timeout:

1. **Background job** (or next poll attempt) detects expired lease
2. Queue entry becomes visible again (leaseExpiresAt < now)
3. Another agent can lease the task
4. Original agent's execution is orphaned

**Handling orphaned execution:**
- Agent should check lease validity before completing
- If lease expired, discard result (another agent may have taken over)

## 5. Title Generation

Auto-generate task title from prompt:

```javascript
function generateTitle(prompt: string): string {
  // Take first line or first 50 chars
  const firstLine = prompt.split('\n')[0];
  if (firstLine.length <= 50) {
    return firstLine;
  }
  return firstLine.substring(0, 47) + '...';
}
```

## 6. Priority

| Priority | Description |
|----------|-------------|
| 0-30 | Low |
| 31-60 | Normal (default: 50) |
| 61-100 | High |

Higher priority tasks are processed first (when multiple tasks are queued).

**Implementation:**
Queue SK format: `QUEUE#<priority-inverted>#<createdAt>#<taskId>`
- Priority inverted: `100 - priority` so higher priority comes first in sort order
