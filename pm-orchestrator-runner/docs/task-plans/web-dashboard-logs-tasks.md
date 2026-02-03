# Web Dashboard and Logs - Task Plan

**CRITICAL: All verification must be automated. No manual user verification.**

## Phase 1: Dashboard + Project Logs + Session Tree UI

### Task 1.0: Project Index DAL (NEW - PRIORITY)

**Files to create/modify:**
- `src/web/dal/project-dal.ts` (new)
- `src/web/dal/types.ts` (modify)
- `test/unit/web/dal/project-dal.test.ts` (new)

**Subtasks:**
1. Define ProjectIndex interface with status/alias/tags/favorite/archived
2. Implement createProject()
3. Implement getProject()
4. Implement listProjects() with filtering (status/tags/favorite/archived)
5. Implement updateProject() for alias/tags/favorite/archived
6. Implement deriveProjectStatus() with priority: needs_response > error > running > idle
7. Write unit tests for status derivation

**Acceptance Criteria:**
- Status derivation follows priority order
- Filtering works correctly
- Favorites appear at top
- Archived hidden by default
- Unit tests pass

---

### Task 1.1: Extend DAL for Sessions

**Files to create/modify:**
- `src/web/dal/sessions.ts` (new)
- `src/web/dal/types.ts` (modify)
- `test/unit/web/dal/sessions.test.ts` (new)

**Subtasks:**
1. Define Session interface in types.ts
2. Implement createSession()
3. Implement getSession()
4. Implement listSessions() with pagination
5. Implement listSessionsByProject()
6. Implement updateSession()
7. Write unit tests

**Acceptance Criteria:**
- All CRUD operations work
- Pagination works correctly
- Filter by project works
- Unit tests pass

---

### Task 1.2: Extend DAL for Project Logs

**Files to create/modify:**
- `src/web/dal/logs.ts` (modify)
- `test/unit/web/dal/logs.test.ts` (modify)

**Subtasks:**
1. Add getProjectLogs() method
2. Add getLogStats() method
3. Add filterLogsByDateRange() method
4. Write unit tests

**Acceptance Criteria:**
- Project-level log aggregation works
- Statistics calculation is accurate
- Date range filtering works
- Unit tests pass

---

### Task 1.3: Add Session API Endpoints

**Files to create/modify:**
- `src/web/server.ts` (modify)
- `test/integration/web/sessions-api.test.ts` (new)

**Subtasks:**
1. Add GET /api/sessions endpoint
2. Add GET /api/sessions/:sessionId endpoint
3. Add GET /api/sessions/:sessionId/logs endpoint
4. Add request validation
5. Write integration tests

**Acceptance Criteria:**
- All endpoints return correct data
- Pagination works
- Filtering works
- Integration tests pass

---

### Task 1.4: Add Project Logs API Endpoints

**Files to create/modify:**
- `src/web/server.ts` (modify)
- `test/integration/web/project-logs-api.test.ts` (new)

**Subtasks:**
1. Add GET /api/projects/:projectId/logs endpoint
2. Add GET /api/projects/:projectId/logs/stats endpoint
3. Write integration tests

**Acceptance Criteria:**
- Endpoints return correct data
- Integration tests pass

---

### Task 1.5: Implement Tree UI Component (Expand/Collapse Only - No Page Navigation)

**Files to create/modify:**
- `src/web/public/index.html` (modify - add tree UI to existing page)

**Subtasks:**
1. Create TreeNode rendering with layer classification (user_llm/llm_relay/relay_claude/system)
2. Implement expand/collapse behavior **in place** (NO page navigation)
3. Implement layer visibility toggles (user_llm visible by default, others hidden)
4. Implement lazy loading on expand
5. Implement node selection (highlight only, no navigation)
6. Add status filtering capability
7. Implement virtual scrolling for large trees
8. Style the tree component

**Acceptance Criteria:**
- Tree renders correctly
- Expand/collapse works **without page navigation**
- Layer visibility toggles work
- user_llm visible by default, others hidden
- Lazy loading on expand
- Selection highlights only (no navigation)
- Virtual scrolling handles 500+ nodes
- Filters work

---

### Task 1.6: Implement Log Viewer Component

**Files to create/modify:**
- `src/web/public/js/log-viewer.js` (new)
- `src/web/public/css/log-viewer.css` (new)

**Subtasks:**
1. Create LogViewer class
2. Implement log entry rendering
3. Implement auto-scroll
4. Add level filtering
5. Add search functionality
6. Implement virtual scrolling
7. Add copy-to-clipboard

**Acceptance Criteria:**
- Logs display correctly
- Auto-scroll works
- Filtering works
- Search works
- Virtual scrolling handles 10000+ entries

---

### Task 1.7: Integration and Polish

**Files to modify:**
- Various HTML/JS/CSS files

**Subtasks:**
1. Connect Tree UI to Log Viewer
2. Add loading states
3. Add error states
4. Polish styling
5. Test full flow

**Acceptance Criteria:**
- Full flow works end-to-end
- Loading states display
- Errors handled gracefully

---

## Phase 2: Lifecycle + Retention

### Task 2.1: Add Lifecycle to Project Model

**Files to create/modify:**
- `src/web/dal/types.ts` (modify)
- `src/web/dal/projects.ts` (modify)
- `test/unit/web/dal/projects.test.ts` (modify)

**Subtasks:**
1. Add lifecycleState field to Project interface
2. Add lastActivityAt field
3. Implement updateLifecycleState()
4. Write unit tests

**Acceptance Criteria:**
- Lifecycle state stored correctly
- State transitions work
- Unit tests pass

---

### Task 2.2: Implement Lifecycle Service

**Files to create/modify:**
- `src/web/services/lifecycle.ts` (new)
- `test/unit/web/services/lifecycle.test.ts` (new)

**Subtasks:**
1. Implement getIdleProjects()
2. Implement archiveProject()
3. Implement unarchiveProject()
4. Implement automatic state transition logic
5. Write unit tests

**Acceptance Criteria:**
- Idle detection works
- Archive/unarchive work
- Automatic transitions work
- Unit tests pass

---

### Task 2.3: Add Lifecycle API Endpoints

**Files to create/modify:**
- `src/web/server.ts` (modify)
- `test/integration/web/lifecycle-api.test.ts` (new)

**Subtasks:**
1. Add POST /api/projects/:projectId/archive
2. Add POST /api/projects/:projectId/unarchive
3. Add GET /api/projects/lifecycle-stats
4. Write integration tests

**Acceptance Criteria:**
- All endpoints work
- Authorization enforced
- Integration tests pass

---

### Task 2.4: Implement Retention Policy DAL

**Files to create/modify:**
- `src/web/dal/retention.ts` (new)
- `test/unit/web/dal/retention.test.ts` (new)

**Subtasks:**
1. Define RetentionPolicy interface
2. Implement getRetentionPolicy()
3. Implement updateRetentionPolicy()
4. Implement calculateExpiredItems()
5. Write unit tests

**Acceptance Criteria:**
- Policy CRUD works
- Expired item calculation is correct
- Unit tests pass

---

### Task 2.5: Implement Cleanup Service

**Files to create/modify:**
- `src/web/services/cleanup.ts` (new)
- `test/unit/web/services/cleanup.test.ts` (new)

**Subtasks:**
1. Implement executeCleanup()
2. Implement dryRun mode
3. Add progress tracking
4. Write unit tests

**Acceptance Criteria:**
- Cleanup deletes correct items
- Dry run mode works
- Progress tracking works
- Unit tests pass

---

### Task 2.6: Add Retention API Endpoints

**Files to create/modify:**
- `src/web/server.ts` (modify)
- `test/integration/web/retention-api.test.ts` (new)

**Subtasks:**
1. Add GET /api/settings/retention
2. Add PUT /api/settings/retention
3. Add POST /api/maintenance/cleanup
4. Write integration tests

**Acceptance Criteria:**
- All endpoints work
- Authorization enforced
- Integration tests pass

---

### Task 2.7: Add Lifecycle/Retention UI

**Files to create/modify:**
- `src/web/public/settings.html` (modify)
- `src/web/public/js/settings.js` (modify)

**Subtasks:**
1. Add lifecycle state display to project list
2. Add archive/unarchive buttons
3. Add retention policy settings form
4. Add cleanup button with confirmation
5. Polish styling

**Acceptance Criteria:**
- UI displays lifecycle states
- Archive/unarchive work from UI
- Retention settings editable
- Cleanup works from UI

---

## Phase 3: Dashboard Enhancements (Optional)

### Task 3.1: Implement Overview Cards

**Subtasks:**
1. Add active sessions card
2. Add tasks today card
3. Add project activity card
4. Add system health card

---

### Task 3.2: Implement Activity Timeline

**Subtasks:**
1. Create ActivityEvent model
2. Implement event aggregation
3. Create timeline UI component
4. Add real-time updates

---

### Task 3.3: Implement Project Quick Access

**Subtasks:**
1. Track recent project access
2. Create quick access UI
3. Add navigation shortcuts

---

## Phase 4: Folder Scan Assistance

### Task 4.1: Implement Folder Scanner

**Files to create/modify:**
- `src/web/services/folder-scanner.ts` (new)
- `test/unit/web/services/folder-scanner.test.ts` (new)

**Subtasks:**
1. Implement scanDirectory()
2. Implement recursive scanning
3. Implement project type detection
4. Add depth limiting
5. Write unit tests

**Acceptance Criteria:**
- Single directory scan works
- Recursive scan works
- Project type detection is accurate
- Depth limit respected
- Unit tests pass

---

### Task 4.2: Implement Scan Job Management

**Files to create/modify:**
- `src/web/services/scan-job-manager.ts` (new)
- `test/unit/web/services/scan-job-manager.test.ts` (new)

**Subtasks:**
1. Define ScanJob interface
2. Implement job creation
3. Implement job status tracking
4. Implement results storage
5. Write unit tests

**Acceptance Criteria:**
- Job creation works
- Status updates correctly
- Results stored properly
- Unit tests pass

---

### Task 4.3: Add Scan API Endpoints

**Files to create/modify:**
- `src/web/server.ts` (modify)
- `test/integration/web/scan-api.test.ts` (new)

**Subtasks:**
1. Add POST /api/scan/start
2. Add GET /api/scan/:jobId
3. Add GET /api/scan/:jobId/results
4. Add POST /api/scan/:jobId/apply
5. Write integration tests

**Acceptance Criteria:**
- All endpoints work
- Authorization enforced
- Integration tests pass

---

### Task 4.4: Implement Scan UI

**Files to create/modify:**
- `src/web/public/scan.html` (new)
- `src/web/public/js/scan.js` (new)
- `src/web/public/css/scan.css` (new)

**Subtasks:**
1. Create scan settings form
2. Implement progress display
3. Create results table
4. Add selection checkboxes
5. Implement apply action
6. Polish styling

**Acceptance Criteria:**
- UI flow works end-to-end
- Progress updates in real-time
- Selection works
- Apply creates projects

---

## Dependency Graph

```
Phase 1:
1.1 (Sessions DAL) → 1.3 (Sessions API)
1.2 (Logs DAL) → 1.4 (Project Logs API)
1.5 (Tree UI) ─┬→ 1.7 (Integration)
1.6 (Log Viewer) ─┘

Phase 2:
2.1 (Lifecycle Model) → 2.2 (Lifecycle Service) → 2.3 (Lifecycle API)
2.4 (Retention DAL) → 2.5 (Cleanup Service) → 2.6 (Retention API)
2.3, 2.6 → 2.7 (UI)

Phase 3:
3.1, 3.2, 3.3 can run in parallel

Phase 4:
4.1 (Scanner) → 4.2 (Job Manager) → 4.3 (API) → 4.4 (UI)
```

## Estimated Effort

| Phase | Tasks | Estimated Hours |
|-------|-------|-----------------|
| Phase 1 | 7 | 16-20 |
| Phase 2 | 7 | 12-16 |
| Phase 3 | 3 | 6-8 |
| Phase 4 | 4 | 8-12 |
| **Total** | **21** | **42-56** |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Virtual scrolling complexity | Use proven library or simple pagination fallback |
| Large scan directories | Implement timeout and chunked processing |
| Cleanup data loss | Require confirmation, implement dry-run |
| Regression in existing features | Run full test suite after each phase |
