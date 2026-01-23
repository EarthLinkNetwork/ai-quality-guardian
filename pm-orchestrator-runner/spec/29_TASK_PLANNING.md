# 29_TASK_PLANNING.md

# Task Planning (Size Estimation and Chunking Decision)

本章はタスク受付時のサイズ見積もり・分割判断・依存関係分析を定義する。

---

## 1. Overview

### 1.1 目的

- ユーザー入力を受け取った時点でタスクサイズを見積もる
- 大きなタスクを自動的にサブタスクに分割するかを判断
- サブタスク間の依存関係を分析し、並列/逐次実行を決定
- 分割決定と依存関係を Conversation Trace に記録

### 1.2 設計原則

- **Early Decision**: タスク実行前に分割判断を完了
- **Transparent Planning**: 分割判断の理由を明示的に記録
- **Dependency-Aware**: 依存関係を考慮した実行順序決定
- **Fail-Closed**: 分析失敗時は単一タスクとして実行

### 1.3 他仕様との関係

- **spec/26_TASK_CHUNKING.md**: サブタスク実行・集約を担当（本仕様は分割判断まで）
- **spec/25_REVIEW_LOOP.md**: 各サブタスクの品質検証を担当
- **spec/28_CONVERSATION_TRACE.md**: PLANNING イベントの記録先

---

## 2. Task Planning Flow

### 2.1 基本フロー

```
User Input
    │
    v
┌─────────────────────────────────────────┐
│ PHASE: PLANNING                         │
│                                         │
│  1. Size Estimation (サイズ見積もり)    │
│     - Token count estimation            │
│     - File count estimation             │
│     - Complexity scoring                │
│                                         │
│  2. Chunking Decision (分割判断)        │
│     - Should this task be chunked?      │
│     - How many subtasks?                │
│                                         │
│  3. Dependency Analysis (依存関係分析)  │
│     - Which subtasks depend on which?   │
│     - Parallel groups identification    │
│                                         │
│  4. Execution Plan (実行計画)           │
│     - Parallel/Sequential decision      │
│     - Worker assignment strategy        │
│                                         │
└─────────────────────────────────────────┘
    │
    ├── Chunking = NO  → Execute as single task
    │
    └── Chunking = YES → Pass to Task Chunking (spec/26)
```

### 2.2 Planning Phase の位置づけ

```
User Input
    │
    v
[PLANNING Phase] ← 本仕様
    │
    ├── Single Task → [Review Loop] → Complete
    │
    └── Chunked → [Task Chunking] → [Review Loop per Subtask] → Aggregate → Complete
```

---

## 3. Size Estimation

### 3.1 見積もり要素

| Factor                | Weight | Description                                    |
| --------------------- | ------ | ---------------------------------------------- |
| `estimated_tokens`    | 0.3    | 出力予想トークン数（LLM推定）                  |
| `file_count`          | 0.3    | 作成/変更予想ファイル数                        |
| `complexity_score`    | 0.2    | タスク複雑度スコア (1-10)                      |
| `dependency_depth`    | 0.2    | 依存関係の深さ                                 |

### 3.2 Size Categories

| Category   | Score Range | Estimated Duration | Chunking Decision |
| ---------- | ----------- | ------------------ | ----------------- |
| `XS`       | 0-20        | < 1 min            | Never chunk       |
| `S`        | 21-40       | 1-5 min            | Rarely chunk      |
| `M`        | 41-60       | 5-15 min           | Consider chunk    |
| `L`        | 61-80       | 15-30 min          | Usually chunk     |
| `XL`       | 81-100      | > 30 min           | Always chunk      |

### 3.3 Size Estimation Data Model

```typescript
interface SizeEstimation {
  task_id: string;
  estimated_at: string;              // ISO 8601

  // Raw estimates
  estimated_tokens: number;          // 予想出力トークン数
  estimated_file_count: number;      // 予想ファイル数
  complexity_score: number;          // 1-10
  dependency_depth: number;          // 0-N (依存関係の深さ)

  // Calculated score
  total_score: number;               // 0-100
  size_category: SizeCategory;       // XS/S/M/L/XL

  // LLM analysis
  llm_reasoning: string;             // LLM の判断理由
  confidence: number;                // 0.0-1.0 (見積もり信頼度)
}

type SizeCategory = 'XS' | 'S' | 'M' | 'L' | 'XL';
```

### 3.4 見積もりプロンプト

LLM Layer が以下のプロンプトでサイズを見積もる:

```markdown
## Task Size Estimation

以下のタスクのサイズを見積もってください。

### タスク
{{user_input}}

### 見積もり項目

1. **予想出力トークン数**: このタスクを完了するために必要なコード/テキストの量
2. **予想ファイル数**: 作成または変更が必要なファイルの数
3. **複雑度スコア (1-10)**: タスクの技術的複雑さ
   - 1-3: 単純（単一関数、設定変更等）
   - 4-6: 中程度（複数関数、インターフェース定義等）
   - 7-10: 複雑（アーキテクチャ変更、複数コンポーネント連携等）
4. **依存関係の深さ**: サブタスク間の依存関係の最大深さ

### 出力形式 (JSON)
```json
{
  "estimated_tokens": <number>,
  "estimated_file_count": <number>,
  "complexity_score": <1-10>,
  "dependency_depth": <0-N>,
  "reasoning": "<判断理由>",
  "confidence": <0.0-1.0>
}
```
```

---

## 4. Chunking Decision

### 4.1 分割判断基準

以下の条件のいずれかを満たす場合、分割を検討:

| Criterion                | Threshold          | Description                                    |
| ------------------------ | ------------------ | ---------------------------------------------- |
| `size_category`          | >= M               | サイズが M 以上                                |
| `estimated_file_count`   | >= 3               | 3 ファイル以上の変更                           |
| `explicit_enumeration`   | true               | 「A, B, C を実装」等の列挙がある               |
| `multiple_components`    | true               | 複数コンポーネントへの変更                     |
| `user_requested_chunk`   | true               | ユーザーが明示的に分割を要求                   |

### 4.2 分割禁止条件

以下の条件のいずれかを満たす場合、分割しない:

| Criterion                | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `atomic_operation`       | 不可分な操作（単一トランザクション等）         |
| `user_requested_single`  | ユーザーが明示的に単一実行を要求               |
| `config_disable_chunk`   | 設定で分割が無効化                             |
| `size_category_xs_s`     | サイズが XS または S                           |

### 4.3 Chunking Decision Data Model

```typescript
interface ChunkingDecision {
  task_id: string;
  decided_at: string;                // ISO 8601

  // Decision
  should_chunk: boolean;
  chunk_count: number;               // 0 = no chunking, 1+ = chunk count

  // Reasoning
  decision_criteria: DecisionCriterion[];
  llm_reasoning: string;

  // Subtask definitions (if chunking)
  subtask_definitions?: SubtaskPlan[];
}

interface DecisionCriterion {
  name: string;                      // Criterion name
  value: unknown;                    // Evaluated value
  threshold: unknown;                // Threshold for decision
  met: boolean;                      // Whether criterion was met
}

interface SubtaskPlan {
  subtask_index: number;
  prompt: string;                    // Subtask prompt
  estimated_size: SizeCategory;
  dependencies: number[];            // Indices of dependent subtasks
}
```

---

## 5. Dependency Analysis

### 5.1 依存関係の種類

| Type           | Description                                    | Example                          |
| -------------- | ---------------------------------------------- | -------------------------------- |
| `data`         | データ依存（出力が入力になる）                 | インターフェース → 実装          |
| `resource`     | リソース依存（同じファイルを変更）             | 同一ファイルの複数変更           |
| `logical`      | 論理依存（順序が重要）                         | 削除 → 再作成                    |
| `none`         | 依存なし（並列実行可能）                       | 独立したファイルの作成           |

### 5.2 Dependency Graph

```typescript
interface DependencyGraph {
  task_id: string;
  subtasks: SubtaskNode[];
  edges: DependencyEdge[];
  execution_groups: ExecutionGroup[];
}

interface SubtaskNode {
  index: number;
  prompt_summary: string;
  estimated_duration_ms: number;
}

interface DependencyEdge {
  from: number;                      // Subtask index
  to: number;                        // Subtask index
  type: 'data' | 'resource' | 'logical';
}

interface ExecutionGroup {
  group_index: number;
  mode: 'parallel' | 'sequential';
  subtask_indices: number[];
  depends_on_groups: number[];       // Must complete before this group
}
```

### 5.3 依存関係分析フロー

```
Subtask Definitions
    │
    v
┌─────────────────────────────────────────┐
│ Dependency Analysis                     │
│                                         │
│  1. File overlap detection              │
│     - Same file modified by 2+ subtasks │
│     → resource dependency               │
│                                         │
│  2. Output-input detection              │
│     - Subtask A outputs X               │
│     - Subtask B needs X                 │
│     → data dependency                   │
│                                         │
│  3. Logical order detection             │
│     - Delete before create              │
│     - Interface before implementation   │
│     → logical dependency                │
│                                         │
└─────────────────────────────────────────┘
    │
    v
Dependency Graph
    │
    v
┌─────────────────────────────────────────┐
│ Execution Group Generation              │
│                                         │
│  - Topological sort of dependencies     │
│  - Group independent subtasks           │
│  - Determine parallel/sequential        │
│                                         │
└─────────────────────────────────────────┘
    │
    v
Execution Plan
```

---

## 6. Execution Plan

### 6.1 Execution Plan Data Model

```typescript
interface ExecutionPlan {
  task_id: string;
  planned_at: string;                // ISO 8601

  // Planning results
  size_estimation: SizeEstimation;
  chunking_decision: ChunkingDecision;
  dependency_graph?: DependencyGraph;

  // Execution strategy
  execution_mode: 'single' | 'parallel' | 'sequential' | 'hybrid';
  estimated_total_duration_ms: number;

  // Worker assignment
  worker_strategy: WorkerStrategy;
}

interface WorkerStrategy {
  type: 'single' | 'round_robin' | 'least_loaded';
  max_parallel_workers: number;
  worker_timeout_ms: number;
}
```

### 6.2 実行モード判定

| Condition                          | Execution Mode |
| ---------------------------------- | -------------- |
| 分割なし                           | `single`       |
| 全サブタスクが独立                 | `parallel`     |
| 全サブタスクに依存関係あり         | `sequential`   |
| 一部並列、一部逐次                 | `hybrid`       |

### 6.3 Hybrid Execution Example

```
Task: "Create user authentication module"
    │
    v
Subtasks:
  [1] Define User interface
  [2] Define Auth interface
  [3] Implement User service (depends on 1)
  [4] Implement Auth service (depends on 2)
  [5] Integration tests (depends on 3, 4)

Execution Groups:
  Group 0: [1, 2] (parallel)
  Group 1: [3, 4] (parallel, after Group 0)
  Group 2: [5] (after Group 1)

Timeline:
  ├── Group 0 ──────┤
  │ [1] [2]         │
  ├── Group 1 ──────┤
  │ [3] [4]         │
  ├── Group 2 ──────┤
  │ [5]             │
  └─────────────────┘
```

---

## 7. Conversation Trace Events

### 7.1 PLANNING Phase Events

Planning Phase は以下のイベントを Conversation Trace に記録:

| Event Type              | Visibility | Description                              |
| ----------------------- | ---------- | ---------------------------------------- |
| `PLANNING_START`        | summary    | Planning Phase 開始                      |
| `SIZE_ESTIMATION`       | full       | サイズ見積もり結果                       |
| `CHUNKING_DECISION`     | summary    | 分割判断結果                             |
| `DEPENDENCY_ANALYSIS`   | full       | 依存関係分析結果                         |
| `EXECUTION_PLAN`        | summary    | 実行計画確定                             |
| `PLANNING_END`          | summary    | Planning Phase 終了                      |

### 7.2 Event Structures

```json
{
  "event": "PLANNING_START",
  "timestamp": "2026-01-23T10:00:00.000Z",
  "session_id": "session-001",
  "task_id": "task-001",
  "data": {
    "user_input_summary": "Create user authentication module with login, logout, session"
  }
}
```

```json
{
  "event": "SIZE_ESTIMATION",
  "timestamp": "2026-01-23T10:00:01.000Z",
  "session_id": "session-001",
  "task_id": "task-001",
  "data": {
    "estimated_tokens": 5000,
    "estimated_file_count": 5,
    "complexity_score": 7,
    "dependency_depth": 2,
    "total_score": 72,
    "size_category": "L",
    "confidence": 0.85,
    "llm_reasoning": "Multiple files with interconnected components"
  }
}
```

```json
{
  "event": "CHUNKING_DECISION",
  "timestamp": "2026-01-23T10:00:02.000Z",
  "session_id": "session-001",
  "task_id": "task-001",
  "data": {
    "should_chunk": true,
    "chunk_count": 5,
    "decision_criteria": [
      { "name": "size_category", "value": "L", "threshold": "M", "met": true },
      { "name": "estimated_file_count", "value": 5, "threshold": 3, "met": true }
    ],
    "llm_reasoning": "Task requires 5 files with clear component separation"
  }
}
```

```json
{
  "event": "EXECUTION_PLAN",
  "timestamp": "2026-01-23T10:00:03.000Z",
  "session_id": "session-001",
  "task_id": "task-001",
  "data": {
    "execution_mode": "hybrid",
    "execution_groups": [
      { "group_index": 0, "mode": "parallel", "subtask_indices": [0, 1] },
      { "group_index": 1, "mode": "parallel", "subtask_indices": [2, 3] },
      { "group_index": 2, "mode": "sequential", "subtask_indices": [4] }
    ],
    "estimated_total_duration_ms": 300000
  }
}
```

---

## 8. Configuration

### 8.1 設定ファイル

```json
// .claude/task-planning.json
{
  "enabled": true,
  "size_estimation": {
    "llm_model": "cheap",
    "timeout_ms": 10000,
    "fallback_category": "M"
  },
  "chunking": {
    "auto_chunk_threshold": "M",
    "max_subtasks": 10,
    "min_subtasks": 2
  },
  "execution": {
    "max_parallel_workers": 3,
    "worker_timeout_ms": 300000,
    "default_strategy": "round_robin"
  }
}
```

### 8.2 REPL コマンド

```bash
# Planning 設定を表示
/planning show

# Planning 設定を変更
/planning set auto_chunk_threshold L
/planning set max_parallel_workers 5

# 特定タスクの Planning 結果を表示
/planning result <task_id>
```

---

## 9. Error Handling

### 9.1 Planning 失敗時

| Error Type               | Behavior                                    |
| ------------------------ | ------------------------------------------- |
| LLM タイムアウト         | Fallback: size_category = M, no chunking    |
| LLM エラー               | Retry 2回 → Fallback                        |
| 依存関係分析失敗         | Sequential execution (safe mode)            |
| 設定ファイル破損         | Default config を使用                       |

### 9.2 Fail-Closed 原則

Planning Phase で問題が発生した場合:

1. 警告ログを出力
2. 単一タスクとして実行を継続
3. `planning_skipped: true` を Trace に記録

```json
{
  "event": "PLANNING_SKIPPED",
  "timestamp": "2026-01-23T10:00:01.000Z",
  "session_id": "session-001",
  "task_id": "task-001",
  "data": {
    "reason": "LLM timeout during size estimation",
    "fallback_mode": "single_task",
    "error_details": "Timeout after 10000ms"
  }
}
```

---

## 10. Cross-References

- spec/26_TASK_CHUNKING.md (サブタスク実行)
- spec/25_REVIEW_LOOP.md (品質検証)
- spec/28_CONVERSATION_TRACE.md (Trace 記録)
- spec/30_RETRY_AND_RECOVERY.md (リトライ戦略)
- spec/31_PROVIDER_MODEL_POLICY.md (モデル選択)
- spec/13_LOGGING_AND_OBSERVABILITY.md (ログ記録)
