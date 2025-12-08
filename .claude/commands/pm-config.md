# /pm-config - プロジェクト設定管理コマンド

PM Orchestrator v3.0.0 のプロジェクト設定を管理するコマンドです。

## Usage

```
/pm-config [subcommand] [options]
```

## Subcommands

### show (default)

現在の設定を表示します。

```
/pm-config show
/pm-config        # show と同じ
```

### edit

対話的に設定を編集します。

```
/pm-config edit
```

### set

特定の設定値を直接変更します。

```
/pm-config set <key> <value>

# Examples:
/pm-config set e2eTest.enabled true
/pm-config set codeReview.mode local_pr
/pm-config set taskTracker.provider clickup
```

### validate

設定の整合性をチェックします。

```
/pm-config validate
```

### reset

設定をデフォルト値にリセットします。

```
/pm-config reset
```

## Configuration Sections

### e2eTest - E2Eテスト設定

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| enabled | boolean | false | E2Eテストを有効化 |
| browser | string | "chrome" | メインブラウザ (chrome/firefox/webkit) |
| headless | boolean | true | ヘッドレスモード |
| extraBrowsers | array | [] | 追加テストブラウザ |

### codeReview - コードレビュー設定

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| mode | string | "none" | レビューモード (none/local_pr/review_remote) |
| reviewRemoteName | string | "review-origin" | レビュー用リモート名 |
| autoResolve | boolean | false | 自動Resolve |

### taskTracker - タスク管理ツール設定

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| provider | string | "none" | プロバイダー (none/clickup/asana) |
| projectId | string | "" | プロジェクトID |
| defaultList | string | "" | デフォルトリストID |
| mcpServerName | string | "" | MCPサーバー名 |

### monitor - 監視設定

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| enabled | boolean | true | 監視を有効化 |
| staleMinutes | number | 45 | 停止判定時間（分） |
| notifySlack | boolean | false | Slack通知 |
| slackWebhook | string | "" | Slack Webhook URL |

### session - セッション設定

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| autoNewTaskOnTaskTypeChange | boolean | true | TaskType変更時に新タスク |
| staleSessionMinutes | number | 60 | セッション期限（分） |
| defaultContinuationMode | string | "same_task" | デフォルト継続モード |

## Examples

### E2Eテストを有効化してFirefoxでテスト

```
/pm-config set e2eTest.enabled true
/pm-config set e2eTest.browser firefox
```

### ローカルPRレビューを有効化

```
/pm-config set codeReview.mode local_pr
```

### ClickUp連携を設定

```
/pm-config set taskTracker.provider clickup
/pm-config set taskTracker.projectId YOUR_PROJECT_ID
/pm-config set taskTracker.defaultList YOUR_LIST_ID
/pm-config set taskTracker.mcpServerName mcp-clickup
```

### Slack通知を有効化

```
/pm-config set monitor.notifySlack true
/pm-config set monitor.slackWebhook https://hooks.slack.com/services/xxx
```

## Notes

- 設定ファイル: `.claude/project-config.json`
- 設定変更は即座に反映されます
- 無効な値を設定しようとするとエラーになります
- `validate` で設定の整合性を確認できます

## Related Skills

- `project-config-manager`: 設定管理の実装
- `session-manager`: セッション設定を使用
- `task-tracker-sync`: タスク管理ツール設定を使用
- `e2e-test-runner`: E2Eテスト設定を使用
- `code-review-manager`: コードレビュー設定を使用

---

**PM Orchestrator v3.0.0**
