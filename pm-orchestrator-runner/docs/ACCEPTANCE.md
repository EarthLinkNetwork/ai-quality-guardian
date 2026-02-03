# ACCEPTANCE.md - Docs-First Gate Acceptance Criteria

## Acceptance Criteria

### AC-1: Required Documentation Files

**Given** the docs-first gate is executed  
**When** any of the 5 required files is missing:
- docs/SPEC.md
- docs/TASK_PLAN.md
- docs/TEST_PLAN.md
- docs/ACCEPTANCE.md
- docs/EVIDENCE.md

**Then** the gate MUST return FAIL (exit code 1) with specific missing file names

### AC-2: Acceptance Criteria Format

**Given** docs/ACCEPTANCE.md exists  
**When** it does not contain numbered criteria in AC-N format (e.g., AC-1, AC-2)  
**Then** the gate MUST return FAIL with "No AC-N format criteria found"

### AC-3: Evidence for All Acceptance Criteria

**Given** docs/ACCEPTANCE.md contains AC-1, AC-2, AC-3  
**When** docs/EVIDENCE.md does not reference all AC numbers  
**Then** the gate MUST return FAIL listing the missing AC numbers

### AC-4: Evidence Must Be Actual Results

**Given** docs/EVIDENCE.md references all AC numbers  
**When** evidence for any AC is only a declaration (e.g., "done", "completed", "works")  
**Then** the gate MUST return FAIL with "Declaration-only evidence" message

**Actual evidence includes:**
- Command output in code blocks
- URLs
- Screenshot references
- Log snippets

### AC-5: Integration with gate:all

**Given** the docs-first gate is implemented  
**When** `npm run gate:all` is executed  
**Then** the docs-first gate MUST be included in the check

### AC-6: Pass Condition

**Given** all 5 docs exist  
**And** ACCEPTANCE.md has AC-N format  
**And** EVIDENCE.md references all AC numbers  
**And** all evidence contains actual execution results  
**Then** the gate MUST return PASS (exit code 0)

### AC-7: E2E Evidence Log

**Given** the E2E test is executed
**When** the test completes
**Then** a log file at `.tmp/e2e-docs-first.log` MUST contain the REJECT -> FIX -> PASS flow

---

## Web UI Acceptance Criteria

### AC-8: Web UI Top Nav Contains All Required Menus

**Given** Web server is started with `node dist/cli/index.js web --port 5678`
**When** accessing `http://localhost:5678/`
**Then** the main nav MUST contain:
- Task Groups
- + New
- Agents
- Notifications
- Settings

### AC-9: Health API Returns Namespace and Project Root

**Given** Web server is running
**When** `curl http://localhost:5678/api/health` is executed
**Then** the response MUST include:
- `namespace` (derived from project root)
- `project_root` (current directory)
- `provider` and `model` settings

### AC-10: Task Creation and Display Flow

**Given** Web server is running with namespace X
**When** a task is created via `POST /api/tasks`
**Then**:
- Task appears in `/api/task-groups` response
- Task detail is available via `/api/tasks/:task_id`
- Same task is visible in REPL with matching namespace

### AC-11: Settings API and UI Integration

**Given** Web server is running
**When** settings are updated via `PUT /api/settings`
**Then**:
- Changes are persisted
- New tasks use updated model/provider settings
- UI reflects current settings

### AC-12: Notifications API and UI Integration

**Given** Web server is running
**When** a notification is created via `POST /api/notifications`
**Then**:
- Notification appears in `/api/notifications` list
- `unread_count` increments
- UI badge shows unread count

### AC-13: Agents Page Displays Runner Data

**Given** Web server is running
**When** `/agents` page is accessed
**Then**:
- Runner list is displayed from `/api/runners`
- Each runner shows: runner_id, status, is_alive, last_heartbeat, project_root

### AC-14: Task Detail Shows Status, Log, and Trace

**Given** a task exists in the queue
**When** task detail is accessed via `/api/tasks/:task_id`
**Then** response MUST include:
- status
- prompt
- created_at
- updated_at
- error_message (if ERROR status)

---

## Phase 1: Settings UI Enhancement Acceptance Criteria

### AC-15: API Key Input Field with Masking

**Given** Settings page is loaded
**When** user views the API Key section
**Then**:
- A password-type input field is displayed for API key entry
- Input shows dots/asterisks by default
- A "Show/Hide" toggle button is present
- Clicking toggle reveals/masks the API key

### AC-16: API Key Storage in DynamoDB

**Given** user enters an API key in Settings
**When** Save button is clicked
**Then**:
- API key is encrypted using AES-GCM before storage
- Encrypted key is stored in `pm-runner-settings` DynamoDB table
- API key is never logged in plaintext
- GET /api/settings/api-key/status returns `configured: true`

### AC-17: Provider/Model Dropdowns

**Given** Settings page is loaded
**When** user views Provider Configuration section
**Then**:
- Provider is a dropdown with options: Anthropic, OpenAI
- Model is a dropdown populated based on selected provider
- Selecting Anthropic shows: claude-opus-4-20250514, claude-sonnet-4-20250514, etc.
- Selecting OpenAI shows: gpt-4o, gpt-4o-mini, o1, o1-mini, etc.
- Model dropdown updates when provider changes

### AC-18: Explicit Save Button with Dirty State

**Given** Settings page is loaded
**When** no changes have been made
**Then**:
- Save button is present but disabled
- No "unsaved changes" indicator is shown

**When** a field value is modified
**Then**:
- Save button becomes enabled
- Modified field shows visual indicator (e.g., asterisk)
- "Unsaved changes" warning appears

**When** Save button is clicked
**Then**:
- Loading state is shown during save
- Success/error feedback is displayed after save
- Save button returns to disabled state after successful save

### AC-19: Two-Tier Settings (Global/Project)

**Given** Settings page is loaded
**When** user views settings
**Then**:
- Tabs or toggle for "Global" and "Project" scope are present
- Global tab shows settings for all projects
- Project tab shows settings for current project

**When** viewing Project settings
**Then**:
- Non-overridden values show "(inherited from Global)" indicator
- "Reset to Global" action is available for overridden values

### AC-20: No Undefined Values Displayed

**Given** Settings page is loaded
**When** any setting has no stored value
**Then**:
- Provider shows "anthropic" (default), never "undefined"
- Model shows "claude-sonnet-4-20250514" (default), never "undefined"
- Max Tokens shows "4096" (default), never "undefined"
- Temperature shows "0.7" (default), never "undefined"

### AC-21: Agents Cleanup Features

**Given** Agents page is loaded
**When** user views the page
**Then**:
- Status filter dropdown is present with options: All, Running, Stale, Stopped
- "Purge Stale Agents" button is present

**When** "Purge Stale Agents" is clicked
**Then**:
- Confirmation dialog appears
- On confirm, stale runners (last_heartbeat > 2 hours) are removed
- Runner list refreshes

### AC-22: Task Settings Snapshot

**Given** settings are configured (provider=anthropic, model=claude-sonnet-4-20250514)
**When** a new task is created
**Then**:
- Task is created with settings_snapshot field
- settings_snapshot contains: provider, model, max_tokens, temperature
- GET /api/tasks/:id includes settings_snapshot in response
- Task detail UI shows "Settings Used" section

---

## Quality Assurance Acceptance Criteria

### AC-23: Web UI index.html No SyntaxError at Load Time

**Given** Web server is started
**When** browser loads index.html
**Then**:
- No JavaScript SyntaxError in browser console
- init() -> loadNamespaces() -> router() executes successfully
- UI renders without being stuck on "loading"

**Regression Test**:
- `test/unit/web/index-html-syntax.test.ts` validates all `<script>` blocks parse without error
- Test uses Node `vm.Script` to parse-check (no execution)

### AC-24: Web UI Boot Timeout Fail-Closed Mechanism

**Given** Web server is started
**When** browser loads index.html but boot sequence fails or hangs
**Then**:
- After BOOT_TIMEOUT_MS (15 seconds), showBootError() is called
- Error message is displayed with "Boot failed at: [step]" and retry button
- User is NOT stuck on infinite "Loading" spinner

**Boot Sequence Logging**:
- [BOOT-1] init() started
- [BOOT-2] loadNamespaces() starting...
- [BOOT-3] loadNamespaces() completed
- [BOOT-4] router() starting...
- [BOOT-5] router() completed
- [BOOT-6] init() completed successfully

**Fail-Closed Behavior**:
- `bootCompleted` flag tracks completion state
- setTimeout fires after BOOT_TIMEOUT_MS if bootCompleted is false
- showBootError() displays error and retry button

**Regression Test**:
- `test/unit/web/index-html-syntax.test.ts` includes "Boot Timeout Fail-Closed Mechanism (AC-24)" describe block
- Tests verify: BOOT_TIMEOUT_MS, bootCompleted, showBootError, setTimeout in init(), boot logging markers

---

## Web UI Boot Verification Acceptance Criteria

### AC-UI-1: Normal Boot Completes Within 15 Seconds

**Given** Web server is started with `node dist/cli/index.js web --port 5681`
**When** browser (or Playwright headless) navigates to `http://localhost:5681/`
**Then**:
- `window.__PM_BOOT_STATUS__.phase` reaches 'ready' within 15 seconds
- Boot sequence completes: [BOOT-1] through [BOOT-6]
- UI displays Task Groups (not stuck on "Loading")
- `window.__PM_BOOT_STATUS__.error` is null

### AC-UI-2: Fail-Closed Screen on API Failure Within 15 Seconds

**Given** Web server is started with `PM_WEB_TEST_MODE=fail_namespaces`
**When** browser navigates to the server
**Then**:
- `window.__PM_BOOT_STATUS__.phase` reaches 'failed' within 15 seconds
- Error message is displayed (not stuck on infinite loading)
- Retry button is visible
- `window.__PM_BOOT_STATUS__.error` contains the failure message

**Test Mode**:
- `PM_WEB_TEST_MODE=fail_namespaces` makes `/api/namespaces` return 500 error
- This simulates API failure for fail-closed testing

### AC-UI-3: CI-Runnable Automated Tests

**Given** Playwright is installed as dev dependency
**When** `npm run test:integration -- --grep "Web UI Boot"` is executed
**Then**:
- Tests run in headless browser mode (CI-compatible)
- Both normal boot and fail-closed scenarios are tested
- Tests complete without flaky failures
- Tests can be included in CI pipeline

**Test File**: `test/integration/web-boot-failclosed.test.ts`

### AC-UI-4: Evidence in docs/EVIDENCE.md

**Given** AC-UI-1 through AC-UI-3 are implemented
**When** docs/EVIDENCE.md is reviewed
**Then**:
- Actual execution logs are documented (not just declarations)
- grep commands with line numbers show implementation
- Test output shows actual pass/fail results
- Evidence is machine-verifiable

### AC-UI-5: gate:all Includes Web UI Boot Verification

**Given** diagnostics/web-boot.check.ts exists
**When** `npm run gate:all` is executed
**Then**:
- gate:web is included in gate:all command
- Structural checks verify:
  - `window.__PM_BOOT_STATUS__` defined in index.html
  - Boot phases include ready and failed states
  - `PM_WEB_TEST_MODE` support in server.ts
  - `showBootError` function exists
  - Playwright integration test file exists
- All checks must pass for gate:all to succeed

---

## Project Settings JavaScript Fix Acceptance Criteria

### AC-P1: No ReferenceError on Project Settings Tab

**Given** Web server is started and Settings page is loaded
**When** user clicks on "Project" tab
**Then**:
- No JavaScript ReferenceError in browser console
- `onProjectSettingChange is not defined` error does not occur
- `saveProjectSettings is not defined` error does not occur
- All form elements are functional

### AC-P2: Project Tab is Default on Settings Page

**Given** Web server is started
**When** user navigates to Settings page
**Then**:
- "Project" tab is active by default (not "Global")
- Project-specific settings are displayed initially
- User can switch to "Global" tab

### AC-P3: Current Project Indicator in Settings Header

**Given** Web server is started with a namespace
**When** user views Settings page header
**Then**:
- Current project name is displayed (e.g., "Project: pm-orchestrator-runner-6d20")
- Indicator is styled visibly (background color, bold text)
- If no namespace is selected, shows "Not selected"

### AC-P4: Project Setting Change Handler Works

**Given** Settings page is on Project tab
**When** user changes a project-specific setting (Provider, Model, Max Tokens, Temperature)
**Then**:
- `onProjectSettingChange(key, value)` is called without error
- Setting is stored in `settingsState.projectSettings`
- If value is empty, setting reverts to global (removes override)
- If provider changes, model list reloads

### AC-P5: Save Project Settings Button Works

**Given** Settings page is on Project tab with modified settings
**When** user clicks "Save Project Settings" button
**Then**:
- `saveProjectSettings()` is called without error
- Button shows "Saving..." then "Saved!"
- `PUT /api/settings/project` is called
- On success, button returns to normal state

### AC-P6: Reset All to Global Button Works

**Given** Settings page is on Project tab
**When** user clicks "Reset All to Global" button
**Then**:
- Confirmation dialog appears
- On confirm, all project overrides are cleared
- All settings revert to global values
- UI updates to show inherited values

---

## API Key Persistence Acceptance Criteria

### AC-K1: API Key Persists Across Server Restart

**Given** Web server is started and API key is saved via `PUT /api/settings/api-key`
**When** server is stopped and restarted in the same folder
**Then**:
- `GET /api/settings/api-key/status` returns `configured: true` for saved provider
- `GET /api/settings` returns `api_key_configured: true`
- Masked key is returned (e.g., `sk-a****7890`)

### AC-K2: Multiple Provider API Keys Persist

**Given** Both Anthropic and OpenAI API keys are saved
**When** server is restarted
**Then**:
- Both providers show `configured: true`
- Both masked keys are returned correctly

### AC-K3: API Key Deletion Persists

**Given** API key is deleted via `DELETE /api/settings/api-key`
**When** server is restarted
**Then**:
- `configured: false` persists after restart
- Empty state is maintained

---

## Self-Running Loop Acceptance Criteria

### AC-L1: Plan Creation from Project

**Given** Web server is running with a project
**When** `POST /api/plan/:projectId` is called
**Then**:
- A Plan with status `DRAFT` is created
- Plan has unique `planId` starting with `plan_`
- Plan contains tasks with unique `taskId` starting with `ptask_`
- Each task has default priority (0) and empty dependencies

### AC-L2: Plan Retrieval APIs

**Given** Plans exist in the system
**When** Plan retrieval APIs are called
**Then**:
- `GET /api/plan/:planId` returns the specific plan
- `GET /api/plans` returns all plans sorted by createdAt descending
- `GET /api/plans?projectId=xxx` filters plans by project

### AC-L3: Plan Update with Task Status

**Given** A Plan exists with status DRAFT
**When** `updatePlan` is called with new status and task updates
**Then**:
- Plan status changes (DRAFT -> DISPATCHING -> RUNNING -> VERIFYING -> VERIFIED/FAILED)
- Tasks can be updated with runIds when dispatched
- `updatedAt` timestamp changes on each update

### AC-L4: Plan Dispatch Creates Parallel Runs

**Given** A Plan exists with status DRAFT and multiple tasks
**When** `POST /api/plan/:planId/dispatch` is called
**Then**:
- Plan status changes to DISPATCHING then RUNNING
- Each task gets a corresponding Run created
- Tasks are linked to Runs via `runId`
- `executedAt` timestamp is set

### AC-L5: Plan Verify Executes Gate Checks

**Given** A Plan exists with all tasks completed
**When** `POST /api/plan/:planId/verify` is called
**Then**:
- Plan status changes to VERIFYING then VERIFIED/FAILED
- `gate:all` is executed (tier0, web, agent, spec)
- Gate results are stored in `gateResult` field
- `verifiedAt` timestamp is set

### AC-L6: AWAITING_RESPONSE Run Detection

**Given** Runs exist with various statuses
**When** `GET /api/needs-response` is called
**Then**:
- Returns only Runs with status `AWAITING_RESPONSE`
- Each run includes projectId, prompt, and creation time

### AC-L7: Run Response Submission

**Given** A Run exists with status AWAITING_RESPONSE
**When** `POST /api/runs/:runId/respond` is called with response
**Then**:
- Response is stored with the Run
- Run continues processing or completes

### AC-L8: Plan CRUD Integration Tests Pass

**Given** The Plan CRUD test suite exists
**When** `npm test -- --grep "Plan CRUD"` is executed
**Then**:
- All 15 Plan CRUD tests pass
- Tests cover: createPlan, getPlan, updatePlan, listPlans, getLatestPlanForProject

---

## Summary

| AC Range | Feature Area |
|----------|--------------|
| AC-1 to AC-7 | Docs-First Gate |
| AC-8 to AC-14 | Web UI Core |
| AC-15 to AC-22 | Settings UI Enhancement (Phase 1) |
| AC-23 | Quality Assurance (JS Syntax) |
| AC-24 | Quality Assurance (Boot Timeout Fail-Closed) |
| AC-UI-1 to AC-UI-5 | Web UI Boot Verification (Playwright E2E) |
| AC-P1 to AC-P6 | Project Settings JavaScript Fix |
| AC-K1 to AC-K3 | API Key Persistence |
| AC-L1 to AC-L8 | Self-Running Loop |
