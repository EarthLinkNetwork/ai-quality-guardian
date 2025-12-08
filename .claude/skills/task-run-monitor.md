---
skill: task-run-monitor
version: 1.0.0
category: monitoring
description: 停止したタスクを検知し、タスク管理ツールへの警告コメント追加やSlack通知を行う
metadata:
  id: task-run-monitor
  display_name: Task Run Monitor
  risk_level: low
  color_tag: YELLOW
  task_types:
    - READ_INFO
capabilities:
  - stale_detection
  - alert_notification
  - task_tracker_comment
  - slack_notification
tools:
  - Read
  - Bash
  - Task
priority: low
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: task-tracker-sync
    relationship: calls
---

# Task Run Monitor - タスク監視スキル

## Activation Conditions

以下のいずれかで起動される:
1. task-run-watcher.sh が停止タスクを検知した場合
2. pm-orchestrator 起動時に `.stale-runs.json` が存在する場合
3. ユーザーが明示的に監視状態を確認する場合

## Purpose

長いタスクがトークン制限等で途中停止し、放置されることを防ぐ。
停止が検知されたタスクについて:
- タスク管理ツールに警告コメントを追加
- オプションでSlackに通知

## Processing Flow

```
1. .claude/sessions/.stale-runs.json を読み込み
2. 各停止タスクについて:
   a. task-tracker-sync を呼び出して警告コメントを追加
   b. Slack通知が有効なら通知を送信
3. 処理済みのアラートをクリア
4. 結果を返却
```

## Stale Detection Criteria

| ステータス | 検知対象 | 閾値 |
|-----------|---------|------|
| running | ✅ | staleMinutes (default: 45分) |
| partial | ✅ | staleMinutes |
| blocked | ✅ | staleMinutes |
| done | ❌ | - |
| abandoned | ❌ | - |

## Alert File Format

`.claude/sessions/.stale-runs.json`:

```json
[
  {
    "taskRunId": "2025-12-08-001",
    "title": "ログイン画面のUI修正",
    "status": "running",
    "ageMinutes": 60
  }
]
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 Task Run Monitor - 停止タスク検知
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: YELLOW | Risk: LOW | Category: monitoring

【検知されたタスク】
1. 2025-12-08-001: ログイン画面のUI修正
   - ステータス: running
   - 最終更新: 60分前
   - アクション: タスク管理ツールに警告追加

【通知結果】
- ClickUp: ✅ 警告コメント追加
- Slack: ✅ 通知送信

Status: completed
```

## Task Tracker Warning Comment

タスク管理ツールに追加される警告コメントの例:

```markdown
## ⚠️ タスク停止警告

このタスクは **60分間** 更新がありません。

### 状況
- ステータス: running
- 最終更新: 2025-12-08 11:30

### 考えられる原因
1. トークン制限によるセッション切断
2. エラーによる処理停止
3. ユーザーの離席

### 推奨アクション
- Claude Code セッションを確認
- 必要に応じてタスクを再開
- 問題がある場合はタスクをクローズ

---
*この警告は PM Orchestrator Task Run Monitor により自動生成されました*
```

## Slack Notification Format

```json
{
  "text": "⚠️ タスク停止警告",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "タスク *ログイン画面のUI修正* が60分間更新されていません"
      }
    },
    {
      "type": "section",
      "fields": [
        {"type": "mrkdwn", "text": "*TaskRunId:*\n2025-12-08-001"},
        {"type": "mrkdwn", "text": "*Status:*\nrunning"}
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "タスクを確認"},
          "url": "https://app.clickup.com/t/xxx"
        }
      ]
    }
  ]
}
```

## Configuration

```json
{
  "monitor": {
    "enabled": true,
    "staleMinutes": 45,
    "notifySlack": false,
    "slackWebhook": ""
  }
}
```

## Integration Points

- **入力元**: task-run-watcher.sh, pm-orchestrator
- **出力先**: task-tracker-sync, Slack webhook

## Error Handling

### タスク管理ツール未設定の場合

警告をログに出力のみ（コメント追加はスキップ）

### Slack webhook未設定の場合

Slack通知はスキップ（他の処理は継続）

### アラートファイル不在の場合

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Task Run Monitor - 正常
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

停止タスクは検知されませんでした。
すべてのタスクは正常に動作しています。

Status: completed
```

## Examples

### Example 1: 停止タスク検知

**入力:**
```json
[
  {
    "taskRunId": "2025-12-08-001",
    "title": "ログイン画面のUI修正",
    "status": "running",
    "ageMinutes": 60
  },
  {
    "taskRunId": "2025-12-08-002",
    "title": "E2Eテスト修正",
    "status": "partial",
    "ageMinutes": 90
  }
]
```

**出力:**
```
⚠️ Task Run Monitor - 停止タスク検知

【検知されたタスク】
1. 2025-12-08-001: ログイン画面のUI修正
   - ステータス: running
   - 最終更新: 60分前
   - アクション: 警告コメント追加

2. 2025-12-08-002: E2Eテスト修正
   - ステータス: partial
   - 最終更新: 90分前
   - アクション: 警告コメント追加

【通知結果】
- ClickUp: ✅ 2件の警告コメント追加
- Slack: ⏭️ 無効のためスキップ

Status: completed
```
