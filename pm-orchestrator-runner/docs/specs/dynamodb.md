# DynamoDB Schema Specification

## 1. Design Approach

**Multiple Tables** design for Phase 1 (simplicity over optimization).

Future: Consolidate to single-table design for cost/performance.

## 2. Tables

### 2.1 Users Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `USER#<userId>` |
| userId | S | UUID |
| email | S | Unique within org |
| passwordHash | S | bcrypt hash |
| displayName | S | User display name |
| role | S | `owner` / `admin` / `member` / `viewer` |
| orgId | S | Organization ID |
| status | S | `active` / `suspended` |
| createdAt | S | ISO8601 |
| lastLoginAt | S | ISO8601 |

**GSI1** (email-index):
- PK: `orgId`
- SK: `email`

### 2.2 Orgs Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| orgId | S | UUID |
| name | S | Organization name |
| plan | S | `free` / `pro` / `enterprise` |
| createdAt | S | ISO8601 |

### 2.3 Projects Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| SK | S | `PROJ#<projectId>` |
| projectId | S | UUID |
| orgId | S | Organization ID |
| name | S | Project name |
| localPathHint | S | Optional: `/Users/dev/myproject` |
| defaultModel | S | `gpt-4o` / `claude-sonnet-4-20250514` etc |
| createdAt | S | ISO8601 |
| updatedAt | S | ISO8601 |

**GSI1** (project-lookup):
- PK: `projectId`
- Projection: ALL

### 2.4 Agents Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| SK | S | `AGENT#<agentId>` |
| agentId | S | UUID |
| orgId | S | Organization ID |
| host | S | Hostname |
| pid | N | Process ID |
| cwd | S | Current working directory |
| status | S | `online` / `stale` / `offline` |
| lastHeartbeatAt | S | ISO8601 |
| currentProjectId | S | Currently assigned project |
| currentTaskId | S | Currently executing task |
| version | S | Agent version |
| capabilities | L | List of capabilities |
| canInteractive | BOOL | false (Web agents) |
| ttl | N | Unix timestamp for auto-cleanup |

**GSI1** (status-index):
- PK: `status`
- SK: `lastHeartbeatAt`

### 2.5 Tasks Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| SK | S | `TASK#<taskId>` |
| taskId | S | UUID |
| orgId | S | Organization ID |
| projectId | S | Project ID |
| agentId | S | Assigned agent (null if queued) |
| state | S | See Task Lifecycle |
| title | S | Auto-generated from prompt |
| prompt | S | User input |
| priority | N | 0-100 (higher = more urgent) |
| createdAt | S | ISO8601 |
| updatedAt | S | ISO8601 |
| startedAt | S | ISO8601 |
| endedAt | S | ISO8601 |
| result | S | Final output summary |
| error | S | Error message if failed |
| clarificationQuestion | S | Current question if AWAITING_RESPONSE |
| responseText | S | User response text |
| correlationId | S | UUID for log correlation |

**GSI1** (project-tasks):
- PK: `projectId`
- SK: `updatedAt`

**GSI2** (agent-tasks):
- PK: `agentId`
- SK: `updatedAt`

**GSI3** (state-queue):
- PK: `state`
- SK: `createdAt`

### 2.6 Queue Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| SK | S | `QUEUE#<createdAt>#<taskId>` |
| taskId | S | Task ID |
| projectId | S | Project ID |
| desiredAgentId | S | Preferred agent (optional) |
| leaseOwner | S | Agent ID holding lease |
| leaseExpiresAt | S | ISO8601 |
| attempts | N | Retry count |
| nextVisibleAt | S | ISO8601 (for visibility timeout) |

**GSI1** (lease-expiry):
- PK: `leaseOwner`
- SK: `leaseExpiresAt`

### 2.7 TaskEvents Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `TASK#<taskId>` |
| SK | S | `EVT#<timestamp>#<seq>` |
| type | S | Event type (see below) |
| message | S | Human-readable message |
| level | S | `info` / `warn` / `error` |
| payload | M | JSON payload |
| actor | S | `user:<id>` / `agent:<id>` / `system` |
| correlationId | S | Correlation ID |
| createdAt | S | ISO8601 |

**Event Types:**
- `CREATED`, `QUEUED`, `LEASED`, `STARTED`
- `PROGRESS`, `LOG_BATCH`
- `AWAITING_RESPONSE`, `RESPONSE_RECEIVED`
- `COMPLETED`, `ERROR`, `CANCELLED`
- `RETRIED`, `REQUEUED`

### 2.8 Logs Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `TASK#<taskId>` |
| SK | S | `LOG#<timestamp>#<seq>` |
| stream | S | `stdout` / `stderr` / `system` |
| line | S | Log content |
| level | S | `debug` / `info` / `warn` / `error` |
| correlationId | S | Correlation ID |
| createdAt | S | ISO8601 |

### 2.9 Settings Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| SK | S | `SET#GLOBAL` / `SET#USER#<userId>` / `SET#PROJ#<projectId>` |
| scope | S | `global` / `user` / `project` |
| defaultModel | S | Default model |
| modelAllowList | L | Allowed models |
| openaiKeyRef | S | Secret reference |
| anthropicKeyRef | S | Secret reference |
| uiPrefs | M | UI preferences |
| notifyPrefs | M | Notification preferences |
| updatedAt | S | ISO8601 |

### 2.10 Secrets Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| SK | S | `SEC#<secretId>` |
| secretId | S | UUID |
| type | S | `openai_key` / `anthropic_key` |
| cipherText | S | Encrypted value (prod) or plain (dev) |
| createdAt | S | ISO8601 |
| updatedAt | S | ISO8601 |

**Security Note:** In dev mode (`NODE_ENV=development`), plain text allowed. In prod, encryption required.

### 2.11 Notifications Table

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | S | `ORG#<orgId>` |
| SK | S | `NOTIF#<timestamp>#<notificationId>` |
| notificationId | S | UUID |
| userId | S | Target user (null = all) |
| type | S | Notification type |
| title | S | Short title |
| message | S | Detail message |
| severity | S | `info` / `warning` / `error` |
| taskId | S | Related task |
| projectId | S | Related project |
| agentId | S | Related agent |
| read | BOOL | Read status |
| createdAt | S | ISO8601 |
| ttl | N | Auto-cleanup timestamp |

**Notification Types:**
- `TASK_AWAITING_RESPONSE`
- `TASK_ERROR`
- `TASK_COMPLETED`
- `AGENT_OFFLINE`
- `QUEUE_STUCK`

**GSI1** (user-notifications):
- PK: `userId`
- SK: `createdAt`

## 3. Sample Records

### User Record
```json
{
  "PK": "USER#usr_abc123",
  "userId": "usr_abc123",
  "email": "dev@example.com",
  "passwordHash": "$2b$10$...",
  "displayName": "Developer",
  "role": "admin",
  "orgId": "org_xyz789",
  "status": "active",
  "createdAt": "2025-01-29T00:00:00Z",
  "lastLoginAt": "2025-01-29T10:00:00Z"
}
```

### Task Record
```json
{
  "PK": "ORG#org_xyz789",
  "SK": "TASK#task_def456",
  "taskId": "task_def456",
  "orgId": "org_xyz789",
  "projectId": "proj_ghi012",
  "agentId": "agent_jkl345",
  "state": "RUNNING",
  "title": "Add user authentication",
  "prompt": "Add login/logout functionality to the app",
  "priority": 50,
  "createdAt": "2025-01-29T10:00:00Z",
  "updatedAt": "2025-01-29T10:05:00Z",
  "startedAt": "2025-01-29T10:05:00Z",
  "correlationId": "corr_mno678"
}
```

## 4. TTL Configuration

| Table | TTL Field | Duration |
|-------|-----------|----------|
| Agents | ttl | 1 hour (after last heartbeat) |
| Notifications | ttl | 7 days |
| Logs | (none) | Manual cleanup |
| TaskEvents | (none) | Manual cleanup |

## 5. Capacity Planning (Phase 1)

| Table | RCU | WCU |
|-------|-----|-----|
| Users | 5 | 5 |
| Orgs | 5 | 5 |
| Projects | 10 | 5 |
| Agents | 10 | 20 |
| Tasks | 20 | 20 |
| Queue | 20 | 20 |
| TaskEvents | 50 | 50 |
| Logs | 100 | 100 |
| Settings | 5 | 5 |
| Secrets | 5 | 5 |
| Notifications | 20 | 20 |

On-demand mode recommended for dev.
