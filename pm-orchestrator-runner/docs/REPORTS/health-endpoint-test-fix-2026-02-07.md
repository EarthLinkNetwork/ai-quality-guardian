# /api/health Endpoint Test Fix Report

**Date:** 2026-02-07
**Issue:** 2 failing tests causing inconsistency between `npm test` and `npm run gate:all`

## Problem

Two tests were failing with 500 status instead of expected 200:

1. `test/acceptance/ac-6-web-ui.test.ts:416` - ヘルスチェックが動作する
2. `test/unit/web/web-server.test.ts:458` - should return health status

## Root Cause Analysis

### Issue 1: Missing `getEndpoint()` method in MockQueueStore

The `/api/health` endpoint calls `queueStore.getEndpoint()`, but the MockQueueStore implementations in both test files did not have this method, causing a runtime error and 500 response.

**src/web/server.ts:635-647:**
```typescript
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    namespace,
    queue_store: {
      type: queueStoreType || 'unknown',
      endpoint: queueStore.getEndpoint(),  // <-- Missing in MockQueueStore
      table_name: queueStore.getTableName(),
    },
    project_root: projectRoot,
  });
});
```

### Issue 2: Mismatched response structure in acceptance test

The acceptance test expected `table_name` at root level, but the actual response structure nests it inside `queue_store`.

## Fixes Applied

### Fix 1: Add `getEndpoint()` to MockQueueStore in acceptance test

**File:** `test/acceptance/ac-6-web-ui.test.ts`
```typescript
getEndpoint(): string {
  return 'mock://test';
}
```

### Fix 2: Add `getEndpoint()` and `getNamespace()` to MockQueueStore in unit test

**File:** `test/unit/web/web-server.test.ts`
```typescript
getEndpoint(): string {
  return 'mock://test';
}

getNamespace(): string {
  return 'test-namespace';
}
```

### Fix 3: Update test expectation to match actual response structure

**File:** `test/acceptance/ac-6-web-ui.test.ts`

Before:
```typescript
const data = response.data as {
  status: string;
  namespace: string;
  table_name: string;  // Wrong: at root level
};
assert.strictEqual(data.table_name, 'pm-runner-queue');
```

After:
```typescript
const data = response.data as {
  status: string;
  timestamp: string;
  namespace: string;
  queue_store: {
    type: string;
    endpoint: string;
    table_name: string;  // Correct: nested in queue_store
  };
};
assert.strictEqual(data.queue_store.table_name, 'pm-runner-queue');
```

## Verification Evidence

### Before Fix
```
2801 passing
2 failing
```

### After Fix
```
2803 passing (4m)
102 pending
0 failing
```

### gate:all Result
```
[PASS] T1-A: Server started with test executor mode
[PASS] T2-A: Chat request succeeds (HTTP level)
[PASS] T3-A: Task status is NOT ERROR
[PASS] T3-B: Task status is AWAITING_RESPONSE (clarification needed)
[PASS] T3-C: Task type is READ_INFO or REPORT
[PASS] BONUS: INCOMPLETE with output → NOT ERROR

Overall: ALL PASS
```

## Summary

| Metric | Before | After |
|--------|--------|-------|
| npm test passing | 2801 | 2803 |
| npm test failing | 2 | 0 |
| gate:all | ALL PASS | ALL PASS |

**Consistency achieved:** Both `npm test` and `npm run gate:all` now report 0 failing tests.
