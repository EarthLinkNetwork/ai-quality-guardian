# REPORT: Web UI INCOMPLETE -> ERROR Runtime Bug Fix

## Problem Statement

Web UI で「矛盾検知テスト」を送信すると、タスクが ERROR (message: "Task ended with status: INCOMPLETE") になる。git log 上は INCOMPLETE->AWAITING_RESPONSE 修正が入っており、ユニットテストも PASS だが、実際の Web 実行パスでは ERROR が発生していた。

## Root Cause Analysis

### Step 1: ERROR 発生箇所の特定

`src/cli/index.ts` line 566 が ERROR を生成していた:

```typescript
// IMPLEMENTATION INCOMPLETE -> ERROR, but preserve output if present
return {
  status: 'ERROR',
  errorMessage: `Task ended with status: ${result.status}`,
  output: cleanOutput || undefined,
};
```

このコードは正しい動作 (IMPLEMENTATION の INCOMPLETE は ERROR にすべき)。問題はタスクが誤って IMPLEMENTATION に分類されていたこと。

### Step 2: dist/src 不整合

dist と src は同期しており、不整合は原因ではなかった。

### Step 3: task_type 伝搬の問題 (根本原因)

**2つの問題が同時に存在していた:**

1. **`detectTaskType("矛盾検知テスト")` が IMPLEMENTATION を返していた**
   - `src/utils/task-type-detector.ts` のデフォルトフォールスルーが `return 'IMPLEMENTATION'` (line 73)
   - カタカナ「テスト」は英語 `test` にマッチしない (Unicode vs ASCII)
   - 日本語 READ_INFO パターンが先頭一致 (`^`) のみで、文中の「検知」「テスト」等にマッチしない
   - 結果: どのパターンにもマッチせず、デフォルトの IMPLEMENTATION にフォールスルー

2. **`POST /api/tasks` と `POST /api/task-groups` が task_type を enqueue に渡していなかった**
   - `server.ts` line 432: `queueStore.enqueue(sessionId, task_group_id, prompt)` -- task_type 引数なし
   - chat ルートのみ `detectTaskType` を呼んでいた
   - task_type が未設定の場合、`createTaskExecutor` で `item.task_type || 'READ_INFO'` にフォールバックする
   - しかし chat ルート経由では detectTaskType の結果が使われるため、IMPLEMENTATION に分類された

### 実行フロー (バグ発生時)

```
POST /api/projects/:id/chat
  -> detectTaskType("矛盾検知テスト") -> "IMPLEMENTATION"
  -> enqueue(sessionId, taskGroupId, prompt, taskRunId, "IMPLEMENTATION")
  -> QueuePoller claims task
  -> createTaskExecutor runs
  -> AutoResolvingExecutor returns INCOMPLETE
  -> item.task_type = "IMPLEMENTATION"
  -> IMPLEMENTATION INCOMPLETE path -> ERROR("Task ended with status: INCOMPLETE")
```

## Fix Applied

### 1. `src/utils/task-type-detector.ts` - Japanese pattern improvement

- 日本語 READ_INFO パターンを先頭一致から文中マッチに拡張
- 「検知」「検証」「テスト」「分析」「解析」「診断」「点検」等の検査/分析系キーワードを READ_INFO パターンに追加
- デフォルトフォールスルーを `IMPLEMENTATION` から `READ_INFO` に変更
  - 理由: READ_INFO INCOMPLETE -> AWAITING_RESPONSE (ユーザーが明確化できる) vs IMPLEMENTATION INCOMPLETE -> ERROR (タスク出力が失われる)
- IMPLEMENTATION パターンにワード境界 (`\b`) を追加して英語ワードの誤マッチを防止
- 日本語の明確な変更意図パターン（「修正して」「追加して」等）を追加

### 2. `src/web/server.ts` - task_type propagation

- `POST /api/tasks` と `POST /api/task-groups` の enqueue 呼び出しに `detectTaskType(prompt)` を追加
- 全ての Web API パスで task_type が正しく設定されるようになった

### 3. テスト追加

- `test/unit/utils/task-type-detector.test.ts`: 日本語分類テスト 29 cases
- `test/e2e/web-task-type-propagation.e2e.test.ts`: Web API task_type 伝搬 E2E テスト 23 cases

## Changed Files

| File | Change |
|------|--------|
| `src/utils/task-type-detector.ts` | Japanese patterns, safer default |
| `src/web/server.ts` | task_type propagation for /api/tasks and /api/task-groups |
| `test/unit/utils/task-type-detector.test.ts` | 29 test cases for Japanese classification |
| `test/e2e/web-task-type-propagation.e2e.test.ts` | 23 E2E test cases for Web propagation |

## Evidence

- TypeScript type check: PASS (0 errors)
- Unit tests: 29/29 PASS
- E2E tests: 23/23 PASS
- Full test suite: 2623/2623 PASS (96 pending)
- Lint (changed files only): 0 errors
- Build: SUCCESS
- dist verification: `detectTaskType("矛盾検知テスト")` returns `"READ_INFO"` in dist
