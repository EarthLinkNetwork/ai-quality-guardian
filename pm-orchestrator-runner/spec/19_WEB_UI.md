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
