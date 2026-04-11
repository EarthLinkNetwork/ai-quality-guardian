# 20_QUEUE_STORE.md

# Queue Store 仕様 (v2)

本章は Queue Store の仕様を定義する。

## v2 変更点

- **シングルテーブル設計**: namespace ごとのテーブル分離を廃止
- **固定テーブル名**: `pm-runner-queue`（全 namespace 共有）
- **複合キー**: namespace (PK) + task_id (SK)
- **Runner 管理テーブル追加**: `pm-runner-runners`

## v2.3 変更点 (2026-04-12)

- **新ステータス**: `WAITING_CHILDREN` — 親タスクがサブタスク完了を待機している状態
- **親子 lifecycle**: 親タスクは子がすべて完了するまで `WAITING_CHILDREN` を保持、その後 `COMPLETE` / `ERROR` / `AWAITING_RESPONSE` に遷移
- **Pipeline fields**: `add_test`, `add_review`, `project_alias` を QueueItem に追加
- **Checkpoint ref field**: `checkpoint_ref` を QueueItem に追加 (ルートタスクのみ所有、再起動後も rollback 可能)
- **Stale task threshold**: デフォルト値を 30 分 → **10 分** に変更、設定可能に
- **Rollback cascade**: 親または子のどちらから rollback を指示しても、ルートの checkpoint からツリー全体を巻き戻す
- 詳細: [spec/36_LIVE_TASKS_AND_RECOVERY.md](./36_LIVE_TASKS_AND_RECOVERY.md)

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
| status | string | QUEUED / RUNNING / AWAITING_RESPONSE / **WAITING_CHILDREN** (v2.3) / COMPLETE / ERROR / CANCELLED |
| prompt | string | ユーザー入力 |
| created_at | string | ISO 8601 形式の作成時刻 |
| updated_at | string | ISO 8601 形式の更新時刻 |
| error_message | string | エラーメッセージ（ERROR 状態時） |
| claimed_by | string | Runner ID（RUNNING 状態時） |
| parent_task_id | string? | 親タスクID（サブタスクの場合のみ） |
| add_test | boolean? | v2.3: Test パイプラインを追加するフラグ |
| add_review | boolean? | v2.3: Review パイプラインを追加するフラグ |
| project_alias | string? | v2.3: プロジェクト alias (表示用) |
| project_path | string? | プロジェクトの作業ディレクトリパス |
| checkpoint_ref | string? | v2.3: ルートタスクが所有する checkpoint シリアライズ (rollback 用) |
| output | string? | タスク実行結果（集約済みサマリを含む） |


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


## 状態遷移 (v2.3)

```
QUEUED → RUNNING → COMPLETE
                ↓
                ↘ ERROR
                ↓
                ↘ AWAITING_RESPONSE (待機 — ユーザー返信で再度 QUEUED/RUNNING)
                ↓
                ↘ WAITING_CHILDREN (親が子を待機中)
                   ↓
                   ↘ COMPLETE  (全子が COMPLETE)
                   ↘ ERROR     (いずれかの子が ERROR)
                   ↘ AWAITING_RESPONSE (いずれかの子が AWAITING)
                   ↘ CANCELLED
```

- **QUEUED**: キューに入った状態
- **RUNNING**: 実行中
- **WAITING_CHILDREN** (v2.3 新規): 親タスクが subtask を enqueue した後、全子が完了するまで待機する状態
- **AWAITING_RESPONSE**: ユーザー返信待ち（子が AWAITING_RESPONSE なら親にも伝播）
- **COMPLETE**: 正常完了
- **ERROR**: エラーで終了
- **CANCELLED**: ユーザーによりキャンセル (rollback 時は子孫もまとめて CANCELLED)

## 許可される状態遷移 (v2.3)

| 現在の状態 | 遷移可能な状態 |
|---|---|
| QUEUED | RUNNING, CANCELLED |
| RUNNING | COMPLETE, ERROR, CANCELLED, AWAITING_RESPONSE, **WAITING_CHILDREN** |
| WAITING_CHILDREN | COMPLETE, ERROR, AWAITING_RESPONSE, CANCELLED |
| AWAITING_RESPONSE | QUEUED, RUNNING, CANCELLED, ERROR, COMPLETE |
| ERROR | AWAITING_RESPONSE, QUEUED, COMPLETE |
| CANCELLED | AWAITING_RESPONSE, QUEUED |
| COMPLETE | (終端) |

- COMPLETE は唯一の終端状態
- ERROR / CANCELLED は recovery 可能（Retry ボタンで QUEUED に戻せる）
- QUEUED からの CANCELLED は即時実行
- RUNNING からの CANCELLED は実行中のタスクを強制終了 + checkpoint rollback 対象


## Stale Task Recovery (v2.3)

**目的**: Runner クラッシュや OS 再起動で `RUNNING` / `WAITING_CHILDREN` のまま放置されたタスクを検知し、自動 ERROR 遷移または Recovery ページでの手動 continue/rollback を可能にする。

### 閾値 (Stale Threshold)

- **デフォルト**: `10分 (600,000ms)`
- **設定可能**: 次の優先順で読み込む
  1. CLI flag `--stale-threshold-ms`
  2. 環境変数 `PM_RUNNER_STALE_THRESHOLD_MS`
  3. `~/.pm-orchestrator-runner/config.json` の `recovery.staleThresholdMs`
  4. Default `600000`
- 従来のハードコード 30 分 (`30 * 60 * 1000`) は **廃止**

### 検知タイミング

1. **起動時**: `QueuePoller.start()` が `recoverStaleTasks()` を 1 回実行
2. **定期**: 5 分間隔で `recoverStaleTasks()` を呼ぶ
3. **Recovery ページ訪問時**: `GET /api/recovery/stale` で現時点の stale タスクを列挙

### 検知ロジック

```
for task in getByStatus('RUNNING') ∪ getByStatus('WAITING_CHILDREN'):
  if Date.now() - Date.parse(task.updated_at) > staleThresholdMs:
    → mark as stale
    → (autoCancelStale=true の場合) updateStatus → ERROR
    → emit 'stale-recovered' event
```

### `/api/health` との連携

起動時に検知された stale 件数を `/api/health` レスポンスに含める:

```json
{
  "ok": true,
  "stale_threshold_ms": 600000,
  "stale_recovered_on_startup": 3,
  "namespace": "..."
}
```

Dashboard 訪問時にこの数値を見てバナー通知 ("N 件の stale タスクを検出") を表示する。


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
