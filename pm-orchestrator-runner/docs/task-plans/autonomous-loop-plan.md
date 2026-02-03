# Task Plan: Autonomous Loop Implementation

## Overview

Implement the Inspect->Plan->Dispatch->Verify->Record autonomous loop.

---

## Task Breakdown

### Phase A: Plan Button & API

| Task | Status | Description |
|------|--------|-------------|
| A1 | Pending | Add Plan CRUD methods to NoDynamoDAL |
| A2 | Pending | Create POST /api/projects/:projectId/plan endpoint |
| A3 | Pending | Create GET /api/plans/:planId endpoint |
| A4 | Pending | Add Plan button to project detail UI |
| A5 | Pending | Implement mock AI plan generation (static decomposition) |

### Phase B: Dispatch Button & Parallel Runs

| Task | Status | Description |
|------|--------|-------------|
| B1 | Pending | Create POST /api/plans/:planId/dispatch endpoint |
| B2 | Pending | Implement parallel Run creation from PlanTasks |
| B3 | Pending | Add planId/planTaskId to NoDynamoRun |
| B4 | Pending | Add Dispatch button to project detail UI |
| B5 | Pending | Implement Run status tracking in Plan |

### Phase C: Verify Button & Gate Execution

| Task | Status | Description |
|------|--------|-------------|
| C1 | Pending | Create POST /api/plans/:planId/verify endpoint |
| C2 | Pending | Implement gate:all execution as Run |
| C3 | Pending | Parse gate output for check results |
| C4 | Pending | Add Verify button to project detail UI |
| C5 | Pending | Display gate results in UI |

### Phase D: AWAITING_RESPONSE Integration

| Task | Status | Description |
|------|--------|-------------|
| D1 | Pending | Add AWAITING_RESPONSE badge CSS |
| D2 | Pending | Update dashboard to show AWAITING_RESPONSE projects |
| D3 | Pending | Update project detail to highlight AWAITING runs |

### Phase E: E2E Testing

| Task | Status | Description |
|------|--------|-------------|
| E1 | Pending | Create autonomous-loop.e2e.test.ts |
| E2 | Pending | Test Inspect->Plan->Dispatch->Verify flow |
| E3 | Pending | Verify stateDir isolation |
| E4 | Pending | Run gate:all and verify evidence |

---

## Dependencies

- Phase B depends on Phase A
- Phase C depends on Phase B
- Phase D is independent
- Phase E requires all other phases

---

## Acceptance Criteria

- AC-LOOP-1: Plan button generates Plan from Inspection Packet
- AC-LOOP-2: Dispatch creates parallel Runs for all PlanTasks
- AC-LOOP-3: Verify executes gate:all and records results
- AC-LOOP-4: AWAITING_RESPONSE is visible on dashboard
- AC-LOOP-5: E2E test passes for full Inspect->Plan->Dispatch->Verify flow
- AC-LOOP-6: No manual cleanup required (test isolation)
- AC-LOOP-7: StateDir mixing is prevented
