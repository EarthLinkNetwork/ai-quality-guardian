# Autonomous Loop Implementation Tasks

## Phase 1: Data Model & DAL Extensions

### Task 1.1: Add Plan Entity to NoDynamo DAL
- [ ] Define Plan and PlanTask interfaces in types.ts
- [ ] Add plans/ directory to NoDynamo storage
- [ ] Implement createPlan, getPlan, updatePlan, listPlans
- [ ] Add planId/planTaskId to NoDynamoRun

### Task 1.2: Add Activity Event Types
- [ ] Add plan_created, plan_dispatched, plan_completed, plan_verified, plan_failed
- [ ] Add task_awaiting event type
- [ ] Update ActivityEventType union

## Phase 2: API Routes

### Task 2.1: Plan Routes
- [ ] POST /api/projects/:projectId/plan - Generate plan
- [ ] POST /api/plans/:planId/dispatch - Dispatch plan
- [ ] POST /api/plans/:planId/verify - Verify with gate:all
- [ ] GET /api/plans/:planId - Get plan with runs
- [ ] GET /api/projects/:projectId/plans - List plans

### Task 2.2: Run Status Extension
- [ ] PATCH /api/runs/:runId/status - Update run status
- [ ] Auto-update project status on AWAITING_RESPONSE
- [ ] Emit activity events on status change

### Task 2.3: Log Streaming
- [ ] GET /api/runs/:runId/logs/stream - SSE endpoint
- [ ] GET /api/runs/:runId/logs?offset&limit - Paginated logs

## Phase 3: UI Implementation

### Task 3.1: Project Detail Buttons
- [ ] Add Inspect button (existing, verify working)
- [ ] Add Plan button
- [ ] Add Verify button
- [ ] Connect to API endpoints

### Task 3.2: Plan View
- [ ] Create plan detail page at /plans/:planId
- [ ] Show task list with status
- [ ] Add Dispatch, Verify, Cancel buttons
- [ ] Show associated runs

### Task 3.3: Needs Response Indicator
- [ ] Dashboard: Filter/highlight AWAITING_RESPONSE
- [ ] Project detail: Show waiting runs prominently
- [ ] Add "Respond" action button

### Task 3.4: Log Viewer Enhancement
- [ ] Show logs during run execution (not just after)
- [ ] Auto-scroll to latest
- [ ] Preserve scroll position when viewing history

## Phase 4: E2E Tests

### Task 4.1: Playwright Test Setup
- [ ] Create test/e2e/autonomous-loop.test.ts
- [ ] Setup 2 project fixtures
- [ ] Configure parallel test execution

### Task 4.2: Autonomous Loop E2E
- [ ] Test: Create project, run Inspect
- [ ] Test: Generate Plan from inspection
- [ ] Test: Dispatch Plan, verify runs created
- [ ] Test: Verify runs with gate:all
- [ ] Test: View logs during execution

### Task 4.3: Needs Response E2E
- [ ] Test: Run enters AWAITING_RESPONSE
- [ ] Test: Dashboard shows need response indicator
- [ ] Test: Project detail highlights waiting run
- [ ] Test: Activity feed shows task_awaiting event

### Task 4.4: Regression Integration
- [ ] Add to npm run gate:all
- [ ] Ensure no manual cleanup between runs
- [ ] Verify namespace isolation

## Acceptance Criteria Mapping

| AC | Task |
|----|------|
| AC-LOOP-1 | 2.1, 3.1 |
| AC-LOOP-2 | 2.1, 4.2 |
| AC-LOOP-3 | 2.1, 4.2 |
| AC-LOOP-4 | 2.2, 3.3, 4.3 |
| AC-LOOP-5 | 1.2, 4.3 |
| AC-LOOP-6 | 2.3, 3.4, 4.2 |
| AC-LOOP-7 | 4.4 |
| AC-LOOP-8 | 4.4 |
