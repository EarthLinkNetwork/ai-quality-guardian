# 26_TASK_CHUNKING.md

# Task Chunking (Automatic Task Splitting)

本章は大きなタスクを自動的にサブタスクに分割し、並列/逐次実行する機能を定義する。

---

## 1. Overview

### 1.1 目的

- 大きなタスクを自動的に N 個のサブタスクに分割
- サブタスクを並列または逐次で別ワーカーに投入
- 全サブタスクが COMPLETE になるまで「完了」を返さない
- 個別サブタスクの失敗時に自動リトライ

### 1.2 設計原則

- **Atomic Completion**: 全サブタスク完了まで親タスクは COMPLETE にならない
- **Fail-Closed**: サブタスク分割が失敗した場合は単一タスクとして実行
- **Transparent Chunking**: ユーザーには元の 1 タスクとして見える
- **Auto-Retry**: サブタスク失敗時は設定された回数まで自動リトライ

---

## 2. Chunking Flow

### 2.1 基本フロー

```
User Input (Large Task)
    │
    v
┌─────────────────────────────────────────┐
│ Task Analysis (LLM Layer)               │
│   - Is this task decomposable?          │
│   - How many subtasks?                  │
│   - What are the dependencies?          │
└─────────────────────────────────────────┘
    │
    ├── Not decomposable → Execute as single task
    │
    v (decomposable)
┌─────────────────────────────────────────┐
│ Subtask Generation                      │
│   - Generate N subtask prompts          │
│   - Define execution order (parallel/seq)│
│   - Assign to workers                   │
└─────────────────────────────────────────┘
    │
    v
┌─────────────────────────────────────────┐
│ Subtask Execution                       │
│   - Execute each subtask (with Review   │
│     Loop if enabled)                    │
│   - Track progress                      │
│   - Handle failures (auto-retry)        │
└─────────────────────────────────────────┘
    │
    v
┌─────────────────────────────────────────┐
│ Aggregation                             │
│   - All subtasks COMPLETE?              │
│   - Aggregate results                   │
│   - Mark parent task as COMPLETE        │
└─────────────────────────────────────────┘
```

### 2.2 分割判定基準

LLM レイヤーが以下の観点でタスクを分析:

| Criterion              | Description                                    |
| ---------------------- | ---------------------------------------------- |
| Multiple files         | 複数ファイルの作成/変更を要求                  |
| Independent parts      | 独立して実行可能な部分が存在                   |
| Explicit enumeration   | 「A, B, C を実装」等の列挙がある               |
| Large scope            | 実装範囲が大きい（関数 5 つ以上等）            |

---

## 3. Data Models

### 3.1 ChunkedTask

```typescript
interface ChunkedTask {
  parent_task_id: string;         // 親タスク ID
  subtasks: SubtaskDefinition[];  // サブタスク定義リスト
  execution_mode: 'parallel' | 'sequential';
  aggregation_strategy: AggregationStrategy;
  status: ChunkedTaskStatus;
  started_at: string;             // ISO 8601
  ended_at?: string;              // ISO 8601
}

type ChunkedTaskStatus =
  | 'ANALYZING'      // 分割分析中
  | 'EXECUTING'      // サブタスク実行中
  | 'AGGREGATING'    // 結果集約中
  | 'COMPLETE'       // 全サブタスク完了
  | 'FAILED';        // 失敗（リトライ超過）

interface SubtaskDefinition {
  subtask_id: string;
  parent_task_id: string;
  prompt: string;                 // サブタスク用プロンプト
  dependencies: string[];         // 依存サブタスク ID リスト
  status: SubtaskStatus;
  retry_count: number;
  worker_id?: string;             // 割り当てワーカー
  result?: SubtaskResult;
}

type SubtaskStatus =
  | 'PENDING'        // 実行待ち
  | 'RUNNING'        // 実行中
  | 'COMPLETE'       // 完了
  | 'FAILED'         // 失敗
  | 'RETRYING';      // リトライ中

interface SubtaskResult {
  status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR';
  output_summary: string;
  files_modified: string[];
  review_loop_iterations?: number; // Review Loop を通過した場合
}
```

### 3.2 AggregationStrategy

```typescript
interface AggregationStrategy {
  type: 'merge_all' | 'last_wins' | 'custom';
  conflict_resolution?: 'fail' | 'overwrite' | 'manual';
}
```

---

## 4. Execution Modes

### 4.1 Parallel Execution

依存関係のないサブタスクを並列実行:

```
Parent Task
    │
    ├──► Subtask 1 ──► Worker A
    ├──► Subtask 2 ──► Worker B
    └──► Subtask 3 ──► Worker C
            │
            v (all complete)
       Aggregation
```

**使用条件:**
- サブタスク間に依存関係がない
- 複数ワーカーが利用可能

### 4.2 Sequential Execution

依存関係のあるサブタスクを逐次実行:

```
Parent Task
    │
    v
Subtask 1 ──► Worker A ──► Complete
    │
    v
Subtask 2 ──► Worker A ──► Complete
    │
    v
Subtask 3 ──► Worker A ──► Complete
    │
    v
Aggregation
```

**使用条件:**
- サブタスク間に依存関係がある
- 順序が重要（例: インターフェース定義 → 実装）

### 4.3 Hybrid Execution

一部並列、一部逐次:

```
Parent Task
    │
    ├──► [Subtask 1, 2] (parallel)
    │         │
    │         v (both complete)
    │
    └──► Subtask 3 (depends on 1, 2)
            │
            v
       Aggregation
```

---

## 5. Auto-Retry Strategy

### 5.1 設定

```typescript
interface RetryConfig {
  max_retries: number;            // サブタスク毎の最大リトライ回数（デフォルト: 2）
  retry_delay_ms: number;         // リトライ間の待機時間（デフォルト: 2000）
  backoff_multiplier: number;     // 遅延倍率（デフォルト: 1.5）
  retry_on: RetryCondition[];     // リトライ条件
}

type RetryCondition =
  | 'INCOMPLETE'    // タスク不完全
  | 'ERROR'         // エラー発生
  | 'TIMEOUT';      // タイムアウト
```

### 5.2 リトライフロー

```
Subtask Execution
    │
    ├── COMPLETE → Done
    │
    └── FAILED
          │
          ├── retry_count < max_retries?
          │     │
          │     ├── Yes → Wait (delay * backoff^retry_count) → Re-execute
          │     │
          │     └── No → Mark as FAILED
          │
          v
    Parent Task handles failure
```

### 5.3 部分失敗時の動作

一部のサブタスクが失敗した場合:

- `fail_fast: true` → 親タスク全体を FAILED
- `fail_fast: false` → 他のサブタスクは継続、最終結果は INCOMPLETE

---

## 6. Logging Requirements

### 6.1 必須ログイベント

| Event Type               | Visibility | Description                              |
| ------------------------ | ---------- | ---------------------------------------- |
| `CHUNKING_START`         | summary    | タスク分割開始                           |
| `CHUNKING_ANALYSIS`      | full       | 分割分析結果                             |
| `SUBTASK_CREATED`        | full       | サブタスク生成                           |
| `SUBTASK_START`          | summary    | サブタスク実行開始                       |
| `SUBTASK_COMPLETE`       | summary    | サブタスク完了                           |
| `SUBTASK_FAILED`         | summary    | サブタスク失敗                           |
| `SUBTASK_RETRY`          | summary    | サブタスクリトライ                       |
| `CHUNKING_AGGREGATION`   | full       | 結果集約                                 |
| `CHUNKING_COMPLETE`      | summary    | タスク分割完了（全サブタスク完了）       |

### 6.2 イベント構造例

```json
{
  "event_type": "CHUNKING_START",
  "timestamp": "2025-01-23T10:00:00.000Z",
  "visibility": "summary",
  "content": {
    "parent_task_id": "task-001",
    "original_prompt": "Create user authentication module with login, logout, and session management",
    "analysis_started": true
  }
}
```

```json
{
  "event_type": "SUBTASK_CREATED",
  "timestamp": "2025-01-23T10:00:05.000Z",
  "visibility": "full",
  "content": {
    "parent_task_id": "task-001",
    "subtask_id": "task-001-sub-1",
    "prompt": "Implement login function with email/password authentication",
    "dependencies": [],
    "execution_order": 1
  }
}
```

```json
{
  "event_type": "CHUNKING_COMPLETE",
  "timestamp": "2025-01-23T10:05:00.000Z",
  "visibility": "summary",
  "content": {
    "parent_task_id": "task-001",
    "total_subtasks": 3,
    "completed_subtasks": 3,
    "failed_subtasks": 0,
    "total_retries": 1,
    "total_duration_ms": 300000
  }
}
```

---

## 7. Integration with Review Loop

### 7.1 サブタスク毎の Review Loop

各サブタスクは個別に Review Loop を通過:

```
Subtask
    │
    v
Review Loop (PASS/REJECT/RETRY)
    │
    ├── PASS → Subtask COMPLETE
    │
    ├── REJECT → Re-execute subtask (with modification)
    │
    └── RETRY → Re-execute subtask (same prompt)
```

### 7.2 Review Loop + Retry の相互作用

- Review Loop の max_iterations は サブタスク毎に適用
- サブタスクの Retry は Review Loop 全体をやり直す
- 総イテレーション数 = Review Loop iterations × Retry count

---

## 8. Queue Store Integration

### 8.1 サブタスクの Queue 登録

サブタスクは個別の QueueItem として登録:

```typescript
interface ChunkedQueueItem extends QueueItem {
  parent_task_id: string;         // 親タスク ID
  subtask_index: number;          // サブタスク番号
  total_subtasks: number;         // 総サブタスク数
  is_subtask: true;
}
```

### 8.2 親タスクの状態管理

親タスクの QueueItem は:

- status: `RUNNING` (サブタスク実行中)
- chunked_task_ref: ChunkedTask へのポインタ

サブタスク全完了後:

- status: `COMPLETE` (全サブタスク完了)
- status: `ERROR` (サブタスク失敗、リトライ超過)

---

## 9. Web UI Display

### 9.1 親タスク表示

```
Task: task-001 [RUNNING - Chunked 2/3]
  ├── Subtask 1: Complete
  ├── Subtask 2: Running (iteration 2)
  └── Subtask 3: Pending
```

### 9.2 進捗表示

- 全体進捗: 完了サブタスク数 / 総サブタスク数
- 各サブタスクの状態
- リトライ履歴

---

## 10. Configuration

### 10.1 設定ファイル

```json
// .claude/task-chunking.json
{
  "enabled": true,
  "auto_detect": true,
  "min_subtasks": 2,
  "max_subtasks": 10,
  "execution_mode": "auto",
  "retry": {
    "max_retries": 2,
    "retry_delay_ms": 2000,
    "backoff_multiplier": 1.5,
    "retry_on": ["INCOMPLETE", "ERROR", "TIMEOUT"]
  },
  "fail_fast": false,
  "review_loop_per_subtask": true
}
```

### 10.2 実行モード自動判定

`execution_mode: "auto"` の場合:

- 依存関係なし → parallel
- 依存関係あり → sequential/hybrid
- ワーカー数 1 → sequential

---

## 11. Error Handling

### 11.1 分割失敗時

タスク分割が失敗した場合:

- 警告ログを出力
- 単一タスクとして実行を継続
- `chunking_skipped: true` をログに記録

### 11.2 部分完了時

一部サブタスクが失敗した場合:

- 完了したサブタスクの結果は保持
- 失敗したサブタスクのリトライ履歴を保存
- 親タスクは `INCOMPLETE` または `ERROR`

---

## 12. Cross-References

- spec/25_REVIEW_LOOP.md (サブタスクでの Review Loop)
- spec/13_LOGGING_AND_OBSERVABILITY.md (ログイベント)
- spec/20_QUEUE_STORE.md (Queue 統合)
- spec/19_WEB_UI.md (進捗表示)
- spec/05_DATA_MODELS.md (Task モデル拡張)
