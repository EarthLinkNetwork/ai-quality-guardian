# Root Cause Analysis: READ_INFO/REPORT Tasks Showing ERROR Status

**Date:** 2026-02-06
**Severity:** High
**Status:** RESOLVED

## Summary

READ_INFO/REPORT tasks submitted via Web Chat with output produced by the executor
were shown as ERROR in the UI instead of COMPLETE. This occurred when the executor
returned NO_EVIDENCE or BLOCKED status, which are legitimate outcomes for READ_INFO
tasks (where text output is the deliverable, not file modifications).

## Timeline

| Date | Commit | Fix | Gap Remaining |
|------|--------|-----|---------------|
| 2026-02-05 | 6480a60 | INCOMPLETE + READ_INFO + output -> AWAITING_RESPONSE | NO_EVIDENCE, BLOCKED paths unfixed |
| 2026-02-05 | 6324cce | READ_INFO/REPORT COMPLETE based on output presence | createTaskExecutor else branch unfixed |
| 2026-02-06 | (this fix) | Unified handling for all non-COMPLETE/non-ERROR statuses | None |

## Root Cause

### Location
`src/cli/index.ts`, function `createTaskExecutor()`, lines 450-576.

### The Bug

The status mapping in `createTaskExecutor` used an if/else chain:

```
if (status === 'COMPLETE')     -> COMPLETE
else if (status === 'ERROR')   -> ERROR
else if (status === 'INCOMPLETE') -> check READ_INFO/REPORT -> COMPLETE or AWAITING_RESPONSE
else                           -> ERROR  <-- BUG: no READ_INFO/REPORT check
```

The `else` branch handled `NO_EVIDENCE` and `BLOCKED` statuses. These statuses are
produced by `ClaudeCodeExecutor` in legitimate scenarios:

- **NO_EVIDENCE**: Executor ran successfully, produced text output, but evidence file
  creation failed (e.g., disk issues, path resolution failure).
- **BLOCKED**: Executor was blocked by an external constraint (e.g., rate limiting).

For READ_INFO/REPORT tasks, these statuses should NOT result in ERROR because:
- READ_INFO deliverable is text output, not file evidence
- If output exists, the task succeeded
- If no output exists, the task needs clarification (AWAITING_RESPONSE)

### Why Previous Fixes Missed This

1. **Commit 6480a60**: Fixed the `INCOMPLETE` branch only. Added READ_INFO/REPORT
   check inside the `INCOMPLETE` handler. Did not touch the `else` branch.

2. **Commit 6324cce**: Fixed `AutoResolvingExecutor` to return COMPLETE for
   READ_INFO/REPORT when output exists. But if AutoResolvingExecutor itself returns
   NO_EVIDENCE (which can happen when evidence file creation fails after the
   READ_INFO check), `createTaskExecutor` still routes to the `else` branch.

3. **Two-layer problem**: The fix in AutoResolvingExecutor catches most cases, but
   the fallthrough in `createTaskExecutor` is the safety net that was missing.

## Fix

Restructured the if/else chain to check `isReadInfoOrReport` as a primary branch:

```
if (status === 'COMPLETE')          -> COMPLETE
else if (status === 'ERROR')        -> ERROR
else if (isReadInfoOrReport)        -> Unified: INCOMPLETE/NO_EVIDENCE/BLOCKED
  -> has output?                    -> COMPLETE
  -> no output?                     -> AWAITING_RESPONSE
else (IMPLEMENTATION, etc.)         -> ERROR (with output preserved)
```

This was applied to both code paths:
1. **Test executor path** (lines 485-507): Used when PM_TEST_EXECUTOR_MODE is set
2. **Production path** (lines 538-569): Used with AutoResolvingExecutor

## Verification

### E2E Tests Added

File: `test/e2e/no-evidence-read-info-complete.e2e.test.ts` (8 test cases)

| Test Case | Executor Status | Task Type | Output | Expected Result |
|-----------|----------------|-----------|--------|-----------------|
| 1 | NO_EVIDENCE | READ_INFO | Yes | COMPLETE |
| 2 | NO_EVIDENCE | READ_INFO | No | AWAITING_RESPONSE |
| 3 | BLOCKED | READ_INFO | Yes | COMPLETE |
| 4 | INCOMPLETE | READ_INFO | Yes | COMPLETE |
| 5 | NO_EVIDENCE | REPORT | Yes | COMPLETE |
| 6 | NO_EVIDENCE | IMPLEMENTATION | Yes | ERROR (correct) |
| 7 | Full flow: POST -> status | READ_INFO | Yes | COMPLETE |
| 8 | Full flow: POST -> status | READ_INFO | No | AWAITING_RESPONSE |

### Gate Results

```
TypeScript:   PASS (0 errors)
Build:        SUCCESS
New E2E:      8/8 PASS
Related E2E:  35/35 PASS
Full suite:   2631/2631 PASS
Lint:         0 new errors
```

## Lesson Learned

When fixing status mapping logic, all possible status values must be checked
against all task types. An if/else chain with a catch-all `else` branch is
dangerous because new status values or task type logic can be silently ignored.
The fix establishes a pattern where task type is checked as a primary discriminant
before individual status codes, ensuring no status falls through without
READ_INFO/REPORT consideration.

## Files Modified

| File | Change |
|------|--------|
| `src/cli/index.ts` | Restructured createTaskExecutor status handling |
| `test/e2e/no-evidence-read-info-complete.e2e.test.ts` | New: 8 regression tests |
| `docs/EVIDENCE.md` | Updated with gate results |
| `docs/REPORTS/2026-02-06_incomplete-error-rootcause.md` | This report |
