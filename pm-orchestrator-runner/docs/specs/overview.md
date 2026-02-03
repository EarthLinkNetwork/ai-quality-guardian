# PM Orchestrator Runner - System Overview

## 1. Vision

Transform pm-orchestrator-runner from a CLI-centric tool into a **Web-first orchestration platform** while preserving CLI capabilities for local agent operation.

### Core Problem Solved
- **Terminal tab hell**: Multiple projects running simultaneously become unmanageable
- **No persistent state**: CLI sessions lose context on restart
- **No visibility**: Can't see what's running across machines/projects
- **No collaboration**: Single-user CLI doesn't support team workflows

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WEB UI (Next.js)                        │
│  - Dashboard (agents, projects, notifications)                  │
│  - Project/Task management                                      │
│  - Real-time log viewer                                         │
│  - Settings & API key management                                │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTP API (polling 2s)
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DynamoDB (AWS / Local)                     │
│  Tables: Users, Orgs, Projects, Agents, Tasks, Queue,           │
│          TaskEvents, Logs, Settings, Secrets, Notifications     │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ SDK direct access
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL AGENT (pm-runner)                      │
│  - Heartbeat (10s)                                              │
│  - Queue poll (3s)                                              │
│  - Task execution (Claude Code wrapper)                         │
│  - Log streaming to DDB                                         │
│  - Response handling for AWAITING_RESPONSE                      │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Key Entities

| Entity | Description |
|--------|-------------|
| **Org** | Organization/tenant - isolation boundary |
| **User** | Authenticated user with role in org |
| **Project** | Code repository context (name, path hint, settings) |
| **Agent** | Running pm-runner instance on a machine |
| **Task** | Single prompt execution unit |
| **TaskEvent** | State transition / progress record |
| **Log** | stdout/stderr/system output line |
| **Notification** | User-facing alert (task needs response, error, etc.) |

## 4. Terminology

| Term | Definition |
|------|------------|
| **Heartbeat** | Periodic agent → DDB update proving agent is alive |
| **Poll** | Agent checking Queue for available tasks |
| **Lease** | Agent claiming exclusive ownership of a task |
| **Clarification** | Task paused waiting for user input |
| **Correlation ID** | UUID linking related logs/events across systems |

## 5. Non-Functional Requirements

### 5.1 Performance
- Web UI: Initial load < 3s, polling latency acceptable (2s)
- Agent: Heartbeat 10s, poll 3s, log batch 1s
- DDB: Single-digit ms latency (Local/AWS)

### 5.2 Scalability (Phase 1)
- Single org: 10 projects, 5 agents, 100 concurrent tasks
- Future: Multi-tenant with org isolation

### 5.3 Security
- All API calls authenticated (session cookie)
- RBAC enforced server-side
- Secrets encrypted in prod, plain in dev (with guard)
- Audit log for sensitive operations

### 5.4 Reliability
- Agent crash: Tasks return to queue (lease expiry)
- Web crash: State persisted in DDB, recoverable
- DDB: AWS managed or local docker

### 5.5 Observability
- Correlation IDs on all operations
- TaskEvents as audit trail
- Logs queryable by task/time/level

## 6. Technology Stack

| Layer | Technology |
|-------|------------|
| Web UI | Next.js 14 (App Router), Tailwind CSS, shadcn/ui |
| API | Next.js Route Handlers |
| Database | DynamoDB (AWS SDK v3) |
| Agent | Node.js (existing pm-runner) |
| Auth | bcrypt + httpOnly cookie session |
| Dev Infra | Docker Compose (DynamoDB Local) |

## 7. Phase 1 Scope

### In Scope
- Basic auth (login/logout, session)
- Dashboard with agent/project/notification overview
- Project CRUD and task creation
- Task detail with log viewer and respond capability
- Agent registration and heartbeat
- Queue-based task distribution
- Settings management (model, keys)
- Notifications for AWAITING_RESPONSE and ERROR

### Out of Scope (Backlog)
- Agent spawn from Web
- WebSocket/SSE real-time
- Email/Slack notifications
- Multi-org support
- Advanced RBAC (custom roles)
- Full-text log search
- Task dependencies/workflows

## 8. Success Criteria

1. Agent heartbeats visible in Web Dashboard
2. Tasks created from Web execute on Agent
3. Logs stream to Web in near-real-time
4. AWAITING_RESPONSE handled via Web
5. ERROR tasks can be retried
6. Settings persist and apply to new tasks
7. Multi-user data model (orgId) enforced
