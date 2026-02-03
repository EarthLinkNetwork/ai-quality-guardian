# 06_AUTONOMOUS_LOOP.md - Autonomous Loop (Inspect->Plan->Dispatch->Verify->Record)

## 1. Overview

The Autonomous Loop enables the PM Orchestrator Runner to execute multi-step task plans
with human oversight. The loop consists of 5 phases:

1. **Inspect** - Analyze current state and generate Inspection Packet
2. **Plan** - Generate task decomposition plan from Inspection Packet
3. **Dispatch** - Execute Plan tasks as parallel Runs
4. **Verify** - Run gate:all and validate execution results
5. **Record** - Store execution record and update activity feed

## 2. Data Models

### 2.1 Plan Entity

```typescript
interface Plan {
  planId: string;              // plan_<uuid>
  projectId: string;
  runId?: string;              // Source run for inspection
  packetId?: string;           // Inspection packet used
  status: PlanStatus;
  tasks: PlanTask[];
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
}

type PlanStatus = 
  | 'DRAFT'           // Plan created, not dispatched
  | 'DISPATCHING'     // Runs being created
  | 'RUNNING'         // Runs executing
  | 'VERIFYING'       // Running gate:all
  | 'VERIFIED'        // gate:all passed
  | 'FAILED'          // gate:all failed or runs failed
  | 'CANCELLED';      // User cancelled

interface PlanTask {
  taskId: string;
  description: string;
  priority: number;
  dependencies: string[];      // taskIds this depends on
  runId?: string;              // Associated Run when dispatched
  status: TaskState;
}
```

### 2.2 Extended Run Entity

```typescript
interface NoDynamoRun {
  // ... existing fields ...
  planId?: string;             // If run was created by Plan dispatch
  planTaskId?: string;         // Which PlanTask this run executes
}
```

## 3. API Endpoints

### 3.1 Plan Generation

```
POST /api/projects/:projectId/plan
Body: { sourceRunId?: string, packetId?: string }

Response: {
  planId: string;
  projectId: string;
  status: 'DRAFT';
  tasks: PlanTask[];
}
```

### 3.2 Plan Dispatch

```
POST /api/plans/:planId/dispatch

Response: {
  planId: string;
  status: 'DISPATCHING';
  runs: Array<{ runId: string; taskId: string; }>;
}
```

### 3.3 Plan Verify

```
POST /api/plans/:planId/verify

Response: {
  planId: string;
  status: 'VERIFYING' | 'VERIFIED' | 'FAILED';
  verifyRunId: string;         // Run executing gate:all
  gateResult?: {
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; message: string; }>;
  };
}
```

### 3.4 Plan Status

```
GET /api/plans/:planId

Response: {
  plan: Plan;
  runs: NoDynamoRun[];
  events: NoDynamoEvent[];
}
```

### 3.5 List Plans

```
GET /api/projects/:projectId/plans

Response: {
  plans: Plan[];
}
```

## 4. Run Status Extension

### 4.1 AWAITING_RESPONSE Detection

When a Run enters AWAITING_RESPONSE state:

1. Update project status to `needs_response`
2. Emit `task_awaiting` activity event
3. Highlight in dashboard and project detail

### 4.2 Status Update API

```
PATCH /api/runs/:runId/status
Body: { status: TaskState; message?: string; }

Response: {
  run: NoDynamoRun;
  projectStatusChanged: boolean;
}
```

## 5. UI Components

### 5.1 Project Detail Buttons

```
+------------------------------------------+
|  Project: my-app                         |
|  Status: idle | [Inspect] [Plan] [Verify]|
+------------------------------------------+
|  Sessions:                               |
|  - sess_abc123 (active)                  |
|    - run_1 COMPLETED                     |
|    - run_2 RUNNING                       |
+------------------------------------------+
```

### 5.2 Plan View

```
+------------------------------------------+
|  Plan: plan_xyz                          |
|  Status: RUNNING                         |
|  Tasks: 3                                |
+------------------------------------------+
| [x] Task 1: Setup dependencies    run_1  |
| [~] Task 2: Implement feature     run_2  |
| [ ] Task 3: Add tests             -      |
+------------------------------------------+
| [Dispatch] [Verify] [Cancel]             |
+------------------------------------------+
```

### 5.3 Needs Response Indicator

Dashboard shows projects with AWAITING_RESPONSE runs prominently:

```
+------------------------------------------+
|  NEEDS RESPONSE (1)                      |
|  +--------------------------------------+|
|  | my-app: Task waiting for input       ||
|  | run_abc: "What database to use?"     ||
|  +--------------------------------------+|
+------------------------------------------+
```

## 6. Activity Feed Events

### 6.1 Plan Events

- `plan_created` - New plan generated
- `plan_dispatched` - Runs created from plan
- `plan_completed` - All runs finished
- `plan_verified` - gate:all passed
- `plan_failed` - gate:all failed or runs failed

### 6.2 Await Events

- `task_awaiting` - Run waiting for user response (high importance)

## 7. Log Viewing

### 7.1 Real-time Log Streaming

Logs are viewable while Run is still executing:

```
GET /api/runs/:runId/logs/stream
Accept: text/event-stream

data: {"timestamp":"...", "message":"...", "level":"info"}
data: {"timestamp":"...", "message":"...", "level":"info"}
```

### 7.2 Log Pagination

```
GET /api/runs/:runId/logs?offset=0&limit=100

Response: {
  logs: Array<{ timestamp, message, level }>;
  total: number;
  hasMore: boolean;
}
```

## 8. State Directory Structure

```
stateDir/
├── projects/
│   └── {projectId}.json
├── sessions/
│   └── {sessionId}.json
├── runs/
│   └── {runId}.json
├── plans/                        # NEW
│   └── {planId}.json
├── events/
│   └── events-YYYY-MM-DD.jsonl
└── inspection-packets/
    └── {packetId}.json
```

## 9. Acceptance Criteria

- **AC-LOOP-1**: Plan button generates task decomposition from inspection packet
- **AC-LOOP-2**: Dispatch creates parallel Runs for each PlanTask
- **AC-LOOP-3**: Verify runs gate:all and stores result
- **AC-LOOP-4**: AWAITING_RESPONSE highlighted in dashboard and project detail
- **AC-LOOP-5**: Activity feed shows all plan and await events
- **AC-LOOP-6**: Logs viewable during run execution (not just after completion)
- **AC-LOOP-7**: No manual cleanup required between runs
- **AC-LOOP-8**: Namespace isolation enforced (no cross-project data leakage)
