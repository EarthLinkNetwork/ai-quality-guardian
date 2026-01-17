# 10_REPL_UX.md

## 重要な前提

本ファイルは、既存仕様（00_INDEX.md〜09_TRACEABILITY.md）に対する「追加仕様」である。
本ファイルで定義される REPL UX は、既存の Runner Core / Lifecycle / Evidence / Lock / Output Control の規約を変更しない。
REPL は「新しい実行権限」ではなく、既存 CLI コマンドと Runner Core を呼び出すための薄い入力 UI である。

本ファイルに記載がない挙動は実装してはならない。曖昧な場合は fail-closed とする。

---

## 用語

- **REPL**: 対話型入力ループ。ユーザーは 1 行ずつ入力し、Runner が解釈・実行する。
- **スラッシュコマンド**: 先頭が `/` の入力（例: `/start`）。
- **自然言語入力**: スラッシュコマンド以外の入力。Runner に「タスク記述」として渡される。
- **REPL セッション**: REPL で保持する "現在の Runner セッション ID" の状態（Runner の session.json とは別概念）。
- **Provider**: LLM プロバイダー（claude-code / openai / anthropic）。
- **Model**: 選択された LLM モデル名（例: gpt-4o-mini, claude-3-haiku-20240307）。
- **TaskLog**: タスク実行の構造化ログ。2 階層（一覧→詳細）で閲覧可能。
- **Visibility Level**: ログ表示の可視性レベル（summary / full）。

---

## 目的

- Claude Code / Codex 風の「起動 → その場で /init /start /status → 自然言語タスク投入」の使用感を提供する。
- 既存の pm-orchestrator start/continue/status/validate の仕様を壊さず、REPL はそれらへのラッパーとして動作する。
- 証跡（Evidence）と fail-closed を崩さない。
- ユーザーに返す情報は最小化し、必要な情報だけを明確に返す。
- **LLM プロバイダー/モデルの選択を明示的に管理する。**
- **タスクログを 2 階層で閲覧可能にし、可視性を制御する。**

---

## 非目的

- 既存 7 フェーズライフサイクルの変更
- Runner Core の「実行権限」分割
- Output Control Manager のバイパス
- **API キーの平文保存・表示**（秘匿原則を厳守）
- **ログへの機密情報出力**

---


## REPL 起動

### CLI エントリ

REPL モードは CLI に追加されるサブコマンドとして提供する。

```
pm-orchestrator repl [--project <path>] [--project-mode <cwd|temp|fixed>] [--project-root <path>] [--print-project-path]
```

`--project` の解決規則は 04_COMPONENTS.md の Project Resolution Rules に完全準拠する。
REPL の起動時点で validate 相当の検証を行い、必須構造がなければ即 ERROR とする。

### CLI オプション（プロジェクトモード関連）

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `--project <path>` | プロジェクトパスを明示指定 | カレントディレクトリ |
| `--project-mode <cwd\|temp\|fixed>` | プロジェクトディレクトリモード | `cwd` |
| `--project-root <path>` | fixed モード時の固定ルートパス | (必須) |
| `--print-project-path` | 起動後にプロジェクトパスを出力（機械可読形式） | false |

### プロジェクトモード（Project Mode）

Runner は 3 種類のプロジェクトディレクトリモードをサポートする。

#### cwd モード（デフォルト）

```
--project-mode cwd
```

- カレントディレクトリ（`process.cwd()`）をそのまま作業ディレクトリとして使用
- ディレクトリの作成・削除は行わない
- 既存プロジェクトでの通常開発ワークフローに適している
- **注意**: `--project-root` オプションは無視される（警告出力）

#### temp モード

```
--project-mode temp
```

- `/var/folders/...` などの OS 標準テンポラリディレクトリを使用
- プロセス終了後にディレクトリが削除される可能性がある
- 単発の検証やデモに適している
- **注意**: テンポラリディレクトリは揮発性であり、後続プロセスでの検証には不向き

#### fixed モード

```
--project-mode fixed --project-root /path/to/stable/dir
```

- 指定された固定パスをプロジェクトルートとして使用
- ディレクトリは自動作成されない（存在しない場合は ERROR）
- 後続プロセスでの検証、ファイル追跡、デモ再現に適している
- **必須**: `--project-root` オプションが必要

#### 解決規則（Project Root Resolution）

```
IF --project-mode === 'cwd' (デフォルト):
  IF --project-root が指定されている:
    → WARNING: "--project-root は cwd モードでは無視されます"
  IF process.cwd() が存在しない:
    → ERROR: "カレントディレクトリが存在しません"
  projectPath = process.cwd()

ELSE IF --project-mode === 'temp':
  IF --project-root が指定されている:
    → WARNING: "--project-root は temp モードでは無視されます"
  projectPath = os.tmpdir() + '/pm-orchestrator-runner-' + randomId()

ELSE IF --project-mode === 'fixed':
  IF --project-root が指定されていない:
    → ERROR: "fixed モードでは --project-root が必須です"
  IF --project-root のディレクトリが存在しない:
    → ERROR: "指定されたプロジェクトルートが存在しません: <path>"
  projectPath = --project-root
```

### --print-project-path フラグ

起動後にプロジェクトパスを機械可読形式で出力する。非対話モードでの検証やスクリプト連携に使用。

**出力形式:**

```
PROJECT_PATH=<resolved_path>
```

**使用例:**

```bash
# プロジェクトパスを変数に取得
PROJECT_PATH=$(pm-orchestrator repl --project-mode fixed --project-root /tmp/demo --print-project-path --non-interactive <<'EOF'
/exit
EOF
| grep "^PROJECT_PATH=" | cut -d= -f2)

# 後続プロセスで同じパスを使用
ls "$PROJECT_PATH"
```

**出力タイミング:**
- REPL 初期化完了直後、最初のプロンプト表示前に出力
- 他の出力（Welcome メッセージ等）より前に出力
- 1 行のみ出力（複数行は禁止）

---

## 入力の分類ルール

1. 入力行が空（空白のみ含む）の場合は無視する（何も実行しない）。
2. 入力が `/` で始まる場合はスラッシュコマンドとして解析する。
3. それ以外は「タスク記述（自然言語入力）」として扱い、Runner の 7 フェーズ実行へ渡す。

---

## スラッシュコマンド一覧

本仕様で定義するスラッシュコマンドは以下のみ。

| コマンド | 説明 |
|----------|------|
| `/help` | コマンド一覧と現在状態を表示 |
| `/init` | プロジェクト雛形を生成 |
| `/provider` | LLM プロバイダーの表示・選択 |
| `/models` | LLM モデルの一覧・選択 |
| `/keys` | API キー状態の確認・設定導線 |
| `/logs` | タスクログの閲覧（2 階層） |
| `/model` | （後方互換）モデル設定の保持・表示 |
| `/start` | 新規セッション開始 |
| `/continue <session-id>` | 既存セッション継続 |
| `/status` | セッション状態確認 |
| `/tasks` | タスク一覧表示 |
| `/approve` | 継続承認 |
| `/exit` | REPL 終了 |

これ以外のスラッシュコマンドは「未知コマンド」として ERROR とする（fail-closed）。

---

## /help

### 目的

利用可能なコマンド一覧と簡単な説明を表示する。

### 出力（必須）

- コマンド一覧と 1 行説明
- 現在の projectPath（解決済み）
- 現在の Runner セッション ID（保持している場合のみ）
- **現在の Provider / Model（設定されている場合）**
- **Executor Mode（claude-code / openai / anthropic）**

### 出力例

```
Available commands:
  /help              Show this help
  /init              Initialize .claude/ structure
  /provider [name]   Show/select LLM provider
  /models [name]     List/select LLM models
  /keys              Show API key status
  /logs [task-id]    View task logs
  /model [name]      Show/set model (legacy)
  /start             Start new session
  /continue <id>     Continue existing session
  /status            Show session status
  /tasks             List tasks
  /approve           Approve continuation
  /exit              Exit REPL

Current state:
  Project: /path/to/project
  Session: sess_abc123 (or: none)
  Provider: openai
  Model: gpt-4o-mini
  Executor: claude-code
```

---

## /init

### 目的

プロジェクト直下に `.claude/` 雛形を生成し、最小構成で validate を通せる状態を作る。

### 生成対象（固定）

- `.claude/CLAUDE.md`
- `.claude/settings.json`
- `.claude/agents/`（ディレクトリ）
- `.claude/rules/`（ディレクトリ）
- `.claude/repl.json`（初期状態）

### 生成ルール

- 既に存在する場合、上書きしてはならない。
- 存在する場合は ERROR（どれが存在しているかを明示）として停止する。
- 親ディレクトリの探索は禁止（Project Resolution Rules に準拠）。

### settings.json の初期値

04_COMPONENTS.md の Configuration Schema のデフォルト値に準拠して生成する。
未知フィールドは入れない。

### repl.json の初期値

```json
{
  "selected_provider": null,
  "selected_model": null,
  "updated_at": null
}
```

### 証跡

`/init` はファイル作成を伴うため、Runner の Evidence 規約に従い evidence を残すこと。
（REPL は UI であっても、Runner が実行した「操作」として証跡対象である）

---

## /provider

### 目的

LLM プロバイダーの表示・選択を行う。

### サポート対象 Provider（固定）

| Provider | 識別子 | 説明 |
|----------|--------|------|
| Claude Code | `claude-code` | Claude Code Executor 経由で実行 |
| OpenAI | `openai` | OpenAI API 直接呼び出し |
| Anthropic | `anthropic` | Anthropic API 直接呼び出し |

### 動作

- `/provider` 引数なし: 現在の selected_provider を表示。未設定なら "UNSET" を表示し、選択を促す。
- `/provider show`: 利用可能なプロバイダー一覧と現在の選択を表示。
- `/provider select`: 矢印キー選択 UI を起動する。
- `/provider <name>`: selected_provider を `<name>` に更新し、保存する。

### 選択 UI（/provider select）

```
Select LLM Provider:
  > claude-code  (Claude Code Executor - recommended)
    openai       (OpenAI API direct)
    anthropic    (Anthropic API direct)

Use arrow keys to move, Enter to select.
```

### 永続化先

`.claude/repl.json` の `selected_provider` フィールドを更新する。

### エラー

- `.claude/` が存在しない場合は E101 相当で ERROR
- 未知の provider 名が指定された場合は E2xx 相当で ERROR（サポート対象を提示）
- repl.json の破損（JSON パース不可）は E105 相当で ERROR（推測復旧禁止）

### 証跡

プロバイダー変更は Evidence として記録する。

---

## /models

### 目的

選択中のプロバイダーで利用可能なモデル一覧の表示・選択を行う。

### 前提条件

- `/provider` で provider が選択済みであること
- provider 未設定の場合は ERROR（/provider を先に実行するよう促す）

### 動作

- `/models` 引数なし: 現在の selected_model を表示。未設定なら "UNSET" を表示し、選択を促す。
- `/models list`: 選択中 provider の利用可能モデル一覧を表示（特徴・料金情報含む）。
- `/models select`: 矢印キー選択 UI を起動する。
- `/models <name>`: selected_model を `<name>` に更新し、保存する。

### モデル一覧表示（/models list）

モデルレジストリ（12_LLM_PROVIDER_AND_MODELS.md 参照）に基づき表示する。

```
Available models for openai:

  Model              | Context  | Input$/1M | Output$/1M | Notes
  -------------------|----------|-----------|------------|------------------
  gpt-4o             | 128K     | $2.50     | $10.00     | Most capable
  gpt-4o-mini        | 128K     | $0.15     | $0.60      | Cost-effective
  gpt-4-turbo        | 128K     | $10.00    | $30.00     | Legacy

Currently selected: gpt-4o-mini
```

### 選択 UI（/models select）

```
Select Model (openai):
  > gpt-4o-mini   ($0.15/$0.60 per 1M tokens - cost-effective)
    gpt-4o        ($2.50/$10.00 per 1M tokens - most capable)
    gpt-4-turbo   ($10.00/$30.00 per 1M tokens - legacy)

Use arrow keys to move, Enter to select.
```

### 永続化先

`.claude/repl.json` の `selected_model` フィールドを更新する。

### エラー

- provider 未設定の場合は ERROR（/provider を先に実行）
- 未知の model 名が指定された場合は ERROR（利用可能モデルを提示）
- repl.json の破損は E105 相当で ERROR

### 証跡

モデル変更は Evidence として記録する。

---

## /keys

### 目的

API キーの設定状態を表示し、設定導線を提示する。

### 重要な制約

- **API キーの値を表示してはならない。**
- **API キーをログ・証跡に平文保存してはならない。**
- 表示するのは「設定済み / 未設定」のステータスのみ。

### 動作

- `/keys` 引数なし: 各プロバイダーの API キー設定状態を表示する。

### 出力例

```
API Key Status:

  Provider   | Env Variable        | Status
  -----------|---------------------|----------
  openai     | OPENAI_API_KEY      | SET
  anthropic  | ANTHROPIC_API_KEY   | NOT SET

Setup instructions:
  OpenAI:    export OPENAI_API_KEY="sk-..."
  Anthropic: export ANTHROPIC_API_KEY="sk-ant-..."

Note: API keys are read from environment variables only.
      Keys are never stored in logs or evidence files.
```

### 環境変数マッピング（固定）

| Provider | 環境変数 |
|----------|----------|
| openai | `OPENAI_API_KEY` |
| anthropic | `ANTHROPIC_API_KEY` |
| claude-code | (環境変数不要 - Claude Code Executor が管理) |

### エラー

- 選択中の provider に対応する API キーが未設定で、実行を試みた場合は fail-closed

---

## /logs

### 目的

タスク実行ログを 2 階層で閲覧する。インタラクティブなUI操作に対応。

### 階層構造

1. **Level 1（タスク一覧）**: `/logs` - セッション内のタスク一覧を表示
2. **Level 2（タスク詳細）**: `/logs <task-id>` - 特定タスクの詳細ログを表示

### 可視性制御（Visibility Level）

| Level | 表示内容 | 用途 |
|-------|----------|------|
| `summary`（デフォルト） | user ↔ LLM mediation のみ | 通常の確認 |
| `full` | executor / claude-code 出力含む | デバッグ用 |

### Interactive UI（2フェーズ操作）

**/logs の操作フロー:**

```
Phase 1: タスク一覧表示
┌─────────────────────────────────────────────────────────┐
│ Task Logs (session: sess_abc123)                        │
│                                                         │
│   #  │ Task ID   │ Status    │ Duration │ Files │ Tests │
│  ────┼───────────┼───────────┼──────────┼───────┼───────│
│ > 1  │ task_001  │ COMPLETE  │ 12.3s    │ 3     │ 5     │
│   2  │ task_002  │ INCOMPLETE│ 8.7s     │ 1     │ 0     │
│   3  │ task_003  │ ERROR     │ 2.1s     │ 0     │ 0     │
│                                                         │
│ [↑/↓] Select  [Enter] View  [q] Exit  [t] Tree view     │
└─────────────────────────────────────────────────────────┘

Phase 2: タスク詳細表示
┌─────────────────────────────────────────────────────────┐
│ Task Log: task_001 - COMPLETE                           │
│                                                         │
│ [10:23:45] USER_INPUT                                   │
│   "config.jsonを作成してください"                        │
│                                                         │
│ [10:23:46] CLARIFICATION_REQUEST                        │
│   "config.jsonというファイルが既に存在します..."         │
│                                                         │
│ [10:23:52] USER_RESPONSE                                │
│   "はい、上書きしてください"                             │
│                                                         │
│ [b] Back  [f] Full view  [q] Exit                       │
└─────────────────────────────────────────────────────────┘
```

### 番号選択・キー操作

| キー              | 動作                                    |
| ----------------- | --------------------------------------- |
| `↑` / `k`         | 前のタスクを選択                        |
| `↓` / `j`         | 次のタスクを選択                        |
| `Enter`           | 選択中のタスク詳細を表示                |
| `1-9`             | 番号でタスクを直接選択                  |
| `t`               | ツリー表示に切り替え                    |
| `f`               | フルログ表示に切り替え                  |
| `b`               | 一覧に戻る（詳細表示時）                |
| `q`               | /logs を終了                            |

### Level 1: タスク一覧（/logs）

```
Task Logs (session: sess_abc123):

   #  │ Task ID   │ Status    │ Duration │ Files │ Tests
  ────┼───────────┼───────────┼──────────┼───────┼───────
 > 1  │ task_001  │ COMPLETE  │ 12.3s    │ 3     │ 5
   2  │ task_002  │ INCOMPLETE│ 8.7s     │ 1     │ 0
   3  │ task_003  │ ERROR     │ 2.1s     │ 0     │ 0

[↑/↓] Select  [Enter] View  [1-9] Jump  [t] Tree  [q] Exit
```

### Level 2: タスク詳細（/logs <task-id>）

**デフォルト（summary）:**

```
Task Log: task_001

[2025-01-12 10:23:45] USER INPUT
  "config.jsonを作成してください"

[2025-01-12 10:23:46] RUNNER CLARIFICATION
  "config.jsonというファイルが既に存在します。上書きしますか？"

[2025-01-12 10:23:52] USER RESPONSE
  "はい、上書きしてください"

[2025-01-12 10:23:53] TASK STARTED
  Action: overwrite
  Target: config.json

[2025-01-12 10:24:05] TASK COMPLETED
  Status: COMPLETE
  Files modified: config.json
  Evidence: evidence/task_001.json
```

**フルログ（/logs <task-id> --full）:**

```
Task Log: task_001 (FULL)

[2025-01-12 10:23:45] USER INPUT
  "config.jsonを作成してください"

[2025-01-12 10:23:45] LLM MEDIATION (openai/gpt-4o-mini)
  Request: { prompt: "Parse user intent...", ... }
  Response: { type: "specify_file", ... }
  Tokens: 150 input, 45 output

[2025-01-12 10:23:46] RUNNER CLARIFICATION
  ...

[2025-01-12 10:23:53] EXECUTOR DISPATCH
  Executor: claude-code
  Input: { task: "overwrite config.json", ... }

[2025-01-12 10:24:03] EXECUTOR OUTPUT
  Raw output: "File written successfully..."
  Exit code: 0

[2025-01-12 10:24:05] TASK COMPLETED
  ...
```

### オプション

| オプション | 説明 |
|------------|------|
| `--full` | executor/claude-code レベルのログも表示 |
| `--tree` | Thread/Run 階層をツリー形式で表示 |
| `--json` | JSON 形式で出力 |

### ツリー表示（/logs --tree）

Thread/Run/Task の親子関係をツリー形式で可視化する。

```
Task Tree (session: sess_abc123):

Thread: thr_001 (main conversation)
├── Run: run_001 [10:23:45 - 10:24:05]
│   ├── task_001 [COMPLETE] USER_INPUT → TASK_COMPLETED
│   │   └── "config.jsonを作成してください"
│   └── task_002 [COMPLETE] CLARIFICATION → USER_RESPONSE
│       └── "ファイルが既に存在します..."
├── Run: run_002 [10:25:00 - 10:26:30]
│   └── task_003 [ERROR] USER_INPUT → ERROR
│       └── "テストを実行してください"
│
Thread: thr_002 (background executor)
└── Run: run_003 [10:23:50 - 10:24:00]
    └── task_004 [COMPLETE] EXECUTOR_OUTPUT
        └── (executor output - hidden in summary)

Legend: [COMPLETE] [INCOMPLETE] [ERROR]
[↑/↓] Navigate  [Enter] Expand  [t] List view  [q] Exit
```

### ツリー表示の詳細

| 要素 | 説明 |
|------|------|
| Thread | 会話スレッド（メインまたはバックグラウンド） |
| Run | 一連のタスク実行単位 |
| Task | 個別タスク（ステータスと概要を表示） |
| └── | 親子関係を示すツリー罫線 |

### エラー

- 現在セッション ID がない場合は ERROR
- 存在しない task-id の場合は ERROR

### /tasks ↔ /logs 整合性（Property 27 準拠）

**原則: `/tasks` で表示されるタスクは、必ず `/logs` でも表示されなければならない。**

```
/tasks の表示例:
  task-1768282936521: ERROR (failed=1)

/logs の表示例（正しい）:
  Task Logs (session: session-xxx):
    #  | Task ID             | Status     | Duration
    1  | task-1768282936521  | ERROR      | 0.5s

/logs の表示例（不正 - Property 27 違反）:
  No tasks logged for this session.
  ← /tasks ではタスクが見えるのに /logs では見えない = 仕様違反
```

**禁止事項:**
- `/tasks` にタスクが存在するのに `/logs` が "No tasks logged for this session." を表示すること
- タスクが INCOMPLETE/ERROR で終了したにもかかわらず TaskLog が存在しないこと

**原因と対策:**
- この不整合は TaskLog 保存が Task lifecycle に接続されていない場合に発生する
- 全ての終端状態（COMPLETE/INCOMPLETE/ERROR）で TaskLog を必ず保存する（Fail-Closed Logging）
- 詳細は 13_LOGGING_AND_OBSERVABILITY.md Section 2 を参照

### Task ID 相互参照表示（Property 30 準拠）

**原則: ユーザーが `/tasks` と `/logs` 間でタスクを追跡できるよう、両方の ID を表示する。**

2 種類のタスク ID が存在する:
- **External Task ID**: RunnerCore が生成（例: `task-1768282936521`）。`/tasks` で表示
- **Internal Log Task ID**: TaskLogManager が生成（例: `task-001`）。ログファイル名に使用

#### 表示フォーマット

**/tasks 出力:**
```
Tasks (session: session-xxx):
  task-1768282936521: COMPLETE (files=2)  [log: task-001]
  task-1768319005471: ERROR (failed=1)    [log: task-002]
```

**/logs 出力:**
```
Task Logs (session: session-xxx):
  #  | Log ID    | External ID           | Status   | Duration | Files
  1  | task-001  | task-1768282936521    | COMPLETE | 12.3s    | 2
  2  | task-002  | task-1768319005471    | ERROR    | 0.5s     | 0
```

#### ID マッピング要件

| 要件 | 説明 |
|------|------|
| 一意性 | External ID と Log ID は 1:1 対応 |
| 永続化 | マッピングは session index.json に保存 |
| 検索可能 | どちらの ID でも `/logs <id>` で詳細表示可能 |
| 追跡可能 | ユーザーが両 ID の関連を視認できること |

#### 実装要件

1. **TaskLogManager**: タスク登録時に `external_task_id` を受け取り、index.json に保存
2. **/tasks コマンド**: 各タスクの `[log: task-NNN]` を表示
3. **/logs コマンド**: External ID カラムを追加表示
4. **/logs <id>**: External ID でも Log ID でも検索可能

詳細は 05_DATA_MODELS.md の TaskLogEntry 定義、13_LOGGING_AND_OBSERVABILITY.md Section 2.7 を参照

---

## /model（後方互換）

### 目的

REPL 専用の「モデル設定」を保持・表示する。
（後方互換のため維持。新規利用は `/provider` + `/models` を推奨）

### 動作

- `/model` 引数なし: 現在の selected_model を表示する。未設定なら "UNSET" を表示する。
- `/model <name>`: selected_model を `<name>` に更新し、保存する。

### 永続化先（固定）

`.claude/repl.json`

### エラー

- `.claude/` が存在しない場合は E101 相当で ERROR
- repl.json の破損（JSON パース不可）は E105 相当で ERROR（推測復旧禁止）

### 証跡

モデルの変更は「REPL 設定変更」として evidence に記録する。

---

## /start

### 目的

新しい Runner 実行セッションを開始する。

### 前提条件（fail-closed）

- provider が設定済みであること
- model が設定済みであること
- 対応する API キーが環境変数に設定済みであること（claude-code 以外）

未設定の場合は ERROR とし、設定コマンド（/provider, /models, /keys）を案内する。

### マッピング（固定）

- `/start` は Runner Core の `start(projectPath?)` を呼ぶ。
- 返ってきた `ExecutionResult.session_id` を REPL の「現在の Runner セッション ID」として保持する。

### 出力（最小）

- session_id
- overall_status
- evidence_path
- next_action（true/false）
- violations（ある場合のみ）
- **selected_provider / selected_model**

---

## /continue

### 目的

既存セッションを継続する。

### マッピング（固定）

- `/continue <id>` は Runner Core の `continue(sessionId)` を呼ぶ。
- 成功した場合、REPL の現在セッション ID を `<id>` に更新する。

### エラー

- `<session-id>` が欠落している場合は ERROR（使用方法を 1 行で提示）
- 存在しないセッションは ERROR（具体的理由を明示）

---

## /approve

### 目的

Continuation Control の「明示承認」を REPL から行う。

### ルール

- Runner 側の `continuation_approved` を true にする操作は、必ず Runner の Evidence と整合して記録されなければならない。
- "承認対象の未完タスクが存在しない" 場合は ERROR（no-op 継続は禁止）。

### 出力（最小）

- 承認の成否
- 承認対象（session_id）
- 次に実行可能な操作（/continue 可能等）を 1 行で提示

---

## /status

### 目的

現在の Runner セッション状態を確認する。

### ルール

- REPL が現在セッション ID を保持していない場合は ERROR（/start または /continue を要求）
- status は Runner Core `status(sessionId)` を呼ぶ

### 出力（最小）

- session_id
- overall_status
- current_phase（取得可能な場合）
- next_action と next_action_reason（存在する場合）
- violations（ある場合のみ）
- **selected_provider / selected_model**

---

## /tasks

### 目的

現在セッションのタスク一覧を表示する。

### ルール

- 現在セッション ID がない場合は ERROR
- 表示は "必要最小限" とする（一覧性優先）

### 出力（最小）

各タスクについて以下のみ（タスク数が多い場合も省略せず列挙する）:

- task_id
- status
- files_modified（件数のみ）
- tests_run（件数のみ）
- incomplete 理由（ある場合のみ）

### カテゴリ別表示

タスクは状態によってカテゴリ分けして表示する:

1. **Failed Tasks**（最優先表示）: ERROR / INCOMPLETE 状態
2. **Active Tasks**: IN_PROGRESS 状態
3. **Pending Tasks**: PENDING 状態
4. **Completed Tasks**: COMPLETE 状態

**表示例:**

```
!!! ALERT: 1 task(s) failed !!!

Failed Tasks
------------
[!] task-001: ERROR
    Error: No files were created or modified by this task

Active Tasks
------------
[>] task-002: IN_PROGRESS

Completed Tasks
---------------
[x] task-003: COMPLETED

Summary
-------
1 completed, 1 running, 0 pending, 1 failed
```

---

## /exit

### 目的

REPL を終了する。

### ルール

- Runner セッションを勝手に完了扱いにしてはならない。
- 実行中セッションがある場合でも REPL は終了できる（ただし、次回は /continue が必要）。

---

## 即時サマリ出力（Immediate Summary Output）

### 目的

タスク完了時（terminal state 到達時）に、ユーザーが即座に結果を把握できるサマリブロックを出力する。
`/tasks` コマンドを実行せずとも、エラーや結果が即座に可視化される。

### 出力タイミング

タスクが以下のいずれかの状態（terminal state）に到達した直後に必ず出力する:

- `COMPLETE`: タスク正常完了
- `INCOMPLETE`: タスク不完全終了（ファイル未検証等）
- `ERROR`: タスク実行エラー

### 出力フォーマット（必須）

**COMPLETE（4行固定）:**
```
RESULT: COMPLETE
TASK: <task_id>
NEXT: (none)
HINT: /logs <task_id>
```

**INCOMPLETE / ERROR（5行固定、WHY必須）:**
```
RESULT: <INCOMPLETE|ERROR>
TASK: <task_id>
NEXT: /logs <task_id>
WHY: <terminal state に至った理由>
HINT: /logs <task_id>
```

**フォーマット規約:**
- 装飾文字（`===`, `[...]`）は使用しない
- NEXT はコマンドのみ（自然言語禁止）
- COMPLETE: NEXT は `(none)`、WHY は出力しない
- INCOMPLETE/ERROR: NEXT は `/logs <task_id>`、WHY は必須
- HINT は全状態で `/logs <task_id>` 固定

### 状態別の出力例

**COMPLETE の場合（4行）:**

```
RESULT: COMPLETE
TASK: task-1768282936521
NEXT: (none)
HINT: /logs task-1768282936521
```

**INCOMPLETE の場合（5行）:**

```
RESULT: INCOMPLETE
TASK: task-1768319005471
NEXT: /logs task-1768319005471
WHY: ファイル作成は実行されましたが、ディスク上で検証できませんでした
HINT: /logs task-1768319005471
```

**ERROR の場合（5行）:**

```
RESULT: ERROR
TASK: task-1768350000000
NEXT: /logs task-1768350000000
WHY: Executor がタイムアウトしました（対話入力待ちの可能性）
HINT: /logs task-1768350000000
```

### 実装要件

1. **出力タイミング**: terminal state 到達直後、次のプロンプト表示前
2. **出力先**: stdout（他の出力と混在しないこと）
3. **共通関数**: `printImmediateSummary(taskId, status, reason, hint)` として実装
4. **current_task_id との連携**: サマリ出力時に `current_task_id = null`、`last_task_id = taskId` に更新

### 禁止事項

- terminal state 到達後にサマリを出力しないこと
- `/tasks` コマンド実行を前提としたエラー可視化設計
- 推測的表現（「おそらく」「かもしれない」）の使用

---

## "exit" 入力の安全性（Exit Typo Safety）

### 目的

ユーザーが `/exit` の代わりに `exit`（スラッシュなし）を入力した場合、それを Claude Code に渡さずに安全に処理する。

### 問題の背景

自然言語入力として `exit` が Claude Code に渡されると、予期しない動作が発生する可能性がある。
"exit" は REPL 終了の意図であることが明白なため、fail-closed で処理する。

### 検出対象

以下の入力パターンを検出する:

| パターン | 検出 | 動作 |
|----------|------|------|
| `exit` | YES | /exit と同等に処理 |
| `Exit` | YES | /exit と同等に処理（大文字小文字無視）|
| `EXIT` | YES | /exit と同等に処理 |
| `exit ` | YES | 末尾空白も許容 |
| ` exit` | YES | 先頭空白も許容（trim 後に判定）|
| `exit now` | NO | 自然言語として処理（"exit" 単体ではない）|
| `please exit` | NO | 自然言語として処理 |

### 処理フロー

```
入力: "exit"
  ↓ trim()
  ↓ toLowerCase()
  ↓ === "exit" ?
    YES → /exit と同等に REPL 終了
    NO  → 通常の自然言語入力として処理
```

### 出力

検出時は以下の2行のみ表示（装飾・説明は禁止）:

```
ERROR: Did you mean /exit?
HINT: /exit
```

出力後、REPL は終了せず入力待ちに戻る（fail-closed: 意図確認のため）。

### 実装要件

1. **検出タイミング**: 自然言語入力処理（`processNaturalLanguage`）の冒頭
2. **fail-closed**: 疑わしい場合は Claude Code に渡さず、入力待ちに戻る
3. **出力制限**: 2行以内、装飾禁止

### 禁止事項

- `exit` 単体を Claude Code Executor に渡すこと
- `exit` 検出を無視して自然言語処理に進むこと
- 2行を超える出力、装飾文字の使用

---

## 自然言語入力（タスク投入）

### ルール

- スラッシュコマンド以外の入力は「Task description」として Runner に渡される。
- Runner は 7 フェーズを必ず実行する（04_COMPONENTS.md / 03_LIFECYCLE.md に準拠）。
- 実行の開始・継続・完了判定は Runner のみが行う。
- REPL は "タスクの境界" を自律判断しない。

### 必須条件（fail-closed）

- 現在セッション ID がない場合は ERROR（/start または /continue を要求）
- provider / model が未設定の場合は ERROR（/provider, /models を要求）
- API キーが未設定の場合は ERROR（/keys で確認を要求）
- continuation が必要な状態で `continuation_approved` が false の場合は fail-closed（/approve を要求）

---

## Output Control（REPL 表示の制約）

REPL はユーザーへ表示するテキストを出力するが、これは Runner の Output Control 規約に従って「必要最小限」を守る。

- 推測的表現は禁止（"たぶん", "おそらく", "〜かもしれない" 等）
- 証跡が必要な結果は evidence_path 等の参照を必ず含める
- 失敗時は、エラーコードと解決手順を 1〜3 行で提示する
- 余計な長文ログは REPL 画面に垂れ流さない（ログは evidence に保存し参照で示す）
- **API キーの値は絶対に表示しない**
- **ログのデフォルト表示は summary レベル（必要最小限）**

---

## 非対話入力モード（Non-Interactive Mode）

### 目的

stdin からのスクリプト入力（heredoc / pipe / ファイルリダイレクト）での REPL 実行を可能にする。
対話モードと同等の機能を提供しつつ、自動化・CI/CD・テストでの利用を想定する。

### モード検出

| 条件 | モード | 動作 |
|------|--------|------|
| `process.stdin.isTTY === true` | 対話（interactive） | プロンプト表示、readline 使用 |
| `process.stdin.isTTY === false` | 非対話（non-interactive） | プロンプト非表示、行バッファ読み取り |
| `--non-interactive` フラグ指定 | 非対話（強制） | TTY 状態に関わらず非対話モード |

### CLI オプション（非対話モード関連）

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `--non-interactive` | 非対話モードを強制 | false（TTY 自動検出） |
| `--exit-on-eof` | EOF 到達時に自動終了 | true（非対話時） |
| `--wait` | 各コマンド完了を待機してから次を処理 | true（非対話時） |

### コマンド処理保証（Sequential Processing Guarantee）

非対話モードでは以下の保証を提供する:

1. **1 コマンド = 1 完全レスポンス**
   - 各入力行に対して、処理が完全に終了するまで次の入力を読み取らない
   - 出力は必ず完全な形で stdout に書き出される

2. **順序保証**
   - 入力順序と出力順序は必ず一致する
   - 並行処理による出力の混在は発生しない

3. **await 完了保証**
   - タスク実行は完全に終了（COMPLETE/INCOMPLETE/ERROR）するまで await される
   - `/tasks`、`/logs` 等のクエリコマンドも、前のコマンドの完了後に実行される

### 出力フラッシュ保証（Output Flush Guarantee）

```
入力: "/start"
  ↓ await 処理完了
  ↓ stdout.write(出力)
  ↓ await stdout flush/drain
入力: "readmeを作って"
  ↓ await 処理完了
  ↓ stdout.write(出力)
  ↓ await stdout flush/drain
入力: "/tasks"
  ↓ await 処理完了
  ↓ stdout.write(出力)
  ↓ await stdout flush/drain
入力: "/logs"
  ↓ ...
```

**実装要件:**
- `process.stdout.write()` 後に `drain` イベントを待機
- または `console.log()` 使用時は同期的に処理
- バッファリングによる出力欠落を防止

### EOF ハンドリング

非対話モードでは stdin が EOF に達した時の挙動を定義する:

| 状態 | `--exit-on-eof` | 動作 |
|------|-----------------|------|
| EOF 到達 | true（デフォルト） | REPL を正常終了（exit code 0） |
| EOF 到達 | false | 追加入力を待機（対話モードと同様） |
| `/exit` 受信 | - | 即座に REPL 終了 |

### 終了コード（Exit Code）

非対話モードでは終了コードを以下のように定義する:

| 終了コード | 条件 |
|------------|------|
| 0 | 全てのコマンドが正常完了（タスクが COMPLETE） |
| 1 | エラー発生（構文エラー、設定エラー、タスクが ERROR） |
| 2 | 未完了（タスクが INCOMPLETE、または明示的な中断） |

### 非対話モードでの禁止事項

- 矢印キー選択 UI（`/provider select`、`/models select`）は使用不可
- インタラクティブなキー操作（`/logs` の `↑/↓` ナビゲーション）は使用不可
- これらを非対話モードで呼び出した場合は ERROR（代わりに引数指定を要求）

### Executor 入出力規約（Non-Interactive Mode）

**重要:** 非対話モードでは、Executor（子プロセス）が stdin を要求することは禁止される。

#### 原則

| 項目 | 非対話モード | 対話モード |
|------|--------------|------------|
| Executor stdin | **閉じる/無視** | 許可（ユーザー入力転送可） |
| Executor stdout/stderr | キャプチャして処理 | キャプチャして処理 |
| 対話プロンプト検出 | Fail-Closed | 許可 |

#### stdin 遮断仕様

非対話モードで Executor を起動する際:

```
spawn の stdio 設定:
  stdin:  'ignore' または 'pipe' で即座に close
  stdout: 'pipe'（キャプチャ用）
  stderr: 'pipe'（キャプチャ用）
```

これにより、Executor が stdin を読もうとしても EOF を受け取り、対話待ちに入らない。

#### 対話待ち検出（Fail-Closed）

Executor が対話プロンプトを出力した場合、REPL は以下を検出してタスクを終了させる:

**検出パターン（例）:**
- `? ` で始まる行（inquirer 等の対話プロンプト）
- `Enter ` / `Press ` で始まる行
- `[Y/n]` / `[y/N]` / `(yes/no)` を含む行
- 一定時間（タイムアウト）進捗出力がない

**検出時の挙動:**
1. 子プロセスを SIGTERM で終了
2. タスクを `ERROR` 状態に遷移（Fail-Closed）
3. TaskLog に `executor_blocked: true`、`blocked_reason` を記録
4. 後続コマンド処理に戻る

### Executor タイムアウト（Non-Interactive Mode）

非対話モードでは、Executor 実行に必ずタイムアウトを適用する。

#### タイムアウト設定

| 設定 | デフォルト値 | 説明 |
|------|--------------|------|
| `executor_timeout_ms` | 60000 (60秒) | Executor 実行の最大許容時間 |
| `progress_timeout_ms` | 30000 (30秒) | 出力なし状態の最大許容時間 |

**CLI オプション:**
```
--executor-timeout <ms>   Executor タイムアウト（ミリ秒）
--progress-timeout <ms>   進捗タイムアウト（ミリ秒）
```

#### タイムアウト発生時の挙動

```
1. 子プロセスに SIGTERM を送信
2. 500ms 待機
3. まだ終了していなければ SIGKILL を送信
4. タスクを ERROR 状態に遷移
5. TaskLog に以下を記録:
   - executor_blocked: true
   - blocked_reason: "TIMEOUT"
   - timeout_ms: <経過時間>
   - terminated_by: "REPL_FAIL_CLOSED"
6. 後続コマンド処理に戻る（/tasks /logs /exit が必ず実行される）
```

#### 進捗検出

進捗タイムアウトは「出力が一定時間ない」場合に発火する:

- stdout または stderr への出力があるたびにタイマーリセット
- 出力がない状態が `progress_timeout_ms` を超えたら対話待ちとみなす

### Fail-Closed 保証（Property 34-36 準拠）

非対話モードでは以下を保証する:

1. **Executor は stdin をブロックしない**（Property 34）
   - stdin は閉じられるため、読み取り待ちは発生しない
   - 対話プロンプトが出力されたら Fail-Closed

2. **タスクは必ず terminal state に到達する**（Property 35）
   - タイムアウトにより、無限待ちは発生しない
   - terminal state: COMPLETE / INCOMPLETE / ERROR のいずれか

3. **後続コマンドは必ず処理される**（Property 36）
   - Executor がブロック/タイムアウトしても、REPL は次のコマンドを処理
   - `/tasks`、`/logs`、`/exit` は必ず実行される

### 非対話モードの使用例

**heredoc での使用:**

```bash
pm-orchestrator repl --project /path/to/project --non-interactive --exit-on-eof <<'EOF'
/start
readmeを作って
/tasks
/logs
/exit
EOF
```

**期待される出力:**

```
Session started: session-xxx
Provider: claude-code
Model: claude-sonnet-4-20250514

Task started: task-001
Action: create README.md
...
Task completed: task-001
Status: COMPLETE
Files modified: 1

Tasks (session: session-xxx):
  task-001: COMPLETE (files=1)

Task Logs (session: session-xxx):
  #  | Task ID   | Status   | Duration
  1  | task-001  | COMPLETE | 12.3s

Goodbye.
```

**pipe での使用:**

```bash
echo -e "/start\nreadmeを作って\n/tasks\n/exit" | pm-orchestrator repl --project /path/to/project
```

**ファイルリダイレクトでの使用:**

```bash
pm-orchestrator repl --project /path/to/project < commands.txt
```

**fixed モードでの使用（後続プロセスでの検証用）:**

```bash
# 固定ディレクトリを作成
DEMO_DIR=/tmp/pm-orchestrator-demo-$$
mkdir -p "$DEMO_DIR"

# fixed モードで REPL 実行
pm-orchestrator repl \
  --project-mode fixed \
  --project-root "$DEMO_DIR" \
  --print-project-path \
  --non-interactive <<'EOF'
/start
readmeを作成してください
/tasks
/exit
EOF

# 後続プロセスで検証（DEMO_DIR は揮発しない）
echo "=== 検証 ==="
ls -la "$DEMO_DIR"
cat "$DEMO_DIR/README.md"

# クリーンアップ
rm -rf "$DEMO_DIR"
```

**期待される出力（fixed モード）:**

```
PROJECT_PATH=/tmp/pm-orchestrator-demo-12345

Session started: session-xxx
Provider: claude-code
Model: claude-sonnet-4-20250514

Task started: task-001
Action: create README.md
...
Task completed: task-001
Status: COMPLETE
Files modified: 1
Verification Root: /tmp/pm-orchestrator-demo-12345

Tasks (session: session-xxx):
  task-001: COMPLETE (files=1)

Goodbye.
=== 検証 ===
total 8
drwxr-xr-x  3 user staff   96 Jan 14 10:00 .
drwxrwxrwt 12 root wheel  384 Jan 14 10:00 ..
-rw-r--r--  1 user staff  123 Jan 14 10:00 README.md
# README.md の内容...
```

### テスト要件（非対話モード）

以下をテストで担保する:

- TTY 検出が正しく動作する（`isTTY` のモック）
- `--non-interactive` フラグが TTY 状態をオーバーライドする
- heredoc 入力で全てのコマンド出力が表示される
- 出力順序が入力順序と一致する
- EOF 到達時の終了コードが正しい
- タスク完了前に次のコマンドが処理されない（await 保証）
- `/tasks` と `/logs` の出力が非対話モードでも整合する（Property 27 準拠）
- **`--project-mode fixed` で指定ディレクトリが使用される（Property 32 準拠）**
- **`--project-root` が存在しない場合に ERROR が返る**
- **`--print-project-path` で PROJECT_PATH= 形式の出力が得られる**
- **fixed モードで作成されたファイルが後続プロセスから検証可能**

### 統合テスト要件（Property 37: Deterministic Integration Testing）

統合テストは **外部 Claude Code CLI に依存してはならない**。CI 安定性を確保するため、以下を遵守する:

#### 1. FakeExecutor による依存性注入（DI）

統合テストでは `IExecutor` インターフェースを実装した FakeExecutor を使用する:

```typescript
interface IExecutor {
  execute(task: ExecutorTask): Promise<ExecutorResult>;
  isClaudeCodeAvailable(): Promise<boolean>;
}
```

#### 2. FakeExecutor の種類

| 種類 | 用途 | 動作 |
|------|------|------|
| SuccessFake | 正常系テスト | 即座に COMPLETE を返す。verified_files にダミーファイルを含む |
| BlockedFake | Fail-Closed テスト | executor_blocked: true, blocked_reason を返す |
| ErrorFake | エラー系テスト | status: 'ERROR' を返す |

#### 3. FakeExecutor の実装例

```typescript
// SuccessFake: 即座に成功を返す
class SuccessFakeExecutor implements IExecutor {
  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    return {
      executed: true,
      output: 'Fake execution completed',
      files_modified: ['README.md'],
      duration_ms: 100,
      status: 'COMPLETE',
      cwd: task.workingDir,
      verified_files: [{ path: 'README.md', exists: true, size: 100 }],
      unverified_files: [],
    };
  }
  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }
}

// BlockedFake: Fail-Closed をトリガー
class BlockedFakeExecutor implements IExecutor {
  constructor(private blockedReason: BlockedReason = 'INTERACTIVE_PROMPT') {}
  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    return {
      executed: false,
      output: '',
      error: `Executor blocked: ${this.blockedReason}`,
      files_modified: [],
      duration_ms: 100,
      status: 'BLOCKED',
      cwd: task.workingDir,
      verified_files: [],
      unverified_files: [],
      executor_blocked: true,
      blocked_reason: this.blockedReason,
      terminated_by: 'REPL_FAIL_CLOSED',
    };
  }
  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }
}
```

#### 4. DI による Executor 差し替え

RunnerCore / REPLInterface は ExecutorFactory を受け取り、テスト時に FakeExecutor を注入:

```typescript
// 本番
const runner = new RunnerCore({ executorFactory: () => new ClaudeCodeExecutor(config) });

// テスト
const runner = new RunnerCore({ executorFactory: () => new SuccessFakeExecutor() });
```

#### 5. テスト分類

| テスト種類 | Executor | 目的 |
|------------|----------|------|
| Unit Test | FakeExecutor | ロジックの検証 |
| Integration Test | FakeExecutor | コンポーネント間連携の検証 |
| E2E Test (Manual) | Real Executor | 実環境での動作確認（CI 対象外） |

#### 6. CI 安定性要件

- 統合テストは FakeExecutor のみを使用し、外部依存を排除する
- テストは決定論的に動作し、タイムアウトによる不安定性を排除する
- Real Executor を使用するテストは `test/e2e/` に配置し、CI から除外する

---

## エラー取り扱い

REPL 専用エラーコードを新設しない。既存分類へ割り当てる。

例:

- `.claude/` 不在: E101
- 設定 JSON 破損: E105
- 未知コマンド: E2xx 相当（具体コードは Runner 実装の既存ポリシーに従う。ただし fail-closed は必須）
- セッション ID 不足: E2xx 相当（入力不備として扱う）
- **provider / model 未設定: E2xx 相当（設定不備として扱う。fail-closed）**
- **API キー未設定: E2xx 相当（認証不備として扱う。fail-closed）**

---

## テスト要件

REPL 追加により、既存の Testing Strategy を満たした状態を維持しなければならない。

最低限、以下をユニットテストで担保する:

- /init が雛形を生成し、既存がある場合は上書きしない
- /model が .claude/repl.json のみに保存し、settings.json を変更しない
- /provider が provider 一覧を表示し、選択を永続化する
- /models が provider 選択済み状態でのみ動作する
- /keys が API キー値を表示しない（ステータスのみ）
- /logs がデフォルトで summary レベルを表示し、--full で詳細を表示する
- /start /continue /status の Runner Core 呼び出しマッピングが正しい
- 現在セッション ID 未設定時の fail-closed
- provider / model 未設定時の fail-closed
- API キー未設定時の fail-closed
- 未知コマンドの fail-closed

Property-based tests が要求される場合は 08_TESTING_STRATEGY.md の "最低 100 回" を満たすこと。

---

## トレーサビリティ（本ファイルの位置づけ）

本ファイルは、主に以下の Property を補助する:

- Property 2: Project Resolution Validation（REPL 起動時の validate）
- Property 4: Seven-Phase Lifecycle Enforcement（自然言語入力が 7 フェーズに入ること）
- Property 15: Output Control and Validation（REPL 表示の制約）
- Property 16: Explicit Continuation Control（/approve と fail-closed）
- Property 19: Communication Mediation（REPL 経由で Runner が出力を統制すること）
- **Property 23: Provider and Model Configuration Control（provider/model の fail-closed）**
- **Property 24: API Key Secrecy（キー秘匿）**
- **Property 25: Log Visibility Control（ログ可視性制御）**
- **Property 26: TaskLog Lifecycle Recording（全終端状態でログ保存）**
- **Property 27: /tasks-/logs Consistency（タスク表示の整合性）**
- **Property 28: Non-Interactive REPL Output Integrity（非対話モード出力整合性）**
- **Property 29: Deterministic Exit Code in Non-Interactive Mode（非対話モード終了コード決定性）**
- **Property 30: Task ID Cross-Reference Display（タスク ID 相互参照表示）**
- **Property 32: Non-Volatile Project Root（揮発しないプロジェクトルート）**
- **Property 33: Verified Files Traceability（検証済みファイル追跡可能性）**

ただし、Property の定義そのものは 06_CORRECTNESS_PROPERTIES.md を唯一の正とし、本ファイルは UX 仕様として補助する。

---

## 関連仕様

- 05_DATA_MODELS.md: ReplState / TaskLog / LogEvent の構造定義
- 06_CORRECTNESS_PROPERTIES.md: Property 23-33 の定義
- 12_LLM_PROVIDER_AND_MODELS.md: Provider / Model レジストリ、料金情報
- 13_LOGGING_AND_OBSERVABILITY.md: ログ保存先、可視性制御、マスキング、Fail-Closed Logging
