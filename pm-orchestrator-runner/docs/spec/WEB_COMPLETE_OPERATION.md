# Web Complete Operation Specification

## Overview

This specification defines the requirements for "Web UI Complete Operation" - the ability to perform all development operations entirely through the Web UI without requiring terminal access.

## Design Principles

### A) Resume = Replay (Re-execution)
- After Web UI restart, execution processes (executor) are assumed to be terminated
- "Resume" means replay (re-execution), not continuation of the same process
- Context is saved by the system, not retained in LLM memory

### B) Default Safety: Rollback → Replay
- When restart is detected or executor absence is suspected, incomplete tasks default to "rollback and replay"
- Exception: Soft resume (attempt+1) is allowed only when saved artifacts (patch, step log, test failure summary) are complete

### C) Reply Flow is Required
- AWAITING_RESPONSE tasks must have Reply textarea in UI
- After reply submission, task transitions to RUNNING → COMPLETE
- Results must be displayed in UI

### D) No Terminal Operations Required
- Web UI must provide Run/Stop/Build/Restart controls
- All operations complete within the browser

---

## Acceptance Criteria

### AC-RESUME-1: Resume = Replay

**Definition:** Resume is re-execution, not process continuation.

**Requirements:**
1. After Web restart, incomplete tasks (AWAITING_RESPONSE, RUNNING) do not assume same-process continuation
2. "Resume" button triggers replay (re-execution)
3. Task state is reconstructed from persistent storage

**Verification:** E2E test simulates restart and verifies replay behavior

---

### AC-RESUME-2: Default is Rollback → Replay

**Definition:** When restart is detected or executor absence is suspected, default to safe rollback before replay.

**Requirements:**
1. Detect restart/executor-absence conditions
2. Default action: rollback working directory changes, then replay
3. Exception: Allow soft resume (attempt+1) only when all artifacts are saved:
   - Applied patches
   - Step log
   - Test failure summary
4. UI clearly shows which mode will be used

**Verification:** E2E test creates mid-execution state and verifies rollback behavior

---

### AC-RESUME-3: Resume UI

**Definition:** AWAITING_RESPONSE task detail shows Resume/Rollback options.

**Requirements:**
1. Task detail view for AWAITING_RESPONSE shows:
   - "Resume (replay)" button
   - "Rollback & Replay" button
2. Both operations complete without terminal access
3. Operation result is displayed in UI

**Verification:** E2E test exercises both buttons and verifies completion

---

### AC-AUTO-DEV-1: Web Auto-Dev Loop

**Definition:** Auto-dev loop can be initiated and completed from Web UI.

**Requirements:**
1. Open Chat with "enable auto-fix loop" triggers auto-dev execution
2. Loop runs entirely within Web UI context
3. On failure: automatic rollback, final result displayed in UI
4. API key absence: fail-closed with clear UI message

**Verification:** E2E test with mock executor verifies loop completion

---

### AC-OPS-1: Runner Controls in Web UI

**Definition:** Web UI provides Run/Stop/Build/Restart controls.

**Requirements:**
1. "Runner Controls" section in UI with:
   - Stop (safe shutdown)
   - Build (npm run build equivalent)
   - Restart (stop → build → start sequence)
2. Operations work for selfhost (local pm web) scenario
3. Success/failure clearly displayed
4. On failure: show cause and next action (Retry/Back)

**Verification:** E2E test exercises Build and Restart buttons

---

### AC-CHAT-1: Thread = TaskGroup (No Proliferation)

**Definition:** One thread equals one taskGroupId; no unintended creation of new task groups.

**Requirements:**
1. Existing thread continuation: Select from Task Groups list
2. Open Chat: Creates new thread (new taskGroupId)
3. Within same thread: taskGroupId fixed, tasks accumulate
4. UI clearly distinguishes new vs continuing thread

**Verification:** E2E test sends multiple messages and verifies single taskGroupId

---

### AC-STATE-1: Question Results → AWAITING_RESPONSE

**Definition:** Results containing questions do not become COMPLETE.

**Requirements:**
1. Detect question patterns:
   - "May I proceed?" / "進めて良いですか?"
   - "Which option?" / "どちらですか?"
   - "Shall I...?" / "〜しますか?"
2. Such results set status to AWAITING_RESPONSE, not COMPLETE
3. Reply submission triggers RUNNING → COMPLETE transition

**Verification:** E2E test with question-containing response verifies status

---

### AC-UI-REPLY-1: Reply Textarea

**Definition:** AWAITING_RESPONSE tasks have multiline reply input.

**Requirements:**
1. Reply textarea in task detail for AWAITING_RESPONSE status
2. Multiline support: Shift+Enter for newline, Enter to submit
3. Reply content preserved in history
4. Empty reply: fail-closed (reject with message)

**Verification:** E2E test submits multiline reply and verifies preservation

---

## Timeout Configuration

### AC-TIMEOUT-1: Progress-Aware Timeout

**Definition:** Timeout considers progress, not just elapsed time.

**Requirements:**
1. `idle_timeout`: Triggers only when no progress events for specified duration
2. `hard_timeout`: Absolute upper limit (safety)
3. `progress_event`: Executor emits heartbeat/tool-progress/log-chunk events
4. On hard_timeout: Set to AWAITING_RESPONSE with Resume option

**Configuration:**
```typescript
interface TimeoutProfile {
  idle_timeout_ms: number;   // Default: 60000 (60s)
  hard_timeout_ms: number;   // Default: 600000 (10m)
  name: string;              // 'standard' | 'long' | 'extended'
}
```

**Profiles:**
- standard: idle=60s, hard=10m
- long: idle=120s, hard=30m
- extended: idle=300s, hard=60m

**Verification:** E2E test verifies progress events prevent idle timeout

---

## E2E Test Mapping

| AC | E2E Test File | Description |
|----|---------------|-------------|
| AC-CHAT-1 | chat-thread-continuation.e2e.test.ts | Thread = TaskGroup verification |
| AC-UI-REPLY-1 | awaiting-response-reply-ui.e2e.test.ts | Reply textarea functionality |
| AC-UI-REPLY-1 | multiline-input.e2e.test.ts | Multiline input behavior |
| AC-RESUME-1, AC-RESUME-2 | resume-replay-after-restart.e2e.test.ts | Resume = Replay verification |
| AC-RESUME-2, AC-RESUME-3 | rollback-and-replay.e2e.test.ts | Rollback behavior |
| AC-OPS-1 | runner-controls.e2e.test.ts | Build/Restart controls |
| AC-TIMEOUT-1 | timeout-progress.e2e.test.ts | Progress-aware timeout |
| AC-STATE-1 | awaiting-response-reply-ui.e2e.test.ts | Question → AWAITING_RESPONSE |
| AC-AUTO-DEV-1 | web-autodev-loop.e2e.test.ts | Auto-dev loop from Web |

---

## Implementation Notes

### Task Persistence Schema

```typescript
interface PersistedTask {
  task_id: string;
  task_group_id: string;
  session_id: string;
  status: QueueItemStatus;
  prompt: string;
  output?: string;
  error_message?: string;
  attempt: number;
  events: ProgressEvent[];
  created_at: string;
  updated_at: string;
}

interface ProgressEvent {
  type: 'heartbeat' | 'tool_progress' | 'log_chunk';
  timestamp: string;
  data?: unknown;
}
```

### Restart Detection

```typescript
function detectRestartCondition(task: PersistedTask): boolean {
  // RUNNING task with no recent progress events
  if (task.status === 'RUNNING') {
    const lastEvent = task.events[task.events.length - 1];
    const elapsed = Date.now() - new Date(lastEvent?.timestamp || task.updated_at).getTime();
    return elapsed > 30000; // 30s without progress suggests restart
  }
  return false;
}
```

### Rollback Strategy

1. Check for uncommitted changes: `git status --porcelain`
2. If changes exist and no saved patch: `git checkout -- .`
3. If saved patch exists: Apply patch in reverse
4. Clear temporary files
5. Ready for replay

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-07 | Initial specification |
