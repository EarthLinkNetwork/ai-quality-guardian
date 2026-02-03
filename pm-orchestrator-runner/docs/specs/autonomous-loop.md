# Autonomous Loop Specification (Inspect -> Plan -> Dispatch -> Verify -> Record)

## Version: 1.0.0
## Status: Draft

---

## Overview

The Autonomous Loop enables a self-running execution cycle for PM Orchestrator Runner.
Given an Inspection Packet (generated from a Run), the system:

1. **Inspect**: Generate/retrieve an Inspection Packet containing task context
2. **Plan**: AI decomposes the inspection into subtasks (JSON-based Plan)
3. **Dispatch**: Launch multiple Runs in parallel for each subtask
4. **Verify**: Execute `gate:all` to validate work quality
5. **Record**: Persist all results with evidence trail

---

## Data Models

### Plan Entity (Extended)

```typescript
interface Plan {
  planId: string;           // plan_<uuid>
  projectId: string;
  orgId: string;
  runId?: string;           // Source run for inspection
  packetId?: string;        // Inspection packet used
  status: PlanStatus;       // DRAFT | DISPATCHING | RUNNING | VERIFYING | VERIFIED | FAILED | CANCELLED
  tasks: PlanTask[];
  verifyRunId?: string;     // Run executing gate:all
  gateResult?: {
    passed: boolean;
    checks: GateCheck[];
  };
  createdAt: string;
  updatedAt: string;
  executedAt?: string;      // When Dispatch was triggered
  completedAt?: string;     // When all tasks completed
  verifiedAt?: string;      // When gate:all finished
}

interface PlanTask {
  taskId: string;           // ptask_<uuid>
  description: string;
  priority: number;
  dependencies: string[];   // taskIds this depends on
  runId?: string;           // Associated Run when dispatched
  status: TaskState;
}

type PlanStatus = 
  | 'DRAFT'        // Plan created, not dispatched
  | 'DISPATCHING'  // Runs being created
  | 'RUNNING'      // Runs executing
  | 'VERIFYING'    // Running gate:all
  | 'VERIFIED'     // gate:all passed
  | 'FAILED'       // gate:all failed or runs failed
  | 'CANCELLED';   // User cancelled
```

### GateCheck Structure

```typescript
interface GateCheck {
  name: string;       // e.g., "gate:ui", "gate:task"
  passed: boolean;
  message: string;
  duration?: number;  // ms
}
```

---

## API Endpoints

### POST /api/projects/:projectId/plan

Generate a Plan from an Inspection Packet.

**Request:**
```json
{
  "packetId": "pkt_xxx",
  "model": "claude-sonnet-4-20250514"  // optional, uses project default
}
```

**Response:**
```json
{
  "planId": "plan_xxx",
  "status": "DRAFT",
  "tasks": [
    {
      "taskId": "ptask_001",
      "description": "Implement feature X",
      "priority": 1,
      "dependencies": [],
      "status": "CREATED"
    }
  ],
  "createdAt": "2025-02-03T..."
}
```

### POST /api/plans/:planId/dispatch

Dispatch all tasks as parallel Runs.

**Request:**
```json
{
  "parallel": true  // optional, default true
}
```

**Response:**
```json
{
  "planId": "plan_xxx",
  "status": "RUNNING",
  "runs": [
    { "taskId": "ptask_001", "runId": "run_xxx" },
    { "taskId": "ptask_002", "runId": "run_yyy" }
  ],
  "executedAt": "2025-02-03T..."
}
```

### POST /api/plans/:planId/verify

Execute gate:all as verification.

**Request:**
```json
{}
```

**Response:**
```json
{
  "planId": "plan_xxx",
  "status": "VERIFIED",
  "verifyRunId": "run_zzz",
  "gateResult": {
    "passed": true,
    "checks": [
      { "name": "gate:ui", "passed": true, "message": "All UI invariants pass" },
      { "name": "gate:task", "passed": true, "message": "All task states valid" }
    ]
  },
  "verifiedAt": "2025-02-03T..."
}
```

### GET /api/plans/:planId

Get Plan details with all task statuses.

---

## UI Components

### Project Detail Page (/projects/:id)

Add action buttons:

1. **Plan Button**: Visible when Inspection Packet exists
   - Opens modal to configure/generate Plan
   - Shows task decomposition preview

2. **Dispatch Button**: Visible when Plan exists with status DRAFT
   - Confirms parallel execution
   - Shows estimated resource usage

3. **Verify Button**: Visible when Plan status is RUNNING and all tasks completed
   - Triggers gate:all execution
   - Shows real-time gate progress

### AWAITING_RESPONSE Indicator

Dashboard and Project pages show badge when any Run has status AWAITING_RESPONSE:

```html
<span class="badge badge-awaiting">NEEDS RESPONSE</span>
```

CSS:
```css
.badge-awaiting {
  background: #fef3c7;
  color: #92400e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

---

## State Directory Isolation

Each project has its own stateDir:

```
<projectPath>/.claude/state/
  projects/
  sessions/
  runs/
  events/
  plans/
  inspection-packets/
```

Rules:
- **Never mix stateDirs**: A Plan generated for project A must not affect project B
- **Plan files stored per-project**: <stateDir>/plans/<planId>.json
- **Runs reference planId**: NoDynamoRun includes planId and planTaskId fields

---

## Gate Execution

### gate:all Components

Execute in order:
1. npm run gate:tier0 (gate:ui + gate:task)
2. npm run gate:web
3. npm run gate:agent
4. npm run gate:spec

### Execution as Run

Create a special Run with:
- prompt: "Execute gate:all verification"
- taskRunId: verify_<planId>
- Log all gate output as events

### Result Parsing

Parse gate output to extract:
- Exit code (0 = passed)
- Individual check results
- Error messages

---

## Error Handling

### Plan Generation Failure

If AI cannot decompose tasks:
- Set Plan status to FAILED
- Record error in gateResult.checks with { name: "plan_generation", passed: false, message: "..." }

### Dispatch Failure

If Run creation fails:
- Mark affected PlanTask as ERROR
- Continue with remaining tasks
- Set Plan status to RUNNING (partial)

### Verify Failure

If gate:all fails:
- Set Plan status to FAILED
- Record all check results
- Do NOT auto-retry (requires user intervention)

---

## Evidence Trail

All actions are recorded as ActivityEvents:

```typescript
type ActivityEventType =
  | 'plan_created'
  | 'plan_dispatched'
  | 'plan_completed'
  | 'plan_verified'
  | 'plan_failed'
  | ...
```

---

## Non-Goals

- Automatic retry on failure (requires explicit user action)
- Cross-project orchestration (each Plan is project-scoped)
- Real-time WebSocket updates (polling is acceptable for MVP)
