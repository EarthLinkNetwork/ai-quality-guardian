# RUNBOOK

## 1. ローカル起動（REPL）

```bash
node dist/cli/index.js repl
```

| コマンド | 説明 |
|----------|------|
| `/init` | セッション初期化 |
| `/start <prompt>` | タスク実行開始 |
| `/tasks` | タスク一覧表示 |
| `/logs` | セッションのログ一覧 |
| `/logs <task-id>` | 指定タスクの詳細表示 |
| `/exit` | REPL終了 |

## 2. 非対話実行

```bash
node dist/cli/index.js repl --non-interactive --exit-on-eof <<EOF
/init
/start Fix the bug in src/main.ts
EOF
```

**Immediate Summary の読み方:**

| フィールド | 意味 |
|------------|------|
| RESULT | 実行結果（COMPLETE / INCOMPLETE / ERROR） |
| TASK | 実行したタスクID |
| NEXT | 推奨される次のアクション |
| HINT | /logs 等のヒント |

## 3. 検証

```bash
npm test              # ユニットテスト
npm run e2e:smoke     # スモークテスト (10回)
npm run e2e:recovery  # リカバリテスト (10回)
npm pack              # パッケージ作成
```

## 4. recovery-stub（テスト専用）

```bash
PM_EXECUTOR_MODE=recovery-stub PM_RECOVERY_SCENARIO=timeout node dist/cli/index.js repl
PM_EXECUTOR_MODE=recovery-stub PM_RECOVERY_SCENARIO=blocked node dist/cli/index.js repl
PM_EXECUTOR_MODE=recovery-stub PM_RECOVERY_SCENARIO=fail-closed node dist/cli/index.js repl
```

- `NODE_ENV=production` では必ず拒否される（exit 1）
- 有効化時は `WARNING: recovery-stub enabled` と `mode=recovery-stub` が出力される
