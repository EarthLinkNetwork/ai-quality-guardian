# Agent Specification

## 1. Overview

The Agent is a local process running `pm-runner` that:
1. Registers itself with DynamoDB
2. Sends periodic heartbeats
3. Polls the queue for tasks
4. Executes tasks via Claude Code
5. Streams logs to DynamoDB
6. Handles clarification requests

## 2. Agent Lifecycle

```
┌─────────────┐
│   STARTUP   │
└──────┬──────┘
       │ Register in Agents table
       ▼
┌─────────────┐
│   ONLINE    │◄─────────────────┐
└──────┬──────┘                  │
       │ Heartbeat every 10s    │
       │ Poll queue every 3s    │
       ▼                         │
┌─────────────┐  Task complete   │
│  EXECUTING  │──────────────────┘
└──────┬──────┘
       │ No heartbeat for 30s
       ▼
┌─────────────┐
│    STALE    │
└──────┬──────┘
       │ No heartbeat for 60s
       ▼
┌─────────────┐
│   OFFLINE   │ (TTL cleanup)
└─────────────┘
```

## 3. Agent Registration

On startup, agent creates/updates record in Agents table:

```javascript
{
  PK: "ORG#<orgId>",
  SK: "AGENT#<agentId>",
  agentId: uuid(),
  orgId: "<from config>",
  host: os.hostname(),
  pid: process.pid,
  cwd: process.cwd(),
  status: "online",
  lastHeartbeatAt: new Date().toISOString(),
  currentProjectId: null,
  currentTaskId: null,
  version: packageJson.version,
  capabilities: ["claude-code"],
  canInteractive: false, // Web agents cannot do interactive
  ttl: Math.floor(Date.now() / 1000) + 3600 // 1 hour
}
```

## 4. Heartbeat

**Interval:** 10 seconds

**Operation:**
```javascript
await ddb.updateItem({
  TableName: "Agents",
  Key: { PK, SK },
  UpdateExpression: "SET lastHeartbeatAt = :now, #status = :status, ttl = :ttl",
  ExpressionAttributeNames: { "#status": "status" },
  ExpressionAttributeValues: {
    ":now": new Date().toISOString(),
    ":status": "online",
    ":ttl": Math.floor(Date.now() / 1000) + 3600
  }
});
```

## 5. Queue Polling

**Interval:** 3 seconds

**Algorithm:**
```javascript
async function pollQueue() {
  // 1. Query Queue table for available items
  const items = await ddb.query({
    TableName: "Queue",
    KeyConditionExpression: "PK = :pk",
    FilterExpression: "attribute_not_exists(leaseOwner) OR leaseExpiresAt < :now",
    ExpressionAttributeValues: {
      ":pk": `ORG#${orgId}`,
      ":now": new Date().toISOString()
    },
    Limit: 1,
    ScanIndexForward: true // Oldest first
  });

  if (items.length === 0) return null;

  // 2. Attempt to lease the item
  const item = items[0];
  const leaseExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

  try {
    await ddb.updateItem({
      TableName: "Queue",
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: "SET leaseOwner = :agent, leaseExpiresAt = :expiry",
      ConditionExpression: "attribute_not_exists(leaseOwner) OR leaseExpiresAt < :now",
      ExpressionAttributeValues: {
        ":agent": agentId,
        ":expiry": leaseExpiry,
        ":now": new Date().toISOString()
      }
    });
    return item;
  } catch (e) {
    // Conflict - another agent got it
    return null;
  }
}
```

## 6. Task Execution

**Flow:**
```
1. Lease acquired
   └─> Update Task state: QUEUED → RUNNING
   └─> Update Agent: currentTaskId = taskId
   └─> Create TaskEvent: LEASED, STARTED

2. Execute Claude Code
   └─> Stream stdout/stderr to Logs table
   └─> Batch writes every 1 second
   └─> Create TaskEvent: PROGRESS (periodic)

3. Handle clarification
   └─> Update Task state: RUNNING → AWAITING_RESPONSE
   └─> Set clarificationQuestion
   └─> Create TaskEvent: AWAITING_RESPONSE
   └─> Create Notification: TASK_AWAITING_RESPONSE
   └─> Poll for responseText (every 3s)
   └─> On response: Resume execution

4. Complete
   └─> Update Task state: RUNNING → COMPLETE/ERROR
   └─> Set result or error
   └─> Update Agent: currentTaskId = null
   └─> Remove from Queue
   └─> Create TaskEvent: COMPLETED/ERROR
   └─> Create Notification (if ERROR)
```

## 7. Log Streaming

**Batch Size:** 100 lines or 1 second, whichever comes first

**Log Entry Format:**
```javascript
{
  PK: "TASK#<taskId>",
  SK: `LOG#${timestamp}#${seq}`,
  stream: "stdout" | "stderr" | "system",
  line: "log content",
  level: "info" | "warn" | "error",
  correlationId: taskCorrelationId,
  createdAt: timestamp
}
```

**Implementation:**
```javascript
class LogBuffer {
  private buffer: LogEntry[] = [];
  private lastFlush = Date.now();

  add(stream: string, line: string, level: string) {
    this.buffer.push({ stream, line, level, timestamp: Date.now() });

    if (this.buffer.length >= 100 || Date.now() - this.lastFlush >= 1000) {
      this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const items = this.buffer;
    this.buffer = [];
    this.lastFlush = Date.now();

    await ddb.batchWriteItem({
      RequestItems: {
        Logs: items.map(item => ({
          PutRequest: { Item: formatLogItem(item) }
        }))
      }
    });
  }
}
```

## 8. Clarification Handling

When Claude Code requests user input:

```javascript
async function handleClarification(question: string) {
  // 1. Update task state
  await updateTaskState(taskId, {
    state: "AWAITING_RESPONSE",
    clarificationQuestion: question
  });

  // 2. Create notification
  await createNotification({
    type: "TASK_AWAITING_RESPONSE",
    title: "Task needs response",
    message: question,
    taskId: taskId,
    severity: "warning"
  });

  // 3. Poll for response
  while (true) {
    await sleep(3000);

    const task = await getTask(taskId);
    if (task.responseText) {
      // Clear response and continue
      await updateTaskState(taskId, {
        state: "RUNNING",
        clarificationQuestion: null,
        responseText: null
      });
      return task.responseText;
    }

    if (task.state === "CANCELLED") {
      throw new Error("Task cancelled");
    }
  }
}
```

## 9. Error Handling

| Error Type | Recovery |
|------------|----------|
| DDB connection | Retry with exponential backoff |
| Claude Code crash | Mark task ERROR, release lease |
| Heartbeat failure | Log warning, continue |
| Lease expired | Re-queue task, restart |

## 10. Configuration

```typescript
interface AgentConfig {
  orgId: string;           // From environment or config file
  dynamodbEndpoint?: string; // Local: http://localhost:8000
  region: string;          // AWS region
  heartbeatIntervalMs: number; // Default: 10000
  pollIntervalMs: number;  // Default: 3000
  logBatchIntervalMs: number; // Default: 1000
  leaseTimeoutMs: number;  // Default: 300000 (5 min)
}
```

## 11. Graceful Shutdown

```javascript
process.on('SIGTERM', async () => {
  // 1. Stop polling
  stopPolling();

  // 2. If executing task, mark as interrupted
  if (currentTaskId) {
    await updateTaskState(currentTaskId, {
      state: "QUEUED", // Return to queue
      agentId: null
    });
    await createTaskEvent(currentTaskId, "REQUEUED", "Agent shutdown");
  }

  // 3. Update agent status
  await updateAgent(agentId, { status: "offline" });

  // 4. Exit
  process.exit(0);
});
```

## 12. Metrics (Future)

| Metric | Description |
|--------|-------------|
| agent_heartbeat_count | Total heartbeats sent |
| agent_task_executed_count | Tasks completed |
| agent_task_error_count | Tasks failed |
| agent_poll_latency_ms | Queue poll latency |
| agent_log_batch_size | Average log batch size |
