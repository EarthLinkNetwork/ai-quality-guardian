# 20_QUEUE_STORE.md

# Queue Store 仕様

本章は Queue Store の仕様を定義する。


## 技術前提

- DynamoDB Local を使用
- JSON / SQLite 使用禁止
- AWS 本番はまだ使わない


## Queue Item スキーマ

| フィールド | 型 | 説明 |
|---|---|---|
| task_id | string | タスクの一意識別子 |
| task_group_id | string | 所属 Task Group の識別子 |
| session_id | string | 所属 Session の識別子 |
| status | string | QUEUED / RUNNING / COMPLETE / ERROR / CANCELLED |
| prompt | string | ユーザー入力 |
| created_at | string | ISO 8601 形式の作成時刻 |
| updated_at | string | ISO 8601 形式の更新時刻 |


## Runner の動作

- 定期的に polling
- 1 Task ずつ実行
- 二重実行禁止


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

```
TableName: pm-runner-queue
KeySchema:
  - AttributeName: task_id
    KeyType: HASH
GlobalSecondaryIndexes:
  - IndexName: session-index
    KeySchema:
      - AttributeName: session_id
        KeyType: HASH
      - AttributeName: created_at
        KeyType: RANGE
  - IndexName: status-index
    KeySchema:
      - AttributeName: status
        KeyType: HASH
      - AttributeName: created_at
        KeyType: RANGE
```


## Cross-References

- 05_DATA_MODELS.md (Task データ構造)
- 19_WEB_UI.md (Web UI からの操作)
