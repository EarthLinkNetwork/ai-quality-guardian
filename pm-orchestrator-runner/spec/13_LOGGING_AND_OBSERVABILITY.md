# 13_LOGGING_AND_OBSERVABILITY.md

# Logging and Observability

本章は、PM Orchestrator Runner のログ記録および可観測性に関する仕様を定義する。

本仕様は Correctness Property 25 (Log Visibility Control) を実装する際の詳細規則である。

---

## 1. Log Storage

### 1.1 保存先ディレクトリ（セッション別）

```
.claude/logs/
├── index.json                          # 全セッションのTaskLogIndex
├── sessions/
│   ├── <session_id>/
│   │   ├── session.json                # セッションメタデータ
│   │   ├── index.json                  # セッション内TaskLogIndex
│   │   └── tasks/
│   │       ├── <task_id>.json          # TaskLog
│   │       ├── <task_id>.json
│   │       └── ...
│   └── <session_id>/
│       └── ...
└── raw/                                # 生ログ（executor出力等）
    └── <session_id>/
        └── <task_id>_<event_id>.log
```

### 1.2 ファイル命名規則

- グローバルインデックス: `index.json`（固定）
- セッションディレクトリ: `sessions/<session_id>/`
- セッションメタデータ: `sessions/<session_id>/session.json`
- セッションインデックス: `sessions/<session_id>/index.json`
- タスクログ: `sessions/<session_id>/tasks/<task_id>.json`
- 生ログ: `raw/<session_id>/<task_id>_<event_id>.log`
- task_id, session_id は対応するエントリの id フィールドと一致

### 1.3 ディレクトリ作成

- `.claude/logs/` が存在しない場合、Runner が自動作成する
- ディレクトリ作成失敗時は ERROR として停止

---

## 2. TaskLog Mandatory Fields (Fail-Closed Logging)

### 2.1 最小必須フィールド

**全てのタスクは、状態（COMPLETE/INCOMPLETE/ERROR）に関わらず、以下のフィールドを持つ TaskLog を必ず生成しなければならない。**

| フィールド名       | 型                    | 必須 | 説明                                                |
| ------------------ | --------------------- | ---- | --------------------------------------------------- |
| session_id         | string                | Yes  | セッション識別子                                    |
| task_id            | string                | Yes  | タスク識別子                                        |
| status             | TaskLogStatus         | Yes  | `queued` / `running` / `complete` / `incomplete` / `error` |
| started_at         | ISO8601 string        | Yes  | タスク開始時刻                                      |
| ended_at           | ISO8601 string / null | Yes  | タスク終了時刻（実行中は null）                     |
| prompt_summary     | string                | Yes  | ユーザー入力の要約（最大100文字）                   |
| runner_decision    | string                | Yes  | Runner の判断内容（accept/reject/clarify等）        |
| executor_summary   | string / null         | No   | Executor 実行結果の要約（Executor 呼び出し時のみ）  |
| evidence_summary   | EvidenceSummary / null| No   | 検証結果の要約（Evidence 検証時のみ）               |
| error_reason       | string / null         | Cond | エラー理由（status が `incomplete` / `error` の場合必須）|
| artifacts          | ArtifactList          | Yes  | 操作対象ファイル一覧                                |
| executor_blocked   | boolean               | No   | Executor がブロック状態で終了したか（Property 34-36）|
| blocked_reason     | BlockedReason / null  | Cond | ブロック理由（executor_blocked=true の場合必須）    |
| timeout_ms         | number / null         | No   | Executor タイムアウト時間（ms）                     |
| terminated_by      | TerminatedBy / null   | Cond | 終了トリガー（executor_blocked=true の場合必須）    |
| visibility         | `summary` / `full`    | Yes  | ログ可視性レベル（既定: `summary`）                 |
| masked             | boolean               | Yes  | マスキング済みフラグ（常に `true`）                 |
| events             | LogEvent[]            | Yes  | ログイベント配列（最低1件必須）                     |

### 2.2 TaskLogStatus 定義

```typescript
type TaskLogStatus = 'queued' | 'running' | 'complete' | 'incomplete' | 'error';
```

| Status       | 説明                                              |
| ------------ | ------------------------------------------------- |
| `queued`     | タスクがキューに追加された（実行待ち）            |
| `running`    | タスクが実行中                                    |
| `complete`   | タスクが正常完了（Evidence 検証済み）             |
| `incomplete` | タスクが不完全（Evidence 不足または検証失敗）     |
| `error`      | タスクがエラーで終了                              |

### 2.2.1 BlockedReason 定義（Property 34-36 準拠）

```typescript
type BlockedReason = 'INTERACTIVE_PROMPT' | 'TIMEOUT' | 'STDIN_REQUIRED';
```

| Reason               | 説明                                              |
| -------------------- | ------------------------------------------------- |
| `INTERACTIVE_PROMPT` | 対話プロンプト（`? `, `[Y/n]` 等）を検出          |
| `TIMEOUT`            | Executor タイムアウト（出力なし状態の継続）       |
| `STDIN_REQUIRED`     | Executor が stdin 入力を要求したことを検出        |

### 2.2.2 TerminatedBy 定義

```typescript
type TerminatedBy = 'REPL_FAIL_CLOSED' | 'USER' | 'TIMEOUT';
```

| Terminator        | 説明                                              |
| ----------------- | ------------------------------------------------- |
| `REPL_FAIL_CLOSED`| REPL の Fail-Closed 機構による強制終了            |
| `USER`            | ユーザーによる明示的なキャンセル                  |
| `TIMEOUT`         | タイムアウトによる自動終了                        |

### 2.3 EvidenceSummary 構造

```json
{
  "files_expected": ["src/utils.ts", "README.md"],
  "files_verified": ["src/utils.ts"],
  "files_missing": ["README.md"],
  "verification_passed": false,
  "verification_reason": "1 file(s) not found on disk"
}
```

### 2.4 ArtifactList 構造

```json
{
  "files_touched": ["src/utils.ts"],
  "files_expected": ["src/utils.ts", "README.md"],
  "files_created": ["src/utils.ts"],
  "files_modified": [],
  "files_deleted": []
}
```

### 2.5 Fail-Closed Logging（必須ログ出力）

**原則: どのような状態でも、タスクのライフサイクルが終了した時点で必ず TaskLog を保存する。**

```
Task Lifecycle → TaskLog Recording:

  [QUEUED] ──→ TaskLog(status: queued) を保存
      │
      v
  [RUNNING] ──→ TaskLog(status: running) に更新
      │
      ├──→ [COMPLETE] ──→ TaskLog(status: complete) を保存
      │
      ├──→ [INCOMPLETE] ──→ TaskLog(status: incomplete, error_reason: "...") を保存
      │
      └──→ [ERROR] ──→ TaskLog(status: error, error_reason: "...") を保存
```

**INCOMPLETE/ERROR でも必ず TaskLog を残す理由:**
- デバッグ・監査のため失敗したタスクの情報が必須
- `/tasks` で見えるタスクは `/logs` でも必ず見えるべき（整合性）
- Fail-Closed: ログがない = 検証不能 = 信頼できない

### 2.6 TaskLog JSON 例

**INCOMPLETE 状態の TaskLog 例:**
```json
{
  "session_id": "sess-20250112-001",
  "task_id": "task-1768282936521",
  "status": "incomplete",
  "started_at": "2025-01-12T11:30:00.000Z",
  "ended_at": "2025-01-12T11:30:45.000Z",
  "prompt_summary": "readmeを作って",
  "runner_decision": "accept",
  "executor_summary": "Executor completed with output",
  "evidence_summary": {
    "files_expected": ["README.md"],
    "files_verified": [],
    "files_missing": ["README.md"],
    "verification_passed": false,
    "verification_reason": "Task completed but no verified files exist on disk"
  },
  "error_reason": "Task completed but no verified files exist on disk",
  "artifacts": {
    "files_touched": [],
    "files_expected": ["README.md"],
    "files_created": [],
    "files_modified": [],
    "files_deleted": []
  },
  "visibility": "summary",
  "masked": true,
  "events": [
    {
      "event_type": "USER_INPUT",
      "timestamp": "2025-01-12T11:30:00.000Z",
      "visibility": "summary",
      "content": { "prompt": "readmeを作って" }
    },
    {
      "event_type": "TASK_INCOMPLETE",
      "timestamp": "2025-01-12T11:30:45.000Z",
      "visibility": "summary",
      "content": {
        "reason": "Task completed but no verified files exist on disk",
        "evidence_summary": { "files_expected": ["README.md"], "files_verified": [] }
      }
    }
  ]
}
```

### 2.6.1 Executor Blocking Detection 記録（Property 34-36 準拠）

**概要:** 非対話モードで Executor がブロック状態（対話待ち、タイムアウト等）になった場合、その情報を TaskLog に記録する。

**Executor Blocked 状態の TaskLog 例:**
```json
{
  "session_id": "sess-20250114-001",
  "task_id": "task-1768282936521",
  "status": "error",
  "started_at": "2025-01-14T10:00:00.000Z",
  "ended_at": "2025-01-14T10:01:05.000Z",
  "prompt_summary": "プロジェクトの設定を確認",
  "runner_decision": "accept",
  "executor_summary": "Executor blocked: interactive prompt detected",
  "executor_blocked": true,
  "blocked_reason": "INTERACTIVE_PROMPT",
  "timeout_ms": 60000,
  "terminated_by": "REPL_FAIL_CLOSED",
  "error_reason": "Executor blocked on interactive prompt: '? Select a configuration option'",
  "artifacts": {
    "files_touched": [],
    "files_expected": [],
    "files_created": [],
    "files_modified": [],
    "files_deleted": []
  },
  "visibility": "summary",
  "masked": true,
  "events": [
    {
      "event_type": "USER_INPUT",
      "timestamp": "2025-01-14T10:00:00.000Z",
      "visibility": "summary",
      "content": { "prompt": "プロジェクトの設定を確認" }
    },
    {
      "event_type": "EXECUTOR_START",
      "timestamp": "2025-01-14T10:00:05.000Z",
      "visibility": "full",
      "content": { "provider": "claude-code" }
    },
    {
      "event_type": "EXECUTOR_BLOCKED",
      "timestamp": "2025-01-14T10:01:05.000Z",
      "visibility": "summary",
      "content": {
        "reason": "INTERACTIVE_PROMPT",
        "detected_pattern": "? Select a configuration option",
        "action": "REPL_FAIL_CLOSED"
      }
    },
    {
      "event_type": "TASK_ERROR",
      "timestamp": "2025-01-14T10:01:05.000Z",
      "visibility": "summary",
      "content": {
        "reason": "Executor blocked on interactive prompt",
        "executor_blocked": true,
        "blocked_reason": "INTERACTIVE_PROMPT"
      }
    }
  ]
}
```

**記録要件:**

1. **executor_blocked = true の場合、以下が必須:**
   - `blocked_reason`: ブロック理由（INTERACTIVE_PROMPT/TIMEOUT/STDIN_REQUIRED）
   - `terminated_by`: 終了トリガー（REPL_FAIL_CLOSED/USER/TIMEOUT）

2. **EXECUTOR_BLOCKED イベントを events 配列に追加:**
   - `reason`: BlockedReason
   - `detected_pattern`: 検出されたパターン（該当する場合）
   - `action`: 実行されたアクション

3. **Property 24/25 準拠:**
   - `detected_pattern` にシークレット情報が含まれる場合はマスキング
   - ログ出力は visibility 制御に従う

**関連:**
- Property 34: Executor stdin Blocking（10_REPL_UX.md）
- Property 35: Task Terminal State Guarantee（06_CORRECTNESS_PROPERTIES.md）
- Property 36: Subsequent Command Processing Guarantee（06_CORRECTNESS_PROPERTIES.md）

---

## 2.7 Verified Files Detection（ファイル検証）

### 2.7.1 定義

**Verified Files** とは、タスク実行後に Runner がディスク上で実在を確認したファイルを指す。

```typescript
interface VerifiedFile {
  path: string;         // プロジェクトルートからの相対パス
  exists: boolean;      // ディスク上に存在するか
  size?: number;        // ファイルサイズ（バイト）
  content_preview?: string; // 内容プレビュー（最大100文字）
}
```

### 2.7.2 検証方法（Verification Methods）

Runner は以下の2段階でファイルを検証する:

**Step 1: Diff Detection（差分検出）**
- タスク実行前後でプロジェクトディレクトリをスキャン
- 新規作成・変更されたファイルを `files_modified` として検出
- 検出対象: プロジェクトルート配下の非隠しファイル（`.` 始まりを除外）
- 除外対象: `node_modules`, `.git`, `.claude` 等

**Step 2: Disk Verification（ディスク検証）**
- `files_modified` の各ファイルに対して `fs.existsSync()` で存在確認
- 存在するファイルを `verified_files` に追加（`exists: true`）
- 存在しないファイルを `unverified_files` に追加

```
files_modified (diff検出) → disk verification → verified_files (実在確認済み)
```

### 2.7.3 ファイルスキャン対象

| 対象                | 含まれる | 理由                                  |
| ------------------- | -------- | ------------------------------------- |
| `README.md`         | Yes      | プロジェクトルートの通常ファイル      |
| `src/utils.ts`      | Yes      | サブディレクトリの通常ファイル        |
| `.gitignore`        | No       | 隠しファイル（`.` 始まり）            |
| `.claude/settings.json` | No   | `.claude` ディレクトリは除外          |
| `node_modules/...`  | No       | `node_modules` は除外                 |

### 2.7.4 files_modified_count 算出

`TaskLogEntry.files_modified_count` は以下のいずれかから算出:

1. **Executor 結果**: `executorResult.files_modified.length`
2. **Verified Files**: `verified_files.filter(f => f.exists).length`
3. **Fallback**: タスク実行中に記録された `filesCreated.length`

優先順位: Verified Files > Executor 結果 > Fallback

### 2.7.5 External Task ID と Internal Log Task ID の対応

Runner は2種類のタスク識別子を管理する:

| 識別子              | 例                     | 用途                                |
| ------------------- | ---------------------- | ----------------------------------- |
| **External Task ID**| `task-1768319005471`   | RunnerCore が生成、`/tasks` で表示  |
| **Internal Log Task ID** | `task-001`        | TaskLogManager が生成、`/logs` で表示 |

**対応の記録:**

`TaskLogEntry` に `external_task_id` フィールドを追加:

```json
{
  "task_id": "task-001",           // Internal (TaskLogManager)
  "external_task_id": "task-1768319005471", // External (RunnerCore)
  "status": "COMPLETE",
  "files_modified_count": 1
}
```

**表示における整合性:**

`/logs` 出力時、両方の ID を表示:

```
Task Logs (session: session-xxx):

  # | Task ID      | Runner ID            | Status     | Files
  --|--------------|----------------------|------------|------
  1 | task-001     | task-1768319005471   | COMPLETE   | 1
```


### 2.7.6 Verification Root（検証ルート）

**Property 32, 33 準拠**

検証の実行場所を `verification_root` として明示的に記録する。

```typescript
interface TaskLogVerificationInfo {
  verification_root: string;    // 絶対パス（検証実行時のプロジェクトルート）
  verified_files: VerifiedFile[];
}

interface VerifiedFile {
  path: string;                 // verification_root からの相対パス
  exists: boolean;
  detected_at: string;          // ISO 8601
  detection_method: 'diff' | 'executor_claim';
}
```

**プロジェクトモードと verification_root:**

| プロジェクトモード | verification_root の挙動 |
|-------------------|--------------------------|
| `temp`（デフォルト）| `/var/folders/.../pm-orchestrator-xxxxx` 等の一時ディレクトリ |
| `fixed`           | `--project-root` で指定されたディレクトリ（永続的） |

**fixed モードの利点:**
- 検証後も `verification_root` が残存し、後から再検証可能
- デモ・チュートリアル用途で「実際に作成されたファイル」を確認可能
- 揮発性問題（一時ディレクトリの消失）を回避

**例（fixed モード）:**
```bash
pm-orchestrator repl --project-mode fixed --project-root /tmp/pm-demo-123
```

```json
{
  "verification_root": "/tmp/pm-demo-123",
  "verified_files": [
    {
      "path": "README.md",
      "exists": true,
      "detected_at": "2025-01-14T10:00:30.000Z",
      "detection_method": "diff"
    }
  ]
}
```

**関連:**
- Property 32: Non-Volatile Project Root（揮発性問題の解決）
- Property 33: Verified Files Traceability（検証済みファイル追跡）
- 10_REPL_UX.md: プロジェクトモード（--project-mode, --project-root）

---

## 3. Thread/Run Concept（タスク階層構造）

### 3.1 概念定義

| 用語       | 定義                                                                 |
| ---------- | -------------------------------------------------------------------- |
| Session    | Runner の起動から終了までの単位。一意の `session_id` を持つ          |
| Thread     | 論理的なタスクの流れ。質問返し→回答→実行が一連のスレッドを構成       |
| Run        | Thread 内の個別の実行単位。1つの Thread は複数の Run を持ちうる      |
| Task       | 最小の作業単位。各 Task は一意の `task_id` を持つ                    |

### 3.2 階層構造

```
Session (session_id: "sess-20250112-001")
├── Thread (thread_id: "thr-001")
│   ├── Run (run_id: "run-001")
│   │   ├── Task (task_id: "task-001", type: USER_INPUT)
│   │   ├── Task (task_id: "task-002", type: CLARIFICATION_REQUEST)
│   │   └── Task (task_id: "task-003", type: USER_RESPONSE)
│   └── Run (run_id: "run-002")
│       ├── Task (task_id: "task-004", type: EXECUTOR_START)
│       └── Task (task_id: "task-005", type: EXECUTOR_OUTPUT)
└── Thread (thread_id: "thr-002")
    └── Run (run_id: "run-003")
        └── Task (task_id: "task-006", type: USER_INPUT)
```

### 3.3 親子関係（Parent-Child Relationship）

各タスクは親タスクへの参照を持つことができる:

```json
{
  "task_id": "task-005",
  "parent_task_id": "task-004",
  "thread_id": "thr-001",
  "run_id": "run-002",
  "session_id": "sess-20250112-001"
}
```

**親子関係のルール:**
- `parent_task_id` は同一 Thread 内のタスクのみ参照可能
- ルートタスク（スレッドの最初のタスク）は `parent_task_id: null`
- 子タスクは親タスクの完了後にのみ作成可能

### 3.4 ID 生成規則

| ID 種別      | フォーマット                           | 例                        |
| ------------ | -------------------------------------- | ------------------------- |
| session_id   | `sess-YYYYMMDD-NNN`                    | `sess-20250112-001`       |
| thread_id    | `thr-NNN`（セッション内連番）          | `thr-001`                 |
| run_id       | `run-NNN`（セッション内連番）          | `run-001`                 |
| task_id      | `task-NNN`（セッション内連番）         | `task-001`                |

### 3.5 ツリー表示（/logs --tree）

```
/logs --tree

Session: sess-20250112-001
├─ [thr-001] Create TypeScript file
│  ├─ [run-001] Clarification
│  │  ├─ task-001 USER_INPUT "Create a new TypeScript file"
│  │  ├─ task-002 CLARIFICATION_REQUEST "What should be the file name?"
│  │  └─ task-003 USER_RESPONSE "utils.ts"
│  └─ [run-002] Execution
│     ├─ task-004 EXECUTOR_START
│     └─ task-005 EXECUTOR_OUTPUT "File created: src/utils.ts"
└─ [thr-002] Add tests
   └─ [run-003] Input
      └─ task-006 USER_INPUT "Add unit tests for utils.ts"
```

---

## 4. Two-Layer Log Viewing

### 4.1 Layer 1: Task List (TaskLogIndex)

`/logs` コマンド実行時、まずタスク一覧を表示する。

表示フォーマット:
```
Task Logs:

  ID      Status      Started               Provider   Model
  ----    --------    -------------------   --------   -----
  001     COMPLETE    2025-01-12 10:30:00   openai     gpt-4o
  002     ERROR       2025-01-12 11:00:00   anthropic  claude-3-5-sonnet
> 003     RUNNING     2025-01-12 11:30:00   claude-code -

Enter task ID to view details, or 'q' to exit:
```

### 4.2 Layer 2: Task Detail (TaskLog)

タスク ID 入力時、該当タスクの詳細ログを表示する。

表示フォーマット（summary モード）:
```
Task 003 - RUNNING
Started: 2025-01-12 11:30:00
Provider: claude-code

Events:
  [11:30:00] USER_INPUT
    "Create a new TypeScript file"

  [11:30:05] CLARIFICATION_REQUEST
    "What should be the file name?"

  [11:30:15] USER_RESPONSE
    "utils.ts"

  [11:30:20] MEDIATION_OUTPUT
    Task accepted. Creating utils.ts...

Use --full to see executor details.
```

表示フォーマット（full モード）:
```
Task 003 - RUNNING
Started: 2025-01-12 11:30:00
Provider: claude-code

Events:
  [11:30:00] USER_INPUT
    "Create a new TypeScript file"

  [11:30:05] CLARIFICATION_REQUEST
    "What should be the file name?"

  [11:30:15] USER_RESPONSE
    "utils.ts"

  [11:30:20] MEDIATION_OUTPUT
    Task accepted. Creating utils.ts...

  [11:30:21] EXECUTOR_START
    Provider: claude-code
    Model: -

  [11:30:25] EXECUTOR_PROGRESS
    Writing file: src/utils.ts

  [11:30:30] EXECUTOR_OUTPUT
    File created: src/utils.ts (245 bytes)
```

---

## 5. Visibility Control

### 5.1 「見えすぎ防止」原則（Principle of Minimal Visibility）

**基本方針:** 既定では最小限の情報のみを表示し、詳細は明示的な要求があった場合のみ表示する。

**理由:**
- ユーザーの混乱を防ぐ（Executor詳細は通常不要）
- セキュリティリスクの低減（意図しない情報漏洩を防止）
- ログの可読性向上（重要な情報にフォーカス）

**原則:**
1. `summary` が常に既定（明示的に `--full` を指定しない限り）
2. Executor 詳細は技術者向け（デバッグ用途）
3. ユーザー ↔ LLM Mediation のやり取りが主要な関心事

### 5.2 Visibility Levels

| Level     | 表示対象                                           | 用途             |
| --------- | ------------------------------------------------- | ---------------- |
| `summary` | USER_INPUT, USER_RESPONSE, CLARIFICATION_REQUEST, MEDIATION_OUTPUT, TASK_COMPLETE, TASK_ERROR | 通常利用         |
| `full`    | 上記 + EXECUTOR_START, EXECUTOR_PROGRESS, EXECUTOR_OUTPUT, EXECUTOR_ERROR, EVIDENCE_CREATED, MODEL_CHANGE | デバッグ/監査用  |

### 5.3 Event Type と Visibility Mapping

| Event Type            | summary | full | 説明                              |
| --------------------- | ------- | ---- | --------------------------------- |
| USER_INPUT            | Yes     | Yes  | ユーザーの入力プロンプト          |
| USER_RESPONSE         | Yes     | Yes  | 質問返しへのユーザー回答          |
| CLARIFICATION_REQUEST | Yes     | Yes  | LLM Mediationからの質問返し       |
| MEDIATION_OUTPUT      | Yes     | Yes  | LLM Mediationの最終出力           |
| TASK_COMPLETE         | Yes     | Yes  | タスク正常完了                    |
| TASK_ERROR            | Yes     | Yes  | タスクエラー                      |
| EXECUTOR_START        | No      | Yes  | Executor開始（内部詳細）          |
| EXECUTOR_PROGRESS     | No      | Yes  | Executor進捗（内部詳細）          |
| EXECUTOR_OUTPUT       | No      | Yes  | Executor出力（内部詳細）          |
| EXECUTOR_ERROR        | No      | Yes  | Executorエラー（内部詳細）        |
| EVIDENCE_CREATED      | No      | Yes  | Evidence生成（検証用）            |
| MODEL_CHANGE          | No      | Yes  | モデル変更（設定変更）            |
| REVIEW_LOOP_START     | Yes     | Yes  | Review Loop開始                   |
| REVIEW_ITERATION_START| No      | Yes  | Review Loopイテレーション開始     |
| QUALITY_JUDGMENT      | Yes     | Yes  | 品質判定（PASS/REJECT/RETRY）     |
| REJECTION_DETAILS     | No      | Yes  | REJECT詳細（失敗基準・修正指示）  |
| MODIFICATION_PROMPT   | No      | Yes  | 修正指示プロンプト全文            |
| REVIEW_ITERATION_END  | No      | Yes  | Review Loopイテレーション終了     |
| REVIEW_LOOP_END       | Yes     | Yes  | Review Loop終了（最終結果）       |
| CHUNKING_START        | Yes     | Yes  | Task Chunking開始                 |
| CHUNKING_ANALYSIS     | No      | Yes  | タスク分割分析結果                |
| SUBTASK_CREATED       | No      | Yes  | サブタスク生成                    |
| SUBTASK_START         | Yes     | Yes  | サブタスク実行開始                |
| SUBTASK_COMPLETE      | Yes     | Yes  | サブタスク完了                    |
| SUBTASK_FAILED        | Yes     | Yes  | サブタスク失敗                    |
| SUBTASK_RETRY         | Yes     | Yes  | サブタスクリトライ                |
| CHUNKING_AGGREGATION  | No      | Yes  | 結果集約                          |
| CHUNKING_COMPLETE     | Yes     | Yes  | Task Chunking完了                 |
| PLANNING_START        | Yes     | Yes  | Task Planning開始                 |
| SIZE_ESTIMATION       | No      | Yes  | サイズ推定結果                    |
| CHUNKING_DECISION     | No      | Yes  | チャンク判定結果                  |
| DEPENDENCY_ANALYSIS   | No      | Yes  | 依存関係分析結果                  |
| EXECUTION_PLAN        | Yes     | Yes  | 実行計画確定                      |
| PLANNING_END          | Yes     | Yes  | Task Planning完了                 |
| RETRY_DECISION        | Yes     | Yes  | リトライ判定（RETRY/ESCALATE）    |
| RETRY_START           | Yes     | Yes  | リトライ開始                      |
| RETRY_SUCCESS         | Yes     | Yes  | リトライ成功                      |
| ESCALATE_DECISION     | Yes     | Yes  | ESCALATE判定                      |
| ESCALATE_EXECUTED     | Yes     | Yes  | ESCALATE実行                      |
| RECOVERY_START        | No      | Yes  | リカバリー開始                    |
| SNAPSHOT_RESTORE      | No      | Yes  | スナップショット復元              |
| RECOVERY_COMPLETE     | Yes     | Yes  | リカバリー完了                    |
| MODEL_SELECTED        | No      | Yes  | モデル選択                        |
| MODEL_SWITCH          | Yes     | Yes  | モデル切り替え（エスカレーション）|
| MODEL_USAGE           | No      | Yes  | トークン使用量                    |
| COST_WARNING          | Yes     | Yes  | コスト警告（80%超過）             |
| COST_LIMIT_EXCEEDED   | Yes     | Yes  | コスト上限到達                    |
| MODEL_FALLBACK        | Yes     | Yes  | フォールバック発動                |

### 5.4 Default Behavior

- 既定の可視性レベルは `summary`（見えすぎ防止原則）
- `--full` オプション指定時のみ `full` レベルで表示
- 可視性レベルはログの保存には影響しない（表示制御のみ）
- 保存時は全イベントを記録（監査可能性を確保）

### 5.5 コマンド例

```bash
# summary モード（既定）- ユーザー ↔ LLM Mediation のやり取りのみ
/logs
/logs 003

# full モード - Executor詳細を含む全情報
/logs --full
/logs 003 --full

# ツリー表示 - Thread/Run構造を可視化
/logs --tree
```

---

## 6. Sensitive Data Masking

### 6.1 マスキング対象パターン（Property 24 準拠）

| パターン名              | 正規表現                                  | マスク後                       | 優先度 |
| ----------------------- | ----------------------------------------- | ------------------------------ | ------ |
| OpenAI API Key          | `sk-[A-Za-z0-9]{20,}`                     | `[MASKED:OPENAI_KEY]`          | 1      |
| Anthropic API Key       | `sk-ant-[A-Za-z0-9-]{20,}`                | `[MASKED:ANTHROPIC_KEY]`       | 1      |
| Google API Key          | `AIza[A-Za-z0-9_-]{35}`                   | `[MASKED:GOOGLE_KEY]`          | 1      |
| AWS Access Key          | `AKIA[A-Z0-9]{16}`                        | `[MASKED:AWS_KEY]`             | 1      |
| Authorization Header    | `(?i)authorization:\s*bearer\s+\S+`       | `[MASKED:AUTH_HEADER]`         | 2      |
| Cookie Header           | `(?i)cookie:\s*\S+`                       | `[MASKED:COOKIE]`              | 2      |
| Set-Cookie Header       | `(?i)set-cookie:\s*\S+`                   | `[MASKED:SET_COOKIE]`          | 2      |
| Generic Secret (Key=Val)| `(?i)(password|secret|token|api_key)=\S+` | `[MASKED:CREDENTIAL]`          | 3      |
| Generic Secret (JSON)   | `(?i)"(password|secret|token|api_key)":\s*"[^"]+"`| `[MASKED:JSON_CREDENTIAL]` | 3      |
| JWT Token               | `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` | `[MASKED:JWT]`     | 2      |
| Private Key Block       | `-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----` | `[MASKED:PRIVATE_KEY]` | 1 |

**優先度:**
- 1: 即座に漏洩が危険（API キー、秘密鍵）
- 2: セッション/認証情報（トークン、Cookie）
- 3: 汎用的な機密情報

### 6.2 マスキング適用タイミング

- **保存時**: ログをファイルに書き込む際に適用（第一防御線）
- **表示時**: ログを画面に表示する際に適用（第二防御線）
- **二重防御**: 両方で適用することで、一方が失敗しても漏洩を防止

### 6.3 マスキング処理の実装

```typescript
interface MaskPattern {
  name: string;
  regex: RegExp;
  mask: string;
  priority: number;
}

const MASK_PATTERNS: MaskPattern[] = [
  // Priority 1: Immediate danger
  { name: 'openai_key', regex: /sk-[A-Za-z0-9]{20,}/g, mask: '[MASKED:OPENAI_KEY]', priority: 1 },
  { name: 'anthropic_key', regex: /sk-ant-[A-Za-z0-9-]{20,}/g, mask: '[MASKED:ANTHROPIC_KEY]', priority: 1 },
  { name: 'google_key', regex: /AIza[A-Za-z0-9_-]{35}/g, mask: '[MASKED:GOOGLE_KEY]', priority: 1 },
  { name: 'aws_key', regex: /AKIA[A-Z0-9]{16}/g, mask: '[MASKED:AWS_KEY]', priority: 1 },
  { name: 'private_key', regex: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----/g, mask: '[MASKED:PRIVATE_KEY]', priority: 1 },

  // Priority 2: Session/Auth tokens
  { name: 'jwt', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, mask: '[MASKED:JWT]', priority: 2 },
  { name: 'auth_header', regex: /(?:authorization|Authorization):\s*[Bb]earer\s+\S+/g, mask: '[MASKED:AUTH_HEADER]', priority: 2 },
  { name: 'cookie', regex: /(?:cookie|Cookie):\s*\S+/g, mask: '[MASKED:COOKIE]', priority: 2 },
  { name: 'set_cookie', regex: /(?:set-cookie|Set-Cookie):\s*\S+/g, mask: '[MASKED:SET_COOKIE]', priority: 2 },

  // Priority 3: Generic secrets
  { name: 'credential_kv', regex: /(?:password|secret|token|api_key|apiKey|api-key)=\S+/gi, mask: '[MASKED:CREDENTIAL]', priority: 3 },
  { name: 'credential_json', regex: /"(?:password|secret|token|api_key|apiKey)":\s*"[^"]+"/gi, mask: '[MASKED:JSON_CREDENTIAL]', priority: 3 },
];

function maskSensitiveData(content: string): string {
  // Sort by priority (lower = higher priority)
  const sortedPatterns = [...MASK_PATTERNS].sort((a, b) => a.priority - b.priority);

  let masked = content;
  for (const { regex, mask } of sortedPatterns) {
    masked = masked.replace(regex, mask);
  }
  return masked;
}
```

### 6.4 Fail-Safe（絶対漏洩防止）

**原則:** マスキング処理は絶対に失敗してはならない。

- マスキング処理でエラーが発生した場合、該当コンテンツは `[MASKING_ERROR: content_hidden]` として表示
- マスキング前のコンテンツが漏洩しないことを保証
- エラー発生時のログ出力には、エラー詳細のみを記録（元コンテンツは含めない）

```typescript
function safeMaskSensitiveData(content: string): string {
  try {
    return maskSensitiveData(content);
  } catch (error) {
    // NEVER expose original content on error
    console.error('[Masking Error]', error instanceof Error ? error.message : 'Unknown error');
    return '[MASKING_ERROR: content_hidden]';
  }
}
```

### 6.5 マスキング検証テスト

**Property 24 検証用テストパターン:**

```typescript
const TEST_CASES = [
  { input: 'API key: sk-1234567890abcdefghij', expected: 'API key: [MASKED:OPENAI_KEY]' },
  { input: 'Authorization: Bearer eyJhbGci...', expected: '[MASKED:AUTH_HEADER]' },
  { input: 'Cookie: session=abc123', expected: '[MASKED:COOKIE]' },
  { input: '{"api_key": "secret123"}', expected: '[MASKED:JSON_CREDENTIAL]' },
];
```

---

## 7. Log Event Recording

### 7.1 イベント記録タイミング

| Event Type            | 記録タイミング                           |
| --------------------- | --------------------------------------- |
| USER_INPUT            | ユーザーがプロンプトを入力した時点       |
| USER_RESPONSE         | 質問返しに対してユーザーが応答した時点   |
| CLARIFICATION_REQUEST | Runner が質問返しを生成した時点          |
| MEDIATION_OUTPUT      | LLM Mediation Layer が出力を生成した時点 |
| EXECUTOR_START        | Executor 呼び出しを開始した時点          |
| EXECUTOR_PROGRESS     | Executor が進捗を報告した時点            |
| EXECUTOR_OUTPUT       | Executor が出力を返した時点              |
| EXECUTOR_ERROR        | Executor がエラーを報告した時点          |
| TASK_COMPLETE         | タスクが COMPLETE と判定された時点       |
| TASK_INCOMPLETE       | タスクが INCOMPLETE と判定された時点（Evidence検証失敗等） |
| TASK_ERROR            | タスクが ERROR と判定された時点          |
| EVIDENCE_CREATED      | Evidence が生成された時点                |
| EVIDENCE_MISSING      | Evidence が不足している（検証失敗）時点  |
| MODEL_CHANGE          | モデル設定が変更された時点               |
| REVIEW_LOOP_START     | Review Loop を開始した時点               |
| REVIEW_ITERATION_START| Review Loop の各イテレーション開始時点   |
| QUALITY_JUDGMENT      | LLM Layer が品質判定を完了した時点       |
| REJECTION_DETAILS     | REJECT 判定の詳細を記録した時点          |
| MODIFICATION_PROMPT   | 修正指示プロンプトを生成した時点         |
| REVIEW_ITERATION_END  | Review Loop の各イテレーション終了時点   |
| REVIEW_LOOP_END       | Review Loop が終了した時点               |
| CHUNKING_START        | Task Chunking 分析を開始した時点         |
| CHUNKING_ANALYSIS     | タスク分割分析が完了した時点             |
| SUBTASK_CREATED       | サブタスクが生成された時点               |
| SUBTASK_START         | サブタスクの実行を開始した時点           |
| SUBTASK_COMPLETE      | サブタスクが正常完了した時点             |
| SUBTASK_FAILED        | サブタスクが失敗した時点                 |
| SUBTASK_RETRY         | サブタスクをリトライ開始した時点         |
| CHUNKING_AGGREGATION  | サブタスク結果の集約を開始した時点       |
| CHUNKING_COMPLETE     | Task Chunking が完了した時点             |
| PLANNING_START        | Task Planning を開始した時点             |
| SIZE_ESTIMATION       | サイズ推定が完了した時点                 |
| CHUNKING_DECISION     | チャンク判定が完了した時点               |
| DEPENDENCY_ANALYSIS   | 依存関係分析が完了した時点               |
| EXECUTION_PLAN        | 実行計画が確定した時点                   |
| PLANNING_END          | Task Planning が完了した時点             |
| RETRY_DECISION        | リトライ判定（RETRY/ESCALATE）を決定した時点 |
| RETRY_START           | リトライを開始した時点                   |
| RETRY_SUCCESS         | リトライが成功した時点                   |
| ESCALATE_DECISION     | ESCALATE 判定を決定した時点              |
| ESCALATE_EXECUTED     | ESCALATE を実行した時点                  |
| RECOVERY_START        | リカバリーを開始した時点                 |
| SNAPSHOT_RESTORE      | スナップショットを復元した時点           |
| RECOVERY_COMPLETE     | リカバリーが完了した時点                 |
| MODEL_SELECTED        | モデルを選択した時点                     |
| MODEL_SWITCH          | モデルを切り替えた時点（エスカレーション）|
| MODEL_USAGE           | トークン使用量を記録した時点             |
| COST_WARNING          | コスト警告（80%超過）を発行した時点      |
| COST_LIMIT_EXCEEDED   | コスト上限に到達した時点                 |
| MODEL_FALLBACK        | フォールバックを発動した時点             |

### 7.2 イベント記録フォーマット

```json
{
  "event_type": "USER_INPUT",
  "timestamp": "2025-01-12T11:30:00.000Z",
  "visibility": "summary",
  "content": {
    "prompt": "Create a new TypeScript file"
  }
}
```

### 7.3 Atomic Recording

- 各イベントは個別にファイルに追記される
- 追記前にファイルロックを取得
- 追記失敗時はリトライ（最大 3 回）
- リトライ失敗時は WARNING をログに出力し、処理は継続

---

## 8. Log Retention and Rotation

### 8.1 保持期間

- 既定の保持期間: 30 日
- 保持期間は設定可能（`runner.config.json` で指定）

### 8.2 サイズ制限

| 項目                     | 制限値       | 超過時の動作                           |
| ------------------------ | ------------ | -------------------------------------- |
| 単一タスクログファイル   | 10 MB        | 古いイベントを削除（FIFO）             |
| セッションログ合計       | 100 MB       | 古いタスクログを削除                   |
| 全体ログディレクトリ     | 1 GB         | 古いセッションを削除                   |
| 単一イベントサイズ       | 1 MB         | 切り詰め + `[TRUNCATED]` マーカー付与  |

### 8.3 ローテーションポリシー

**自動ローテーション:**
- Runner 起動時に古いログを自動削除
- 削除対象: `updated_at` が保持期間を超過したタスクログ
- インデックスからも該当エントリを削除

**サイズベースローテーション:**
- ディレクトリサイズが制限を超えた場合、古いセッションから削除
- 削除前に WARNING をログ出力

### 8.4 手動クリーンアップ

```bash
/logs --clear           # 全ログを削除（確認プロンプトあり）
/logs --clear --force   # 確認なしで全ログを削除
/logs --clear --older-than 7d  # 7日より古いログを削除
```

### 8.5 設定例

```json
// runner.config.json
{
  "logging": {
    "retention_days": 30,
    "max_task_log_size_mb": 10,
    "max_session_log_size_mb": 100,
    "max_total_log_size_mb": 1024,
    "max_event_size_mb": 1
  }
}
```

---

## 9. Observability Integration

### 9.1 メトリクス

Runner は以下のメトリクスを収集可能とする（将来対応）:

- タスク完了数 / エラー数
- 平均タスク実行時間
- Provider 別の使用頻度
- Model 別の使用頻度

### 9.2 トレーシング

- 各タスクには一意の `task_id` が付与される
- `task_id` はログ、Evidence、エラーメッセージで一貫して使用される
- 外部トレーシングシステムとの連携は将来対応

### 9.3 アラート

- ERROR 状態のタスクが連続 3 件発生した場合の警告（将来対応）
- API キー未設定時の警告表示

---

## 10. Error Handling

### 10.1 ログ書き込みエラー

- ファイルシステムエラー時は WARNING を出力し、処理は継続
- ログ記録の失敗はタスク実行を停止しない（best-effort）

### 10.2 ログ読み込みエラー

- インデックスファイル破損時は空の一覧を表示
- 個別タスクログ破損時は「Log file corrupted」を表示

### 10.3 ディスク容量不足

- 書き込み失敗が連続した場合、古いログの自動削除を試行
- それでも失敗した場合は WARNING を出力

---

## 11. Non-Interactive Mode Logging Guarantees

### 11.1 概要

非対話モード（stdin script / heredoc / pipe）では、タスクログの書き込みが確実に完了してから REPL が終了することを保証する。

**重要:** 非対話モードでは EOF 到達時に即座に終了するため、非同期のログ書き込みが完了する前にプロセスが終了するリスクがある。これを防止するため、以下の保証を提供する。

### 11.2 Flush/Close 保証（Property 28 準拠）

```
非対話モードでのタスク終了シーケンス:

  [タスク実行完了]
       │
       v
  [TaskLog 書き込み開始]
       │
       v
  [ファイルシステムへの sync 完了を await]
       │
       v
  [TaskLogIndex 更新]
       │
       v
  [ファイルシステムへの sync 完了を await]
       │
       v
  [次のコマンド処理 または REPL 終了]
```

### 11.3 実装要件

**TaskLog 保存時の同期化:**

```typescript
// 非同期書き込み後に sync を待機
async function saveTaskLog(taskLog: TaskLog): Promise<void> {
  const filePath = getTaskLogPath(taskLog.session_id, taskLog.task_id);
  const content = JSON.stringify(taskLog, null, 2);

  // 書き込み
  await fs.promises.writeFile(filePath, content, 'utf-8');

  // 非対話モードでは sync を強制（データロス防止）
  if (isNonInteractiveMode()) {
    const fd = await fs.promises.open(filePath, 'r');
    await fd.sync();
    await fd.close();
  }
}
```

**REPL 終了時の保証:**

```typescript
// 非対話モードでの REPL 終了シーケンス
async function exitRepl(): Promise<void> {
  // 1. 保留中のログ書き込みを全て完了
  await taskLogManager.flushAll();

  // 2. stdout のドレインを待機
  if (process.stdout.writableNeedDrain) {
    await new Promise(resolve => process.stdout.once('drain', resolve));
  }

  // 3. 終了コードを設定して終了
  process.exit(exitCode);
}
```

### 11.4 RawLog の保存保証

生ログ（Executor 出力等）も同様に保存を保証する:

- `raw/<session_id>/<task_id>_<event_id>.log` への書き込み後に sync
- 大量の出力がある場合はストリーム書き込みを使用し、完了を await

### 11.5 エラー発生時の保証

タスクが ERROR で終了した場合も、必ず以下を保存する:

1. TaskLog（status: error, error_reason 含む）
2. 関連する RawLog（存在する場合）
3. TaskLogIndex の更新

**保存前にプロセスが強制終了した場合:**
- 次回起動時に不完全なログファイルを検出
- 可能な限り復旧を試行
- 復旧不能な場合は WARNING を出力

### 11.6 タイムアウト処理

非対話モードでの長時間実行タスクに対する保護:

```typescript
// 非対話モードでのタイムアウト設定
const NON_INTERACTIVE_TIMEOUT = 300000; // 5分

async function executeWithTimeout(task: Task): Promise<TaskResult> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Task timeout in non-interactive mode')), NON_INTERACTIVE_TIMEOUT)
  );

  return Promise.race([executeTask(task), timeoutPromise]);
}
```

### 11.7 テスト要件

以下をテストで担保する:

- 非対話モードで TaskLog が確実にファイルに保存される
- 非対話モードで RawLog が確実にファイルに保存される
- EOF 到達時に保留中の書き込みが完了してから終了する
- ERROR 状態でも TaskLog が保存される
- タイムアウト時に適切なエラーログが保存される

---

## 12. Cross-References

- Property 24: API Key Secrecy (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 25: Log Visibility Control (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 26: TaskLog Lifecycle Recording (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 27: /tasks-/logs Consistency (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 28: Non-Interactive REPL Output Integrity (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 29: Deterministic Exit Code in Non-Interactive Mode (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 30: Task ID Cross-Reference Display (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 31: Verified Files Detection (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 32: Non-Volatile Project Root (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 33: Verified Files Traceability (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 34: Executor stdin Blocking in Non-Interactive Mode (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 35: Task Terminal State Guarantee in Non-Interactive Mode (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 36: Subsequent Command Processing Guarantee in Non-Interactive Mode (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 37: Deterministic Integration Testing (spec/06_CORRECTNESS_PROPERTIES.md)
- IExecutor Interface (spec/05_DATA_MODELS.md)
- TaskLog Data Models (spec/05_DATA_MODELS.md)
- /logs Command (spec/10_REPL_UX.md)
- Non-Interactive Mode (spec/10_REPL_UX.md)
- Project Mode (spec/10_REPL_UX.md)
- Task Planning イベント (spec/29_TASK_PLANNING.md)
- Retry/Recovery イベント (spec/30_RETRY_AND_RECOVERY.md)
- Model Policy イベント (spec/31_PROVIDER_MODEL_POLICY.md)
- Conversation Trace イベント (spec/28_CONVERSATION_TRACE.md)
