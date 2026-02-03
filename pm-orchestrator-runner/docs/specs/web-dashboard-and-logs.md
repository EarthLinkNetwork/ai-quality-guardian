# Web Dashboard and Logs Specification

## Overview

This specification defines the enhanced Web UI features for pm-orchestrator-runner, including:
- **Dashboard**: Project overview with status indicators and filtering
- **Project Logs**: Hierarchical tree UI for log browsing (expand/collapse, no page navigation)
- **Activity Log**: Cross-project timeline view
- **Project Settings**: Alias, tags, favorite, archived state
- **Lifecycle Management**: Archive/unarchive, retention policies
- **Folder Scan**: Discovery support for ChatGPT layer spec

## Key Design Principles

### 1. Status Derivation (Priority Order)

Project status is derived with strict priority:

```
needs_response > error > running > idle
```

| Priority | Status | Condition |
|----------|--------|-----------|
| 1 | `needs_response` | Any task in AWAITING_RESPONSE state |
| 2 | `error` | Any task in ERROR state |
| 3 | `running` | Any task in RUNNING/QUEUED state |
| 4 | `idle` | All tasks complete or no tasks |

### 2. Layer Separation

Logs are categorized into layers for clear visualization:

| Layer | Description | Default Visible |
|-------|-------------|-----------------|
| `user_llm` | User ↔ LLM (ChatGPT/Claude) | Yes |
| `llm_relay` | LLM ↔ Relay Server | On expand |
| `relay_claude` | Relay ↔ Claude Code | On expand |
| `system` | Internal system events | On expand |

### 3. Tree Structure (No Page Navigation)

All log browsing uses expand/collapse within a single page:
- No separate detail pages
- Lazy loading on expand
- Virtual scrolling for performance

## Architecture

### Current State

```
Session
└── Thread (per project directory)
    └── Run (per task execution)
        └── Task (individual task)
            └── Logs (stdout/stderr)
```

### Enhanced Data Flow

```
TaskLogManager (File-based)
    ↓
DynamoDB (Indexed) + File System (traces/*.jsonl, events/*.jsonl)
    ↓
REST API (Express)
    ↓
Web UI (Vanilla JS, Polling-based)
```

### New Data Models

#### ProjectIndex

```typescript
interface ProjectIndex {
  projectId: string;           // SHA256 hash of projectPath
  projectPath: string;         // Absolute path
  alias?: string;              // User-defined alias
  tags: string[];              // User-defined tags
  favorite: boolean;           // Pinned to top
  archived: boolean;           // Hidden from default view
  status: 'needs_response' | 'error' | 'running' | 'idle';
  lastActivityAt: string;      // ISO8601
  sessionCount: number;
  taskStats: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    awaiting: number;          // AWAITING_RESPONSE count
  };
  createdAt: string;
  updatedAt: string;
}
```

#### LogEvent (Hierarchical)

```typescript
interface LogEvent {
  eventId: string;
  taskId: string;
  sessionId: string;
  projectId: string;

  // Hierarchy
  spanId: string;              // Unique span identifier
  parentSpanId?: string;       // Parent span (for nesting)
  depth: number;               // Nesting level (0 = root)

  // Layer classification
  layer: 'user_llm' | 'llm_relay' | 'relay_claude' | 'system';

  // Content
  type: 'message' | 'tool_call' | 'tool_result' | 'error' | 'state_change';
  direction: 'inbound' | 'outbound' | 'internal';
  content: string;
  metadata?: Record<string, unknown>;

  // Timing
  timestamp: string;           // ISO8601
  durationMs?: number;

  // Display
  collapsed: boolean;          // Initial collapse state
  childCount: number;          // Number of children (for UI)
}
```

#### ActivityEvent (Cross-Project)

```typescript
interface ActivityEvent {
  eventId: string;
  projectId: string;
  projectPath: string;
  projectAlias?: string;
  sessionId?: string;
  taskId?: string;

  type: 'task_started' | 'task_completed' | 'task_failed' |
        'task_awaiting' | 'session_started' | 'session_ended' | 'error';

  summary: string;             // Human-readable summary
  details?: Record<string, unknown>;

  timestamp: string;
  importance: 'high' | 'normal' | 'low';
}
```

## 1. Dashboard

### 1.1 Project List

The dashboard shows all projects with status indicators.

#### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                                    [Filter v] [+] │
├─────────────────────────────────────────────────────────────┤
│ ★ my-app (needs_response)                   2 tasks waiting │
│   /Users/masa/dev/my-app                    Last: 5 min ago │
├─────────────────────────────────────────────────────────────┤
│   api-server (running)                      1 task running  │
│   /Users/masa/dev/api-server               Last: 1 min ago  │
├─────────────────────────────────────────────────────────────┤
│   utils-lib (idle)                          All complete    │
│   /Users/masa/dev/utils                    Last: 2 hours    │
└─────────────────────────────────────────────────────────────┘
```

#### Filtering Options

- Status: all, needs_response, error, running, idle
- Tags: user-defined tags
- Favorites: show only starred
- Include archived: toggle

#### API Endpoints

```
GET /api/projects
  Query params:
    - status: 'needs_response' | 'error' | 'running' | 'idle'
    - tags: string[] (comma-separated)
    - favorite: boolean
    - archived: boolean (default: false)
    - limit: number (default: 50)
    - cursor: string

GET /api/projects/:projectId
  Response: ProjectIndex

PATCH /api/projects/:projectId
  Body: { alias?, tags?, favorite?, archived? }
```

### 1.2 Activity Log (Cross-Project Timeline)

Real-time activity feed across all projects.

#### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Activity Log                               [All Projects v] │
├─────────────────────────────────────────────────────────────┤
│ 10:23:45  my-app       Task awaiting response               │
│           "Please confirm the database schema changes"      │
├─────────────────────────────────────────────────────────────┤
│ 10:22:30  api-server   Task completed                       │
│           "Added user authentication endpoint"              │
├─────────────────────────────────────────────────────────────┤
│ 10:20:15  my-app       Task started                         │
│           "Implementing feature X"                          │
└─────────────────────────────────────────────────────────────┘
```

#### API Endpoints

```
GET /api/activity
  Query params:
    - projectId: string (filter by project)
    - type: string[] (filter by event type)
    - importance: 'high' | 'normal' | 'low'
    - limit: number (default: 50)
    - cursor: string
    - since: ISO8601 (for polling)
```

## 2. Log Visualization

### 2.1 Project-Level Logs

Project-level logs aggregate all sessions and tasks within a project directory.

#### Data Model

```typescript
interface ProjectLog {
  projectPath: string;       // Absolute path to project directory
  totalSessions: number;
  totalTasks: number;
  lastActivityAt: string;    // ISO8601
  aggregatedStats: {
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
    awaiting: number;        // AWAITING_RESPONSE count
  };
}
```

#### API Endpoints

```
GET /api/projects/:projectId/logs
  Query params:
    - limit: number (default: 100)
    - cursor: string (pagination)
    - layer: 'user_llm' | 'llm_relay' | 'relay_claude' | 'system'
    - startTime: ISO8601
    - endTime: ISO8601

GET /api/projects/:projectId/logs/stats
  Response: ProjectLogStats
```

### 2.2 Session-Level Logs

Session-level logs show all activity within a single Claude Code session.

#### Data Model

```typescript
interface SessionLog {
  sessionId: string;         // Format: session-YYYY-MM-DD-XXXXXX
  projectPath: string;
  startedAt: string;
  endedAt?: string;
  threads: ThreadSummary[];
  totalRuns: number;
  totalTasks: number;
}

interface ThreadSummary {
  threadId: string;
  runs: RunSummary[];
}

interface RunSummary {
  runId: string;
  taskRunId: string;
  status: TaskState;
  startedAt: string;
  endedAt?: string;
  taskCount: number;
}
```

#### API Endpoints

```
GET /api/sessions
  Query params:
    - projectPath: string (filter by project)
    - limit: number
    - cursor: string

GET /api/sessions/:sessionId
  Response: SessionLog with full thread/run hierarchy

GET /api/sessions/:sessionId/logs
  Query params: (same as project logs)
```

### 2.3 Tree UI Component

Hierarchical tree view for navigating logs **without page navigation**.

#### Component Structure

```
SessionTreeView (single page, expand/collapse only)
├── SessionNode (collapsible)
│   ├── [user_llm] User Message
│   │   └── [user_llm] LLM Response
│   │       ├── [llm_relay] Relay Request (collapsed by default)
│   │       │   └── [relay_claude] Claude Code Execution
│   │       │       └── [relay_claude] Tool Call: Edit
│   │       │       └── [relay_claude] Tool Result
│   │       └── [llm_relay] Relay Response
│   ├── [user_llm] User Message
│   │   └── ...
└── (Load more on scroll)
```

#### Layer Visibility

```typescript
interface LayerVisibility {
  user_llm: boolean;      // Always visible (default: true)
  llm_relay: boolean;     // Toggle (default: false)
  relay_claude: boolean;  // Toggle (default: false)
  system: boolean;        // Toggle (default: false)
}
```

#### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Project: my-app                    [Layers: ● ○ ○ ○] [🔍]   │
├─────────────────────────────────────────────────────────────┤
│ ▼ Session 2024-01-31-abc123                    10:20 - now  │
│   ├─ 📤 User: "Add login feature"                    10:20  │
│   │   └─ 📥 LLM: "I'll implement..."                 10:21  │
│   │       └─ ▶ [3 tool calls] (click to expand)             │
│   ├─ 📤 User: "Also add logout"                      10:25  │
│   │   └─ 📥 LLM: "Adding logout..."                  10:26  │
│   │       └─ ▼ [2 tool calls]                               │
│   │           ├─ 🔧 Edit: src/auth/logout.ts                │
│   │           └─ 🔧 Bash: npm test                          │
│   └─ ⏳ Awaiting response: "Confirm schema?"         10:30  │
├─────────────────────────────────────────────────────────────┤
│ ▶ Session 2024-01-30-def456                    09:00-09:45  │
└─────────────────────────────────────────────────────────────┘
```

#### State Management

```typescript
interface TreeState {
  expandedNodes: Set<string>;  // Node IDs (spanId)
  selectedNode: string | null;
  layerVisibility: LayerVisibility;
  filter: {
    status?: TaskState[];
    dateRange?: [Date, Date];
    searchQuery?: string;
  };
}
```

#### API for Tree Data

```
GET /api/sessions/:sessionId/tree
  Query params:
    - layers: string[] (comma-separated layer names)
    - expandDepth: number (default: 2, max children to preload)
    - limit: number (default: 100)
    - cursor: string

Response:
{
  sessionId: string;
  rootEvents: LogEvent[];
  hasMore: boolean;
  cursor?: string;
}
```

## 3. Project Settings

### 3.1 Settings UI

```
┌─────────────────────────────────────────────────────────────┐
│ Project Settings: my-app                                    │
├─────────────────────────────────────────────────────────────┤
│ Path: /Users/masa/dev/my-app                                │
│                                                             │
│ Alias:     [my-app____________] (display name)              │
│ Tags:      [frontend] [react] [+]                           │
│ Favorite:  [★ Yes]                                          │
│ Archived:  [ ] No                                           │
│                                                             │
│ Stats:                                                      │
│   Sessions: 23                                              │
│   Tasks: 156 (142 completed, 10 failed, 4 running)          │
│   Last activity: 5 minutes ago                              │
│                                                             │
│ Actions:                                                    │
│   [Archive Project]  [Delete All Logs]  [Export]            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 API Endpoints

```
GET /api/projects/:projectId/settings
  Response: {
    projectId: string;
    projectPath: string;
    alias?: string;
    tags: string[];
    favorite: boolean;
    archived: boolean;
    stats: { ... };
  }

PUT /api/projects/:projectId/settings
  Body: {
    alias?: string;
    tags?: string[];
    favorite?: boolean;
    archived?: boolean;
  }
```

## 4. Project Lifecycle Management

### 4.1 Project States

```
ACTIVE      - Has recent activity (configurable: default 7 days)
IDLE        - No recent activity
ARCHIVED    - Manually archived by user
```

### 4.2 Lifecycle Transitions

```typescript
interface ProjectLifecycle {
  projectId: string;
  state: 'ACTIVE' | 'IDLE' | 'ARCHIVED';
  lastActivityAt: string;
  archivedAt?: string;
  retentionPolicy: RetentionPolicy;
}
```

### 4.3 API Endpoints

```
POST /api/projects/:projectId/archive
POST /api/projects/:projectId/unarchive
GET /api/projects/lifecycle-stats
```

## 5. Retention Policies

### 5.1 Default Retention

| Data Type | Retention Period |
|-----------|------------------|
| Task Logs | 7 days (TTL in DynamoDB) |
| Task Events | 30 days |
| Audit Logs | 90 days |
| Session Metadata | 30 days |
| Project Metadata | Indefinite |

### 5.2 Configurable Retention

```typescript
interface RetentionPolicy {
  taskLogs: number;      // Days
  taskEvents: number;
  auditLogs: number;
  sessionMetadata: number;
}
```

### 5.3 Retention API

```
GET /api/settings/retention
PUT /api/settings/retention
  Body: RetentionPolicy

POST /api/maintenance/cleanup
  Query: dryRun=true|false
```

## 6. Folder Scan Assistance

### 6.1 Purpose

Help users discover and manage projects by scanning filesystem directories.

### 6.2 Scan Process

```
1. User specifies root directory to scan
2. System recursively finds directories containing:
   - .claude/ directory
   - package.json
   - .git directory
3. Results presented as potential projects
4. User selects which to add/track
```

### 6.3 Data Model

```typescript
interface ScanResult {
  path: string;
  type: 'claude-project' | 'node-project' | 'git-repo';
  hasClaudeConfig: boolean;
  lastModified: string;
  size?: number;
  recommendation: 'add' | 'skip' | 'review';
}

interface ScanJob {
  id: string;
  rootPath: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    scannedDirs: number;
    foundProjects: number;
  };
  results: ScanResult[];
  startedAt: string;
  completedAt?: string;
}
```

### 6.4 API Endpoints

```
POST /api/scan/start
  Body: { rootPath: string, depth?: number }
  Response: { jobId: string }

GET /api/scan/:jobId
  Response: ScanJob

GET /api/scan/:jobId/results
  Query: filter=claude-project|node-project|git-repo

POST /api/scan/:jobId/apply
  Body: { projectPaths: string[] }
```

### 6.5 UI Flow

```
1. [Scan Settings Page]
   - Input: Root directory path
   - Options: Max depth, include hidden dirs
   - Button: Start Scan

2. [Scan Progress]
   - Progress bar with directory count
   - Live results streaming

3. [Results Review]
   - Table with discovered projects
   - Checkboxes for selection
   - Bulk actions: Add All, Add Selected, Skip All

4. [Confirmation]
   - Summary of projects to be added
   - Confirm button
```

## 7. Implementation Plan

### Phase 0: Analysis & Spec Finalization (Current)

1. ✅ Analyze existing codebase structure
2. ✅ Define data models (ProjectIndex, LogEvent, ActivityEvent)
3. ✅ Design API endpoints
4. ⬜ Create test plan document
5. ⬜ Create task plan document

### Phase 1: Dashboard + Project Logs + Session Tree UI

**Deliverables:**
- Dashboard page with project list and status indicators
- Project-level log view with tree structure
- Session tree with expand/collapse
- Layer visibility toggles
- Activity log (cross-project timeline)
- Project settings (alias, tags, favorite)

**Files to create/modify:**
- `src/web/public/index.html` - Add dashboard, logs, activity pages
- `src/web/dal/project-dal.ts` - New DAL for project operations
- `src/web/dal/log-event-dal.ts` - New DAL for log events
- `src/web/services/project-service.ts` - Project business logic
- `src/web/app/routes/projects.ts` - New API routes

### Phase 2: Lifecycle + Retention

**Deliverables:**
- Project archive/unarchive functionality
- Retention policy configuration UI
- Automatic cleanup job
- Archive filter on dashboard

**Files to create/modify:**
- `src/web/services/lifecycle-service.ts` - Lifecycle management
- `src/web/services/retention-service.ts` - Retention policy
- `src/web/app/routes/maintenance.ts` - Cleanup endpoints

### Phase 3: Agent/Daemon (Spec Only or Implementation)

**Deliverables (Spec Only if time-constrained):**
- Specification for multi-folder agent execution
- API design for agent workspace
- (Optional) Basic implementation

### Phase 4: Folder Scan

**Deliverables:**
- Filesystem scanner for project discovery
- Scan results UI
- Bulk project import

**Files to create/modify:**
- `src/web/services/scan-service.ts` - Filesystem scanner
- `src/web/app/routes/scan.ts` - Scan API routes

## 8. Acceptance Criteria

### AC-1: Dashboard

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-1.1 | Project list shows all non-archived projects | Automated test |
| AC-1.2 | Status indicator reflects correct priority | Automated test |
| AC-1.3 | Filtering by status/tags/favorite works | Automated test |
| AC-1.4 | Favorite projects appear at top | Automated test |

### AC-2: Project Logs (Tree UI)

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-2.1 | Tree structure with expand/collapse | Automated test |
| AC-2.2 | No page navigation for log details | Automated test |
| AC-2.3 | Layer visibility toggles work | Automated test |
| AC-2.4 | Lazy loading on expand | Automated test |

### AC-3: Activity Log

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-3.1 | Cross-project timeline displays | Automated test |
| AC-3.2 | Filtering by project works | Automated test |
| AC-3.3 | Real-time updates via polling | Automated test |

### AC-4: Project Settings

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-4.1 | Alias/tags/favorite persistence | Automated test |
| AC-4.2 | Archive hides from default view | Automated test |

### AC-5: Lifecycle/Retention

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-5.1 | Archive/unarchive toggles state | Automated test |
| AC-5.2 | Retention policy saves | Automated test |

### AC-6: Regression

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-6.1 | gate:all passes | CI/CD |
| AC-6.2 | All existing tests pass | CI/CD |

## 9. Testing Strategy

**CRITICAL: All verification must be automated. No manual user verification.**

### Unit Tests (`test/unit/`)

- DAL methods for new queries
- Tree state management
- Status derivation logic
- Retention policy calculations
- Scan result filtering

### Integration Tests (`test/integration/`)

- API endpoint responses
- Pagination correctness
- Lifecycle state transitions
- Cleanup job execution
- Status derivation across projects

### E2E Tests (`test/e2e/` or `test/integration/`)

- Dashboard project list rendering
- Tree UI expand/collapse
- Layer visibility toggle
- Log filtering
- Project settings persistence
- Activity log updates

### Test Artifacts

All test runs produce artifacts in:
```
.tmp/web-dashboard-logs-e2e/artifacts/
├── summary.json           # Overall test results
├── screenshots/           # UI state captures
├── api-responses/         # API response snapshots
└── coverage/              # Code coverage reports
```

## 10. Migration Notes

### Backward Compatibility

- All existing APIs remain unchanged
- New endpoints are additive
- Existing data format preserved
- TTL fields added to existing records retroactively

### Data Migration

```typescript
// Add lifecycle state to existing projects
async function migrateProjectLifecycle() {
  const projects = await listAllProjects();
  for (const project of projects) {
    if (!project.lifecycleState) {
      await updateProject(project.projectId, {
        lifecycleState: 'ACTIVE',
        lastActivityAt: project.updatedAt
      });
    }
  }
}
```

## 11. Performance Considerations

### Pagination

- All list endpoints support cursor-based pagination
- Default page size: 20 items
- Maximum page size: 100 items

### Caching

- Project metadata: 5 minute cache
- Session list: 1 minute cache
- Log entries: No cache (real-time)

### Virtual Scrolling

- Tree UI uses virtualization for > 100 nodes
- Log viewer uses virtualization for > 1000 entries

## 12. Phase 3A/3B: Enhanced Dashboard & Activity Management

### 12.1 Activity Definition (Phase 3A - Critical)

**Two types of activity timestamps are tracked:**

| Field | Purpose | Update Trigger | Used For |
|-------|---------|----------------|----------|
| `lastSeenAt` | UI interaction timestamp | User opens project in Web UI or REPL | Display "last seen" |
| `lastMeaningfulWorkAt` | Actual work timestamp | Task started/completed, LLM interaction | **Lifecycle determination** |

**Important:** `lastMeaningfulWorkAt` is used for lifecycle state (ACTIVE/IDLE) determination, NOT `lastSeenAt`.

```typescript
interface ProjectActivity {
  lastSeenAt: string;           // ISO8601 - When user last viewed this project
  lastMeaningfulWorkAt: string; // ISO8601 - When actual work last occurred
}

// Update triggers for lastMeaningfulWorkAt:
// - Task state changes (QUEUED, RUNNING, COMPLETED, ERROR)
// - LLM API calls (input/output)
// - Tool executions (Edit, Bash, Read, etc.)
// - Session start

// Update triggers for lastSeenAt:
// - Dashboard project click
// - Project logs viewed
// - Project settings opened
// - REPL /status or /logs command for this project
```

**Lifecycle Determination:**

```typescript
function determineLifecycleState(project: ProjectIndex): ProjectLifecycleState {
  if (project.archived) {
    return 'ARCHIVED';
  }

  const now = new Date();
  const lastWork = new Date(project.lastMeaningfulWorkAt); // NOT lastSeenAt
  const daysSinceWork = (now.getTime() - lastWork.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceWork > idleThresholdDays) { // default: 7 days
    return 'IDLE';
  }

  return 'ACTIVE';
}
```

### 12.2 Dashboard Enhancement (Phase 3B)

#### Status Icons

| Status | Icon | Color | Priority | Condition |
|--------|------|-------|----------|-----------|
| `NEEDS_ACTION` | ⚠️ | Orange | 1 (highest) | Any task AWAITING_RESPONSE |
| `ERROR` | ❌ | Red | 2 | Any task in ERROR state |
| `RUNNING` | 🔄 | Blue | 3 | Any task RUNNING/QUEUED |
| `COMPLETE` | ✅ | Green | 4 | All tasks complete, recent activity |
| `IDLE` | 💤 | Gray | 5 | No recent activity |
| `ARCHIVED` | 📦 | Muted | N/A | Manually archived |

**Note:** `COMPLETE` is shown when lifecycle is ACTIVE but status is `idle` (all tasks done).

#### In-Place Editing (No Navigation)

Dashboard allows editing without leaving the page:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard                        [Active v] [Tags v] [★ Fav] [📦]   │
├─────────────────────────────────────────────────────────────────────┤
│ ★ ⚠️ my-app                    2 awaiting   │ Last: 5m │ [✏️] [📦] │
│      /Users/masa/dev/my-app    tags: react  │          │           │
├─────────────────────────────────────────────────────────────────────┤
│   🔄 api-server                1 running    │ Last: 1m │ [✏️] [📦] │
│      /Users/masa/dev/api       tags: api    │          │           │
├─────────────────────────────────────────────────────────────────────┤
│   ✅ utils-lib                 All done     │ Last: 2h │ [✏️] [📦] │
│      /Users/masa/dev/utils                  │          │           │
└─────────────────────────────────────────────────────────────────────┘

Legend:
[✏️] = Inline alias edit (click to edit, Enter to save)
[📦] = Archive/Unarchive toggle (single click)
[★]  = Favorite toggle (single click)
```

**Inline Edit Behavior:**

1. **Alias Edit (✏️):**
   - Click icon → text input appears with current alias
   - Enter → save via PATCH /api/projects/:id
   - Escape → cancel edit
   - No page navigation

2. **Archive Toggle (📦):**
   - Click → immediate POST /api/projects/:id/archive or /unarchive
   - Project disappears from list if not showing archived
   - No confirmation dialog

3. **Favorite Toggle (★):**
   - Click → immediate PATCH /api/projects/:id { favorite: toggle }
   - Visual star toggles instantly
   - Favorites sort to top

#### Filters

| Filter | Default | Options |
|--------|---------|---------|
| Lifecycle | Active | Active, Idle, Archived, All |
| Status | All | needs_action, error, running, complete, idle |
| Tags | All | User-defined tags (multi-select) |
| Favorites Only | false | true/false toggle |

**Filter Logic:**

```typescript
interface DashboardFilter {
  lifecycle: 'ACTIVE' | 'IDLE' | 'ARCHIVED' | 'ALL';
  status?: ProjectIndexStatus[];
  tags?: string[];
  favoriteOnly: boolean;
}

// API: GET /api/projects?lifecycle=ACTIVE&status=needs_response,error&favoriteOnly=true
```

#### Metrics Display

Each project card shows:

| Metric | Example | Source |
|--------|---------|--------|
| Status Summary | "2 awaiting" / "1 running" / "All done" | taskStats |
| Last Activity | "5m" / "2h" / "3d" | lastMeaningfulWorkAt (relative) |
| Tags | "react, frontend" | tags[] |

### 12.3 Log Tree UI (Phase 3B)

#### Hierarchy: Project → Session → Thread

```
Project: my-app
├─ Session 2024-01-31-abc123 (Active)
│   ├─ Thread main
│   │   ├─ Run task-001 [COMPLETE] "Add login"
│   │   │   └─ [4 events] (expand to view)
│   │   └─ Run task-002 [AWAITING] "Confirm schema"
│   │       └─ ⚠️ Awaiting response: "Please confirm..."
│   └─ Thread background
│       └─ Run task-003 [RUNNING] "Lint check"
├─ Session 2024-01-30-def456 (Ended)
│   └─ ...
```

**Key Principle:** All navigation via expand/collapse. No detail pages.

#### API Endpoint

```
GET /api/projects/:projectId/tree
  Response: {
    project: ProjectIndex;
    sessions: [{
      sessionId: string;
      status: 'active' | 'ended';
      threads: [{
        threadId: string;
        runs: [{
          runId: string;
          taskRunId: string;
          status: TaskState;
          summary: string;
          eventCount: number;
          events?: LogEvent[]; // Only if expanded
        }]
      }]
    }]
  }

GET /api/projects/:projectId/tree/expand?sessionId=X&runId=Y
  Response: {
    events: LogEvent[];
    hasMore: boolean;
    cursor?: string;
  }
```

### 12.4 Activity Log (Cross-Project Timeline)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Activity Log                              [All Projects v] [🔄 5s] │
├─────────────────────────────────────────────────────────────────────┤
│ 10:23:45  ⚠️ my-app         Awaiting response                      │
│                "Please confirm the database schema changes"         │
├─────────────────────────────────────────────────────────────────────┤
│ 10:22:30  ✅ api-server     Task completed                         │
│                "Added user authentication endpoint"                 │
├─────────────────────────────────────────────────────────────────────┤
│ 10:20:15  🔄 my-app         Task started                           │
│                "Implementing feature X"                             │
├─────────────────────────────────────────────────────────────────────┤
│ 10:15:00  ❌ utils-lib      Task failed                            │
│                "Build failed: missing dependency"                   │
└─────────────────────────────────────────────────────────────────────┘
```

**API:**

```
GET /api/activity
  Query:
    - projectIds: string[] (filter by projects)
    - types: string[] (task_started, task_completed, task_failed, task_awaiting)
    - since: ISO8601 (for polling)
    - limit: number (default: 50)
    - cursor: string
```

### 12.5 Project Settings UI (Phase 3A)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Project Settings                                              [×]   │
├─────────────────────────────────────────────────────────────────────┤
│ Path: /Users/masa/dev/my-app                                        │
│                                                                     │
│ Alias:     [my-app______________] (editable)                        │
│                                                                     │
│ Tags:      [frontend] [react] [×]  [+ Add tag]                      │
│                                                                     │
│ Status:    ⚠️ NEEDS_ACTION (derived, read-only)                     │
│            ├─ 2 tasks awaiting response                             │
│            └─ 1 task running                                        │
│                                                                     │
│ Lifecycle: 🟢 ACTIVE                                                │
│            └─ Last work: 5 minutes ago                              │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐   │
│ │ [★ Favorite]  [📦 Archive]  [🗑️ Delete Logs]                  │   │
│ └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Note:** Status is derived (read-only). Only alias, tags, favorite, and archived are user-editable.

### 12.6 Acceptance Criteria (Phase 3A/3B)

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-P3-1 | Alias/tags editable from Project Settings UI | Integration test |
| AC-P3-2 | lastMeaningfulWorkAt used for lifecycle (not lastSeenAt) | Unit test |
| AC-P3-3 | Dashboard shows Active/Archived/Favorite filters | Integration test |
| AC-P3-4 | Status icons match priority (needs_action > error > running > idle) | Unit test |
| AC-P3-5 | Log tree shows Project→Session→Thread hierarchy | Integration test |
| AC-P3-6 | Activity Log shows cross-project timeline | Integration test |
| AC-P3-7 | In-place archive/unarchive works without navigation | Integration test |
| AC-P3-8 | In-place alias edit works without navigation | Integration test |
| AC-P3-9 | All existing tests pass (regression-zero) | CI gate:all |

### 12.7 Data Model Updates

```typescript
// Add to ProjectIndex
interface ProjectIndex {
  // ... existing fields ...

  // NEW: Activity tracking
  lastSeenAt?: string;           // ISO8601 - UI interaction
  lastMeaningfulWorkAt: string;  // ISO8601 - Actual work (used for lifecycle)
}
```

### 12.8 API Updates

```
// New endpoints
GET  /api/projects/:projectId/tree              # Tree structure
GET  /api/projects/:projectId/tree/expand       # Expand node
GET  /api/activity                              # Cross-project activity

// Updated endpoints
GET  /api/projects                              # Add lifecycle filter
PATCH /api/projects/:projectId                  # Support lastSeenAt update
```

## 13. Security

### Authorization

All endpoints require authenticated session with appropriate role:

| Endpoint Category | Required Role |
|-------------------|---------------|
| Read logs | viewer, member, admin, owner |
| Modify settings | admin, owner |
| Archive projects | admin, owner |
| Run scans | admin, owner |
| Cleanup operations | owner |

### Audit Trail

All modifications logged to audit table:
- Lifecycle state changes
- Retention policy changes
- Cleanup executions
- Scan operations
