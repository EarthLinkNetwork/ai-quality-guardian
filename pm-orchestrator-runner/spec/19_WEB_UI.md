# 19_WEB_UI.md

# Web UI 仕様（Phase 1 - v2）

本章は Web UI の仕様を定義する。

## v2 変更点

- **Namespace セレクター**: 複数 namespace の切り替え対応
- **Runner ステータス API**: Runner の生存状態を表示
- **シングルテーブル設計対応**: 固定テーブル名 `pm-runner-queue`


## 実装方針

Web UI は最初から実装する。


## 前提

- ローカル起動（localhost）
- ngrok で外部公開可能
- AWS 未使用（DynamoDB Local のみ）


## ngrok 運用

### 概要

Web UI をローカルで起動し、ngrok を使用してインターネット経由でアクセス可能にする。
これにより、外出先やモバイル端末から Runner に命令を投入できる。

### 起動手順

```bash
# 1. Runner を Web UI モードで起動
pm-orchestrator repl --project-mode cwd --web-ui --port 3000

# 2. 別ターミナルで ngrok を起動
ngrok http 3000

# 3. ngrok が発行した URL（例: https://abc123.ngrok.io）でアクセス
```

### ngrok 設定（推奨）

```yaml
# ~/.ngrok2/ngrok.yml
authtoken: YOUR_AUTH_TOKEN
tunnels:
  pm-runner:
    proto: http
    addr: 3000
    bind_tls: true  # HTTPS のみ
```

### セキュリティ考慮

- ngrok Basic Auth を設定する（無料プランでは不可）
- URL を第三者に共有しない
- 作業完了後は ngrok を停止する
- Runner はローカルネットワーク外から直接アクセスできない設計

### 制限事項

- Web UI は Queue Store を操作するだけ（Runner に直接命令しない）
- ngrok URL は一時的（再起動で変わる）
- 無料プランではカスタムドメイン不可


## Web UI の役割

- Queue Store を操作するだけ
- Runner に直接命令しない
- Runner とは Queue Store を介して間接的に通信する


## 画面構成

### Namespace セレクター（v2 新機能）

- ドロップダウンで namespace を選択
- 選択した namespace の Queue を表示
- 各 namespace の Runner 数を表示
- Runner ステータス表示（緑: 稼働中、赤: 停止）

### Task Group 一覧画面

- 選択した namespace 内の全 Task Group の一覧表示
- Task Group ごとのタスク数表示
- 作成日時でソート

### Task 一覧画面

- 選択した Task Group 内の Task 一覧
- status (QUEUED / RUNNING / COMPLETE / ERROR / CANCELLED) で色分け
- 最新のタスクが上に表示

### Task ログ閲覧画面

- 選択した Task の詳細ログ表示
- Evidence の参照リンク
- 変更ファイル一覧
- タスク状態変更ボタン（キャンセル等）

### 新規命令投入フォーム

- テキストエリア（複数行入力可能）
- Task Group 選択（既存 or 新規作成）
- 投入ボタン


## 技術選定

- フロントエンド: 軽量なもの（詳細は実装時に決定）
- バックエンド: Runner と同一プロセスで起動
- 通信: REST API または WebSocket


## REST API

### Namespace 一覧取得（v2 新規）

**Endpoint**: `GET /api/namespaces`

**Response (200 OK)**:
```json
{
  "namespaces": [
    {
      "namespace": "project-a-a1b2",
      "task_count": 15,
      "queued_count": 3,
      "running_count": 1
    },
    {
      "namespace": "stable",
      "task_count": 42,
      "queued_count": 0,
      "running_count": 0
    }
  ],
  "current_namespace": "project-a-a1b2"
}
```


### Runner ステータス取得（v2 新規）

**Endpoint**: `GET /api/runners`

**Response (200 OK)**:
```json
{
  "namespace": "project-a-a1b2",
  "runners": [
    {
      "runner_id": "runner-abc123",
      "status": "running",
      "is_alive": true,
      "last_heartbeat": "2024-01-15T10:30:00.000Z",
      "started_at": "2024-01-15T08:00:00.000Z",
      "project_root": "/Users/masa/dev/project-a"
    },
    {
      "runner_id": "runner-def456",
      "status": "stopped",
      "is_alive": false,
      "last_heartbeat": "2024-01-15T09:00:00.000Z",
      "started_at": "2024-01-15T07:00:00.000Z",
      "project_root": "/Users/masa/dev/project-a"
    }
  ]
}
```

**Runner 判定ロジック**:
- `is_alive`: `last_heartbeat` から 2分以内なら `true`
- `status`: Runner 自身が報告する状態（running / stopped）


### Task 状態変更

**Endpoint**: `PATCH /api/tasks/:task_id/status`

**Request Body**:
```json
{
  "status": "CANCELLED"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "task_id": "task-xxx",
  "old_status": "QUEUED",
  "new_status": "CANCELLED"
}
```

**Response (400 Bad Request)** - 不正な状態遷移:
```json
{
  "error": "Invalid status transition",
  "message": "Cannot transition from COMPLETE to CANCELLED"
}
```

**Response (404 Not Found)** - タスクが存在しない:
```json
{
  "error": "Task not found",
  "task_id": "task-xxx"
}
```

**許可される状態遷移**:
- QUEUED -> CANCELLED
- RUNNING -> CANCELLED

**禁止される状態遷移**:
- COMPLETE -> (どの状態にも遷移不可)
- ERROR -> (どの状態にも遷移不可)
- CANCELLED -> (どの状態にも遷移不可)


### Task Group 一覧取得

**Endpoint**: `GET /api/task-groups`

**Response (200 OK)**:
```json
{
  "namespace": "project-a-a1b2",
  "task_groups": [
    {
      "task_group_id": "group-001",
      "task_count": 5,
      "queued_count": 1,
      "running_count": 1,
      "complete_count": 2,
      "error_count": 1,
      "cancelled_count": 0,
      "created_at": "2024-01-15T08:00:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```


### Task Group 作成（Task 投入）

**Endpoint**: `POST /api/task-groups`

**Request Body**:
```json
{
  "task_group_id": "my-task-group",
  "prompt": "ユーザーの指示内容"
}
```

**Response (201 Created)**:
```json
{
  "task_id": "task-xxx",
  "task_group_id": "my-task-group",
  "namespace": "project-a-a1b2",
  "status": "QUEUED",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```


### Task 投入

**Endpoint**: `POST /api/tasks`

**Request Body**:
```json
{
  "task_group_id": "existing-group",
  "prompt": "ユーザーの指示内容"
}
```

**Response (201 Created)**:
```json
{
  "task_id": "task-xxx",
  "task_group_id": "existing-group",
  "namespace": "project-a-a1b2",
  "status": "QUEUED",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```


### Task 詳細取得

**Endpoint**: `GET /api/tasks/:task_id`

**Response (200 OK)**:
```json
{
  "task_id": "task-xxx",
  "task_group_id": "group-001",
  "namespace": "project-a-a1b2",
  "session_id": "session-yyy",
  "status": "RUNNING",
  "prompt": "ユーザーの指示内容",
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:31:00.000Z",
  "error_message": null
}
```


### Health Check

**Endpoint**: `GET /api/health`

**Response (200 OK)**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "namespace": "project-a-a1b2",
  "table_name": "pm-runner-queue",
  "project_root": "/Users/masa/dev/project-a"
}
```


### Namespace 情報取得

**Endpoint**: `GET /api/namespace`

**Response (200 OK)**:
```json
{
  "namespace": "my-project-a1b2",
  "table_name": "pm-runner-queue",
  "project_root": "/Users/masa/dev/my-project"
}
```

**注意**: v2 では `table_name` は常に `pm-runner-queue`（固定値）


## Cross-References

- 20_QUEUE_STORE.md (Queue Store 仕様)
- 05_DATA_MODELS.md (Task / Session データ構造)
- 21_STABLE_DEV.md (Namespace 設計)

---

## 管理画面メニュー構成（現行 v3+）

*最終更新: 2026-04-09*

### 左サイドバーメニュー

> **v2.3 変更点**:
> - `Activity` → `Live Tasks` に改名（`#/activity` は現役 + 新エイリアス `#/live-tasks`）
> - `Task Tracker` メニューを **削除**（使用されていなかった。`spec/34` と `src/task-tracker/` も削除）
> - 新メニュー `Recovery` を追加（`#/recovery`）: stale / failed タスクの continue / rollback / retry
> - 新メニュー `New Chat` (`#/new-chat` ダイアログ)、`Processes` (`#/processes`) は別途実装済み

#### セクション 1: Main

| メニュー名 | URL/ハッシュ | レンダラー関数 | 主要APIエンドポイント | Playwrightテスト |
|-----------|------------|--------------|-------------------|----------------|
| Dashboard | #/dashboard または / | renderDashboard | GET /api/dashboard, /api/projects | left-menu-navigation.spec.ts |
| Projects | #/projects | renderProjectList | GET/POST/PATCH/DELETE /api/projects | left-menu-navigation.spec.ts |
| Task Groups | #/ または #/task-groups | renderTaskGroupList | GET/POST/PATCH/DELETE /api/task-groups | task-groups-crud.spec.ts |
| New Chat | #/new-chat（ダイアログ） | openNewChatDialog | GET /api/projects | chat-navigation.spec.ts |
| Live Tasks | #/activity または #/live-tasks | renderLiveTasks | GET /api/live-tasks, GET /api/activity | live-tasks.spec.ts |

#### セクション 2: Claude Code

| メニュー名 | URL/ハッシュ | レンダラー関数 | 主要APIエンドポイント | Playwrightテスト |
|-----------|------------|--------------|-------------------|----------------|
| AI Generate | #/ai-generate | renderAssistantPage | /api/assistant/* | left-menu-navigation.spec.ts, ai-generate-model-selector.spec.ts |
| Hooks | #/hooks | renderHooksPage | GET/POST/PUT/DELETE /api/claude-hooks | hooks-crud.spec.ts |
| Commands | #/commands | renderCommandsPage | GET/POST/PUT/DELETE /api/claude-files/commands | commands-agents-crud.spec.ts |
| Agents | #/agents | renderAgentsPage | GET/POST/PUT/DELETE /api/claude-files/agents (type=agent) | commands-agents-crud.spec.ts |
| Skills | #/skills | renderSkillsPage | GET/POST/PUT/DELETE /api/claude-files/agents (type=skill); 別経路の `POST /api/skills/generate` は **テンプレートベース** スキャフォールド（LLM 不使用、後述「Skills: Template Scaffold vs AI Generate」を参照） | skills-sidebar.spec.ts, skills-crud.spec.ts |
| Plugins | #/plugins | renderPluginsPage | /api/assistant/plugins* | assistant-save-plugin spec |
| MCP Servers | #/mcp-servers | renderMcpServersPage | GET/PATCH /api/mcp-servers | left-menu-navigation.spec.ts |

#### セクション 3: Management

| メニュー名 | URL/ハッシュ | レンダラー関数 | 主要APIエンドポイント | Playwrightテスト |
|-----------|------------|--------------|-------------------|----------------|
| Backup | #/backup | renderBackupPage | （部分実装） | left-menu-navigation.spec.ts |
| Recovery | #/recovery | renderRecoveryPage | GET /api/recovery/stale, /api/recovery/failed, POST /api/tasks/:id/rollback, POST /api/tasks/:id/retry | recovery-page.spec.ts |
| PR Reviews | #/pr-reviews | renderPRReviewsPage | GET/POST/DELETE /api/pr-reviews | left-menu-navigation.spec.ts |
| Logs | #/logs | renderLogsPage | GET /api/app-logs | left-menu-navigation.spec.ts |
| Processes | #/processes | renderProcessesPage | GET /api/system/processes, POST /api/system/processes/:pid/kill | processes-page.spec.ts |
| Settings | #/settings | renderSettingsPage | GET/POST/PATCH/DELETE /api/settings | settings*.spec.ts, settings-save-buttons.spec.ts |

### Settings ページ: カード別セーブ構造（v3.x 新規）

**目的**: Settings 画面で複数カードに1つの「Save Global Settings」ボタンが配置されていた構成を廃止し、カード単位でセーブボタンを配置する。カードごとに明示的な保存フローを持つことで、「どのボタンを押せば何が保存されるのか」が曖昧な UX バグを解消する。

**背景**:
v3.x 以前は Settings 画面の末尾に「Save Global Settings」ボタンが 1 つだけ存在し、Default LLM Configuration カードと Default Generation Parameters カードを同時に保存していた。一方で Internal LLM カードだけは自分専用の「Save Internal LLM Settings」ボタンを持っていた。結果、ユーザが Default LLM Configuration を変更して Internal LLM のボタンを押すと LLM 設定が保存されない、という混乱が発生した。

**変更後の構成（1 カード = 1 セーブボタン）**:

| カード | セーブボタン (data-testid) | 保存先 API | 保存される主なフィールド |
|--------|---------------------------|-----------|------------------------|
| Default LLM Configuration | `settings-save-default-llm` | PUT `/api/settings/project` | `llm.provider`, `llm.model` |
| Internal LLM | `settings-save-internal-llm` | PUT `/api/settings/internal-llm` | `internalLlm.provider`, `internalLlm.model` |
| Default Generation Parameters | `settings-save-default-params` | PUT `/api/settings/project` | `preferences.maxTokens`, `preferences.temperature` |

**廃止**:
- ページ末尾の `Save Global Settings` ボタンは削除。`resetSettings()` ボタンは残置。
- JS 関数 `saveGlobalSettings()` は削除し、`saveDefaultLlmSettings()` と `saveDefaultGenerationParams()` に分割。
- `saveInternalLlmSettings()` は変更しない（既に正しい構成）。

**UI 仕様**:
- 各カード内、フォーム要素の下に `settings-actions` ブロックを配置し、そのカード固有のセーブボタンを配置する。
- ボタンラベルはカード名と揃える:
  - Default LLM Configuration → "Save Default LLM"
  - Default Generation Parameters → "Save Default Parameters"
  - Internal LLM → "Save Internal LLM Settings"（既存）
- 保存成功時は `showToast('... saved', 'success')` を表示。

### Model Dropdown Cost / Tier Display (v3.x 新規 - Batch 2)

**目的**: ユーザが「どのモデルを使った時にどれぐらい頭が良くて、どのぐらい課金がかかるのか」を選択時点で判断できるようにする。従来の model dropdown は `<option>GPT-4o</option>` のように表示名のみで、料金と性能帯が不明だった。

**対象 `<select>` 要素**:

| ID | 画面 | カード |
|---|---|---|
| `settings-model` | Settings → App | Default LLM Configuration |
| `settings-qd-model` | Settings → App | Internal LLM |
| `project-model` | Settings → Project Overrides | LLM Configuration Override |

**Option 文字列フォーマット** (A-4, 2026-04-25 Batch 2 fix で per-token-direction 表記に変更):
```
"{displayName} (${inputPricePerMillion.toFixed(2)}/1M in, ${outputPricePerMillion.toFixed(2)}/1M out • {tier})"
```

例:
- `"GPT-4o ($2.50/1M in, $10.00/1M out • flagship)"`
- `"Claude 3.5 Haiku ($0.80/1M in, $4.00/1M out • standard)"`
- `"GPT-5.4 ($2.50/1M in, $15.00/1M out • flagship)"`

**Batch 2 fix (2026-04-25) - 削除されたモデル**:
以下の 3 モデルは publish された API 価格がなく retired と判断、registry から削除された:
- `gpt-5`, `gpt-5.1`, `o3-mini`

これらは `/v1/models` 応答には残っているが、実際の課金 API が存在しないため
dropdown に `$0.00 / $0.00` と表示されてユーザを誤解させる恐れがあった。
公式価格が公開された段階で再追加する。

**`tier` フィールド（ModelInfo 拡張）**:

`src/models/repl/model-registry.ts` の `ModelInfo` インターフェースに `tier: 'basic' | 'standard' | 'advanced' | 'flagship'` を必須フィールドとして追加する。

tier の分類基準（input price per 1M tokens ベースのヒューリスティック）:
- `flagship`: > $10/M、または最先端世代（GPT-4o, Claude Opus 4, o1, GPT-5.x）
- `advanced`: $2–$10/M（GPT-4 Turbo, Claude Sonnet 4, Claude 3.5 Sonnet）
- `standard`: $0.5–$2/M（GPT-3.5 Turbo, Claude 3.5 Haiku）
- `basic`: < $0.5/M（GPT-4o Mini, Claude 3 Haiku）

pricing TBD（0/0）のモデルは、世代・ポジションで判定する（例: GPT-5.4 Pro → flagship、o4 Mini → advanced）。

**データソース**:
- registry (`OPENAI_MODELS`, `ANTHROPIC_MODELS`) が唯一の真実。
- `getAllModelCostInfo()` は各 ProjectCostInfo に `tier` を含めて返す。
- `GET /api/models` は `getAllModelCostInfo()` の戻り値をそのまま返すので、クライアントは `tier` / `inputPricePerMillion` / `outputPricePerMillion` / `modelDisplayName` を取得可能。

**クライアント実装**:
- `populateModelDropdown(selectId, provider, selectedValue)` ヘルパ関数を `index.html` に追加する。
  - `fetch('/api/models')` で一覧取得（Settings 画面表示時に呼ばれる）
  - provider が指定された場合はその provider のモデルのみを `<option>` に追加
  - provider 未指定なら openai + anthropic の両方を連結
  - 各 `<option>` の text は上記フォーマット、value は `modelId`
  - `selectedValue` に一致する option には `selected` 属性を付与
- 既存の 3 つの `<select>` のハードコードされた `<option>` は削除し、`<option value="">Loading...</option>` プレースホルダのみを残す。
- `renderSettings()` は内部 render 完了後に `populateModelDropdown('settings-model', ...)` と `populateModelDropdown('settings-qd-model', ...)` を呼ぶ。
- `renderProjectOverrides()` は内部 render 完了後に `populateModelDropdown('project-model', ...)` を呼ぶ。

**仕様書↔実装↔テストの3点リンク追記**:

| メニュー | 仕様書セクション | 実装関数 | テストファイル |
|---------|----------------|---------|--------------|
| Model Dropdown (Cost/Tier) | spec/19_WEB_UI.md#model-dropdown-cost--tier-display-v3x-新規---batch-2 | populateModelDropdown / renderAppSettings / renderProjectOverrides | test/unit/models/model-registry-tier.test.ts, test/unit/web/ai-cost-service-tier.test.ts, test/unit/web/settings-model-dropdown.test.ts, test/playwright/model-dropdowns-cost.spec.ts |

### AI Generate Model Selector (v3.x 新規 - Batch 3)

**目的**: `/ai-generate` ページで AI 提案を生成する際、ユーザがその場で provider / model を選べるようにする。Settings のデフォルトとは独立に「今回だけ flagship モデルで生成する」ことを可能にし、生成品質（スキル/エージェントのクオリティ）の問題に対する直接的なユーザコントロールを提供する。

**背景**: これまで AI Generate は Settings の `defaultProvider` / `defaultModels` をそのまま使い、初期値は `gpt-4o-mini` / `claude-3-haiku-20240307` （いずれも basic tier）だった。ユーザから生成内容の品質が低いという報告があり、(a) デフォルトをより高品位な flagship / advanced tier に引き上げる、(b) UI からいつでもモデルを切り替えられる、の 2 点を実装する。

**UI 要素**（`renderProposeTab()` 内、`assistant-input-area` の上に配置）:

| data-testid | 要素 | 説明 |
|---|---|---|
| `ai-generate-provider` | `<select>` | openai / anthropic を選択（initial: `localStorage['pm-runner-ai-generate-provider']` or Settings default） |
| `ai-generate-model` | `<select data-dynamic="true">` | provider に対応するモデル一覧（`populateModelDropdown` で描画） |

**UI 動作**:
- `populateModelDropdown('ai-generate-model', providerValue, selectedValue)` を呼び出して option を描画。
- provider を切り替えると model select を再描画（そのプロバイダーのモデルのみ）。
- 両方の選択値を `localStorage['pm-runner-ai-generate-provider']` / `localStorage['pm-runner-ai-generate-model']` に保存。次回ロード時に読み戻す。
- 「Send」ボタン押下時、POST body に `provider` と `model` を含めて送信する。

**サーバ側デフォルト（`src/web/routes/assistant.ts`）**:

| Provider | 旧デフォルト (basic) | 新デフォルト |
|---|---|---|
| openai | `gpt-4o-mini` | `gpt-4o` (flagship) |
| anthropic | `claude-3-haiku-20240307` | `claude-sonnet-4-20250514` (advanced) |

**POST /api/assistant/propose 入力契約拡張**:

リクエストボディに以下の optional フィールドを許可する:
- `provider`: `"openai" | "anthropic"` — 明示的に provider を上書きする
- `model`: `string` — 明示的に model id を上書きする

両方が与えられた場合、registry に実在するモデルかを検証し、不正値は 400 で拒否する。省略時は新デフォルトを用いる。選択されたモデルは `response.meta.selectedProvider` / `response.meta.selectedModel` に含めて返す（デバッグ用）。

**System Prompt 強化（`buildSystemPrompt(scope)`）**:

従来 ~50 行の簡潔な JSON schema 案内だったプロンプトを、約 150 行に拡張する。構成:

1. **Role** — 「あなたは Claude Code の設定アーティファクト（skill / agent / command / hook）を生成するエキスパートエディタです」
2. **Output format** — JSON schema を厳密に記述、artifact kind 別のパス規約、patch フィールドの JSON-encoded string ルール
3. **Artifact kind ガイドライン** — skill / agent / command それぞれの書き方（frontmatter 構造、セクション構成、命名）
4. **Quality guidelines（品質規範）** — 「プロジェクト固有の慣習を尊重する」「具体的なコマンド例を含める」「hallucinated フラグを使わない」「秘密情報を含めない」「既存の artifact と衝突する命名を避ける」
5. **Few-shot examples** — skill / agent について、入力 prompt → 高品質な出力 JSON の対応例を 2 件
6. **Constraints（制約）** — content に Claude Code では未サポートのツール API を呼び出さない、禁止拡張子を使わない、targetPathHint は scope と整合すること 等

**仕様書↔実装↔テストの3点リンク追記**:

| メニュー | 仕様書セクション | 実装関数 | テストファイル |
|---------|----------------|---------|--------------|
| AI Generate Model Selector | spec/37_AI_GENERATE.md, spec/19_WEB_UI.md#ai-generate-model-selector-v3x-新規---batch-3 | renderProposeTab / assistantSend / generateProposal / buildSystemPrompt | test/unit/web/routes/assistant-defaults.test.ts, test/unit/web/routes/assistant-system-prompt.test.ts, test/unit/web/routes/assistant-model-override.test.ts, test/unit/web/ai-generate-model-selector.test.ts, test/playwright/ai-generate-model-selector.spec.ts |

### Skills: Template Scaffold vs AI Generate (v3.x 新規 - Batch 4)

**目的**: 「スキルの自動生成」に関連するエンドポイントが 2 つ存在し、それぞれ全く異なる仕組みであることを明示する。混同すると「AI 生成のはずなのにモデル選択がない」「品質が低い」といった誤解を招くため、UI とドキュメント両方で明確に区別する。

**2 つのエンドポイント**:

| エンドポイント | 仕組み | LLM 使用 | コスト | 出力の決定性 | 用途 |
|---|---|---|---|---|---|
| `POST /api/skills/generate` | **テンプレートベース** スキャフォールド。`scanProject()` が package.json / tsconfig / Cargo.toml 等を読み、`generateSkills()` がプロジェクトに合った定型スキル（project-conventions / test / deploy / project-safety 等）を**プログラム的に**生成する。 | ✗（呼び出さない） | ¥0 | **完全に決定的**（同じ入力 → 同じ出力） | プロジェクト初期化時に最低限のスキル骨格を一括生成 |
| `POST /api/assistant/propose` | **AI 生成**。`buildSystemPrompt()` で構築した System Prompt と user prompt を LLM（OpenAI / Anthropic）に送り、`ProposalPlanSet` を受け取る。 | ✓ | モデル次第（flagship は高コスト） | 非決定的（同じ入力でも出力が揺れる） | 自然言語の指示から個別の skill / agent / command 等を作成 |

**レスポンスのマーカー**:
- `POST /api/skills/generate` のレスポンスは常に `template: true` を含める。クライアントから見ても LLM コールが起きていないことが自明になる。
- `POST /api/assistant/propose` のレスポンスは `meta.selectedProvider` / `meta.selectedModel` を返す（既存仕様）。

**UI 表示ルール**（Skills ページ `renderSkillsContent()`）:
- 個別スキルの編集は引き続き `/api/claude-files/agents` を使う。Skills ページは AI を呼ばない。
- ただしユーザが「このページ自体が AI で skill を作るのでは？」と誤解する可能性があるため、Skills ページのヘッダ直下に **常時表示される説明バナー** を 1 行配置する:
  - `data-testid="skills-template-help"` を持つ要素
  - 文言（英語）: `Manually edit existing skill files. To create a new skill from a natural-language prompt, use AI Generate. /api/skills/generate (CLI/API only) generates a fixed template scaffold (no AI cost).`
  - リンクで `/ai-generate` に遷移できること。

**仕様書↔実装↔テストの3点リンク追記**:

| メニュー | 仕様書セクション | 実装関数 | テストファイル |
|---------|----------------|---------|--------------|
| Skills Template Scaffold | spec/19_WEB_UI.md#skills-template-scaffold-vs-ai-generate-v3x-新規---batch-4 | createSkillsRoutes / generateSkills / renderSkillsContent | test/unit/web/routes/skills-template-only.test.ts, test/unit/web/skills-page-labels.test.ts |

### Live Tasks ページ詳細仕様（v2.3 新規）

**目的**: いま動いているタスクをプロジェクト横断で一覧表示。Event History を下部に折りたたみ表示。

**上段: Live Tasks テーブル**
- 対象ステータス: `RUNNING`, `WAITING_CHILDREN`, `AWAITING_RESPONSE`, `QUEUED`（QUEUED は optional フィルタ）
- 列: Status バッジ / Task ID / Project alias / Task Group / Started / Elapsed / Age from last update / Actions
- Actions: View (→ `/tasks/:id`), Cancel (→ PATCH status CANCELLED)
- Stale判定: `age > staleThresholdMs` の行は赤背景 + "STALE" バッジ
- 自動リフレッシュ: 5 秒間隔（チェックボックスで on/off）

**下段: Event History（折りたたみ）**
- 既存 `/api/activity` を再利用
- デフォルト collapsed、クリックで展開
- 50 件表示

**API**:
```
GET /api/live-tasks?namespace=<ns>&limit=<n>&includeQueued=<bool>
  Response:
  {
    tasks: [
      { task_id, task_group_id, project_path, project_alias, status,
        started_at, updated_at, elapsed_ms, stale_ms, is_stale }
    ],
    stale_count: number,
    stale_threshold_ms: number
  }
```

### Recovery ページ詳細仕様（v2.3 新規）

**目的**: クラッシュ・中断などで RUNNING のまま放置されたタスク、および ERROR タスクを検査し、`continue` / `retry` / `rollback` / `cancel` する。

**URL**: `#/recovery`

**上段: Stale タスク一覧**
- 条件: status=`RUNNING` or `WAITING_CHILDREN` で `age_ms > staleThresholdMs`
- 列: Task ID / Project / Task Group / Status / Age / Actions
- Actions: **Mark as ERROR** (強制的にエラーに遷移) / **Rollback** (git stash/file snapshot 復元) / **View**
- 起動時にバナー通知: "N 件の stale タスクを検出しました"

**中段: Recent Failed タスク一覧**
- 条件: status=`ERROR` で最近 24 時間以内
- Actions: **Retry** (QUEUED に戻す) / **Rollback** / **View**

**下段: Rollback History**
- 過去に実行された rollback 操作のログ（最新 20 件）
- 列: Task ID / Project / Rolled back at / Checkpoint type / Result

**API**:
```
GET /api/recovery/stale        → stale task list
GET /api/recovery/failed       → recent error tasks
POST /api/tasks/:id/rollback   → execute checkpoint rollback (parent-scoped)
POST /api/tasks/:id/retry      → transition ERROR → QUEUED
```

**Rollback の親子関係ルール（CRITICAL）**:
詳細は [spec/36_LIVE_TASKS_AND_RECOVERY.md](./36_LIVE_TASKS_AND_RECOVERY.md) を参照。
- Checkpoint は **ルートタスクのみが作成・所有**する（`parent_task_id === undefined` のタスク）
- サブタスクは checkpoint を新規作成しない（親のチェックポイントを継承）
- Rollback は対象タスクから親チェーンを辿って root を見つけ、root.checkpoint_ref を復元
- 復元後、root と全ての descendants は `CANCELLED` に遷移
- "親または子のどちらを rollback してもツリー全体が巻き戻る" — これが期待動作

### Task Groups の詳細仕様（v3）

#### 一覧ページ（renderTaskGroupList）

- URLハッシュ: `#/` または `#/task-groups`
- 表示内容: タスクグループの一覧（最新order）
- 各アイテムに削除ボタン（赤色）が表示される
- 削除後のナビゲーション先: `/task-groups`（`/` ではない）

#### 詳細ページ（renderTaskList）

- URLハッシュ: `#/task-groups/{task_group_id}`
- 表示内容: タスクグループ内のタスク一覧
- 「グループ削除」ボタンが表示される
- 削除後のナビゲーション先: `/task-groups`（`/` ではない）

#### タスク詳細ページ（renderTaskDetail）

- URLハッシュ: `#/tasks/{task_id}`
- 「タスク削除」ボタンが表示される
- 削除後のナビゲーション先: `/task-groups/{task_group_id}`

### 削除操作の仕様

すべての削除操作は以下の共通仕様に従う:

1. ユーザーに確認ダイアログを表示（`confirm()`）
2. DELETE APIを呼び出す
3. 成功後、適切なリストページへナビゲートする
4. 失敗時はアラート表示

**ナビゲーション先の正規化**:
- タスクグループ削除 → `/task-groups` へ（`/`ではない）
- タスク削除 → `/task-groups/{親グループID}` へ


## バックグラウンド起動

### 概要

Web UI サーバーをバックグラウンドプロセスとして起動し、ターミナルを占有せずに動作させる。

### CLI オプション

```bash
pm web --background [--port <number>] [--namespace <name>]
```

### 動作仕様

1. `--background` フラグが指定された場合、サーバーをデタッチドプロセスとして起動
2. PID ファイルを namespace の state ディレクトリに保存
3. stdout / stderr をログファイルにリダイレクト
4. 親プロセスは起動確認後に即座に終了

### PID ファイル

```
.claude/state/{namespace}/web-server.pid
```

- PID ファイルには起動したプロセスの PID を記録
- サーバー終了時に自動削除
- `web-stop` コマンドがこの PID を読み取って終了シグナルを送信

### ログファイル

```
.claude/state/{namespace}/web-server.log
```

- stdout と stderr を統合してログファイルに出力
- ログローテーションは Phase 2 で検討


## web-stop コマンド

### 概要

バックグラウンドで起動している Web UI サーバーを停止する。

### CLI

```bash
pm web-stop [--namespace <name>] [--port <number>]
```

### 動作仕様

1. PID ファイルを読み取る
2. 該当プロセスに SIGTERM を送信（graceful shutdown）
3. 5秒以内に終了しない場合は SIGKILL を送信（強制終了）
4. PID ファイルを削除
5. 終了結果を表示

### 終了コード

| コード | 意味 |
|--------|------|
| 0 | 正常に停止 |
| 1 | PID ファイルが見つからない（サーバーが起動していない） |
| 2 | プロセスが応答しない（強制終了を実施） |

### エラーケース

- PID ファイルが存在しない場合: エラーメッセージを表示して終了
- PID ファイルのプロセスが既に終了している場合: PID ファイルを削除して終了
- プロセスが応答しない場合: SIGKILL で強制終了


## Queue 共有の仕様（v2）

### 原則

**同じ namespace を使用する全ての Web UI と REPL は、同じ Queue を共有する。**

### DynamoDB テーブル名（v2）

**固定**: `pm-runner-queue`

v2 では全ての namespace が単一テーブルを共有。
namespace はパーティションキーとしてデータを分離。

```
[Web UI: stable]  ─┬─> [DynamoDB: pm-runner-queue]
[Web UI: dev]     ─┤     ├─ namespace=stable のデータ
[REPL: terminal]  ─┘     └─ namespace=dev のデータ
```

### 同一 namespace での複数インスタンス

```
[Web UI: port 5678] ─┬─> [DynamoDB: pm-runner-queue]
[REPL: terminal 1]  ─┤     └─ namespace=stable のデータ
[REPL: terminal 2]  ─┘
```

- 全て同じテーブルの同じ namespace データを参照
- タスクの投入・取得は競合しない（DynamoDB の atomic 操作）
- Runner は 1 つだけがタスクを処理する（QUEUED -> RUNNING の atomic 更新）

### 異なる namespace での分離

- 同一テーブル内で namespace パーティションキーにより論理分離
- Query 時に `namespace = X` を指定してフィルタリング
- 互いのデータは見えない


## Namespace 自動導出

### 原則

**同じプロジェクトフォルダ = 同じ Queue**

namespace を明示的に指定しない場合、プロジェクトルートのパスから自動的に namespace を導出する。
これにより、異なるプロジェクトが誤って同じ Queue を共有することを防ぐ。

### 導出ロジック

```
プロジェクトルート: /Users/masa/dev/my-project
  ↓
フォルダ名: my-project
パスハッシュ: a1b2 (MD5 の先頭4文字)
  ↓
namespace: my-project-a1b2
```

### 優先順位

1. `--namespace` オプション（最優先）
2. 環境変数 `PM_RUNNER_NAMESPACE`
3. **プロジェクトルートからの自動導出**（デフォルト動作）

### 例

```bash
# 自動導出（推奨）
cd /Users/masa/dev/project-a
pm web  # namespace = project-a-xxxx

cd /Users/masa/dev/project-b
pm web  # namespace = project-b-yyyy（別の namespace）

# 明示的に指定（上書き）
pm web --namespace shared  # namespace = shared
```

### Web UI での namespace 表示

Web UI のヘッダーに現在の namespace が表示される。

- 自動導出の場合: 緑色のバッジ
- 明示的指定の場合: 通常のバッジ

これにより、どの Queue を操作しているか一目で確認できる。

### Project Detail ページ仕様（v3.x: README タブ化）

*最終更新: 2026-04-23*

#### URL とレンダラー

- URL ハッシュ: `#/projects/{projectId}`
- レンダラー関数: `renderProjectDetail(projectId)` (`src/web/public/index.html`)
- API: `GET /api/projects/{projectId}`, `GET /api/projects/{projectId}/readme`

#### タブ構成

Project Detail は **2 タブ構成** で表示する。

| タブ | data-testid | 内容 |
|------|-------------|------|
| Overview | `project-detail-tab-overview` | Project Details / Project Metadata / Default Command / Project Actions / Task Groups / Recent Task Groups / Recent Tasks / Recent Activity / Sessions（既存全カード） |
| README | `project-detail-tab-readme` | プロジェクト直下 `README.md` の Markdown プレビュー |

- 既定で **Overview タブが選択されている**（後方互換）
- タブ切替時に URL hash は変更しない（軽量）。リロードすると Overview に戻る
- README タブはプロジェクトに `README.md` が存在しなくても **常に表示**する。中身は「No README found」になる

#### README プレビュー仕様（v3.x: 自前 parser → marked + DOMPurify 置換）

- **レンダリングライブラリ**: `marked` (UMD) + `DOMPurify` (min)
  - 旧実装の自前 Markdown parser (`renderMarkdownToHtml` / `sanitizeMarkdownUrl`) は **削除**
  - vendor 配置: `src/web/public/vendor/{marked.umd.js, purify.min.js}` → 同 `dist/web/public/vendor/`
  - 配信パス: `<script src="/vendor/marked.umd.js">`, `<script src="/vendor/purify.min.js">`
  - vendor 同期: `node scripts/copy-vendor.cjs`（`postbuild` から自動実行）

- **サニタイズ方針**:
  - DOMPurify のデフォルト挙動に依存（`javascript:` / `data:` / `vbscript:` URL は属性削除）
  - リンクは `target="_blank" rel="noopener noreferrer"` を付与（marked renderer で）

- **API**:
  - `GET /api/projects/{projectId}/readme` → `{ content: string, exists: boolean, path: string }`
  - 既存実装（`src/web/routes/dashboard.ts`）を流用。バックエンド変更なし

- **DOM 構造**:
  - タブ pane: `<div data-testid="project-detail-pane-readme">`
  - プレビュー本体: `<div data-testid="project-readme-body">{sanitized HTML}</div>`
  - リフレッシュボタン: `<button data-testid="project-readme-refresh-btn">`

#### 3点リンク追記

| メニュー | 仕様書セクション | 実装関数 | テストファイル |
|---------|----------------|---------|--------------|
| Project Detail Tabs | spec/19_WEB_UI.md#project-detail-ページ仕様v3x-readme-タブ化 | renderProjectDetail / setProjectDetailTab | test/playwright/project-readme-preview.spec.ts |
| Project README Preview | spec/19_WEB_UI.md#readme-プレビュー仕様v3x-自前-parser--marked--dompurify-置換 | loadProjectReadme | test/playwright/project-readme-preview.spec.ts, test/playwright/tier-a-critical.spec.ts (XSS) |

