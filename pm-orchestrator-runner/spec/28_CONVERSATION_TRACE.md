# 28_CONVERSATION_TRACE.md

# Conversation Trace (往復ログ)

本章は Runner の「会話ログ（往復ログ）」自動保存機能を定義する。

---

## 1. Overview

### 1.1 目的

1 回のタスク投入で発生する全ての往復（LLM への投入 → 出力取得 → 品質判定 → 修正指示 → 再投入）を、
**後から読み返せる JSONL ファイル**として自動保存する。

これにより:
- Runner 自身の改善履歴を追跡可能
- Review Loop の動作を第三者が検証可能
- Task Chunking のサブタスク単位での往復も記録

### 1.2 設計原則

- **Complete Capture**: 全ての LLM 往復を漏らさず記録
- **JSONL Format**: 1 行 1 イベント、既存 TracePack と整合
- **Retrievable**: REPL `/trace` と Web API `/api/tasks/:id/trace` で取得可能

---

## 2. Data Model

### 2.1 ConversationTraceEntry (1 行)

```typescript
interface ConversationTraceEntry {
  /** ISO 8601 タイムスタンプ */
  timestamp: string;

  /** イベントタイプ */
  event: ConversationTraceEventType;

  /** セッション ID */
  session_id: string;

  /** タスク ID */
  task_id: string;

  /** サブタスク ID (Task Chunking 時) */
  subtask_id?: string;

  /** イテレーションインデックス (0-based) */
  iteration_index?: number;

  /** イベント固有データ */
  data: Record<string, unknown>;
}
```

### 2.2 ConversationTraceEventType

| Event Type | Description | data に含まれる内容 |
|------------|-------------|---------------------|
| `USER_REQUEST` | ユーザーの元入力 | `{ prompt: string }` |
| `SYSTEM_RULES` | 自動注入された Mandatory Rules | `{ rules: string }` |
| `CHUNKING_PLAN` | Task Chunking の分割計画 | `{ subtasks: SubtaskPlan[] }` |
| `LLM_REQUEST` | Claude Code への投入プロンプト全文 | `{ prompt: string, subtask_id?: string }` |
| `LLM_RESPONSE` | Claude Code からの返答全文 | `{ output: string, status: string, files_modified: string[] }` |
| `QUALITY_JUDGMENT` | 品質判定結果 | `{ judgment: 'PASS'|'REJECT'|'RETRY', criteria_results: CriteriaResult[], summary: string }` |
| `REJECTION_DETAILS` | REJECT 時の修正指示 | `{ criteria_failed: string[], modification_prompt: string }` |
| `ITERATION_END` | イテレーション終了 | `{ iteration_index: number, judgment: string }` |
| `FINAL_SUMMARY` | 最終まとめ | `{ status: string, total_iterations: number, files_modified: string[] }` |

### 2.3 CriteriaResult

```typescript
interface CriteriaResult {
  /** 基準 ID (Q1-Q9) */
  id: string;
  /** 基準名 */
  name: string;
  /** PASS/FAIL */
  passed: boolean;
  /** 根拠の短文 */
  reason?: string;
}
```

---

## 3. Storage

### 3.1 ファイルパス

```
<state_dir>/traces/conversation-<task_id>-<timestamp>.jsonl
```

例:
```
.pm-orchestrator/traces/conversation-task-001-2025-01-23T10-30-00.jsonl
```

### 3.2 JSONL フォーマット

1 行 1 イベント。各行は独立した JSON オブジェクト。

```jsonl
{"timestamp":"2025-01-23T10:30:00.000Z","event":"USER_REQUEST","session_id":"sess-1","task_id":"task-001","data":{"prompt":"Implement login feature"}}
{"timestamp":"2025-01-23T10:30:00.100Z","event":"SYSTEM_RULES","session_id":"sess-1","task_id":"task-001","data":{"rules":"## Mandatory Rules\n..."}}
{"timestamp":"2025-01-23T10:30:01.000Z","event":"LLM_REQUEST","session_id":"sess-1","task_id":"task-001","iteration_index":0,"data":{"prompt":"..."}}
{"timestamp":"2025-01-23T10:30:05.000Z","event":"LLM_RESPONSE","session_id":"sess-1","task_id":"task-001","iteration_index":0,"data":{"output":"TODO: implement this","status":"COMPLETE"}}
{"timestamp":"2025-01-23T10:30:05.100Z","event":"QUALITY_JUDGMENT","session_id":"sess-1","task_id":"task-001","iteration_index":0,"data":{"judgment":"REJECT","criteria_results":[{"id":"Q2","name":"No TODO/FIXME","passed":false,"reason":"TODO found"}]}}
{"timestamp":"2025-01-23T10:30:05.200Z","event":"REJECTION_DETAILS","session_id":"sess-1","task_id":"task-001","iteration_index":0,"data":{"criteria_failed":["Q2"],"modification_prompt":"Fix: Remove TODO markers..."}}
{"timestamp":"2025-01-23T10:30:06.000Z","event":"LLM_REQUEST","session_id":"sess-1","task_id":"task-001","iteration_index":1,"data":{"prompt":"..."}}
{"timestamp":"2025-01-23T10:30:10.000Z","event":"LLM_RESPONSE","session_id":"sess-1","task_id":"task-001","iteration_index":1,"data":{"output":"Fully implemented","status":"COMPLETE"}}
{"timestamp":"2025-01-23T10:30:10.100Z","event":"QUALITY_JUDGMENT","session_id":"sess-1","task_id":"task-001","iteration_index":1,"data":{"judgment":"PASS","criteria_results":[...]}}
{"timestamp":"2025-01-23T10:30:10.200Z","event":"FINAL_SUMMARY","session_id":"sess-1","task_id":"task-001","data":{"status":"COMPLETE","total_iterations":2,"files_modified":["src/login.ts"]}}
```

---

## 4. Integration with Review Loop / Task Chunking

### 4.1 Review Loop 連携

ReviewLoopExecutorWrapper は各イテレーションで以下を記録:
1. `LLM_REQUEST` (投入前)
2. `LLM_RESPONSE` (取得後)
3. `QUALITY_JUDGMENT` (判定後)
4. `REJECTION_DETAILS` (REJECT 時のみ)
5. `ITERATION_END` (イテレーション終了)

### 4.2 Task Chunking 連携

TaskChunkingExecutorWrapper は:
1. `CHUNKING_PLAN` (分割計画生成後)
2. 各サブタスクで `subtask_id` を付与した往復ログ

### 4.3 Runner Core 連携

RunnerCore はタスク開始時に:
1. `USER_REQUEST` (ユーザー入力)
2. `SYSTEM_RULES` (Mandatory Rules)

タスク終了時に:
1. `FINAL_SUMMARY` (最終まとめ)

---

## 5. API

### 5.1 REPL Commands

#### `/trace <task-id|#>`

指定タスクの会話ログを表示。

```
pm> /trace task-001
--- Conversation Trace for task-001 ---
[2025-01-23 10:30:00] USER_REQUEST: Implement login feature
[2025-01-23 10:30:00] SYSTEM_RULES: (Mandatory Rules injected)
[2025-01-23 10:30:01] LLM_REQUEST[0]: (prompt sent)
[2025-01-23 10:30:05] LLM_RESPONSE[0]: TODO: implement this
[2025-01-23 10:30:05] QUALITY_JUDGMENT[0]: REJECT (Q2: TODO found)
[2025-01-23 10:30:05] REJECTION_DETAILS[0]: Fix: Remove TODO markers...
[2025-01-23 10:30:06] LLM_REQUEST[1]: (modified prompt)
[2025-01-23 10:30:10] LLM_RESPONSE[1]: Fully implemented
[2025-01-23 10:30:10] QUALITY_JUDGMENT[1]: PASS
[2025-01-23 10:30:10] FINAL_SUMMARY: COMPLETE (2 iterations)
---
```

#### `/trace <task-id|#> --latest`

最新イテレーションのみ表示。

#### `/trace <task-id|#> --raw`

JSONL 生データを表示。

### 5.2 Web API

#### `GET /api/tasks/:id/trace`

タスクの会話ログを JSON 配列で返却。

**Request:**
```
GET /api/tasks/task-001/trace
```

**Response:**
```json
{
  "task_id": "task-001",
  "trace_file": ".pm-orchestrator/traces/conversation-task-001-2025-01-23T10-30-00.jsonl",
  "entries": [
    {"timestamp": "...", "event": "USER_REQUEST", ...},
    {"timestamp": "...", "event": "SYSTEM_RULES", ...},
    ...
  ],
  "summary": {
    "total_iterations": 2,
    "judgments": ["REJECT", "PASS"],
    "final_status": "COMPLETE"
  }
}
```

#### Query Parameters

| Param | Description |
|-------|-------------|
| `latest` | `?latest=true` で最新イテレーションのみ |
| `raw` | `?raw=true` で JSONL 生テキストを返却 |

---

## 6. Implementation

### 6.1 ConversationTracer Class

```typescript
class ConversationTracer {
  constructor(config: {
    stateDir: string;
    sessionId: string;
    taskId: string;
  });

  /** ユーザーリクエストを記録 */
  logUserRequest(prompt: string): void;

  /** システムルールを記録 */
  logSystemRules(rules: string): void;

  /** チャンキング計画を記録 */
  logChunkingPlan(subtasks: SubtaskPlan[]): void;

  /** LLM リクエストを記録 */
  logLLMRequest(prompt: string, iterationIndex: number, subtaskId?: string): void;

  /** LLM レスポンスを記録 */
  logLLMResponse(output: string, status: string, filesModified: string[], iterationIndex: number, subtaskId?: string): void;

  /** 品質判定を記録 */
  logQualityJudgment(judgment: string, criteriaResults: CriteriaResult[], iterationIndex: number, subtaskId?: string): void;

  /** REJECT 詳細を記録 */
  logRejectionDetails(criteriaFailed: string[], modificationPrompt: string, iterationIndex: number, subtaskId?: string): void;

  /** 最終サマリーを記録 */
  logFinalSummary(status: string, totalIterations: number, filesModified: string[]): void;

  /** トレースファイルパスを取得 */
  getTraceFilePath(): string;

  /** トレースを読み込み */
  static readTrace(filePath: string): ConversationTraceEntry[];
}
```

### 6.2 TracePack との関係

- **TracePack**: セッション/タスク状態遷移の汎用ログ
- **ConversationTracer**: LLM 往復の詳細ログ（本章で定義）

両者は独立して動作し、同一タスクで両方が記録される。
ConversationTracer は TracePack を拡張するのではなく、専用モジュールとして実装。

---

## 7. Self-Improvement Fixture

### 7.1 目的

Runner が「自分自身を改善できる」ことを機械的に証明するための fixture。

### 7.2 Fixture 構成

```
fixtures/self-heal-wrapper/
├── broken-module.ts     # 意図的に不完全なモジュール（TODO/省略マーカー）
├── expected-output.ts   # 修正後の期待出力
└── test/
    └── self-heal.test.ts  # 統合テスト
```

### 7.3 テストシナリオ

1. **初回実行**: broken-module.ts を「修正して」とタスク投入
2. **Claude Code (Mock)**: 不完全な出力を返す（TODO マーカー含む）
3. **Review Loop**: Q2 違反検出 → REJECT → 修正指示生成
4. **Retry**: 修正指示付きで再投入
5. **Claude Code (Mock)**: 完全な出力を返す
6. **Review Loop**: PASS
7. **検証**: 会話ログ (JSONL) が生成され、REJECT→PASS の履歴が記録されている

### 7.4 検証項目

- 会話ログファイルが存在する
- `USER_REQUEST` → `LLM_REQUEST[0]` → `LLM_RESPONSE[0]` → `QUALITY_JUDGMENT[0]=REJECT` → `REJECTION_DETAILS[0]` → `LLM_REQUEST[1]` → `LLM_RESPONSE[1]` → `QUALITY_JUDGMENT[1]=PASS` → `FINAL_SUMMARY` の順序
- `/trace` コマンドで取得可能
- `/api/tasks/:id/trace` で取得可能

---

## 8. Properties

| ID | Property | Description |
|----|----------|-------------|
| P28.1 | Complete Capture | 全ての LLM 往復が記録される |
| P28.2 | JSONL Format | 1 行 1 イベント、パース可能 |
| P28.3 | Retrievable via REPL | `/trace <id>` で取得可能 |
| P28.4 | Retrievable via API | `/api/tasks/:id/trace` で取得可能 |
| P28.5 | Self-Heal Provable | fixture で REJECT→PASS が証明可能 |
