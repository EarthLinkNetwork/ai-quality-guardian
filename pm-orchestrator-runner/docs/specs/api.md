# HTTP API Specification

## 1. Overview

All API routes are Next.js Route Handlers under `/api/`.

**Base URL:** `http://localhost:3000/api`

**Authentication:** Cookie-based session (httpOnly)

## 2. Authentication

### POST /api/auth/login

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "userId": "usr_abc123",
  "email": "user@example.com",
  "displayName": "User Name",
  "role": "admin",
  "orgId": "org_xyz789"
}
```

**Response (401):**
```json
{
  "error": "Invalid credentials"
}
```

**Side Effects:**
- Sets `session` httpOnly cookie

### POST /api/auth/logout

**Response (200):**
```json
{
  "success": true
}
```

**Side Effects:**
- Clears `session` cookie

### GET /api/auth/me

**Response (200):**
```json
{
  "userId": "usr_abc123",
  "email": "user@example.com",
  "displayName": "User Name",
  "role": "admin",
  "orgId": "org_xyz789"
}
```

**Response (401):**
```json
{
  "error": "Not authenticated"
}
```

## 3. Dashboard

### GET /api/dashboard

**Response (200):**
```json
{
  "agents": {
    "online": 3,
    "stale": 1,
    "offline": 0
  },
  "projects": {
    "total": 5
  },
  "tasks": {
    "queued": 5,
    "running": 2,
    "awaitingResponse": 1
  },
  "recentNotifications": [
    {
      "notificationId": "notif_123",
      "type": "TASK_AWAITING_RESPONSE",
      "title": "Task needs response",
      "message": "Which auth method?",
      "severity": "warning",
      "taskId": "task_456",
      "createdAt": "2025-01-29T10:00:00Z",
      "read": false
    }
  ]
}
```

## 4. Projects

### GET /api/projects

**Query Parameters:**
- `limit` (optional, default 20)
- `cursor` (optional, pagination)

**Response (200):**
```json
{
  "items": [
    {
      "projectId": "proj_abc123",
      "name": "My Project",
      "localPathHint": "/Users/dev/myproject",
      "defaultModel": "claude-sonnet-4-20250514",
      "createdAt": "2025-01-29T00:00:00Z",
      "updatedAt": "2025-01-29T10:00:00Z",
      "taskCount": 5
    }
  ],
  "nextCursor": "eyJwayI6..."
}
```

### POST /api/projects

**Request:**
```json
{
  "name": "New Project",
  "localPathHint": "/path/to/project",
  "defaultModel": "claude-sonnet-4-20250514"
}
```

**Response (201):**
```json
{
  "projectId": "proj_new123",
  "name": "New Project",
  "localPathHint": "/path/to/project",
  "defaultModel": "claude-sonnet-4-20250514",
  "createdAt": "2025-01-29T10:00:00Z",
  "updatedAt": "2025-01-29T10:00:00Z"
}
```

### GET /api/projects/[id]

**Response (200):**
```json
{
  "projectId": "proj_abc123",
  "name": "My Project",
  "localPathHint": "/Users/dev/myproject",
  "defaultModel": "claude-sonnet-4-20250514",
  "createdAt": "2025-01-29T00:00:00Z",
  "updatedAt": "2025-01-29T10:00:00Z"
}
```

### PUT /api/projects/[id]

**Request:**
```json
{
  "name": "Updated Name",
  "localPathHint": "/new/path",
  "defaultModel": "gpt-4o"
}
```

**Response (200):** Updated project object

### DELETE /api/projects/[id]

**Response (204):** No content

## 5. Agents

### GET /api/agents

**Response (200):**
```json
{
  "items": [
    {
      "agentId": "agent_abc123",
      "host": "macbook-pro",
      "pid": 12345,
      "cwd": "/Users/dev/project",
      "status": "online",
      "lastHeartbeatAt": "2025-01-29T10:00:00Z",
      "currentProjectId": "proj_123",
      "currentTaskId": "task_456",
      "version": "1.0.0",
      "capabilities": ["claude-code"]
    }
  ]
}
```

### GET /api/agents/[id]

**Response (200):** Single agent object

## 6. Tasks

### GET /api/tasks

**Query Parameters:**
- `state` (optional): Filter by state
- `projectId` (optional): Filter by project
- `agentId` (optional): Filter by agent
- `limit` (optional, default 20)
- `cursor` (optional)

**Response (200):**
```json
{
  "items": [
    {
      "taskId": "task_abc123",
      "projectId": "proj_123",
      "agentId": "agent_456",
      "state": "RUNNING",
      "title": "Add authentication",
      "prompt": "Add login/logout functionality",
      "priority": 50,
      "createdAt": "2025-01-29T10:00:00Z",
      "updatedAt": "2025-01-29T10:05:00Z",
      "startedAt": "2025-01-29T10:05:00Z"
    }
  ],
  "nextCursor": "eyJwayI6..."
}
```

### POST /api/tasks

**Request:**
```json
{
  "projectId": "proj_123",
  "prompt": "Add user authentication with JWT",
  "priority": 50
}
```

**Response (201):**
```json
{
  "taskId": "task_new123",
  "projectId": "proj_123",
  "state": "QUEUED",
  "title": "Add user authentication",
  "prompt": "Add user authentication with JWT",
  "priority": 50,
  "createdAt": "2025-01-29T10:00:00Z",
  "updatedAt": "2025-01-29T10:00:00Z",
  "correlationId": "corr_xyz789"
}
```

### GET /api/tasks/[id]

**Response (200):** Full task object with all fields

### POST /api/tasks/[id]/respond

**Request:**
```json
{
  "response": "Use JWT with refresh tokens"
}
```

**Response (200):**
```json
{
  "success": true,
  "task": { /* updated task object */ }
}
```

### POST /api/tasks/[id]/cancel

**Response (200):**
```json
{
  "success": true,
  "task": { /* updated task with state: CANCELLED */ }
}
```

### POST /api/tasks/[id]/retry

**Precondition:** Task state must be ERROR

**Response (200):**
```json
{
  "success": true,
  "task": { /* new task object (re-queued) */ }
}
```

### GET /api/tasks/[id]/logs

**Query Parameters:**
- `since` (optional): ISO8601 timestamp, get logs after this time
- `limit` (optional, default 100)

**Response (200):**
```json
{
  "items": [
    {
      "timestamp": "2025-01-29T10:00:01.000Z",
      "stream": "stdout",
      "line": "Analyzing requirements...",
      "level": "info"
    }
  ],
  "hasMore": true
}
```

### GET /api/tasks/[id]/events

**Response (200):**
```json
{
  "items": [
    {
      "type": "CREATED",
      "message": "Task created",
      "level": "info",
      "actor": "user:usr_123",
      "createdAt": "2025-01-29T10:00:00Z"
    },
    {
      "type": "QUEUED",
      "message": "Task queued",
      "level": "info",
      "actor": "system",
      "createdAt": "2025-01-29T10:00:01Z"
    }
  ]
}
```

## 7. Settings

### GET /api/settings

**Response (200):**
```json
{
  "defaultModel": "claude-sonnet-4-20250514",
  "modelAllowList": ["claude-sonnet-4-20250514", "gpt-4o"],
  "hasOpenaiKey": true,
  "hasAnthropicKey": true,
  "uiPrefs": {
    "theme": "dark",
    "logAutoScroll": true
  }
}
```

### PUT /api/settings

**Request:**
```json
{
  "defaultModel": "gpt-4o",
  "uiPrefs": {
    "theme": "light"
  }
}
```

**Response (200):** Updated settings

### PUT /api/settings/keys/openai

**Request:**
```json
{
  "key": "sk-..."
}
```

**Response (200):**
```json
{
  "success": true,
  "hasOpenaiKey": true
}
```

### DELETE /api/settings/keys/openai

**Response (200):**
```json
{
  "success": true,
  "hasOpenaiKey": false
}
```

## 8. Notifications

### GET /api/notifications

**Query Parameters:**
- `unreadOnly` (optional, boolean)
- `limit` (optional, default 20)
- `cursor` (optional)

**Response (200):**
```json
{
  "items": [
    {
      "notificationId": "notif_123",
      "type": "TASK_AWAITING_RESPONSE",
      "title": "Task needs response",
      "message": "Which auth method?",
      "severity": "warning",
      "taskId": "task_456",
      "read": false,
      "createdAt": "2025-01-29T10:00:00Z"
    }
  ],
  "unreadCount": 5,
  "nextCursor": "eyJwayI6..."
}
```

### PUT /api/notifications/[id]/read

**Response (200):**
```json
{
  "success": true
}
```

### PUT /api/notifications/read-all

**Response (200):**
```json
{
  "success": true,
  "updatedCount": 5
}
```

## 9. Error Responses

All error responses follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { /* optional additional info */ }
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request body |
| CONFLICT | 409 | Resource conflict |
| INTERNAL_ERROR | 500 | Server error |

## 10. Rate Limiting (Future)

| Endpoint Pattern | Limit |
|------------------|-------|
| POST /api/tasks | 10/min |
| GET /api/tasks/*/logs | 60/min |
| Other | 100/min |
