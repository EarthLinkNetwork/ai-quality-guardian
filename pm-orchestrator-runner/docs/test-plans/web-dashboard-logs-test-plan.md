# Web Dashboard and Logs Test Plan

**CRITICAL: All verification must be automated. No manual user verification.**

## Test Artifacts Location

All test runs produce artifacts in:
```
.tmp/web-dashboard-logs-e2e/artifacts/
├── summary.json           # Overall test results
├── screenshots/           # UI state captures (E2E)
├── api-responses/         # API response snapshots
└── coverage/              # Code coverage reports
```

## 1. Unit Tests

### 1.1 Status Derivation Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| status_needs_response | Task in AWAITING_RESPONSE | Project status = needs_response |
| status_error | Task in ERROR (no awaiting) | Project status = error |
| status_running | Task in RUNNING (no error/awaiting) | Project status = running |
| status_idle | All tasks complete | Project status = idle |
| status_priority_1 | AWAITING + ERROR + RUNNING | needs_response (highest priority) |
| status_priority_2 | ERROR + RUNNING (no awaiting) | error |
| status_priority_3 | RUNNING only | running |

### 1.2 Layer Classification Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| layer_user_llm | User message to LLM | layer = user_llm |
| layer_llm_relay | LLM to Relay request | layer = llm_relay |
| layer_relay_claude | Relay to Claude Code | layer = relay_claude |
| layer_system | Internal system event | layer = system |
| default_visibility | Default layer state | user_llm=true, others=false |

### 1.3 DAL Tests (src/web/dal/)

#### project-dal.ts (NEW)

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| createProject | Create project index | Returns project with ID |
| getProject | Get project by ID | Returns project or null |
| listProjects | List all projects | Returns paginated results |
| listProjectsByStatus | Filter by status | Returns matching projects |
| listFavoriteProjects | Get favorite projects | Returns starred projects |
| updateProjectAlias | Update project alias | Alias saved |
| updateProjectTags | Update project tags | Tags saved |
| toggleFavorite | Toggle favorite state | State toggled |
| archiveProject | Archive project | archived=true |
| unarchiveProject | Unarchive project | archived=false |
| deriveProjectStatus | Calculate status from tasks | Correct priority applied |

#### sessions.ts

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| createSession | Create new session record | Returns session with ID |
| getSession | Get session by ID | Returns session or null |
| listSessions | List sessions with pagination | Returns paginated results |
| listSessionsByProject | Filter sessions by project path | Returns filtered results |
| updateSessionEndTime | Update session end timestamp | Session endedAt updated |

#### logs-extended.ts

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| getProjectLogs | Aggregate logs by project | Returns logs with pagination |
| getSessionLogs | Get logs for session | Returns session-scoped logs |
| getLogStats | Calculate log statistics | Returns counts by level/status |
| filterLogsByDateRange | Filter logs by time range | Returns filtered results |

#### lifecycle.ts

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| updateLifecycleState | Transition project state | State updated correctly |
| getIdleProjects | Find inactive projects | Returns projects past threshold |
| archiveProject | Archive a project | State set to ARCHIVED |
| unarchiveProject | Unarchive a project | State set to ACTIVE |

#### retention.ts

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| getRetentionPolicy | Get current policy | Returns policy object |
| updateRetentionPolicy | Update retention periods | Policy saved correctly |
| calculateExpiredItems | Find items past retention | Returns expired item IDs |
| executeCleanup | Delete expired items | Items removed from DB |

### 1.2 Service Tests (src/web/services/)

#### folder-scanner.ts

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| scanDirectory | Scan single directory | Returns scan result |
| scanRecursive | Scan with depth limit | Respects max depth |
| detectProjectType | Identify project type | Correct type returned |
| filterResults | Filter by project type | Returns matching only |

#### activity-aggregator.ts

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| aggregateByProject | Group events by project | Correct grouping |
| aggregateBySession | Group events by session | Correct grouping |
| calculateStats | Compute statistics | Accurate calculations |

### 1.3 Component Tests (src/web/components/)

#### TreeView (Expand/Collapse Only - No Page Navigation)

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| render empty tree | No data provided | Shows empty state |
| render with data | Valid hierarchy | All nodes visible |
| expand node | Click expand button | Children visible **in place** |
| collapse node | Click collapse button | Children hidden |
| expand_no_navigation | Expand any node | **No page navigation occurs** |
| lazy_load_children | Expand node | Children loaded on demand |
| layer_toggle_user_llm | Toggle user_llm layer | Layer shown/hidden |
| layer_toggle_llm_relay | Toggle llm_relay layer | Layer shown/hidden |
| layer_toggle_relay_claude | Toggle relay_claude layer | Layer shown/hidden |
| layer_default_state | Initial page load | user_llm visible, others hidden |
| select node | Click node | Node highlighted |
| filter nodes | Apply status filter | Only matching visible |
| virtual scroll | Large dataset | Smooth scrolling |
| nested_depth | Deep hierarchy (5+ levels) | All levels expandable |

#### LogViewer

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| render logs | Log entries provided | Entries displayed |
| auto scroll | New entry added | Scrolls to bottom |
| filter by level | Select level filter | Only matching shown |
| search logs | Enter search query | Matches highlighted |
| copy log entry | Click copy button | Entry in clipboard |

#### Dashboard Cards

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| active sessions card | Sessions data | Count displayed |
| tasks today card | Task stats | Counts displayed |
| project activity | Activity data | Chart rendered |
| system health | Health data | Status indicators |

## 2. Integration Tests

### 2.1 API Endpoint Tests

#### Session API

```typescript
describe('GET /api/sessions', () => {
  it('returns paginated sessions');
  it('filters by project path');
  it('handles empty results');
  it('validates pagination params');
});

describe('GET /api/sessions/:sessionId', () => {
  it('returns session with hierarchy');
  it('returns 404 for unknown session');
});

describe('GET /api/sessions/:sessionId/logs', () => {
  it('returns session logs');
  it('applies level filter');
  it('applies date range filter');
});
```

#### Project Logs API

```typescript
describe('GET /api/projects/:projectId/logs', () => {
  it('returns project logs');
  it('aggregates across sessions');
  it('handles pagination');
});

describe('GET /api/projects/:projectId/logs/stats', () => {
  it('returns accurate statistics');
});
```

#### Lifecycle API

```typescript
describe('POST /api/projects/:projectId/archive', () => {
  it('archives active project');
  it('rejects already archived');
  it('requires admin role');
});

describe('POST /api/projects/:projectId/unarchive', () => {
  it('unarchives project');
  it('requires admin role');
});
```

#### Retention API

```typescript
describe('GET /api/settings/retention', () => {
  it('returns current policy');
});

describe('PUT /api/settings/retention', () => {
  it('updates policy');
  it('validates policy values');
  it('requires owner role');
});

describe('POST /api/maintenance/cleanup', () => {
  it('executes cleanup');
  it('supports dry run');
  it('requires owner role');
});
```

#### Scan API

```typescript
describe('POST /api/scan/start', () => {
  it('starts scan job');
  it('validates root path');
  it('requires admin role');
});

describe('GET /api/scan/:jobId', () => {
  it('returns job status');
  it('returns 404 for unknown job');
});

describe('POST /api/scan/:jobId/apply', () => {
  it('creates projects from selection');
  it('validates selected paths');
});
```

### 2.2 Database Integration Tests

```typescript
describe('DynamoDB Integration', () => {
  it('creates session with logs');
  it('queries logs by session');
  it('queries logs by project');
  it('applies TTL correctly');
  it('handles pagination cursors');
  it('executes retention cleanup');
});
```

## 3. E2E Tests

**CRITICAL: All tests are automated. No manual verification.**

### 3.1 Dashboard

```typescript
describe('Dashboard', () => {
  it('shows project list with status indicators');
  it('displays correct status priority (needs_response > error > running > idle)');
  it('shows favorite projects at top');
  it('filters by status (needs_response/error/running/idle)');
  it('filters by tags');
  it('hides archived projects by default');
  it('shows archived when "include archived" toggled');
  it('displays last activity timestamp');
  it('displays task counts per project');
});
```

### 3.2 Activity Log (Cross-Project Timeline)

```typescript
describe('Activity Log', () => {
  it('displays events from all projects');
  it('shows timestamp, project name, event type');
  it('filters by project');
  it('filters by event type');
  it('updates via polling');
  it('highlights high importance events');
});
```

### 3.3 Tree UI (Expand/Collapse Only)

```typescript
describe('Tree UI', () => {
  it('loads session list for project');
  it('expands session to show log events IN PLACE (no navigation)');
  it('collapses session to hide events');
  it('expands nested events (tool calls)');
  it('no page navigation occurs on any expand/collapse');
  it('lazy loads children on expand');
  it('toggles layer visibility (user_llm/llm_relay/relay_claude/system)');
  it('shows user_llm layer by default');
  it('hides other layers by default');
  it('filters tree by status');
  it('searches tree by text');
  it('handles large datasets with virtualization');
});
```

### 3.4 Project Settings

```typescript
describe('Project Settings', () => {
  it('displays project path');
  it('edits project alias');
  it('adds/removes tags');
  it('toggles favorite');
  it('archives project');
  it('unarchives project');
  it('persists all settings changes');
});
```

### 3.5 Log Viewer

```typescript
describe('Log Viewer', () => {
  it('displays logs for selected node');
  it('auto-scrolls to new entries');
  it('filters by log level');
  it('searches within logs');
  it('copies log entry to clipboard');
  it('exports logs to file');
});
```

### 3.4 Lifecycle Management

```typescript
describe('Project Lifecycle', () => {
  it('shows lifecycle state in UI');
  it('archives project via UI');
  it('unarchives project via UI');
  it('filters projects by state');
});
```

### 3.5 Retention Settings

```typescript
describe('Retention Settings', () => {
  it('displays current policy');
  it('updates retention periods');
  it('shows validation errors');
  it('executes cleanup with confirmation');
});
```

### 3.6 Folder Scan

```typescript
describe('Folder Scan', () => {
  it('starts scan from UI');
  it('shows progress during scan');
  it('displays scan results');
  it('selects projects to add');
  it('creates selected projects');
});
```

## 4. Performance Tests

### 4.1 Load Tests

| Scenario | Target | Metric |
|----------|--------|--------|
| List 1000 sessions | < 500ms | Response time |
| Query 10000 logs | < 1s | Response time |
| Tree with 500 nodes | < 100ms | Render time |
| Log viewer 10000 entries | 60fps | Scroll performance |

### 4.2 Stress Tests

| Scenario | Target |
|----------|--------|
| 100 concurrent API requests | No errors |
| Scan 10000 directories | Completes successfully |
| Cleanup 100000 expired items | Completes in < 5min |

## 5. Regression Tests

### 5.1 Existing Functionality

| Feature | Test |
|---------|------|
| Task creation | Tasks still creatable |
| Task state transitions | All transitions work |
| Agent heartbeat | Heartbeat still works |
| Queue operations | Queue functions correctly |
| Existing log writing | Logs still written |
| Settings API | Settings still work |
| Notifications | Notifications still work |

### 5.2 API Compatibility

| Endpoint | Test |
|----------|------|
| GET /api/tasks | Response format unchanged |
| GET /api/agents | Response format unchanged |
| GET /api/settings | Response format unchanged |
| All existing endpoints | No breaking changes |

## 6. Test Data

### 6.1 Fixtures

```typescript
// test/fixtures/sessions.ts
export const testSessions = [
  {
    sessionId: 'session-2024-01-15-abc123',
    projectPath: '/test/project1',
    startedAt: '2024-01-15T10:00:00Z',
    // ...
  }
];

// test/fixtures/logs.ts
export const testLogs = [
  {
    logId: 'log-001',
    level: 'info',
    message: 'Task started',
    // ...
  }
];
```

### 6.2 Factories

```typescript
// test/factories/session.ts
export function createSession(overrides = {}) {
  return {
    sessionId: `session-${Date.now()}`,
    projectPath: '/test/project',
    startedAt: new Date().toISOString(),
    ...overrides
  };
}
```

## 7. Test Execution

### 7.1 Commands

```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# E2E tests
npm run test:e2e

# All tests
npm test

# Coverage
npm run coverage
```

### 7.2 CI/CD Integration

```yaml
# .github/workflows/test.yml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm run test:unit
    - run: npm run test:integration
    - run: npm run test:e2e
```

## 8. Success Criteria

| Metric | Target |
|--------|--------|
| Unit test coverage | > 80% |
| Integration test coverage | > 70% |
| E2E test pass rate | 100% |
| No regressions | 0 failures |
| Performance targets | All met |
