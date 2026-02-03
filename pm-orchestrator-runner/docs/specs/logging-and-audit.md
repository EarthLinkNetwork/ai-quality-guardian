# Logging and Audit Specification

## 1. Overview

Three types of logging:
1. **Task Logs**: stdout/stderr from Claude Code execution
2. **Task Events**: State transitions and milestones
3. **Audit Logs**: Sensitive operations (future)

## 2. Task Logs

### 2.1 Structure

```javascript
{
  PK: "TASK#<taskId>",
  SK: "LOG#<timestamp>#<seq>",
  stream: "stdout" | "stderr" | "system",
  line: "Log content here...",
  level: "debug" | "info" | "warn" | "error",
  correlationId: "corr_xyz789",
  createdAt: "2025-01-29T10:00:01.123Z"
}
```

### 2.2 Stream Types

| Stream | Description |
|--------|-------------|
| stdout | Standard output from Claude Code |
| stderr | Standard error from Claude Code |
| system | Agent system messages (start, stop, etc.) |

### 2.3 Log Levels

| Level | Description | Example |
|-------|-------------|---------|
| debug | Verbose debugging | "Parsing file: utils.ts" |
| info | Normal operation | "Creating component..." |
| warn | Potential issues | "Deprecated API usage" |
| error | Errors | "Failed to read file" |

### 2.4 Writing Logs

Agent batches logs for efficiency:

```javascript
class LogWriter {
  private taskId: string;
  private correlationId: string;
  private buffer: LogEntry[] = [];
  private seq = 0;

  async write(stream: string, line: string, level: string = "info") {
    const entry = {
      PK: `TASK#${this.taskId}`,
      SK: `LOG#${new Date().toISOString()}#${this.seq++}`,
      stream,
      line,
      level,
      correlationId: this.correlationId,
      createdAt: new Date().toISOString()
    };

    this.buffer.push(entry);

    if (this.buffer.length >= 100 || this.shouldFlush()) {
      await this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const items = this.buffer;
    this.buffer = [];

    // Batch write (max 25 items per batch)
    for (let i = 0; i < items.length; i += 25) {
      await ddb.batchWriteItem({
        RequestItems: {
          Logs: items.slice(i, i + 25).map(item => ({
            PutRequest: { Item: item }
          }))
        }
      });
    }
  }
}
```

### 2.5 Reading Logs

```javascript
async function getTaskLogs(taskId, { since, limit = 100 }) {
  const params = {
    TableName: "Logs",
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `TASK#${taskId}`
    },
    Limit: limit,
    ScanIndexForward: true // Oldest first
  };

  if (since) {
    params.KeyConditionExpression += " AND SK > :since";
    params.ExpressionAttributeValues[":since"] = `LOG#${since}`;
  }

  const result = await ddb.query(params);

  return {
    items: result.Items.map(item => ({
      timestamp: item.createdAt,
      stream: item.stream,
      line: item.line,
      level: item.level
    })),
    hasMore: !!result.LastEvaluatedKey
  };
}
```

### 2.6 Log Retention

- No automatic TTL (logs are valuable for debugging)
- Manual cleanup available for old completed tasks
- Future: Configurable retention policy

## 3. Task Events

### 3.1 Structure

```javascript
{
  PK: "TASK#<taskId>",
  SK: "EVT#<timestamp>#<seq>",
  type: "CREATED" | "QUEUED" | "LEASED" | "STARTED" | ...,
  message: "Human-readable description",
  level: "info" | "warn" | "error",
  payload: { /* type-specific data */ },
  actor: "user:<userId>" | "agent:<agentId>" | "system",
  correlationId: "corr_xyz789",
  createdAt: "2025-01-29T10:00:00Z"
}
```

### 3.2 Event Types

| Type | Description | Actor |
|------|-------------|-------|
| CREATED | Task created | user |
| QUEUED | Added to queue | system |
| LEASED | Agent acquired lease | agent |
| STARTED | Execution began | agent |
| PROGRESS | Execution progress update | agent |
| LOG_BATCH | Batch of logs written | agent |
| AWAITING_RESPONSE | Waiting for user input | agent |
| RESPONSE_RECEIVED | User provided response | user |
| COMPLETED | Task finished successfully | agent |
| ERROR | Task failed | agent |
| CANCELLED | Task cancelled | user |
| RETRIED | Task retried after error | user |
| REQUEUED | Returned to queue (agent shutdown) | system |

### 3.3 Creating Events

```javascript
async function createTaskEvent(taskId, type, message, actor, payload = {}) {
  const now = new Date().toISOString();
  const seq = await getNextSeq(taskId); // Or use timestamp + random suffix

  await ddb.putItem({
    TableName: "TaskEvents",
    Item: {
      PK: `TASK#${taskId}`,
      SK: `EVT#${now}#${seq}`,
      type,
      message,
      level: getEventLevel(type),
      payload,
      actor,
      correlationId: await getTaskCorrelationId(taskId),
      createdAt: now
    }
  });
}

function getEventLevel(type) {
  switch (type) {
    case "ERROR": return "error";
    case "CANCELLED": return "warn";
    default: return "info";
  }
}
```

### 3.4 Reading Events

```javascript
async function getTaskEvents(taskId) {
  const result = await ddb.query({
    TableName: "TaskEvents",
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `TASK#${taskId}`
    },
    ScanIndexForward: true // Chronological order
  });

  return result.Items;
}
```

## 4. Correlation ID

Every task has a correlation ID for tracing:

```javascript
const correlationId = `corr_${randomUUID()}`;
```

Used to:
- Link logs across systems
- Filter logs by task run
- Debug issues in distributed execution

## 5. Web UI Log Viewer

### 5.1 Polling Strategy

```javascript
function useTaskLogs(taskId, isLive) {
  const [logs, setLogs] = useState([]);
  const lastTimestamp = useRef(null);

  useEffect(() => {
    if (!isLive) return;

    const poll = async () => {
      const newLogs = await fetchLogs(taskId, lastTimestamp.current);
      if (newLogs.length > 0) {
        lastTimestamp.current = newLogs[newLogs.length - 1].timestamp;
        setLogs(prev => [...prev, ...newLogs]);
      }
    };

    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [taskId, isLive]);

  return logs;
}
```

### 5.2 Auto-scroll

```jsx
function LogViewer({ taskId, isLive }) {
  const containerRef = useRef();
  const [autoScroll, setAutoScroll] = useState(true);
  const logs = useTaskLogs(taskId, isLive);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div ref={containerRef} onScroll={handleScroll} className="log-viewer">
      {logs.map((log, i) => (
        <LogLine key={i} log={log} />
      ))}
    </div>
  );
}
```

### 5.3 Syntax Highlighting

```jsx
function LogLine({ log }) {
  const className = `log-line log-${log.level} log-${log.stream}`;

  return (
    <div className={className}>
      <span className="timestamp">
        {formatTimestamp(log.timestamp)}
      </span>
      <span className="stream">[{log.stream}]</span>
      <span className="content">{log.line}</span>
    </div>
  );
}
```

## 6. Audit Logs (Future)

### 6.1 Sensitive Operations

| Operation | Details Logged |
|-----------|----------------|
| Login | userId, IP, success/failure |
| API Key change | userId, keyType (not the key!) |
| User create/delete | adminId, targetUserId |
| Settings change | userId, changed fields |
| Task cancel | userId, taskId, reason |

### 6.2 Structure

```javascript
{
  PK: "ORG#<orgId>",
  SK: "AUDIT#<timestamp>#<auditId>",
  auditId: "audit_abc123",
  action: "LOGIN" | "API_KEY_UPDATE" | ...,
  userId: "usr_xyz789",
  details: { /* action-specific */ },
  ip: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  createdAt: "2025-01-29T10:00:00Z"
}
```

### 6.3 Retention

- Audit logs: 1 year (compliance requirement)
- Immutable (no delete/update)
