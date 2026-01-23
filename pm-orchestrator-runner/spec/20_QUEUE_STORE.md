# 20_QUEUE_STORE.md

# Queue Store 仕様 (v2)

本章は Queue Store の仕様を定義する。

## v2 変更点

- **シングルテーブル設計**: namespace ごとのテーブル分離を廃止
- **固定テーブル名**: `pm-runner-queue`（全 namespace 共有）
- **複合キー**: namespace (PK) + task_id (SK)
- **Runner 管理テーブル追加**: `pm-runner-runners`

## 技術前提

- DynamoDB Local を使用
- JSON / SQLite 使用禁止
- AWS 本番はまだ使わない


## Queue Item スキーマ

| フィールド | 型 | 説明 |
|---|---|---|
| namespace | string | パーティションキー（namespace 識別子） |
| task_id | string | ソートキー（タスクの一意識別子） |
| task_group_id | string | 所属 Task Group の識別子 |
| session_id | string | 所属 Session の識別子 |
| status | string | QUEUED / RUNNING / COMPLETE / ERROR / CANCELLED |
| prompt | string | ユーザー入力 |
| created_at | string | ISO 8601 形式の作成時刻 |
| updated_at | string | ISO 8601 形式の更新時刻 |
| error_message | string | エラーメッセージ（ERROR 状態時） |
| claimed_by | string | Runner ID（RUNNING 状態時） |


## Runner Record スキーマ

| フィールド | 型 | 説明 |
|---|---|---|
| namespace | string | パーティションキー（namespace 識別子） |
| runner_id | string | ソートキー（Runner の一意識別子） |
| last_heartbeat | string | ISO 8601 形式の最終ハートビート時刻 |
| started_at | string | ISO 8601 形式の起動時刻 |
| status | string | running / stopped |
| project_root | string | Runner が監視しているプロジェクトルート |


## Runner の動作

- 定期的に polling
- 1 Task ずつ実行
- 二重実行禁止
- **ハートビート**: 各 poll 時に `last_heartbeat` を更新


## Heartbeat 仕様

- Runner は各 poll 時に `last_heartbeat` を更新
- **タイムアウト**: 2分（120秒）
- 2分以上ハートビートがない Runner は `stopped` と判定
- `isAlive` 判定: `Date.now() - last_heartbeat < 120000ms`


## Polling 間隔

- 既定値: 1000ms (1秒)
- 設定で変更可能


## 状態遷移

```
QUEUED -> RUNNING -> COMPLETE
       |          -> ERROR
       -> CANCELLED

RUNNING -> CANCELLED (強制キャンセル)
```

- QUEUED: キューに入った状態
- RUNNING: 実行中
- COMPLETE: 正常完了
- ERROR: エラーで終了
- CANCELLED: ユーザーによりキャンセル


## 許可される状態遷移

| 現在の状態 | 遷移可能な状態 |
|---|---|
| QUEUED | RUNNING, CANCELLED |
| RUNNING | COMPLETE, ERROR, CANCELLED |
| COMPLETE | (遷移不可) |
| ERROR | (遷移不可) |
| CANCELLED | (遷移不可) |

- COMPLETE, ERROR, CANCELLED は終端状態であり、他の状態への遷移は禁止
- QUEUED からの CANCELLED は即時実行
- RUNNING からの CANCELLED は実行中のタスクを強制終了


## DynamoDB Local 起動

```
docker run -p 8000:8000 amazon/dynamodb-local
```


## テーブル定義

### pm-runner-queue（メインテーブル）

```yaml
TableName: pm-runner-queue
KeySchema:
  - AttributeName: namespace
    KeyType: HASH
  - AttributeName: task_id
    KeyType: RANGE
GlobalSecondaryIndexes:
  - IndexName: status-index
    KeySchema:
      - AttributeName: status
        KeyType: HASH
      - AttributeName: created_at
        KeyType: RANGE
    Projection:
      ProjectionType: ALL
AttributeDefinitions:
  - AttributeName: namespace
    AttributeType: S
  - AttributeName: task_id
    AttributeType: S
  - AttributeName: status
    AttributeType: S
  - AttributeName: created_at
    AttributeType: S
```

### pm-runner-runners（Runner 管理テーブル）

```yaml
TableName: pm-runner-runners
KeySchema:
  - AttributeName: namespace
    KeyType: HASH
  - AttributeName: runner_id
    KeyType: RANGE
AttributeDefinitions:
  - AttributeName: namespace
    AttributeType: S
  - AttributeName: runner_id
    AttributeType: S
```


## v1 からの移行

- **破壊的変更**: 既存データは破棄される
- v1 のテーブル（`pm-runner-queue-{namespace}`）は手動で削除
- v2 では全 namespace が単一テーブル `pm-runner-queue` を共有
- namespace はパーティションキーとしてデータを分離


## Namespace 分離の仕組み

v2 では単一テーブル内で namespace をパーティションキーとして使用：

```
pm-runner-queue テーブル:
┌──────────────┬───────────┬────────┬─────────┐
│ namespace    │ task_id   │ status │ ...     │
├──────────────┼───────────┼────────┼─────────┤
│ project-a    │ task-001  │ QUEUED │ ...     │
│ project-a    │ task-002  │ RUNNING│ ...     │
│ project-b    │ task-001  │ QUEUED │ ...     │
│ stable       │ task-001  │ COMPLETE│ ...    │
└──────────────┴───────────┴────────┴─────────┘
```

- Query で `namespace = X` を指定して namespace 内のデータのみ取得
- 異なる namespace のデータは互いに見えない（論理的分離）


## Cross-References

- 05_DATA_MODELS.md (Task データ構造)
- 19_WEB_UI.md (Web UI からの操作)
- 21_STABLE_DEV.md (Namespace 設計)
