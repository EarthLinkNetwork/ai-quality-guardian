# P0 Runtime Guarantee Specification

## Overview

This specification defines the P0 (Priority Zero) runtime guarantees for the pm-orchestrator-runner system. These are absolute requirements that must never be violated.

---

## P0-1: Claude Code Execution Logs Fully Visible in Web UI

**Definition:** Real-time stdout/stderr from Claude Code executor must be visible in Web UI.

**Requirements:**
1. ExecutorOutputStream provides real-time streaming via subscriber pattern
2. Web UI `/api/tasks/:id/output` returns accumulated output
3. Output includes both stdout and stderr with proper separation
4. Late subscribers receive buffered recent output
5. No output is lost or truncated during execution

**Implementation:**
- `src/executor/executor-output-stream.ts`: Singleton stream manager
- `src/executor/claude-code-executor.ts`: Emits to ExecutorOutputStream
- `src/web/routes/tasks.ts`: Provides `/api/tasks/:id/output` endpoint

**Verification:**
- Gate: `npm run gate:logs-visible`
- E2E: `test/e2e/executor-output-visibility.e2e.test.ts`

---

## P0-2: Auth/API Key Errors Are ERROR, Not Timeout

**Definition:** Authentication or API key configuration errors must return ERROR status with AUTH_ERROR or CONFIG_ERROR, never be treated as timeout.

**Requirements:**
1. Preflight checks run before executor starts
2. Missing/invalid API keys trigger ERROR with code AUTH_ERROR
3. Missing CLI tools trigger ERROR with code CONFIG_ERROR
4. These errors are immediate, not after timeout
5. Web UI displays clear error message with fix instructions

**Error Codes:**
- `AUTH_ERROR`: API key missing, invalid, or expired
- `CONFIG_ERROR`: CLI not installed, login required, or misconfigured
- `NETWORK_ERROR`: Network connectivity issues

**Implementation:**
- `src/diagnostics/executor-preflight.ts`: Comprehensive preflight checks
- `src/queue/queue-poller.ts`: Integrates preflight before execution
- `src/executor/claude-code-executor.ts`: Returns PreflightError on failure

**Verification:**
- Gate: `npm run gate:auth-detection`
- E2E: `test/e2e/auth-error-detection.e2e.test.ts`

---

## P0-3: Timeout Only on Process Death

**Definition:** Timeout triggers ONLY when executor process terminates (exit/crash), NOT on output silence.

**Requirements:**
1. "Silence = timeout" is ABOLISHED (v3 design)
2. Output silence alone does NOT terminate task
3. Only process exit (code 0 or non-0) or crash triggers completion
4. Hard timeout is safety net only, can be disabled
5. Progress events extend active time (heartbeat, tool use, etc.)

**Timeout Profiles:**
- `standard`: No hard timeout by default
- `extended`: For long-running operations
- `safety-net`: Optional hard limit for runaway processes

**Implementation:**
- `src/executor/claude-code-executor.ts`: v3 design, no silence timeout
- `src/executor/dynamic-timeout-executor.ts`: Profile-based wrapper

**Verification:**
- Gate: `npm run gate:timeout-real`
- E2E: `test/e2e/timeout-only-on-death.e2e.test.ts`

---

## P0-4: BLOCKED/INCOMPLETE Misconversion Prohibition

**Definition:** Only DANGEROUS_OP TaskType can transition to BLOCKED status.

**Requirements:**
1. BLOCKED status requires human confirmation for destructive operations
2. Non-DANGEROUS_OP tasks cannot become BLOCKED
3. AWAITING_RESPONSE is for clarification requests (not blocking)
4. Task completion is COMPLETE or ERROR, never incorrectly BLOCKED

**Valid Status Transitions:**
- READ_INFO, REPORT: QUEUED -> RUNNING -> COMPLETE/ERROR
- LIGHT_EDIT, IMPLEMENTATION: QUEUED -> RUNNING -> COMPLETE/ERROR/AWAITING_RESPONSE
- DANGEROUS_OP: QUEUED -> RUNNING -> BLOCKED -> COMPLETE/ERROR

**Implementation:**
- `src/queue/queue-store.ts`: Status transition validation
- `src/supervisor/task-type-detector.ts`: TaskType classification

**Verification:**
- Gate: `npm run gate:blocked-scope`
- E2E: `test/e2e/blocked-status-scope.e2e.test.ts`

---

## P0-5: Web-Only Self-Update E2E Proof

**Definition:** Build -> Restart -> build_sha change must be verifiable through Web UI alone.

**Requirements:**
1. `/api/runner/build` triggers npm run build
2. `/api/runner/restart` triggers stop -> build -> start
3. `/api/health` returns `build_sha` and `web_pid`
4. After restart, `web_pid` changes (process restarted)
5. After build, `build_sha` changes (new build)
6. All operations work without terminal access

**Implementation:**
- `src/web/routes/runner-controls.ts`: Build/Restart/Stop endpoints
- `src/supervisor/process-supervisor.ts`: Process management
- `scripts/generate-build-meta.js`: Build SHA generation

**Verification:**
- Gate: `npm run gate:browser`
- Playwright: `test/playwright/runner-controls-browser.spec.ts`

---

## P0-6: Stale Notification Mixing Prohibition

**Definition:** Executor log output must never contain stale notifications from previous sessions, tasks, or background processes.

**Requirements:**
1. `isStaleNotification()` fail-closed filter on all log retrieval
2. Every `ExecutorOutputChunk` tagged with `sessionId`
3. All 3 API endpoints apply stale filtering:
   - `GET /api/executor/logs?taskId=` (query param)
   - `GET /api/executor/logs/task/:taskId` (path param)
   - `GET /api/executor/logs/stream` (SSE)
4. Stale detection: taskId mismatch, sessionId mismatch, timestamp before creation, stale text patterns
5. No context = stale (fail-closed)

**Stale Detection Checks (fail-closed):**
| Check | Condition | Result |
|-------|-----------|--------|
| No context | Neither taskId nor sessionId provided | **STALE** |
| Task mismatch | `chunk.taskId !== currentTaskId` | **STALE** |
| Session mismatch | `chunk.sessionId !== currentSessionId` | **STALE** |
| Timestamp stale | `chunk.timestamp < taskCreatedAt` | **STALE** |
| Stale text | Contains "previous session", "cleaned up", etc. | **STALE** |

**Implementation:**
- `src/executor/executor-output-stream.ts`: `isStaleNotification()`, `getByTaskIdFiltered()`, `setSessionId()`
- `src/web/routes/executor-logs.ts`: Stale filtering on all endpoints
- `src/cli/index.ts`: Session ID tagging on web server start

**Verification:**
- Gate: `npm run gate:p0-stale-final`
- Unit: `test/unit/executor/stale-notification-filter.test.ts` (22 tests)
- Contract: `test/unit/utils/p0-stale-final-contracts.test.ts` (14 tests)
- E2E Script: `scripts/p0-stale-final.sh` (3 tasks, 7 endpoints, SSE)

---

## P0 Completion Declaration Rules (Fail-Closed)

**Definition:** All P0/P1 completion reports must follow a fixed machine-verifiable format. Ambiguous or incomplete reports are FAIL.

**Required Keys (all mandatory):**
```
verdict, violations, sessionCount, staleFiltered, totalChunks, evidencePath
```

**Rules:**
1. Any report claiming "PASS" or "COMPLETE" must include ALL 6 keys above
2. `evidencePath` must point to an existing file with valid JSON
3. AWAITING_RESPONSE requirements must include mechanical evidence of: trigger → reply → resume → COMPLETE
4. Ambiguous expressions forbidden in completion reports: "必要なら", "たぶん", "かもしれない", "probably", "maybe", "might"
5. Final deliverables (procedures, reports, prompts) must be in code blocks
6. Non-code-block procedure presentation is forbidden

**Verification:**
- Gate: `npm run gate:spec` (SPEC-P0-COMPLETION rule)
- Spec: `docs/spec/P0_RUNTIME_GUARANTEE.md` (this file, this section)

---

## Gate Integration

### New Gates Required

```json
{
  "gate:logs-visible": "ts-node diagnostics/logs-visible.check.ts",
  "gate:auth-detection": "ts-node diagnostics/auth-detection.check.ts",
  "gate:timeout-real": "ts-node diagnostics/timeout-real.check.ts",
  "gate:blocked-scope": "ts-node diagnostics/blocked-scope.check.ts"
}
```

### gate:all Integration

All P0 gates must be included in `gate:all` and failure blocks completion.

---

## Evidence Requirements

Each P0 requirement must have:
1. Implementation code reference (file:line)
2. Unit test coverage
3. E2E test coverage
4. Gate diagnostic check
5. Documentation in docs/EVIDENCE.md

---

## Completion Criteria

P0 is complete when:
- [ ] All 5 P0 requirements implemented
- [ ] All P0 gates pass
- [ ] gate:all returns ALL PASS
- [ ] npm run build succeeds
- [ ] npm test shows 0 failing
- [ ] Playwright E2E shows 0 failing
- [ ] docs/EVIDENCE.md updated with P0 section
- [ ] README.md updated with P0 specifications

---

## Web UI Verification Procedures

### P0-1: Executor Logs Verification

**Procedure:**
1. Start server: `pm web --port 15678 --in-memory`
2. Submit task: `POST /api/tasks` with `{"task_group_id":"test","prompt":"hello","task_type":"READ_INFO"}`
3. Check logs: `GET /api/executor/logs/task/:taskId`
4. Verify SSE: `GET /api/executor/logs/stream`

**Expected Output:**
- Executor logs contain `system: Task started`, `stdout: <output>`, `system: Task completed successfully`
- SSE endpoint returns `event: connected` on subscribe
- Summary at `GET /api/executor/summary` shows correct counts

### P0-2: Auth/API Key Error Verification

**Procedure (Auth failure):**
1. Start server with fake CLI that returns auth error in PATH
2. Submit task via `POST /api/tasks`
3. Check: `GET /api/tasks/:taskId`

**Expected Output:**
- `status: "ERROR"` (never TIMEOUT)
- `error_message` contains "Preflight check failed: CLI not logged in"
- Recovery steps: `claude login`, `claude setup-token`, `set ANTHROPIC_API_KEY`
- `blocked_reason: "PREFLIGHT_AUTH_FAILED"`
- `terminated_by: "PREFLIGHT_FAIL_CLOSED"`

**Procedure (API key missing):**
1. Start server with fake CLI that returns "api key" error in PATH
2. Submit task via `POST /api/tasks`
3. Check: `GET /api/tasks/:taskId`

**Expected Output:**
- `status: "ERROR"` (never TIMEOUT)
- Same recovery steps as auth failure

### P0-3: Progress-Aware Timeout Verification

**Procedure:**
1. Start server with `SOFT_TIMEOUT_MS=10000` (10s soft timeout)
2. Submit a long-running READ_INFO task
3. Verify task exceeds soft timeout without termination

**Expected Output:**
- Task runs beyond 10s soft timeout
- Task completes with `status: "COMPLETE"`
- Server log shows silence warnings but NO termination
- Code architecture proof: `silenceLogHandle` (line 700) only logs, never kills process

**Design:** v3 timeout design abolishes `silence=timeout`. Only overall safety net (10 min) can terminate.

### P0-4: BLOCKED Status Scope Verification

**Procedure:**
- Only `DANGEROUS_OP` tasks can have BLOCKED status
- Verified by `canTaskTypeBeBlocked()` in AutoResolvingExecutor
- Gate check: `npm run gate:blocked-scope`

### P0-5: Web-Only Self-Update Verification

**Procedure:**
1. `GET /api/health` → note `build_sha` and `web_pid`
2. `POST /api/runner/build` → triggers rebuild
3. `POST /api/runner/restart` → triggers restart
4. `GET /api/health` → verify `build_sha` changed

### AWAITING_RESPONSE → Reply → Resume Flow

**Procedure:**
1. Submit READ_INFO task with prompt that triggers question output
2. Wait for task to reach `AWAITING_RESPONSE` (show_reply_ui: true)
3. Send reply: `POST /api/tasks/:id/reply` with `{"reply": "YES"}`
4. Verify: Reply accepted, status transitions AWAITING_RESPONSE → QUEUED
5. Poller re-claims task, re-executes with user reply in conversation history

**Expected Output:**
- Reply API returns `{"success": true, "old_status": "AWAITING_RESPONSE", "new_status": "QUEUED"}`
- Executor logs show 2 rounds: initial execution + re-execution after reply
- Task progresses with new output incorporating user's answer

---

## Error Format Reference

### Preflight Auth Failure
```json
{
  "status": "ERROR",
  "error_message": "Preflight check failed: CLI not logged in. ...\n\nRecovery steps:\n  - Run: claude login\n  - Or run: claude setup-token\n  - Or set ANTHROPIC_API_KEY environment variable",
  "blocked_reason": "PREFLIGHT_AUTH_FAILED",
  "terminated_by": "PREFLIGHT_FAIL_CLOSED"
}
```

### Preflight CLI Not Available
```json
{
  "status": "ERROR",
  "error_message": "Preflight check failed: CLI not available. Claude Code CLI not found at: claude",
  "blocked_reason": "PREFLIGHT_CLI_NOT_AVAILABLE",
  "terminated_by": "PREFLIGHT_FAIL_CLOSED"
}
```

### Recovery Commands
| Error | Recovery |
|-------|----------|
| CLI not logged in | `claude login` or `claude setup-token` |
| API key missing | `export ANTHROPIC_API_KEY=<key>` |
| CLI not found | Install Claude Code CLI |

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-09 | Initial P0 specification |
| 1.1.0 | 2026-02-10 | Added Web UI verification procedures, error formats, recovery commands, AWAITING_RESPONSE flow |
| 1.2.0 | 2026-02-10 | Added P0-6 Stale Notification Mixing, P0 Completion Declaration Rules (fail-closed format) |
