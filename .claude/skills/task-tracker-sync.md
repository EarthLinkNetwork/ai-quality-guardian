---
skill: task-tracker-sync
version: 1.0.0
category: integration
description: ClickUp/Asana等のタスク管理ツールとMCP経由で連携し、タスクの作成・更新・コメント追加を行う
metadata:
  id: task-tracker-sync
  display_name: Task Tracker Sync
  risk_level: low
  color_tag: YELLOW
  task_types:
    - IMPLEMENTATION
    - REVIEW_RESPONSE
    - CONFIG_CI_CHANGE
capabilities:
  - task_creation
  - task_update
  - comment_addition
  - status_sync
tools:
  - Read
  - Bash
  - Task
priority: medium
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: session-manager
    relationship: receives_input_from
  - skill: reporter
    relationship: receives_input_from
---

# Task Tracker Sync - タスク管理ツール連携スキル

## Activation Conditions

pm-orchestrator から以下のタイミングで起動される:
- 新タスク開始時 (new_task判定後)
- タスク進捗時 (same_task判定後、重要なステップ完了時)
- タスク完了時 (reporter Skill の最終レポート後)

## Supported Providers

| Provider | MCP Server | Status |
|----------|------------|--------|
| ClickUp | mcp-clickup | Supported |
| Asana | mcp-asana | Supported |
| None | - | Disabled |

## Processing Flow

```
1. project-config.json からタスク管理ツール設定を読み込み
2. provider が none の場合はスキップ
3. MCP サーバー経由でタスク管理ツール API を呼び出し
4. 結果をセッションファイルに記録
5. 結果をpm-orchestratorに返却
```

## Configuration

```json
{
  "taskTracker": {
    "provider": "clickup | asana | none",
    "projectId": "PROJECT_ID",
    "defaultList": "LIST_ID",
    "mcpServerName": "mcp-clickup"
  }
}
```

## Operations

### 1. Create Task (new_task時)

**トリガー**: session-manager が new_task を判定した直後

**処理内容**:
1. ユーザーの最初の入力文をベースにタイトルを生成
2. 元のプロンプト本文 + PM Orchestrator が理解した要約を説明文に格納
3. タスクを作成
4. 作成されたタスクID を session-run JSON に保存

**MCP呼び出し例 (ClickUp)**:
```
mcp_clickup_create_task:
  list_id: "LIST_ID"
  name: "ログイン画面のUI修正"
  description: |
    ## 元のプロンプト
    ログイン画面のUIを修正してください。

    ## PM Orchestrator 要約
    - TaskType: IMPLEMENTATION
    - 規模: medium
    - 主要タスク: LoginForm コンポーネントの修正
  status: "in progress"
```

### 2. Add Comment (same_task時)

**トリガー**:
- same_task 判定時（進捗報告）
- 各サブエージェント完了時

**処理内容**:
1. 既存のタスクIDを使用
2. PM Orchestrator やサブエージェントのアウトプットサマリをコメントに追加

**MCP呼び出し例 (ClickUp)**:
```
mcp_clickup_create_comment:
  task_id: "TASK_ID"
  comment_text: |
    ## 進捗報告 (2025-12-08 12:30)

    ### 完了したステップ
    - ✅ task-decomposer: 3タスクに分解
    - ✅ implementer: LoginForm.tsx を修正

    ### 次のステップ
    - qa: 品質チェック実行中
```

### 3. Final Report (reporter完了時)

**トリガー**: reporter Skill が最終レポートを出力した直後

**処理内容**:
1. 最終レポートの内容をコメントとして追加
2. タスクステータスを更新（完了 or 要対応）

**MCP呼び出し例 (ClickUp)**:
```
mcp_clickup_create_comment:
  task_id: "TASK_ID"
  comment_text: |
    ## 🎉 タスク完了レポート

    ### タスク概要
    ログイン画面のUI修正

    ### 実行結果
    - ✅ タスク分解: 3タスクに分解
    - ✅ 実装: 2ファイル変更
    - ✅ 品質検証: テスト12/12合格
    - ✅ レビュー: 準拠率95%

    ### 変更内容
    - src/components/LoginForm.tsx (+45行)
    - src/styles/login.css (+20行)

mcp_clickup_update_task:
  task_id: "TASK_ID"
  status: "complete"
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 Task Tracker Sync - 連携結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: YELLOW | Risk: LOW | Category: integration

【操作】
create_task | add_comment | update_status

【Provider】
ClickUp / Asana

【タスク情報】
タスクID: CLICKUP-abc123
タスク名: ログイン画面のUI修正
URL: https://app.clickup.com/t/abc123

【結果】
✅ 成功 / ❌ 失敗

Status: completed
```

## Error Handling

### Provider が none の場合

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Task Tracker Sync - スキップ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

タスク管理ツール連携は無効です。
有効にするには /pm-config edit でproviderを設定してください。

Status: skipped
```

### MCP サーバー未接続の場合

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Task Tracker Sync - エラー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【エラー】
MCP サーバー 'mcp-clickup' に接続できません。

【対処方法】
1. MCP サーバーが起動しているか確認
2. claude mcp list で接続状態を確認
3. 必要に応じて再接続

Status: failed
```

## Integration Points

- **入力元**: pm-orchestrator, session-manager, reporter
- **出力先**: pm-orchestrator (ステータス報告)

## Examples

### Example 1: 新タスク作成

**入力:**
```
session-manager判定: new_task
ユーザー入力: ログイン画面のバリデーションを追加してください
```

**出力:**
```
🔗 Task Tracker Sync - 連携結果

【操作】
create_task

【Provider】
ClickUp

【タスク情報】
タスクID: abc123xyz
タスク名: ログイン画面のバリデーション追加
URL: https://app.clickup.com/t/abc123xyz

【結果】
✅ タスク作成成功

Status: completed
```

### Example 2: コメント追加

**入力:**
```
session-manager判定: same_task
taskRunId: 2025-12-08-001
implementer完了: LoginForm.tsx を修正
```

**出力:**
```
🔗 Task Tracker Sync - 連携結果

【操作】
add_comment

【Provider】
ClickUp

【タスク情報】
タスクID: abc123xyz
コメント: implementer完了 - LoginForm.tsx を修正

【結果】
✅ コメント追加成功

Status: completed
```
