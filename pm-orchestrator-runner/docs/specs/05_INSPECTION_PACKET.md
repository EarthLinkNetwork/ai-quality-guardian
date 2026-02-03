# 05_INSPECTION_PACKET.md - ChatGPT Integration (Inspection Packets)

## 1. Overview

Inspection Packets are structured data exports designed for external review,
particularly for ChatGPT/Claude analysis. They provide a snapshot of system
state, logs, and context for debugging or audit purposes.

## 2. Use Cases

### 2.1 Debugging Assistance

When a task fails or behaves unexpectedly:
1. Generate inspection packet for the task
2. Share with ChatGPT for analysis
3. Receive structured diagnosis

### 2.2 Code Review

Before merging changes:
1. Generate inspection packet for session
2. Include diffs, tests, and logs
3. Get AI review of changes

### 2.3 Audit Trail

For compliance or retrospective:
1. Generate inspection packet for time range
2. Include all events, actions, and outcomes
3. Archive for future reference

## 3. Packet Structure

### 3.1 Task Inspection Packet

```typescript
interface TaskInspectionPacket {
  version: '1.0';
  type: 'task';
  generatedAt: string;  // ISO8601
  
  // Context
  task: {
    taskId: string;
    title: string;
    prompt: string;
    state: TaskState;
    createdAt: string;
    startedAt?: string;
    endedAt?: string;
    result?: string;
    error?: string;
  };
  
  project: {
    projectId: string;
    name: string;
  };
  
  agent?: {
    agentId: string;
    host: string;
    version: string;
  };
  
  // Timeline
  events: Array<{
    timestamp: string;
    type: string;
    message: string;
    actor: string;
    payload?: Record<string, unknown>;
  }>;
  
  // Logs (last N lines or all)
  logs: Array<{
    timestamp: string;
    stream: 'stdout' | 'stderr' | 'system';
    line: string;
  }>;
  
  // Settings snapshot at task creation
  settings: {
    model: string;
    provider: string;
    maxTokens: number;
    temperature: number;
  };
  
  // Clarification history (if any)
  clarifications: Array<{
    question: string;
    response: string;
    askedAt: string;
    respondedAt: string;
  }>;
  
  // Metadata
  meta: {
    correlationId: string;
    orgId: string;
    generatedBy: string;  // user or system
  };
}
```

### 3.2 Session Inspection Packet

```typescript
interface SessionInspectionPacket {
  version: '1.0';
  type: 'session';
  generatedAt: string;
  
  session: {
    sessionId: string;
    name: string;
    status: string;
    startedAt: string;
    closedAt?: string;
    threadCount: number;
  };
  
  project: {
    projectId: string;
    name: string;
  };
  
  threads: Array<{
    threadId: string;
    title: string;
    status: string;
    runCount: number;
    runs: Array<{
      runId: string;
      taskId: string;
      taskTitle: string;
      taskState: string;
    }>;
  }>;
  
  // Aggregated stats
  stats: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageDuration: number;  // seconds
    totalLogs: number;
  };
  
  meta: {
    orgId: string;
    generatedBy: string;
  };
}
```

### 3.3 Audit Inspection Packet

```typescript
interface AuditInspectionPacket {
  version: '1.0';
  type: 'audit';
  generatedAt: string;
  
  timeRange: {
    from: string;  // ISO8601
    to: string;    // ISO8601
  };
  
  org: {
    orgId: string;
    name: string;
  };
  
  // All events in time range
  events: Array<{
    timestamp: string;
    type: string;
    entityType: 'task' | 'project' | 'agent' | 'user';
    entityId: string;
    actor: string;
    action: string;
    details?: Record<string, unknown>;
  }>;
  
  // Summary
  summary: {
    tasksCreated: number;
    tasksCompleted: number;
    tasksFailed: number;
    agentsRegistered: number;
    agentsDeregistered: number;
    usersActive: number;
    projectsActive: number;
  };
  
  meta: {
    generatedBy: string;
    reason?: string;  // Audit purpose
  };
}
```

## 4. Generation API

### 4.1 Generate Task Packet

```typescript
// POST /api/inspection/task/:taskId
async function generateTaskPacket(taskId: string, options?: {
  includeAllLogs?: boolean;  // Default: last 500 lines
  includeSettings?: boolean;  // Default: true
}): Promise<TaskInspectionPacket>
```

**Response:**
```json
{
  "version": "1.0",
  "type": "task",
  "generatedAt": "2026-02-03T12:00:00Z",
  "task": {
    "taskId": "task_abc123",
    "title": "Add user authentication",
    "prompt": "Add login/logout functionality...",
    "state": "ERROR",
    "createdAt": "2026-02-03T10:00:00Z",
    "startedAt": "2026-02-03T10:01:00Z",
    "endedAt": "2026-02-03T10:05:00Z",
    "error": "TypeError: Cannot read property 'user' of undefined"
  },
  "events": [...],
  "logs": [...],
  "meta": {
    "correlationId": "corr_xyz789",
    "orgId": "org_default",
    "generatedBy": "user:admin"
  }
}
```

### 4.2 Generate Session Packet

```typescript
// POST /api/inspection/session/:sessionId
async function generateSessionPacket(sessionId: string): Promise<SessionInspectionPacket>
```

### 4.3 Generate Audit Packet

```typescript
// POST /api/inspection/audit
async function generateAuditPacket(options: {
  from: string;
  to: string;
  reason?: string;
}): Promise<AuditInspectionPacket>
```

## 5. Export Formats

### 5.1 JSON (Default)

Full fidelity, machine-readable.

### 5.2 Markdown (Human-Readable)

```markdown
# Task Inspection: Add user authentication

**Status:** ERROR
**Created:** Feb 3, 2026 10:00 AM
**Duration:** 4 minutes

## Prompt

Add login/logout functionality to the app

## Timeline

| Time | Event | Details |
|------|-------|---------|
| 10:00:00 | CREATED | Task created by user:admin |
| 10:01:00 | QUEUED | Added to queue |
| 10:01:05 | LEASED | Leased by agent_xyz |
| 10:05:00 | ERROR | TypeError: Cannot read property... |

## Logs (Last 50 lines)

\`\`\`
[10:01:10] Running npm test...
[10:01:15] FAIL: auth.test.ts
[10:05:00] TypeError: Cannot read property 'user' of undefined
\`\`\`

## Error Analysis Prompt

Please analyze this task failure:
- Error: TypeError: Cannot read property 'user' of undefined
- Last successful action: Running npm test
- Logs show test failure in auth.test.ts

What might have caused this error and how can it be fixed?
```

### 5.3 Clipboard-Ready Format

Optimized for pasting into ChatGPT:

```
<inspection type="task" id="task_abc123">
<context>
Project: my-app
Task: Add user authentication
Status: ERROR
Error: TypeError: Cannot read property 'user' of undefined
</context>

<logs last="50">
[10:01:10] Running npm test...
[10:01:15] FAIL: auth.test.ts
[10:05:00] TypeError: Cannot read property 'user' of undefined
</logs>

<question>
Analyze this error and suggest a fix.
</question>
</inspection>
```

## 6. UI Integration

### 6.1 Task Detail Button

```tsx
function TaskActions({ task }: { task: Task }) {
  return (
    <div className="flex gap-2">
      {task.state === 'ERROR' && (
        <Button
          variant="secondary"
          onClick={() => generateAndCopyPacket(task.taskId)}
        >
          Copy for ChatGPT
        </Button>
      )}
      <DropdownMenu>
        <DropdownTrigger>Export</DropdownTrigger>
        <DropdownContent>
          <DropdownItem onClick={() => exportPacket(task.taskId, 'json')}>
            Download JSON
          </DropdownItem>
          <DropdownItem onClick={() => exportPacket(task.taskId, 'markdown')}>
            Download Markdown
          </DropdownItem>
          <DropdownItem onClick={() => copyToClipboard(task.taskId)}>
            Copy to Clipboard
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu>
    </div>
  );
}
```

### 6.2 Quick Copy Flow

1. User clicks "Copy for ChatGPT" on error task
2. System generates clipboard-ready packet
3. Packet copied to clipboard with toast notification
4. User pastes into ChatGPT for analysis

## 7. Privacy Considerations

### 7.1 Redaction

Before export, optionally redact:
- API keys (already encrypted, but mask references)
- User emails (replace with user:xxx)
- Full file paths (replace with relative paths)

### 7.2 Redaction Config

```typescript
interface RedactionConfig {
  redactApiKeys: boolean;  // Default: true
  redactEmails: boolean;   // Default: false
  redactPaths: boolean;    // Default: false
}
```

## 8. Acceptance Criteria

- **AC-INSP-1**: Task inspection packet includes all events and logs
- **AC-INSP-2**: Session inspection packet includes all threads and runs
- **AC-INSP-3**: Audit inspection packet covers specified time range
- **AC-INSP-4**: JSON export is valid and complete
- **AC-INSP-5**: Markdown export is human-readable
- **AC-INSP-6**: Clipboard format is optimized for ChatGPT
- **AC-INSP-7**: "Copy for ChatGPT" button appears on error tasks
- **AC-INSP-8**: Redaction works for sensitive data
