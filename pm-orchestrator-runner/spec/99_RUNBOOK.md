# RUNBOOK

## 1. ローカル起動（REPL）

**起動方法**

```bash
node dist/cli/index.js repl
```

**利用可能コマンド**

| コマンド | 説明 |
|----------|------|
| `/init` | セッション初期化 |
| `/tasks` | タスク一覧表示 |
| `/logs` | セッションのログ一覧 |
| `/logs <task-id>` | 指定タスクの詳細表示 |
| `/exit` | REPL終了 |

**タスク実行**

自然言語入力で自動的にタスクが開始されます（/start不要）。

```
> READMEファイルを作成してください
[Auto-starting session...]

--- Task Started ---
Task ID: task-1737104556789
Provider: Claude Code CLI (uses your Claude subscription, no API key required)
Prompt: READMEファイルを作成してください
--------------------

... 実行中 ...

--- Execution Result ---
Status: COMPLETE
Executor: claude-code
Duration: 12.3s
Tasks: 1/1 completed

Files Modified:
  - README.md

Response Summary:
  README.mdを作成しました...
------------------------
```

## 2. 非対話実行

**実行例**

```bash
node dist/cli/index.js repl --non-interactive --exit-on-eof <<EOF
/init
Fix the bug in src/main.ts
EOF
```

**Immediate Summary の読み方**

| フィールド | 意味 |
|------------|------|
| RESULT | 実行結果（COMPLETE / INCOMPLETE / ERROR） |
| TASK | 実行したタスクID |
| NEXT | 推奨される次のアクション |
| HINT | /logs 等のヒント |

**Execution Result の読み方**

| フィールド | 意味 |
|------------|------|
| Status | 実行状態（COMPLETE / INCOMPLETE / ERROR） |
| Executor | 使用したExecutor（claude-code / deterministic / recovery-stub） |
| Duration | 実行時間 |
| Files Modified | 変更されたファイル一覧 |
| Response Summary | LLM応答の要約（先頭200文字） |

## 3. 検証

```bash
npm test
npm run e2e:smoke
npm run e2e:recovery
npm pack
```

## 4. recovery-stub（テスト専用）

**実行例**

```bash
PM_EXECUTOR_MODE=recovery-stub PM_RECOVERY_SCENARIO=timeout node dist/cli/index.js repl
PM_EXECUTOR_MODE=recovery-stub PM_RECOVERY_SCENARIO=blocked node dist/cli/index.js repl
PM_EXECUTOR_MODE=recovery-stub PM_RECOVERY_SCENARIO=fail-closed node dist/cli/index.js repl
```

**注意事項**

- `NODE_ENV=production` では必ず拒否される（exit 1）
- 有効化時は `WARNING: recovery-stub enabled` と `mode=recovery-stub` が出力される
