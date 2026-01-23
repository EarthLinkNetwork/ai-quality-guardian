# Review Loop + Task Chunking 実機証跡

## 概要

このドキュメントは pm-orchestrator-runner の Review Loop および Task Chunking 機能の動作証跡を記録します。

- **作成日**: 2026-01-23
- **テスト実行環境**: Node.js + Mocha

## テスト結果サマリー

### Review Loop テスト: 63件 全てPASS

```
Review Loop: Quality Judgment
  ✔ should PASS when all quality criteria met
  ✔ should REJECT when omission markers detected (Q3)
  ✔ should REJECT when TODO/FIXME detected (Q2)
  ✔ should REJECT when early termination detected (Q6)
  ✔ should escalate when max_iterations reached
  ✔ should emit correct events throughout review cycle

Review Loop - Q1: Files Verified
  ✔ should PASS when verified files exist on disk
  ✔ should FAIL when unverified files exist
  ✔ should FAIL when files_modified but none verified
  ✔ should PASS when no files expected or modified

Review Loop - Q2: No TODO/FIXME Left
  ✔ should PASS when no TODO markers in output
  ✔ should FAIL when TODO marker found in output
  ✔ should FAIL when FIXME marker found in output
  ✔ should FAIL when TBD marker found
  ✔ should detect TODO in verified file content preview

Review Loop - Q3: No Omission Markers
  ✔ should PASS when no omission markers present
  ✔ should FAIL when // 残り省略 found
  ✔ should FAIL when // etc. found
  ✔ should FAIL when // 以下同様 found
  ✔ should FAIL when ... omission found in code
  ✔ should detect omission in verified file content preview

Review Loop - Q4: No Incomplete Syntax
  ✔ should PASS when syntax is complete
  ✔ should FAIL when braces are unmatched
  ✔ should FAIL when brackets are unmatched
  ✔ should FAIL when parentheses are unmatched
  ✔ should detect truncated output

Review Loop - Q5: Evidence Present
  ✔ should PASS when verified files exist
  ✔ should PASS with successful execution and modified files
  ✔ should FAIL when status is NO_EVIDENCE
  ✔ should FAIL when no verified evidence

Review Loop - Q6: No Early Termination
  ✔ should PASS when no termination phrases and no evidence required
  ✔ should PASS when termination phrase found but evidence exists
  ✔ should FAIL when 完了しました without evidence
  ✔ should FAIL when これで完了です without evidence
  ✔ should FAIL when 以上です without evidence
```

### Task Chunking テスト: 56件 全てPASS

```
Task Chunking: Decomposition and Retry
  ✔ should analyze task and detect decomposable patterns
  ✔ should execute non-decomposable task directly
  ✔ should decompose task into subtasks and execute
  ✔ should retry failed subtask with exponential backoff
  ✔ should fail after max retries exceeded
  ✔ should support fail-fast mode for parallel execution

Task Chunking Module
  analyzeTaskForChunking
    ✔ should identify non-decomposable simple tasks
    ✔ should identify decomposable tasks with numbered list
    ✔ should identify decomposable tasks with bullet points
    ✔ should respect max_subtasks limit
    ✔ should respect min_subtasks threshold
    ✔ should detect dependencies for sequential execution
    ✔ should default to parallel for independent tasks
```

### 統合シナリオテスト: 5件 全てPASS

```
Integration Scenarios: Review Loop + Task Chunking
  ✔ Scenario 1: Decompose task, each subtask passes Review Loop
  ✔ Scenario 2: Subtask fails Review Loop, triggers retry
  ✔ Scenario 3: Parallel subtasks with independent Review Loops
  ✔ Scenario 4: Sequential execution with dependencies
  ✔ Scenario 5: Max iterations reached, escalate to user
```

## イベントフロー

### Review Loop イベント順序

```
1. REVIEW_LOOP_START      - レビューループ開始
2. REVIEW_ITERATION_START - イテレーション開始
3. (実行)                 - Executor 実行
4. QUALITY_JUDGMENT       - 品質判定 (PASS/REJECT/RETRY)
5. REVIEW_ITERATION_END   - イテレーション終了
6. [REJECT時のみ]
   - REJECTION_DETAILS    - 拒否理由の詳細
   - MODIFICATION_PROMPT  - 修正プロンプト生成
   - (2-5 を max_iterations まで繰り返し)
7. REVIEW_LOOP_END        - レビューループ終了
```

### Task Chunking イベント順序

```
1. CHUNKING_START         - チャンキング開始
2. [分割可能な場合]
   - SUBTASK_CREATED      - サブタスク生成 (各サブタスクに対して)
   - SUBTASK_START        - サブタスク実行開始
   - (サブタスク実行)
   - SUBTASK_COMPLETE     - サブタスク実行完了
   - [失敗時] SUBTASK_RETRY - リトライ発生
3. CHUNKING_COMPLETE      - チャンキング完了
```

### 統合フロー: Review Loop + Task Chunking

```
タスク投入
  │
  ▼
CHUNKING_START
  │
  ├── [分割可能]
  │   │
  │   ▼
  │   SUBTASK_CREATED × N
  │   │
  │   ▼ (各サブタスクに対して)
  │   SUBTASK_START
  │   │
  │   ├── REVIEW_LOOP_START
  │   │   │
  │   │   ├── REVIEW_ITERATION_START
  │   │   │   │
  │   │   │   ▼
  │   │   │   QUALITY_JUDGMENT → PASS → REVIEW_ITERATION_END
  │   │   │                    → REJECT → MODIFICATION_PROMPT → 次イテレーション
  │   │   │                    → RETRY → 次イテレーション
  │   │   │
  │   │   ▼
  │   │   REVIEW_LOOP_END
  │   │
  │   ▼
  │   SUBTASK_COMPLETE (or SUBTASK_RETRY → 再実行)
  │
  └── [分割不可]
      │
      ▼
      直接実行
  │
  ▼
CHUNKING_COMPLETE
```

## 品質判定基準 (Q1-Q6)

| 基準 | 内容 | PASSの条件 |
|------|------|-----------|
| Q1 | Files Verified | verified_files に存在するファイルがディスク上に実在 |
| Q2 | No TODO/FIXME Left | 出力に TODO/FIXME/TBD が含まれない |
| Q3 | No Omission Markers | `...`, `// 残り省略`, `// etc.`, `// 以下同様` がない |
| Q4 | No Incomplete Syntax | 括弧の対応が取れている（構文が完全） |
| Q5 | Evidence Present | verified_files または files_modified に証跡がある |
| Q6 | No Early Termination | 「完了しました」等の宣言がある場合は証跡も必要 |

## リトライ条件

Task Chunking の RetryCondition:

| 条件 | 説明 |
|------|------|
| `INCOMPLETE` | タスク未完了 |
| `ERROR` | エラー発生 |
| `TIMEOUT` | タイムアウト |

## コマンドによる証跡再現

```bash
# Review Loop テストの実行
pnpm test -- --grep "Review Loop"

# Task Chunking テストの実行
pnpm test -- --grep "Task Chunking"

# 統合シナリオテストの実行
pnpm test -- --grep "Integration Scenarios"

# 全てのイベントフローテスト
pnpm test -- --grep "Event Emission"
```

## ファイル参照

- 統合テスト: `test/integration/review-loop-chunking-full-flow.test.ts`
- Review Loop 実装: `src/review-loop/review-loop.ts`
- Task Chunking 実装: `src/task-chunking/task-chunking.ts`
