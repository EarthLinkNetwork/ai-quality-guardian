# Recovery Page & Rollback — Test Specification

**Status**: Draft v1.0
**Related**: `spec/36_LIVE_TASKS_AND_RECOVERY.md`, `spec/20_QUEUE_STORE.md`
**Test files**:
- `test/playwright/recovery-page.spec.ts`
- `test/playwright/checkpoint-parent-ownership.spec.ts`
- `test/unit/checkpoint/parent-owned.test.ts`
- `test/unit/recovery/rollback-tree.test.ts`

This document lists the testable requirements for the Recovery page and the
parent-owned checkpoint / cascade rollback behaviour.

---

## A. Recovery Page UI Tests

### RP-1: Empty state

**Preconditions**: No stale tasks, no recent ERROR tasks.

**Steps**:
1. Navigate to `#/recovery`

**Expected**:
- Page header "Recovery"
- `Stale Tasks` section shows "No stale tasks detected"
- `Recent Failed` section shows "No recent failures"
- `Rollback History` section shows "No rollbacks yet"

---

### RP-2: Stale task listed with correct age

**Preconditions**:
- Stale threshold set to 1 second
- Task `T1` in RUNNING, `updated_at` = 10 seconds ago

**Steps**:
1. Navigate to `#/recovery`

**Expected**:
- `T1` appears under `Stale Tasks`
- Age column shows `~10s`
- Actions: `Mark as ERROR`, `Rollback`, `View` buttons

---

### RP-3: Recent Failed list shows ERROR tasks

**Preconditions**: Task `T2` status=ERROR with error_message, updated_at within 24h.

**Steps**:
1. Navigate to `#/recovery`

**Expected**:
- `T2` appears under `Recent Failed`
- Error message preview visible
- Actions: `Retry`, `Rollback`, `View`

---

### RP-4: Retry transitions ERROR → QUEUED

**Preconditions**: Task `T3` in ERROR.

**Steps**:
1. Click `Retry` on `T3`
2. Wait for refresh

**Expected**:
- `POST /api/tasks/T3/retry` is called
- `T3` no longer in `Recent Failed`
- `T3` status is now `QUEUED` (verifiable via test helper)

---

### RP-5: Startup banner when stale tasks exist

**Preconditions**: Server restarts with 2 stale tasks (older than threshold).

**Steps**:
1. Restart the server
2. Visit Dashboard
3. Read the banner

**Expected**:
- `/api/health` response has `stale_recovered_on_startup >= 1`
- Dashboard shows a yellow/red banner: `前回の停止で N 件のタスクが stale のまま残っていました`
- Banner has a `Recovery ページで確認する` link to `#/recovery`

---

## B. Rollback Parent-Ownership Tests (CRITICAL)

These tests encode the invariant:

> **Checkpoints are owned by root tasks only. Rollback of any descendant walks
> up to the root and restores the entire tree.**

### RO-1: Root task creates checkpoint

**Preconditions**: Empty git repo at `tempProjectDir`.

**Steps**:
1. Enqueue a root task (no `parent_task_id`)
2. Execute it via the executor

**Expected**:
- `createCheckpoint(projectPath, taskId)` is called exactly once
- After execution, the root task's `checkpoint_ref` field is populated

---

### RO-2: Subtask does NOT create its own checkpoint

**Preconditions**: Root task `R1` (with checkpoint), subtask `S1` (parent_task_id=R1).

**Steps**:
1. Execute `S1`

**Expected**:
- `createCheckpoint` is NOT called for `S1`
- `S1.checkpoint_ref` remains undefined
- The git stash list contains only 1 stash (from R1)

---

### RO-3: Rollback from child cascades to root + all descendants

**Preconditions**:
- `R1` with checkpoint, status=COMPLETE/WAITING_CHILDREN
- `S1` child of R1, status=RUNNING
- `S2` child of R1, status=QUEUED
- `SS1` grandchild (child of S1), status=QUEUED

**Steps**:
1. `POST /api/tasks/S1/rollback` (rollback a descendant, not the root)
2. Read response

**Expected**:
- Response: `{ success: true, rolled_back_task_id: "R1", cancelled_descendants: ["R1", "S1", "S2", "SS1"] }`
- Checkpoint rollback executed once (git stash popped)
- After rollback, R1 / S1 / S2 / SS1 are all in `CANCELLED` status
- `R1.checkpoint_ref` is now undefined (stash consumed)

---

### RO-4: Rollback from root cascades to all descendants

**Preconditions**: Same tree as RO-3.

**Steps**:
1. `POST /api/tasks/R1/rollback`

**Expected**:
- Same cascade behaviour as RO-3
- `rolled_back_task_id` is `R1`
- All 4 tasks become `CANCELLED`

---

### RO-5: Rollback without checkpoint returns NO_CHECKPOINT

**Preconditions**: Task `R2` without `checkpoint_ref` (simulating loss across restarts).

**Steps**:
1. `POST /api/tasks/R2/rollback`

**Expected**:
- HTTP 409
- Response: `{ success: false, error: "NO_CHECKPOINT" }`
- No git operations performed
- `R2` status unchanged

---

### RO-6: Git project uses git stash

**Preconditions**: tempProjectDir is a git repo with uncommitted changes.

**Steps**:
1. Execute root task that modifies files
2. Record the diff
3. Rollback via API
4. Verify git status

**Expected**:
- Before rollback: working tree has task modifications
- After rollback: working tree matches pre-task state
- Uncommitted changes from BEFORE the task are preserved (stash pop worked)

---

### RO-7: Non-git project uses file snapshot

**Preconditions**: tempProjectDir is NOT a git repo (no `.git/`).

**Steps**:
1. Execute root task that creates / modifies files
2. Rollback via API
3. Read files

**Expected**:
- Checkpoint type recorded as `file-snapshot`
- After rollback, src/ files match the pre-task snapshot

---

### RO-8: Rollback entry persists to Rollback History

**Steps**:
1. Execute rollback on a task
2. `GET /api/recovery/rollback-history`

**Expected**:
- Returned entries include the just-performed rollback
- Entry has `rolled_back_task_id`, `checkpoint_type`, `success`, `cancelled_count`, `triggered_at`

---

## C. Configurable Stale Threshold Tests

### ST-1: Default threshold is 10 minutes

**Steps**:
1. Start server with no flags/env/config overrides
2. `GET /api/health`

**Expected**:
- Response has `stale_threshold_ms === 600000`

---

### ST-2: CLI flag overrides default

**Steps**:
1. Start server with `--stale-threshold-ms 900000`
2. `GET /api/health`

**Expected**:
- `stale_threshold_ms === 900000`

---

### ST-3: Env var overrides default

**Steps**:
1. `PM_RUNNER_STALE_THRESHOLD_MS=300000 node dist/cli/index.js web`
2. `GET /api/health`

**Expected**:
- `stale_threshold_ms === 300000`

---

### ST-4: Config file overrides default

**Preconditions**: `~/.pm-orchestrator-runner/config.json` contains
`{ "recovery": { "staleThresholdMs": 120000 } }`

**Steps**:
1. Start server with no flags
2. `GET /api/health`

**Expected**:
- `stale_threshold_ms === 120000`

---

### ST-5: Precedence: flag > env > config > default

**Preconditions**:
- Config file has `staleThresholdMs: 100000`
- Env `PM_RUNNER_STALE_THRESHOLD_MS=200000`
- CLI flag `--stale-threshold-ms 300000`

**Steps**: Start server, GET /api/health

**Expected**:
- `stale_threshold_ms === 300000` (flag wins)

---

## Test File Conventions

- Playwright port: `3609`
- Namespace: `pw-recovery`
- Use `InMemoryQueueStore` with seeded data via `/__test__/*` helpers
- Git tests use temporary git repos created with `git init` in `tempProjectDir`
- Reference comments: `// spec: specs/recovery-rollback.spec.md > RO-N`
