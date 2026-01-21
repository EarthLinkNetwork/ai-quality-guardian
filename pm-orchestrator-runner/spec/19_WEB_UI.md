# 19_WEB_UI.md

# Web UI 仕様（Phase 1）

本章は Web UI の仕様を定義する。


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

### Task Group 一覧画面

- 全 Task Group の一覧表示
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


## Cross-References

- 20_QUEUE_STORE.md (Queue Store 仕様)
- 05_DATA_MODELS.md (Task / Session データ構造)
