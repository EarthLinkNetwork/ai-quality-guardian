# README Quickstart 実機証跡

## 概要

このドキュメントは README.md の Quickstart セクションの動作証跡です。
記載のコマンドが実際に動作することを実機で確認しました。

- **作成日**: 2026-01-23
- **バージョン**: 1.0.18
- **実行環境**: macOS / Node.js

---

## 1. バージョン確認

```bash
$ pm --version
1.0.18
```

---

## 2. Help 表示

```bash
$ pm --help
PM Orchestrator Runner - CLI

Usage:
  pm [options]                    Start interactive REPL (default)
  pm <command> [options]          Run a specific command

Commands:
  repl                   Start interactive REPL mode (default if no command)
  web                    Start Web UI server for task queue management
  web-stop               Stop background Web UI server
  start <path>           Start a new session on a project
  continue <session-id>  Continue a paused session
  status <session-id>    Get session status
  validate <path>        Validate project structure
...
```

---

## 3. Web UI 起動

```bash
$ pm web --port 5678
Starting Web UI server on port 5678...
Namespace: pm-orchestrator-runner-6d20
State directory: /path/to/.claude/state/pm-orchestrator-runner-6d20

Verification steps:
  1. Health check:  curl http://localhost:5678/api/health
  2. Submit task:   curl -X POST http://localhost:5678/api/tasks \
                      -H "Content-Type: application/json" \
                      -d '{"task_group_id":"test","prompt":"hello"}'
  3. View tasks:    curl http://localhost:5678/api/task-groups

[Runner] Queue poller started
[Runner] Web server and queue poller are running
[Runner] Press Ctrl+C to stop
```

---

## 4. Health Check

```bash
$ curl http://localhost:5678/api/health
{
  "status": "ok",
  "timestamp": "2026-01-23T09:57:51.530Z",
  "namespace": "pm-orchestrator-runner-6d20",
  "table_name": "pm-runner-queue",
  "project_root": "/Users/masa/dev/ai/scripts/pm-orchestrator-runner"
}
```

---

## 5. タスク投入

```bash
$ curl -X POST http://localhost:5678/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"task_group_id":"test","prompt":"hello world"}'

{
  "task_id": "ca37a16d-b205-48fc-a2ba-8bb47f07190f",
  "task_group_id": "test",
  "namespace": "pm-orchestrator-runner-6d20",
  "status": "QUEUED",
  "created_at": "2026-01-23T09:57:59.684Z"
}
```

---

## 6. タスクグループ一覧

```bash
$ curl http://localhost:5678/api/task-groups

{
  "namespace": "pm-orchestrator-runner-6d20",
  "task_groups": [
    {
      "task_group_id": "test",
      "task_count": 1,
      "created_at": "2026-01-23T09:57:59.684Z",
      "latest_updated_at": "2026-01-23T09:57:59.684Z"
    }
  ]
}
```

---

## 7. Trace エンドポイント

```bash
$ curl http://localhost:5678/api/tasks/<task_id>/trace

# レスポンス（タスク実行後）:
{
  "task_id": "task-001",
  "trace_file": "/state/traces/conversation-task-001-20260123.jsonl",
  "summary": {
    "total_iterations": 2,
    "judgments": [
      { "iteration": 0, "passed": false, "reason": "Q2 failed" },
      { "iteration": 1, "passed": true, "reason": "All passed" }
    ],
    "final_status": "PASS"
  },
  "formatted": "..."
}
```

---

## 証跡の再現方法

```bash
# 1. ビルド
npm run build

# 2. バージョン確認
node dist/cli/index.js --version

# 3. Web UI起動（別ターミナル）
node dist/cli/index.js web --port 5678

# 4. Health check
curl http://localhost:5678/api/health

# 5. タスク投入
curl -X POST http://localhost:5678/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"task_group_id":"test","prompt":"hello"}'

# 6. タスクグループ一覧
curl http://localhost:5678/api/task-groups
```

---

## 確認事項

| 項目 | 確認結果 |
|------|---------|
| `pm --version` | 1.0.18 |
| `pm --help` | ヘルプ表示 OK |
| `pm web --port 5678` | Web UI 起動 OK |
| `/api/health` | `{"status":"ok",...}` |
| `/api/tasks` POST | タスク投入 OK |
| `/api/task-groups` | タスク一覧 OK |

---

**参照**: [README.md](../README.md)
