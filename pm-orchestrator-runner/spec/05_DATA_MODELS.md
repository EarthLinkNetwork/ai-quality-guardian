# 05_DATA_MODELS.md

# Data Models

## Core Data Structures

本章は PM Orchestrator Runner における、
すべての永続化データおよび通信データ構造の正確な定義を示す。

ここに記載されていないフィールドの追加、
既存フィールドの解釈変更、省略は すべて仕様違反 とする。

---

## Session

Session は 1 回の Runner 実行単位を表す。

- **session_id**
  セッションを一意に識別する文字列。
- **started_at**
  ISO 8601 形式の開始時刻。
- **target_project**
  対象プロジェクトの絶対パス。
- **runner_version**
  Runner のバージョン文字列。
- **configuration**
  解決済み Configuration 全体。
- **current_phase**
  現在のフェーズを示す Phase 列挙値。
- **status**
  セッション全体の状態を示す SessionStatus。
- **continuation_approved**
  明示的に継続が承認されたかを示す真偽値。
- **limit_violations**
  発生した制限違反の配列。存在しない場合は空配列とする。
- **selected_provider**
  選択された LLM プロバイダー識別子。ReplState から引き継がれる。
- **selected_model**
  選択された LLM モデル名。ReplState から引き継がれる。

---

## Thread

Thread は会話スレッドを表す。1つのセッション内に複数のスレッドが存在できる。

- **thread_id**
  スレッドを一意に識別する文字列。形式: `thr_<連番>`
- **session_id**
  所属セッションの識別子。
- **thread_type**
  スレッド種別。ThreadType 列挙値。
- **created_at**
  ISO 8601 形式の作成時刻。
- **description**
  スレッドの人間可読な説明（省略可能）。

### ThreadType

| 値 | 説明 |
|---|---|
| `main` | メイン会話スレッド（ユーザーとの対話） |
| `background` | バックグラウンド実行スレッド（Executor 処理） |
| `system` | システム内部スレッド |

---

## Run

Run は一連のタスク実行単位を表す。1つのスレッド内に複数の Run が存在できる。

- **run_id**
  Run を一意に識別する文字列。形式: `run_<連番>`
- **thread_id**
  所属スレッドの識別子。
- **session_id**
  所属セッションの識別子。
- **started_at**
  ISO 8601 形式の開始時刻。
- **completed_at**
  ISO 8601 形式の完了時刻。未完了の場合は null。
- **status**
  Run の現在状態を示す RunStatus。
- **trigger**
  Run を開始したトリガー種別。RunTrigger 列挙値。

### RunStatus

| 値 | 説明 |
|---|---|
| `RUNNING` | 実行中 |
| `COMPLETED` | 正常完了 |
| `FAILED` | エラーで終了 |
| `CANCELLED` | キャンセルされた |

### RunTrigger

| 値 | 説明 |
|---|---|
| `USER_INPUT` | ユーザー入力により開始 |
| `USER_RESPONSE` | ユーザー回答により開始 |
| `CONTINUATION` | 自動継続により開始 |
| `EXECUTOR` | Executor 処理により開始 |

---

## Task

Task は Runner が管理する 最小の実行単位である。

- **task_id**
  タスクを一意に識別する文字列。
- **thread_id**
  所属スレッドの識別子。
- **run_id**
  所属 Run の識別子。
- **parent_task_id**
  親タスクの識別子。ルートタスクの場合は null。
  タスクが分解された場合、分解元タスクが親となる。
- **description**
  タスクの人間可読な説明。
- **requirements**
  当該タスクに適用される要求事項の配列。
- **status**
  タスクの現在状態を示す TaskStatus。
- **assigned_executor**
  担当 Executor の識別子。未割当の場合は存在しない。
- **evidence_refs**
  関連付けられた Evidence の識別子配列。
- **files_modified**
  当該タスクで変更されたファイルの絶対パス配列。
- **tests_run**
  実行されたテスト結果の配列。
- **tests_required_before_implementation**
  実装前にテスト存在が必須であることを示す真偽値。
- **granularity_limits**
  当該タスクに適用される TaskLimits。
- **decomposition_approved_by_runner**
  タスク分解が Runner により承認されたことを示す真偽値。
- **log_ref**
  当該タスクに対応する TaskLog の識別子。

---

## TaskResult

TaskResult は Task の実行結果を表す。

- **task_id**
  タスクを一意に識別する文字列。
- **status**
  タスクの完了状態を示す TaskStatus。
- **started_at**
  ISO 8601 形式の開始時刻。
- **completed_at**
  ISO 8601 形式の完了時刻。未完了の場合は存在しない。
- **error**
  発生したエラー情報。エラーがない場合は存在しない。
- **evidence**
  タスク実行の証跡情報。
- **clarification_needed**
  Runner がユーザーに確認を求める必要があることを示す真偽値。
  タスクが曖昧で Executor を呼び出す前に確認が必要な場合に true。
- **clarification_question**
  ユーザーへの確認質問文字列。1-2 行、推測表現を含まない。
  clarification_needed が true の場合のみ存在する。
  質問は以下の 2 種類に分岐する：
  - "create/add/update" 系：「対象のファイル名またはパスを指定してください。」
  - "fix/change/modify" 系：「どの機能/箇所を修正しますか？（例: コマンド名、エラー文、対象ファイル）」

---

## Evidence

Evidence は 1 つの論理操作に対応する証跡単位である。

- **evidence_id**
  証跡を一意に識別する文字列。
- **timestamp**
  ISO 8601 形式の記録時刻。
- **operation_type**
  操作種別を示す文字列。
- **executor_id**
  操作を実行した Executor の識別子。該当しない場合は存在しない。
- **artifacts**
  生成または参照された Artifact の配列。
- **hash**
  当該 Evidence 自体の SHA-256 ハッシュ。
- **raw_logs**
  対応する生ログファイルへのパス。
- **atomic_operation**
  単一論理操作であることを示す真偽値。
- **raw_evidence_refs**
  元となる生証跡の識別子配列。
- **integrity_validated**
  整合性検証が完了していることを示す真偽値。
- **contains_sensitive_data**
  機密データ（API キー等）を含むかを示す真偽値。
  true の場合、当該 Evidence はマスキング処理済みでなければならない。

---

## FileLock

FileLock はファイル単位の排他制御情報である。

- **lock_id**
  ロックを一意に識別する文字列。
- **file_path**
  ロック対象ファイルの絶対パス。
- **holder_executor_id**
  ロック保持中の Executor 識別子。
- **acquired_at**
  ISO 8601 形式の取得時刻。
- **expires_at**
  デッドロック検出の参考時刻。
  自動解放の判断には使用してはならない。
- **lock_type**
  READ または WRITE のいずれか。

---

## ExecutionResult

ExecutionResult は Runner 実行完了時に生成される結果構造である。

- **overall_status**
  OverallStatus 列挙値。
- **tasks**
  当該セッションで扱われたすべての Task 配列。
- **evidence_summary**
  Evidence の集約情報。
- **next_action**
  次の操作が可能かどうかを示す真偽値。
  以下のルールで決定される：
  - clarification が存在する場合：true（ユーザーが回答する必要がある）
  - それ以外：overall_status が ERROR/INVALID 以外なら true
  - ERROR/INVALID の場合：false
- **next_action_reason**
  次操作判断の理由を示す文字列。
  clarification が存在する場合のみ、clarification_question の内容が設定される。
  それ以外の場合は undefined。
- **violations**
  発生した仕様違反の配列。
- **session_id**
  対象セッションの識別子。
- **incomplete_task_reasons**
  未完了タスクの理由配列。
- **evidence_inventory**
  EvidenceInventory 構造。
- **speculative_language_detected**
  推測的言語が検出されたかを示す真偽値。
- **selected_provider**
  使用された LLM プロバイダー識別子。
- **selected_model**
  使用された LLM モデル名。

---

## Supporting Structures

### TaskLimits

Task に適用される制限。

- **max_files**
  変更可能な最大ファイル数。
- **max_tests**
  実行可能な最大テスト数。
- **max_seconds**
  最大実行時間（秒）。

---

### LimitViolation

制限違反の記録。

- **limit_type**
  違反した制限種別。
- **limit_value**
  許容上限値。
- **actual_value**
  実際に観測された値。
- **timestamp**
  ISO 8601 形式の発生時刻。
- **resolution_required**
  明示的対応が必要であることを示す真偽値。

---

### EvidenceInventory

証跡全体の集約情報。

- **total_evidence_items**
  証跡総数。
- **missing_evidence_operations**
  証跡欠落が発生した操作の識別子配列。
- **integrity_failures**
  整合性検証失敗の識別子配列。
- **raw_evidence_files**
  生証跡ファイルのパス配列。

---

## REPL State Structures

### ReplState

REPL セッションの永続化状態。`.claude/repl.json` に保存される。

- **selected_provider**
  選択された LLM プロバイダー識別子。
  有効な値: `"claude-code"` | `"openai"` | `"anthropic"` | `null`
  null は未設定を示す。
- **selected_model**
  選択された LLM モデル名（任意の非空文字列）。
  Runner は存在確認・課金確認を行わない。
  null は未設定を示す。
- **updated_at**
  最終更新時刻。ISO 8601 形式。
  null は未更新を示す。
- **current_task_id**
  現在実行中のタスク識別子。
  タスクが `running` 状態の場合のみ非 null。
  タスクが終端状態（`complete` | `incomplete` | `error`）に遷移した時点で null にリセットされる。
  null は実行中タスクなしを示す。
- **last_task_id**
  最後に終端状態に到達したタスクの識別子。
  タスクが終端状態に遷移するたびに更新される。
  null は終端タスクなし（セッション開始直後）を示す。

### ReplState スキーマ（固定）

```json
{
  "selected_provider": string | null,
  "selected_model": string | null,
  "updated_at": string | null,
  "current_task_id": string | null,
  "last_task_id": string | null
}
```

### ReplState 初期値

```json
{
  "selected_provider": null,
  "selected_model": null,
  "updated_at": null,
  "current_task_id": null,
  "last_task_id": null
}
```

### ReplState 制約

- selected_provider が null でない場合、有効な Provider 識別子でなければならない。
- selected_model は任意の非空文字列を許容する（Runner は検証しない）。
- updated_at は ISO 8601 形式でなければならない。
- current_task_id は `running` 状態のタスクのみを指す。終端状態のタスク ID を保持してはならない。
- last_task_id は最後に終端状態に到達したタスクを指す。`running` 状態のタスク ID を保持してはならない。
- 破損（JSON パース不可）は E105 相当で ERROR とする。推測復旧禁止。

### current_task_id / last_task_id 遷移規則

```
タスク開始時:
  current_task_id = <新タスクID>
  last_task_id = 変更なし

タスク終端状態到達時（complete | incomplete | error）:
  last_task_id = current_task_id
  current_task_id = null
```

この遷移は Fail-Closed で実装されなければならない。
終端状態到達時に current_task_id が null にリセットされない場合、
次の /tasks 表示で誤った「現在実行中」表示となる。

---

### ReplExecutionMode

REPL の実行モードを示す列挙値。

| 値 | 説明 |
|---|---|
| `interactive` | 対話モード（TTY 接続時、readline 使用） |
| `non_interactive` | 非対話モード（stdin script / heredoc / pipe） |

### ReplExecutionMode 検出規則

1. `--non-interactive` フラグが指定された場合 → `non_interactive`
2. `process.stdin.isTTY === false` の場合 → `non_interactive`
3. それ以外 → `interactive`

### ReplExecutionMode による動作差異

| 動作 | interactive | non_interactive |
|------|-------------|-----------------|
| プロンプト表示 | あり | なし |
| readline 使用 | あり | なし（行バッファ読み取り） |
| 矢印キー選択 UI | あり | なし（ERROR） |
| コマンド処理 | 非同期許容 | await 必須（Sequential Processing） |
| 出力フラッシュ | best-effort | 必須（await drain） |
| EOF 到達時 | 待機継続 | 終了（exit-on-eof） |
| 終了コード | 不定 | 決定論的（Property 29） |
| TaskLog 保存 | best-effort | 同期保証（Property 28） |

参照: spec/10_REPL_UX.md (Non-Interactive Mode), spec/06_CORRECTNESS_PROPERTIES.md (Property 28, 29)

---

### ReplConfig

REPL 起動時の設定構造。CLI オプションから解決される。

- **project**
  プロジェクトパス。CLI `--project` オプションから取得。
  未指定の場合はカレントディレクトリ。
- **project_mode**
  プロジェクトディレクトリモード。`temp` または `fixed`。
  CLI `--project-mode` オプションから取得。既定は `temp`。
- **project_root**
  fixed モード時の固定ルートパス。絶対パス。
  CLI `--project-root` オプションから取得。
  fixed モード時は必須、temp モード時は無視。
- **print_project_path**
  起動後にプロジェクトパスを出力するか。真偽値。
  CLI `--print-project-path` フラグから取得。既定は `false`。
- **non_interactive**
  非対話モードを強制するか。真偽値。
  CLI `--non-interactive` フラグから取得。既定は `false`。
- **exit_on_eof**
  EOF 到達時に自動終了するか。真偽値。
  CLI `--exit-on-eof` フラグから取得。
  既定は非対話モード時 `true`、対話モード時 `false`。
- **wait**
  各コマンド完了を待機するか。真偽値。
  CLI `--wait` フラグから取得。
  既定は非対話モード時 `true`、対話モード時 `false`。

### ReplConfig スキーマ

```typescript
interface ReplConfig {
  project?: string;
  project_mode: 'temp' | 'fixed';
  project_root?: string;
  print_project_path: boolean;
  non_interactive: boolean;
  exit_on_eof: boolean;
  wait: boolean;
}
```

### ReplConfig 制約

- `project_mode === 'fixed'` の場合、`project_root` は必須。
- `project_root` は絶対パスでなければならない。
- `project_root` が指定された場合、ディレクトリは存在しなければならない（自動作成禁止）。
- `project_mode === 'temp'` の場合、`project_root` は無視される（警告出力）。

### ReplConfig 解決規則

```
1. CLI オプションを解析
2. project_mode を決定（既定: temp）
3. IF project_mode === 'fixed':
     IF project_root が未指定 → ERROR
     IF project_root が存在しない → ERROR
     resolvedProjectPath = project_root
   ELSE:
     IF project_root が指定 → WARNING（無視）
     resolvedProjectPath = os.tmpdir() + '/pm-orchestrator-runner-' + randomId()
4. print_project_path が true の場合:
     出力: PROJECT_PATH=<resolvedProjectPath>
5. non_interactive モード検出（--non-interactive または isTTY === false）
6. exit_on_eof, wait のデフォルト値を non_interactive に応じて設定
```

参照: spec/10_REPL_UX.md (CLI オプション), spec/06_CORRECTNESS_PROPERTIES.md (Property 32)

---

## Task Log Structures

### TaskLogIndex

セッション内のタスクログ一覧。`.claude/logs/index.json` に保存される。

- **session_id**
  対象セッションの識別子。
- **created_at**
  インデックス作成時刻。ISO 8601 形式。
- **updated_at**
  最終更新時刻。ISO 8601 形式。
- **entries**
  TaskLogEntry の配列。

### TaskLogEntry

タスクログ一覧の各エントリ。

- **task_id**
  タスクを一意に識別する文字列（Internal Log Task ID）。
  TaskLogManager が生成。形式: `task-NNN`（連番）。
- **external_task_id**
  RunnerCore が生成したタスク識別子（External Task ID）。
  形式: `task-<timestamp>`（例: `task-1768282936521`）。
  `/tasks` と `/logs` の相互参照に使用。Property 30 準拠。
- **thread_id**
  所属スレッドの識別子。
- **run_id**
  所属 Run の識別子。
- **parent_task_id**
  親タスクの識別子。ルートタスクの場合は null。
- **status**
  タスクの現在状態を示す TaskStatus。
- **started_at**
  タスク開始時刻。ISO 8601 形式。
- **completed_at**
  タスク完了時刻。ISO 8601 形式。未完了の場合は null。
- **duration_ms**
  実行時間（ミリ秒）。未完了の場合は現在までの経過時間。
- **files_modified_count**
  変更ファイル数。verified_files のうち exists=true の件数。
- **tests_run_count**
  実行テスト数。
- **log_file**
  詳細ログファイルへの相対パス。

### TaskLogStatus

タスクログの状態を示す列挙値。

| 値 | 説明 |
|---|---|
| `queued` | タスクがキューに追加された（実行待ち） |
| `running` | タスクが実行中 |
| `complete` | タスクが正常完了（Evidence 検証済み） |
| `incomplete` | タスクが不完全（Evidence 不足または検証失敗） |
| `error` | タスクがエラーで終了 |

### EvidenceSummary

Evidence 検証結果の要約構造。

- **files_expected**
  期待されるファイルパスの配列。
- **files_verified**
  検証済み（存在確認済み）ファイルパスの配列。
- **files_missing**
  不足しているファイルパスの配列。
- **verification_passed**
  検証が成功したかを示す真偽値。
- **verification_reason**
  検証結果の理由を示す文字列。
- **verified_files**
  VerifiedFile の配列。Property 31 準拠の詳細検証結果。

### VerifiedFile

タスク実行後のファイル検証結果。Property 31 準拠。

- **path**
  ファイルの絶対パス。
- **exists**
  実ディスク上の存在確認結果（`fs.existsSync()` の結果）。
- **detected_at**
  検出時刻。ISO 8601 形式。
- **detection_method**
  検出方法。`diff`（前後比較）または `executor_claim`（Executor 申告）。

```typescript
interface VerifiedFile {
  path: string;
  exists: boolean;
  detected_at: string;
  detection_method: 'diff' | 'executor_claim';
}
```

**ステータス決定規則:**

```
verified_files.some(vf => vf.exists === true) → COMPLETE 候補
verified_files.length === 0 → NO_EVIDENCE
verified_files.every(vf => vf.exists === false) → NO_EVIDENCE
```

**files_modified_count 計算:**

```
files_modified_count = verified_files.filter(vf => vf.exists).length
```

```json
{
  "files_expected": ["src/utils.ts", "README.md"],
  "files_verified": ["src/utils.ts"],
  "files_missing": ["README.md"],
  "verification_passed": false,
  "verification_reason": "1 file(s) not found on disk"
}
```

### ArtifactList

タスクで操作されたファイル一覧の構造。

- **files_touched**
  何らかの操作が行われたファイルパスの配列。
- **files_expected**
  期待されるファイルパスの配列。
- **files_created**
  新規作成されたファイルパスの配列。
- **files_modified**
  変更されたファイルパスの配列。
- **files_deleted**
  削除されたファイルパスの配列。

```json
{
  "files_touched": ["src/utils.ts"],
  "files_expected": ["src/utils.ts", "README.md"],
  "files_created": ["src/utils.ts"],
  "files_modified": [],
  "files_deleted": []
}
```

### TaskLog

個別タスクの詳細ログ。`.claude/logs/sessions/<session_id>/tasks/<task_id>.json` に保存される。

**Fail-Closed 原則: 全ての終端状態（complete/incomplete/error）で TaskLog を必ず保存する。**

**必須フィールド:**

- **task_id**
  タスクを一意に識別する文字列。
- **session_id**
  所属セッションの識別子。
- **status**
  タスクの現在状態を示す TaskLogStatus。
- **started_at**
  タスク開始時刻。ISO 8601 形式。
- **ended_at**
  タスク終了時刻。ISO 8601 形式。実行中は null。
- **prompt_summary**
  ユーザー入力の要約（最大100文字）。
- **runner_decision**
  Runner の判断内容（accept/reject/clarify等）。
- **error_reason**
  エラー理由。status が `incomplete` / `error` の場合は必須。それ以外は null。
- **artifacts**
  操作対象ファイル一覧。ArtifactList 構造。
- **visibility**
  ログ可視性レベル。`summary` または `full`。既定は `summary`。
- **masked**
  マスキング済みフラグ。常に `true`。
- **events**
  LogEvent の配列。時系列順。最低1件必須。

**オプションフィールド:**

- **thread_id**
  所属スレッドの識別子。
- **run_id**
  所属 Run の識別子。
- **parent_task_id**
  親タスクの識別子。ルートタスクの場合は null。
- **created_at**
  ログ作成時刻。ISO 8601 形式。
- **executor_summary**
  Executor 実行結果の要約（Executor 呼び出し時のみ）。
- **evidence_summary**
  検証結果の要約。EvidenceSummary 構造。Evidence 検証時のみ。
- **summary**
  TaskLogSummary 構造。
- **evidence_refs**
  関連 Evidence の識別子配列。
- **verification_root**
  検証実行時のプロジェクトルート（絶対パス）。Property 33 準拠。
  タスク実行時に使用された実際のプロジェクトルート。
  fixed モード時は `--project-root` で指定されたパスと一致する。
- **verified_files**
  検証済みファイル一覧。VerifiedFile の配列。Property 33 準拠。
  タスク完了時に Runner が検証した全ファイルを記録。
  各ファイルの `path` は `verification_root` からの相対パスで記録。
- **executor_blocked**
  Executor がブロック状態になったかを示す真偽値。Property 34-36 準拠。
  non-interactive モードで Executor が stdin 待ち・対話プロンプト検出・タイムアウトで
  ブロックした場合に true。
- **blocked_reason**
  ブロック理由。BlockedReason 列挙値。executor_blocked が true の場合のみ存在。
  `INTERACTIVE_PROMPT`: 対話プロンプト検出
  `TIMEOUT`: タイムアウト検出
  `STDIN_REQUIRED`: stdin 入力要求検出
- **timeout_ms**
  ブロック検出までの経過時間（ミリ秒）。executor_blocked が true の場合のみ存在。
- **terminated_by**
  Executor 終了方法。TerminatedBy 列挙値。executor_blocked が true の場合のみ存在。
  `REPL_FAIL_CLOSED`: REPL の Fail-Closed 機構による自動終了
  `USER`: ユーザー操作による終了
  `TIMEOUT`: タイムアウトによる自動終了



**TaskLog JSON 例（INCOMPLETE 状態）:**

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
  "verification_root": "/tmp/pm-orchestrator-demo-12345",
  "verified_files": [
    {
      "path": "README.md",
      "exists": false,
      "detected_at": "2025-01-12T11:30:45.000Z",
      "detection_method": "executor_claim"
    }
  ],
  "evidence_summary": {
    "files_expected": ["README.md"],
    "files_verified": [],
    "files_missing": ["README.md"],
    "verification_passed": false,
    "verification_reason": "Task completed but no verified files exist on disk",
    "verified_files": [
      {
        "path": "README.md",
        "exists": false,
        "detected_at": "2025-01-12T11:30:45.000Z",
        "detection_method": "executor_claim"
      }
    ]
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
      "visibility_level": "summary",
      "content": { "text": "readmeを作って" }
    },
    {
      "event_type": "TASK_INCOMPLETE",
      "timestamp": "2025-01-12T11:30:45.000Z",
      "visibility_level": "summary",
      "content": {
        "status": "INCOMPLETE",
        "error_message": "Task completed but no verified files exist on disk"
      }
    }
  ]
}
```

**TaskLog JSON 例（COMPLETE 状態 - fixed モード）:**

```json
{
  "session_id": "sess-20250114-001",
  "task_id": "task-1768319005471",
  "status": "complete",
  "started_at": "2025-01-14T10:00:00.000Z",
  "ended_at": "2025-01-14T10:00:30.000Z",
  "prompt_summary": "README.mdを作成してください",
  "runner_decision": "accept",
  "executor_summary": "Executor completed with output",
  "verification_root": "/tmp/pm-orchestrator-demo-12345",
  "verified_files": [
    {
      "path": "README.md",
      "exists": true,
      "detected_at": "2025-01-14T10:00:30.000Z",
      "detection_method": "diff"
    }
  ],
  "evidence_summary": {
    "files_expected": ["README.md"],
    "files_verified": ["README.md"],
    "files_missing": [],
    "verification_passed": true,
    "verification_reason": "All expected files verified on disk",
    "verified_files": [
      {
        "path": "README.md",
        "exists": true,
        "detected_at": "2025-01-14T10:00:30.000Z",
        "detection_method": "diff"
      }
    ]
  },
  "error_reason": null,
  "artifacts": {
    "files_touched": ["README.md"],
    "files_expected": ["README.md"],
    "files_created": ["README.md"],
    "files_modified": [],
    "files_deleted": []
  },
  "visibility": "summary",
  "masked": true,
  "events": [
    {
      "event_type": "USER_INPUT",
      "timestamp": "2025-01-14T10:00:00.000Z",
      "visibility_level": "summary",
      "content": { "text": "README.mdを作成してください" }
    },
    {
      "event_type": "TASK_COMPLETED",
      "timestamp": "2025-01-14T10:00:30.000Z",
      "visibility_level": "summary",
      "content": {
        "status": "COMPLETE",
        "files_modified": ["README.md"],
        "evidence_ref": "ev-001"
      }
    }
  ]
}
```


### LogEvent content 例（イベント種別ごと）

**USER_INPUT:**
```json
{
  "text": "ユーザーの入力テキスト（機密情報マスク済み）"
}
```

**RUNNER_CLARIFICATION:**
```json
{
  "question": "Runner からの確認質問",
  "options": ["選択肢1", "選択肢2"]
}
```

**USER_RESPONSE:**
```json
{
  "response": "ユーザーの回答",
  "selected_option": "選択肢1"
}
```

**TASK_STARTED:**
```json
{
  "action": "create | overwrite | modify | ...",
  "target_file": "ファイルパス（該当する場合）"
}
```

**TASK_COMPLETED / TASK_ERROR:**
```json
{
  "status": "COMPLETE | INCOMPLETE | ERROR | ...",
  "files_modified": ["ファイルパス配列"],
  "evidence_ref": "evidence識別子",
  "error_message": "エラーメッセージ（該当する場合）"
}
```

**LLM_MEDIATION_REQUEST:**
```json
{
  "provider": "openai | anthropic",
  "model": "gpt-4o-mini | claude-3-haiku-20240307 | ...",
  "prompt_summary": "プロンプト要約（機密情報なし）",
  "tokens_input": 150
}
```

**LLM_MEDIATION_RESPONSE:**
```json
{
  "provider": "openai | anthropic",
  "model": "gpt-4o-mini | ...",
  "response_type": "overwrite | new_name | specify_file | ...",
  "tokens_output": 45,
  "latency_ms": 1200
}
```

**EXECUTOR_DISPATCH:**
```json
{
  "executor": "claude-code | openai | anthropic",
  "task_summary": "タスク要約"
}
```

**EXECUTOR_OUTPUT:**
```json
{
  "executor": "claude-code | ...",
  "exit_code": 0,
  "output_summary": "出力要約（機密情報なし）",
  "raw_output_ref": "生出力ファイルへの参照"
}
```

**EXECUTOR_BLOCKED:** (Property 34-36 準拠)
```json
{
  "executor": "claude-code | ...",
  "blocked_reason": "INTERACTIVE_PROMPT | TIMEOUT | STDIN_REQUIRED",
  "detected_pattern": "? Select an option:",
  "timeout_ms": 30000,
  "terminated_by": "REPL_FAIL_CLOSED | USER | TIMEOUT",
  "termination_signal": "SIGTERM | SIGKILL"
}
```

### TaskLogSummary

タスクログの集約情報。

- **total_events**
  イベント総数。
- **summary_events**
  summary レベルのイベント数。
- **full_events**
  full レベルのイベント数。
- **total_tokens_input**
  LLM 入力トークン合計。
- **total_tokens_output**
  LLM 出力トークン合計。
- **total_latency_ms**
  LLM 呼び出し合計レイテンシ（ミリ秒）。

---

## Sensitive Data Handling

### 機密データの定義

以下のデータは「機密データ」として分類される：

| データ種別 | 例 |
|---|---|
| API キー | `sk-...`, `sk-ant-...` |
| アクセストークン | OAuth トークン、JWT |
| 認証情報 | パスワード、シークレット |
| 個人情報 | メールアドレス、電話番号（タスク内容に含まれる場合） |

### 機密データの取り扱い規約

1. **ログへの平文保存禁止**
   - LogEvent.content に機密データを平文で保存してはならない。
   - 機密データが含まれる可能性がある場合、マスキング処理を行う。

2. **Evidence への平文保存禁止**
   - Evidence.contains_sensitive_data が true の場合、マスキング処理済みでなければならない。
   - 未処理の機密データを含む Evidence は生成してはならない。

3. **画面表示禁止**
   - REPL の /keys コマンドは「SET / NOT SET」のステータスのみを表示する。
   - API キーの値を画面に表示してはならない。

4. **マスキング形式（固定）**
   ```
   API キー: sk-***MASKED***
   トークン: ***MASKED_TOKEN***
   パスワード: ***MASKED***
   ```

5. **検証**
   - Runner は出力前に機密データパターンをチェックする。
   - パターン検出時はマスキングを強制適用する。

### 機密データパターン（固定・優先度順）

| Priority | パターン名 | 正規表現 | マスク形式 |
|---|---|---|---|
| 1 | OpenAI API キー | `sk-[A-Za-z0-9]{20,}` | `[MASKED:OPENAI_KEY]` |
| 1 | Anthropic API キー | `sk-ant-[A-Za-z0-9-]{20,}` | `[MASKED:ANTHROPIC_KEY]` |
| 1 | プライベートキー | `-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----` | `[MASKED:PRIVATE_KEY]` |
| 2 | JWT | `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` | `[MASKED:JWT]` |
| 2 | Authorization ヘッダ | `(?:authorization\|Authorization):\s*[Bb]earer\s+\S+` | `[MASKED:AUTH_HEADER]` |
| 2 | Cookie | `(?:cookie\|Cookie):\s*\S+` | `[MASKED:COOKIE]` |
| 2 | Set-Cookie | `(?:set-cookie\|Set-Cookie):\s*\S+` | `[MASKED:SET_COOKIE]` |
| 3 | JSON クレデンシャル | `"(?:password\|secret\|token\|api_key\|apiKey)":\s*"[^"]+"` | `[MASKED:JSON_CREDENTIAL]` |
| 3 | 環境変数形式 | `(?:PASSWORD\|SECRET\|TOKEN\|API_KEY)=[^\s]+` | `[MASKED:ENV_CREDENTIAL]` |
| 3 | Bearer トークン | `Bearer\s+[A-Za-z0-9._-]+` | `[MASKED:BEARER_TOKEN]` |
| 4 | 一般的なシークレット | `(password\|secret\|token\|key)\s*[:=]\s*["']?[^\s"']+["']?` | `[MASKED:GENERIC_SECRET]` |

**優先度の意味:**
- **Priority 1**: 即座に危険（漏洩時の影響が最大）
- **Priority 2**: セッション/認証トークン
- **Priority 3**: JSON/環境変数形式のクレデンシャル
- **Priority 4**: 一般的なパターン

**マスキング処理順序:**
1. Priority の低い順（数値が小さい = 高優先度）に適用
2. 複数パターンにマッチする場合、最初にマッチしたパターンを適用
3. マスキング後のテキストは再度パターン検査しない

---

## Status Enumerations

- **OverallStatus**
  `COMPLETE` | `INCOMPLETE` | `ERROR` | `INVALID` | `NO_EVIDENCE`

- **TaskStatus**
  `COMPLETE` | `INCOMPLETE` | `ERROR` | `INVALID` | `NO_EVIDENCE`

- **Phase**
  `REQUIREMENT_ANALYSIS` | `TASK_DECOMPOSITION` | `PLANNING` | `EXECUTION` | `QA` | `COMPLETION_VALIDATION` | `REPORT`

- **Provider**
  `claude-code` | `openai` | `anthropic`

- **ThreadType**
  `main` | `background` | `system`

- **RunStatus**
  `RUNNING` | `COMPLETED` | `FAILED` | `CANCELLED`

- **RunTrigger**
  `USER_INPUT` | `USER_RESPONSE` | `CONTINUATION` | `EXECUTOR`

- **LogEventType**
  `USER_INPUT` | `RUNNER_CLARIFICATION` | `USER_RESPONSE` | `TASK_STARTED` | `TASK_COMPLETED` | `TASK_INCOMPLETE` | `TASK_ERROR` | `EVIDENCE_MISSING` | `LLM_MEDIATION_REQUEST` | `LLM_MEDIATION_RESPONSE` | `EXECUTOR_DISPATCH` | `EXECUTOR_OUTPUT` | `EXECUTOR_BLOCKED` | `FILE_OPERATION` | `TEST_EXECUTION`

- **BlockedReason** (Property 34-36 準拠)
  `INTERACTIVE_PROMPT` | `TIMEOUT` | `STDIN_REQUIRED`
  Executor がブロックした理由を示す列挙値。

- **TerminatedBy** (Property 34-36 準拠)
  `REPL_FAIL_CLOSED` | `USER` | `TIMEOUT`
  Executor が終了された方法を示す列挙値。

- **VisibilityLevel**
  `summary` | `full`

- **ProjectMode**
  `temp` | `fixed`

---

## IExecutor Interface (Property 37 準拠)

統合テストでの決定論的テストを可能にするため、Executor は以下のインターフェースを実装する。

```typescript
interface IExecutor {
  execute(task: ExecutorTask): Promise<ExecutorResult>;
  isClaudeCodeAvailable(): Promise<boolean>;
}

interface ExecutorFactory {
  create(config: ExecutorConfig): IExecutor;
}
```

本番環境では `ClaudeCodeExecutor` を使用し、テスト環境では `FakeExecutor` を注入する。

FakeExecutor の種類:

| 種類 | 用途 | 動作 |
|------|------|------|
| SuccessFakeExecutor | 正常系テスト | 即座に COMPLETE を返す |
| BlockedFakeExecutor | Fail-Closed テスト | executor_blocked: true を返す |
| ErrorFakeExecutor | エラー系テスト | status: 'ERROR' を返す |

参照: spec/06_CORRECTNESS_PROPERTIES.md (Property 37), spec/10_REPL_UX.md (統合テスト要件)

---

## Status Priority

状態集約時の優先順位は以下に固定される。

1. INVALID
2. ERROR
3. NO_EVIDENCE
4. INCOMPLETE
5. COMPLETE

複数の状態が存在する場合、
最も優先度の高い状態が全体状態として採用される。

---

## File Locations

### ディレクトリ構造

```
.claude/
├── repl.json                            # REPL 状態
├── logs/
│   ├── index.json                       # 全セッションの TaskLogIndex
│   └── sessions/
│       └── <session_id>/
│           ├── session.json             # セッションメタデータ
│           ├── index.json               # セッション内 TaskLogIndex
│           └── tasks/
│               └── <task_id>.json       # TaskLog
├── raw/
│   └── <session_id>/
│       └── <task_id>_<event_id>.log     # 生ログ
└── evidence/
    └── <evidence_id>.json               # Evidence
```

### ファイル配置一覧

| データ | 保存先 |
|---|---|
| ReplState | `.claude/repl.json` |
| 全体 TaskLogIndex | `.claude/logs/index.json` |
| セッションメタデータ | `.claude/logs/sessions/<session_id>/session.json` |
| セッション内 TaskLogIndex | `.claude/logs/sessions/<session_id>/index.json` |
| TaskLog (individual) | `.claude/logs/sessions/<session_id>/tasks/<task_id>.json` |
| Raw executor output | `.claude/raw/<session_id>/<task_id>_<event_id>.log` |
| Evidence | `.claude/evidence/<evidence_id>.json` |

### セッションメタデータ構造

```json
{
  "session_id": "sess_abc123",
  "started_at": "2025-01-12T10:00:00.000Z",
  "threads": [
    { "thread_id": "thr_001", "thread_type": "main" },
    { "thread_id": "thr_002", "thread_type": "background" }
  ],
  "runs": [
    { "run_id": "run_001", "thread_id": "thr_001", "status": "COMPLETED" }
  ]
}
```

---

## 関連仕様

- 06_CORRECTNESS_PROPERTIES.md: Property 24 (API Key Secrecy)、Property 25 (Log Visibility Control)、Property 26 (TaskLog Lifecycle Recording)、Property 27 (/tasks-/logs Consistency)、Property 30 (Task ID Cross-Reference Display)、Property 31 (Verified Files Detection)、Property 32 (Non-Volatile Project Root)、Property 33 (Verified Files Traceability)、Property 34 (Executor stdin Blocking in Non-Interactive Mode)、Property 35 (Task Terminal State Guarantee in Non-Interactive Mode)、Property 36 (Subsequent Command Processing Guarantee in Non-Interactive Mode)、Property 37 (Deterministic Integration Testing)
- 10_REPL_UX.md: ReplState の使用方法、/logs コマンド、/tasks ↔ /logs 整合性、Task ID 相互参照表示、プロジェクトモード（--project-mode, --project-root, --print-project-path）、Executor I/O 規約（Non-Interactive Mode）
- 13_LOGGING_AND_OBSERVABILITY.md: ログ保存・閲覧の詳細、Fail-Closed Logging、Verified Files Detection (Section 2.7)、Executor Blocking Detection 記録 (Section 2.6.1)
