# Evidence: INCOMPLETE -> AWAITING_RESPONSE Fix

## Date
2026-02-05

## Summary
Fixed READ_INFO/REPORT tasks returning INCOMPLETE from executor being incorrectly converted to ERROR.
Now they transition to AWAITING_RESPONSE with output preserved.

## Problem
When the AutoResolvingExecutor returned INCOMPLETE status for READ_INFO/REPORT tasks in the Web Chat
path (`createTaskExecutor` in `src/cli/index.ts`), the code treated ALL non-COMPLETE/ERROR statuses
as ERROR (line 540-541). This meant:

1. READ_INFO tasks with partial output were marked ERROR and output was lost
2. Users saw ERROR status instead of being prompted for clarification
3. The test executor path had correct handling, but the real executor path did not

## Root Cause
`src/cli/index.ts` lines 534-542 (AutoResolvingExecutor path):
```typescript
} else {
  // INCOMPLETE, NO_EVIDENCE, BLOCKED -> treat as ERROR for queue purposes
  return { status: 'ERROR', errorMessage: `Task ended with status: ${result.status}` };
}
```
This catch-all converted INCOMPLETE to ERROR without checking task type.

## Fix (Minimal Diff)

### 1. `src/cli/index.ts` - AutoResolvingExecutor INCOMPLETE handling
Added task-type-aware INCOMPLETE handling:
- READ_INFO/REPORT + INCOMPLETE + output -> AWAITING_CLARIFICATION signal (with output preserved)
- READ_INFO/REPORT + INCOMPLETE + no output -> AWAITING_CLARIFICATION signal (with fallback output)
- IMPLEMENTATION + INCOMPLETE -> ERROR (strict, but output preserved)
- All other statuses -> ERROR (with output preserved)

### 2. `src/queue/queue-store.ts` - IQueueStore interface + QueueStore implementation
Added optional `output` parameter to `setAwaitingResponse()`:
```typescript
setAwaitingResponse(taskId: string, clarification: ClarificationRequest,
  conversationHistory?: ConversationEntry[], output?: string): Promise<StatusUpdateResult>;
```

### 3. `src/queue/in-memory-queue-store.ts` - InMemoryQueueStore
Added `output` parameter to `setAwaitingResponse()` and saves it to the task record.

### 4. `src/queue/queue-poller.ts` - QueuePoller
Updated AWAITING_CLARIFICATION handler to pass `result.output` to `setAwaitingResponse()`.

## Tests Added

### Unit Tests: `test/unit/queue/incomplete-awaiting-response.test.ts`
- `setAwaitingResponse with output`: Verifies output is saved
- `setAwaitingResponse without output`: Backward compatibility
- `QueuePoller AWAITING_CLARIFICATION with output`: Output preservation through poller
- `QueuePoller AWAITING_CLARIFICATION without output`: Fallback behavior
- `READ_INFO + INCOMPLETE + output -> AWAITING_CLARIFICATION with output`
- `READ_INFO + INCOMPLETE + no output -> AWAITING_CLARIFICATION with fallback`
- `IMPLEMENTATION + INCOMPLETE -> ERROR with output preserved`
- `REPORT + INCOMPLETE + output -> AWAITING_CLARIFICATION with output`

### E2E Tests: `test/e2e/incomplete-awaiting-response.e2e.test.ts`
- `AWAITING_RESPONSE with output via task detail API`
- `Fallback output for INCOMPLETE without output`
- `IMPLEMENTATION INCOMPLETE -> ERROR with output saved`
- `Task group listing preserves AWAITING_RESPONSE output`

## Gate:All Results
- **typecheck**: PASS
- **lint**: PASS (no new errors)
- **test**: PASS (1942 passing, 4 pending)
- **build**: PASS

## Files Changed
1. `src/cli/index.ts` - INCOMPLETE handling in AutoResolvingExecutor path
2. `src/queue/queue-store.ts` - IQueueStore interface + QueueStore.setAwaitingResponse
3. `src/queue/in-memory-queue-store.ts` - InMemoryQueueStore.setAwaitingResponse
4. `src/queue/queue-poller.ts` - Output preservation in AWAITING_CLARIFICATION handler
5. `test/unit/queue/incomplete-awaiting-response.test.ts` - 8 unit tests
6. `test/e2e/incomplete-awaiting-response.e2e.test.ts` - 4 E2E tests
7. `docs/EVIDENCE_INCOMPLETE_AWAITING_RESPONSE.md` - This file
