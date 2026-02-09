# Web Development Runtime Specification

Version: 1.0.0
Last Updated: 2026-02-06

## Overview

This document defines the acceptance criteria for the Web-first development runtime system.
The primary goal is: **Users never debug - all testing, verification, and fixes are fully automated by AI**.

## Definitions

- **Web-only development**: Users interact exclusively through the Web UI
- **Auto-dev loop**: AI automatically implements, tests, fixes, and re-tests until success
- **AI Judge**: Evaluates test results dynamically without fixed expected values

---

## Acceptance Criteria

### Core Principles

#### AC-CORE-1: Web-Driven Auto-Dev Loop
Implementation instructions submitted via Web must trigger an automatic loop:
1. Implement
2. Test
3. Fix (if failed)
4. Re-test
5. Repeat until success or max iterations

**Pass Condition**: No human intervention required from instruction to completion.

#### AC-CORE-2: No User Debugging
- Users MUST NOT debug, verify, or manually test anything
- All testing, verification, and fixes are AI-automated
- Any task requiring user debugging is a BUG

---

### Chat Thread Behavior

#### AC-CHAT-1: Thread = TaskGroup Invariant
- 1 thread = 1 `taskGroupId` (fixed)
- Consecutive posts within a thread ADD tasks to the same `taskGroupId`
- New posts MUST NOT create new `taskGroupId` within the same thread

#### AC-CHAT-2: AWAITING_RESPONSE for Questions
- Output containing questions MUST have status `AWAITING_RESPONSE`
- `COMPLETE` status is FORBIDDEN if questions are present
- Detection: regex patterns for `?`, `ですか`, `ましょうか`, etc.

#### AC-CHAT-3: Reply UI for AWAITING_RESPONSE
- Task detail page MUST show a Reply textarea when `status === 'AWAITING_RESPONSE'`
- Textarea MUST support multiple lines
- Submit button MUST be visible and functional

---

### Input Behavior

#### AC-INPUT-1: Textarea Specifications
- Component: `<textarea>`
- Enter key: Submit message
- Shift+Enter: Insert newline
- Multi-line content MUST be preserved on submission

---

### Auto-Test Engine

#### AC-AUTO-TEST-1: Pre-Completion Test Requirement
- Implementation tasks MUST run AI auto-E2E before marking COMPLETE
- Test execution is mandatory, not optional

#### AC-AUTO-TEST-2: Fail = No Complete
- E2E test failure PROHIBITS COMPLETE status
- System MUST automatically enter fix loop
- Max iterations: 5 (configurable)

#### AC-AUTO-TEST-3: Sandbox Isolation
- All tests MUST run in isolated sandbox
- Allowed directories:
  - `/tmp/ai-test-sandbox/`
  - `testsandbox/`
- Modification to main project files is FORBIDDEN during testing

#### AC-AUTO-TEST-4: AI Judge Dynamic Evaluation
- Fixed expected values are FORBIDDEN
- AI Judge evaluates responses dynamically
- Score threshold: configurable (default: 0.72)
- Pass condition: `score >= passThreshold`

---

## API Specifications

### POST /api/tasks (existing)
Enqueue a new task to a thread.

### POST /api/reply
Reply to an AWAITING_RESPONSE task.

Request:
```json
{
  "task_id": "string",
  "reply": "string"
}
```

Response:
```json
{
  "success": true,
  "task_id": "string",
  "new_status": "RUNNING"
}
```

### GET /api/tasks/:task_id
Returns task detail including reply UI requirements.

Response includes:
```json
{
  "status": "AWAITING_RESPONSE",
  "show_reply_ui": true,
  "output": "..."
}
```

---

## Test Specifications

### E2E Test Files

1. `test/e2e/web-autodev-loop.e2e.test.ts`
   - Submit implementation instruction
   - Verify auto-test triggers
   - Verify auto-fix on failure
   - Verify completion without human intervention

2. `test/e2e/chat-thread.e2e.test.ts`
   - Consecutive posts in same thread
   - Verify taskGroupId remains constant
   - Verify task count increases

3. `test/e2e/reply-ui.e2e.test.ts`
   - Generate AWAITING_RESPONSE task
   - Verify textarea exists
   - Submit reply
   - Verify status transitions to COMPLETE

---

## Configuration

### config/ai-test-config.json
```json
{
  "passThreshold": 0.72,
  "strictMode": false,
  "maxAutoFixIterations": 5,
  "sandboxDir": "testsandbox",
  "enableAutoE2E": true
}
```

---

## Evidence Requirements

Upon completion, the following evidence MUST be provided:

1. `docs/EVIDENCE.md` - Summary proof
2. `docs/REPORTS/auto-dev-proof.md` - Detailed logs

Evidence must demonstrate:
- User submitted instruction via Web only
- AI automatically implemented, tested, fixed, and completed
- No human debugging occurred

---

## Completion Criteria

A task is COMPLETE only when ALL of the following are true:

1. All E2E tests PASS
2. `npm run gate:all` PASS
3. AI auto-tests PASS
4. No human debugging required
5. All functionality accessible via Web UI

If ANY criterion is unmet, status MUST remain INCOMPLETE or ERROR.
