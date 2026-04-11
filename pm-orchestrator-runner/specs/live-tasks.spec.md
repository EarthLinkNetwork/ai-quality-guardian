# Live Tasks Page — Test Specification

**Status**: Draft v1.0
**Related**: `spec/36_LIVE_TASKS_AND_RECOVERY.md`, `spec/19_WEB_UI.md`
**Test file**: `test/playwright/live-tasks.spec.ts`

This document lists the testable requirements for the Live Tasks page. Tests
MUST be written from this spec **without reading the implementation**.

---

## Scope

The Live Tasks page (`#/activity` or `#/live-tasks`) displays all in-flight
tasks across the current namespace, regardless of project or task group. It
replaces the old event-log Activity page.

---

## Test Cases

### LT-1: Page loads and shows the safety banner

**Preconditions**: Server started with empty queue.

**Steps**:
1. Navigate to `#/live-tasks`
2. Wait for page load

**Expected**:
- Page header shows `Live Tasks`
- Summary card visible with count `0`
- Empty state message: "No in-flight tasks"
- Event History section is rendered and collapsed by default

---

### LT-2: RUNNING task appears in the list

**Preconditions**: Task `T1` enqueued and manually transitioned to RUNNING.

**Steps**:
1. Navigate to `#/live-tasks`

**Expected**:
- `T1` row is present
- Status column shows `RUNNING` badge
- Project column shows the project alias (or basename of path)
- Task ID column is truncated + has link to `/tasks/T1`
- Age column > 0 ms

---

### LT-3: WAITING_CHILDREN task is shown as "in progress"

**Preconditions**: Parent task `P1` in WAITING_CHILDREN with 2 QUEUED children.

**Steps**:
1. Navigate to `#/live-tasks`

**Expected**:
- `P1` row status badge uses the `running` style (NOT `complete`)
- `P1` is not greyed out — user sees parent is still in progress
- Two child rows also listed (with `parent_task_id` linked to P1 via URL)

---

### LT-4: AWAITING_RESPONSE task is shown

**Preconditions**: Task `T2` in AWAITING_RESPONSE.

**Steps**:
1. Navigate to `#/live-tasks`

**Expected**:
- `T2` row present with `AWAITING_RESPONSE` badge
- Action: `View` button visible (so user can go answer)

---

### LT-5: Stale task is highlighted

**Preconditions**:
- Stale threshold set to 1 second (test override)
- Task `T3` in RUNNING, `updated_at` set to 2 seconds ago

**Steps**:
1. Navigate to `#/live-tasks`

**Expected**:
- `T3` row has red background
- Row contains a `STALE` badge
- `stale_count` in summary is `>= 1`

---

### LT-6: Event History toggle reveals legacy activity log

**Preconditions**: At least one ActivityEvent exists.

**Steps**:
1. Navigate to `#/live-tasks`
2. Click "Event History" section header

**Expected**:
- Section expands
- Entries from `/api/activity` are rendered below the Live Tasks table
- Collapsing again hides the entries

---

### LT-7: Auto-refresh toggle works

**Preconditions**: Task list has one item.

**Steps**:
1. Navigate to `#/live-tasks`
2. Toggle the `Auto (5s)` checkbox on
3. Wait 6 seconds
4. Toggle off

**Expected**:
- Two `GET /api/live-tasks` requests fire within 6 seconds while on
- No additional requests after toggling off

---

### LT-8: Cancel action transitions task to CANCELLED

**Preconditions**: Task `T4` in RUNNING.

**Steps**:
1. Navigate to `#/live-tasks`
2. Click `Cancel` on `T4` row
3. Confirm dialog

**Expected**:
- `PATCH /api/tasks/T4/status` is called with `CANCELLED`
- After next refresh, `T4` no longer appears in Live Tasks (it's terminal)

---

### LT-9: QUEUED tasks hidden by default, shown with filter

**Preconditions**: Two tasks — `T5` (RUNNING), `T6` (QUEUED).

**Steps**:
1. Navigate to `#/live-tasks`
2. Observe initial list
3. Toggle `Include QUEUED` filter
4. Observe updated list

**Expected**:
- Initial list: only `T5`
- After toggle: `T5` and `T6`

---

### LT-10: API includes project_alias and stale_threshold_ms

**Steps**:
1. Call `GET /api/live-tasks` directly

**Expected**:
- Response has `tasks[]`, `stale_count`, `stale_threshold_ms`, `timestamp`
- Each task has `task_id`, `task_group_id`, `status`, `age_ms`, `is_stale`
- Tasks with registered projects include `project_alias`

---

## Test File Conventions

- Port: `3608`
- Namespace: `pw-live-tasks`
- Use `InMemoryQueueStore`
- Manipulate queue state via `/__test__/*` helper routes (similar to
  `subtask-lifecycle.spec.ts`)
- Reference comment: `// spec: specs/live-tasks.spec.md > LT-N`
