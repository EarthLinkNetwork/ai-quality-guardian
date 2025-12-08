---
skill: project-config-manager
version: 1.0.0
category: configuration
description: project-config.json の管理を行い、プロジェクト設定の表示・編集・検証を提供する
metadata:
  id: project-config-manager
  display_name: Project Config Manager
  risk_level: low
  color_tag: YELLOW
  task_types:
    - READ_INFO
    - CONFIG_CI_CHANGE
capabilities:
  - config_display
  - config_edit
  - config_validation
  - feature_toggle
tools:
  - Read
  - Write
  - Edit
  - Bash
priority: medium
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
---

# Project Config Manager - プロジェクト設定管理スキル

## Activation Conditions

以下の条件で起動される:
1. ユーザーが `/pm-config` コマンドを実行
2. pm-orchestrator が設定確認を必要とした場合
3. 他のスキルが設定値を必要とした場合

## Purpose

- `project-config.json` の一元管理
- 設定値の表示・編集・検証
- 機能の有効化/無効化
- 設定の整合性チェック

## Configuration File Location

```
.claude/project-config.json
```

## Configuration Schema

```json
{
  "version": "2.1.0",
  "e2eTest": {
    "enabled": false,
    "browser": "chrome",
    "headless": true,
    "extraBrowsers": []
  },
  "codeReview": {
    "mode": "none",
    "reviewRemoteName": "review-origin",
    "autoResolve": false
  },
  "taskTracker": {
    "provider": "none",
    "projectId": "",
    "defaultList": "",
    "mcpServerName": ""
  },
  "monitor": {
    "enabled": true,
    "staleMinutes": 45,
    "notifySlack": false,
    "slackWebhook": ""
  },
  "session": {
    "autoNewTaskOnTaskTypeChange": true,
    "staleSessionMinutes": 60,
    "defaultContinuationMode": "same_task"
  }
}
```

## Commands

### /pm-config show

現在の設定を表示:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - 現在の設定
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【バージョン】
3.0.0

【E2E テスト】
- 有効: ❌
- ブラウザ: chrome
- Headless: ✅
- 追加ブラウザ: なし

【コードレビュー】
- モード: none
- レビューリモート: review-origin
- 自動Resolve: ❌

【タスク管理ツール】
- Provider: none
- Project ID: (未設定)
- デフォルトリスト: (未設定)
- MCP Server: (未設定)

【監視】
- 有効: ✅
- 停止判定: 45分
- Slack通知: ❌
- Webhook: (未設定)

【セッション】
- TaskType変更で新タスク: ✅
- セッション期限: 60分
- デフォルト継続モード: same_task
```

### /pm-config edit

対話的に設定を編集:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - 設定編集
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

編集するセクションを選択してください:

1. E2E テスト設定
2. コードレビュー設定
3. タスク管理ツール設定
4. 監視設定
5. セッション設定
0. キャンセル

>
```

### /pm-config set <key> <value>

直接設定値を変更:

```bash
/pm-config set e2eTest.enabled true
/pm-config set codeReview.mode local_pr
/pm-config set taskTracker.provider clickup
```

### /pm-config validate

設定の整合性をチェック:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - 設定検証
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【検証結果】
✅ バージョン: 有効 (3.0.0)
✅ E2E テスト: 設定OK
⚠️ コードレビュー: mode=review_remote だが review-origin リモートが未設定
✅ タスク管理: 無効 (provider=none)
✅ 監視: 設定OK
✅ セッション: 設定OK

【警告】
- codeReview.mode が review_remote の場合、git remote add review-origin <url> が必要です

【アクション】
警告を解消するには以下を実行してください:
git remote add review-origin git@github.com:user/review-repo.git
```

### /pm-config reset

設定をデフォルトにリセット:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - リセット確認
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ 全ての設定がデフォルト値にリセットされます。

続行しますか？ (y/n)
```

## Processing Flow

```
1. project-config.json の存在確認
   - なければデフォルトで作成
2. コマンドに応じた処理実行
   - show: 設定を読み込み、整形して表示
   - edit: 対話的編集モード
   - set: 指定キーの値を更新
   - validate: 整合性チェック
   - reset: デフォルト値で上書き
3. 変更があれば保存
4. 結果を返却
```

## Validation Rules

### E2E Test

| 項目 | ルール |
|------|--------|
| browser | "chrome" / "firefox" / "webkit" |
| extraBrowsers | browser と重複不可 |
| headless | boolean |

### Code Review

| 項目 | ルール |
|------|--------|
| mode | "none" / "local_pr" / "review_remote" |
| reviewRemoteName | mode=review_remote 時に必須 |

### Task Tracker

| 項目 | ルール |
|------|--------|
| provider | "none" / "clickup" / "asana" |
| projectId | provider≠none 時に必須 |
| defaultList | provider≠none 時に必須 |
| mcpServerName | provider≠none 時に必須 |

### Monitor

| 項目 | ルール |
|------|--------|
| staleMinutes | 1-1440 (24時間以内) |
| notifySlack | boolean |
| slackWebhook | notifySlack=true 時に必須 |

### Session

| 項目 | ルール |
|------|--------|
| staleSessionMinutes | 1-1440 |
| defaultContinuationMode | "same_task" / "new_task" / "ask" |

## Output Format

### Success

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - 設定更新
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【変更内容】
- e2eTest.enabled: false → true
- e2eTest.browser: chrome → firefox

【保存先】
.claude/project-config.json

Status: completed
```

### Error

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - エラー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【エラー】
無効な値: e2eTest.browser = "ie"

【有効な値】
- chrome
- firefox
- webkit

Status: error
```

## Error Handling

### Config File Not Found

設定ファイルが存在しない場合、デフォルト値で新規作成:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - 初期化
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

project-config.json が見つかりません。
デフォルト設定で新規作成しました。

設定を編集するには /pm-config edit を実行してください。

Status: completed
```

### Invalid JSON

JSON パースエラーの場合:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ Project Config Manager - エラー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【エラー】
project-config.json の解析に失敗しました。

【詳細】
JSON Parse Error at line 15: Unexpected token

【対処方法】
1. 手動で JSON を修正
2. または /pm-config reset でリセット

Status: error
```

## Integration Points

- **入力元**: pm-orchestrator, ユーザーコマンド
- **出力先**: 全てのスキル（設定値の提供）

## Examples

### Example 1: E2Eテストを有効化

**入力:**
```
/pm-config set e2eTest.enabled true
```

**出力:**
```
⚙️ Project Config Manager - 設定更新

【変更内容】
- e2eTest.enabled: false → true

【保存先】
.claude/project-config.json

Status: completed
```

### Example 2: コードレビューモードを設定

**入力:**
```
/pm-config set codeReview.mode local_pr
```

**出力:**
```
⚙️ Project Config Manager - 設定更新

【変更内容】
- codeReview.mode: none → local_pr

【保存先】
.claude/project-config.json

【有効化された機能】
- PR作成後、CodeRabbit/Copilot によるレビューを待機
- 指摘対応ループが有効

Status: completed
```

### Example 3: タスク管理ツール連携を設定

**入力:**
```
/pm-config edit
> 3 (タスク管理ツール設定)
> provider: clickup
> projectId: PROJ123
> defaultList: LIST456
> mcpServerName: mcp-clickup
```

**出力:**
```
⚙️ Project Config Manager - 設定更新

【変更内容】
- taskTracker.provider: none → clickup
- taskTracker.projectId: (未設定) → PROJ123
- taskTracker.defaultList: (未設定) → LIST456
- taskTracker.mcpServerName: (未設定) → mcp-clickup

【保存先】
.claude/project-config.json

【次のステップ】
1. mcp-clickup サーバーが起動していることを確認
2. claude mcp list で接続状態を確認

Status: completed
```

## Default Configuration Template

```json
{
  "version": "2.1.0",
  "e2eTest": {
    "enabled": false,
    "browser": "chrome",
    "headless": true,
    "extraBrowsers": []
  },
  "codeReview": {
    "mode": "none",
    "reviewRemoteName": "review-origin",
    "autoResolve": false
  },
  "taskTracker": {
    "provider": "none",
    "projectId": "",
    "defaultList": "",
    "mcpServerName": ""
  },
  "monitor": {
    "enabled": true,
    "staleMinutes": 45,
    "notifySlack": false,
    "slackWebhook": ""
  },
  "session": {
    "autoNewTaskOnTaskTypeChange": true,
    "staleSessionMinutes": 60,
    "defaultContinuationMode": "same_task"
  }
}
```
