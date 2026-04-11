# 36_LIVE_TASKS_AND_RECOVERY.md

# Live Tasks & Recovery 仕様

**Status**: Draft v1.0
**Created**: 2026-04-12
**Supersedes**: `spec/34_TASK_TRACKER_PERSISTENCE.md` (deleted — task-tracker was never integrated)

---

## 1. 目的

PM Orchestrator Runner の実運用で以下の 3 つのニーズに応える:

1. **今動いているタスクが見たい** — プロジェクト横断で `RUNNING` / `WAITING_CHILDREN` / `AWAITING_RESPONSE` / `QUEUED` なタスクを一覧表示する Live Tasks ページ
2. **クラッシュ・中断からの復旧** — Claude Code CLI のクラッシュ / PC 再起動 / `ctrl+c` 強制終了などで RUNNING のまま止まったタスクを検知し、`continue` / `retry` / `cancel` / `rollback` できる Recovery ページ
3. **All-or-nothing Rollback** — 親タスクまたはその子孫のいずれか 1 つを rollback 指示すると、checkpoint を持つルートを起点にツリー全体をまとめて巻き戻す

---

## 2. 前提: 既存の関連機構

### 2.1 Stale Task Recovery（spec/20_QUEUE_STORE.md, 実装済み）

- `QueueStore.recoverStaleTasks(maxAgeMs)` — `RUNNING` ステータスで `updated_at` が閾値より古いタスクを ERROR に遷移する
- `QueuePoller` が起動時 1 回 + 定期実行 (5 分間隔) する
- **v2.3 変更**: 閾値は `recoveryConfig.staleThresholdMs` で設定可能に。デフォルトは **10 分** (600,000 ms)。従来のハードコード 30 分は廃止

### 2.2 Git Checkpoint / Rollback（`src/checkpoint/task-checkpoint.ts`, 実装済み）

- **Git プロジェクト**: `git stash push -u` で pre-task 状態を保存、`git checkout -- .` + `git clean -fd` + `git stash pop` で復元
- **非 Git プロジェクト**: `os.tmpdir()` へのファイルスナップショット
- checkpoint オブジェクトは `{ type, taskId, projectPath, stashRef?, createdAt, files? }`
- **v2.3 変更**: checkpoint はルートタスクのみが作成し、QueueItem に `checkpoint_ref` として永続化される（従来はメモリのみで再起動後に失われていた）

### 2.3 親子タスクの WAITING_CHILDREN ステータス（spec/20_QUEUE_STORE.md 更新）

- `RUNNING → WAITING_CHILDREN → {COMPLETE, ERROR, AWAITING_RESPONSE, CANCELLED}` の遷移が許可されている
- 親は子がすべて終わるまで `WAITING_CHILDREN` 状態を保つ
- `aggregateParentConversation()` が集約を行い、子の終了時に親のステータスを更新

---

## 3. Live Tasks 仕様

### 3.1 ページ概要

- **URL ハッシュ**: `#/activity` または `#/live-tasks`（エイリアス）
- **メニュー位置**: サイドバー Main セクション
- **レンダラー関数**: `renderLiveTasks`
- **構成**:
  - 上段: Live Tasks テーブル (in-flight tasks)
  - 下段: Event History (折りたたみ、既存 `/api/activity` 再利用)

### 3.2 API エンドポイント

#### `GET /api/live-tasks`

**Query parameters**:
- `namespace` (optional) — デフォルトはサーバーの namespace
- `limit` (default: 100) — 最大タスク数
- `includeQueued` (boolean, default: false) — QUEUED も含めるか

**Response schema**:
```typescript
{
  tasks: Array<{
    task_id: string;
    task_group_id: string;
    project_id?: string;
    project_path?: string;
    project_alias?: string;
    status: 'RUNNING' | 'WAITING_CHILDREN' | 'AWAITING_RESPONSE' | 'QUEUED';
    parent_task_id?: string;
    created_at: string;     // ISO 8601
    started_at?: string;    // 最初に RUNNING に入った時刻 (null の可能性あり)
    updated_at: string;
    elapsed_ms: number;     // created_at からの経過
    age_ms: number;         // updated_at からの経過（stale 判定に使用）
    is_stale: boolean;      // age_ms > stale_threshold_ms
  }>;
  stale_count: number;
  stale_threshold_ms: number;
  timestamp: string;
}
```

**実装方針**:
- `queueStore.getByStatus('RUNNING') + getByStatus('WAITING_CHILDREN') + getByStatus('AWAITING_RESPONSE')` を join
- `includeQueued=true` なら `getByStatus('QUEUED')` も追加
- project_alias / project_path は DAL から lookup (キャッシュ)
- `updated_at` 降順でソート

### 3.3 UI 要件

- Live Tasks テーブル列: Status / Task ID / Project / Task Group / Started / Elapsed / Age / Actions
- Stale 行は赤背景 + "STALE" バッジで強調
- Action ボタン:
  - **View**: タスク詳細ページへ遷移
  - **Cancel**: `PATCH /api/tasks/:id/status` で `CANCELLED` へ
- 自動リフレッシュ: 5 秒間隔（チェックボックスで有効化、ページ離脱時は停止）
- Event History は折りたたみ（デフォルト閉じた状態）。開いたら `/api/activity` を取得して表示

---

## 4. Recovery 仕様

### 4.1 ページ概要

- **URL ハッシュ**: `#/recovery`
- **メニュー位置**: サイドバー Management セクション（旧 Task Tracker の位置）
- **レンダラー関数**: `renderRecoveryPage`
- **構成**:
  - 上段: Stale タスク一覧（今まさに stale 判定されているもの）
  - 中段: Recent Failed タスク一覧（過去 24 時間の ERROR タスク）
  - 下段: Rollback History（過去に実行された rollback 操作）

### 4.2 API エンドポイント

#### `GET /api/recovery/stale`

```typescript
Response: {
  stale_threshold_ms: number;
  tasks: Array<{
    task_id: string;
    task_group_id: string;
    project_path?: string;
    project_alias?: string;
    status: 'RUNNING' | 'WAITING_CHILDREN';
    age_ms: number;
    parent_task_id?: string;
    is_root: boolean;  // true if parent_task_id is undefined
    has_checkpoint: boolean;  // true if root ancestor has checkpoint_ref
  }>;
}
```

#### `GET /api/recovery/failed`

```typescript
Query: ?since_hours=24&limit=50
Response: {
  tasks: Array<{
    task_id: string;
    task_group_id: string;
    project_path?: string;
    project_alias?: string;
    error_message?: string;
    updated_at: string;
    parent_task_id?: string;
    has_checkpoint: boolean;
  }>;
}
```

#### `POST /api/tasks/:id/rollback`

```typescript
Request body: { confirm: boolean }  // must be true
Response: {
  success: boolean;
  rolled_back_task_id: string;        // root task id (may differ from :id)
  cancelled_descendants: string[];    // list of task_ids that were set to CANCELLED
  checkpoint_type: 'git-stash' | 'file-snapshot' | 'none';
  rollback_details?: string;
  error?: string;
}
```

**Semantics** (CRITICAL):
1. Find the root ancestor by walking `parent_task_id` links
2. Load root's `checkpoint_ref` (git stash ref or snapshot dir path)
3. If missing → return 409 `{ success: false, error: 'NO_CHECKPOINT' }`
4. Execute `rollback(checkpoint)` via `src/checkpoint/task-checkpoint.ts`
5. Walk the tree from root, set root + all descendants to `CANCELLED`
6. Append a `RollbackHistoryEntry` to rollback history
7. Emit `recovery.rollback` event so Live Tasks UI refreshes

#### `POST /api/tasks/:id/retry`

```typescript
Request body: {}
Response: { success: boolean, new_status: 'QUEUED' }
```

Only allowed when current status is `ERROR` or `CANCELLED`. Transitions to `QUEUED`. **Does NOT re-create a checkpoint** — the retry reuses the old checkpoint if still valid, or creates a new one at execution time if checkpoint is missing.

#### `GET /api/recovery/rollback-history`

```typescript
Query: ?limit=20
Response: {
  entries: Array<{
    rollback_id: string;
    rolled_back_task_id: string;
    project_path: string;
    checkpoint_type: string;
    success: boolean;
    cancelled_count: number;
    triggered_at: string;
    triggered_by?: string;  // user id if auth
  }>;
}
```

### 4.3 起動時バナー通知

- サーバー起動時に `recoverStaleTasks()` が何件か検出した場合、次回 Dashboard 訪問時に以下のバナーを表示:

```
⚠ 前回の停止/クラッシュで N 件のタスクが stale のまま残っていました。
[Recovery ページで確認する]
```

- バナーの dismiss は localStorage に記録（24 時間後に再度表示）
- 実装: `/api/health` のレスポンスに `stale_recovered_on_startup: number` を含める

---

## 5. Checkpoint の親子関係ルール (CRITICAL)

### 5.1 Invariant

**ルートタスクのみが checkpoint を所有する**。これにより rollback の一貫性が保証される。

```
Root task A (checkpoint_ref = stash@{0})
├─ Subtask A-sub-1 (checkpoint_ref = undefined)
│   ├─ Sub-subtask A-sub-1-sub-1 (checkpoint_ref = undefined)
│   └─ Sub-subtask A-sub-1-sub-2 (checkpoint_ref = undefined)
└─ Subtask A-sub-2 (checkpoint_ref = undefined)
```

### 5.2 Checkpoint 作成ロジック

`cli/index.ts` 内のタスク実行前:

```typescript
if (!item.parent_task_id) {
  // Root task: create checkpoint
  const checkpointResult = await createCheckpoint(effectiveWorkingDir, item.task_id);
  if (checkpointResult.success) {
    await queueStore.setCheckpointRef(item.task_id, serializeCheckpoint(checkpointResult.checkpoint));
  }
} else {
  // Subtask: inherit from root
  // (no checkpoint creation — root already holds it)
}
```

### 5.3 Rollback 実行ロジック

```typescript
async function rollbackTask(taskId: string): Promise<RollbackResult> {
  // 1. Walk up to root
  let current = await queueStore.getItem(taskId);
  while (current && current.parent_task_id) {
    current = await queueStore.getItem(current.parent_task_id);
  }
  if (!current) throw new Error('Task not found');
  const root = current;

  // 2. Load checkpoint
  if (!root.checkpoint_ref) {
    return { success: false, error: 'NO_CHECKPOINT' };
  }
  const checkpoint = deserializeCheckpoint(root.checkpoint_ref);

  // 3. Execute git/file rollback
  const rbResult = await rollback(checkpoint);
  if (!rbResult.success) return { success: false, error: rbResult.error };

  // 4. Cancel the entire tree (root + descendants)
  const tree = await collectDescendants(root.task_id);
  const cancelled: string[] = [];
  for (const t of tree) {
    if (t.status !== 'CANCELLED' && t.status !== 'COMPLETE') {
      await queueStore.updateStatus(t.task_id, 'CANCELLED', 'Rolled back as part of tree');
      cancelled.push(t.task_id);
    }
  }

  // 5. Clear checkpoint_ref (it's no longer valid — stash was popped)
  await queueStore.setCheckpointRef(root.task_id, undefined);

  // 6. Record history
  await queueStore.appendRollbackHistory({ ... });

  return { success: true, rolled_back_task_id: root.task_id, cancelled_descendants: cancelled, checkpoint_type: checkpoint.type };
}

async function collectDescendants(rootId: string): Promise<QueueItem[]> {
  // BFS through parent_task_id links
  const all = await queueStore.getByTaskGroup(rootTask.task_group_id);
  const result: QueueItem[] = [];
  const queue: string[] = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const found = all.find(t => t.task_id === id);
    if (found) result.push(found);
    const children = all.filter(t => t.parent_task_id === id);
    for (const c of children) queue.push(c.task_id);
  }
  return result;
}
```

### 5.4 Unit Tests Required

- `parent_task_id === undefined` のタスクが createCheckpoint を呼ぶ
- `parent_task_id !== undefined` のタスクは createCheckpoint を呼ばない
- `rollbackTask(childId)` が root を見つけて rollback する
- `rollbackTask(rootId)` が全 descendants を CANCELLED にする
- checkpoint_ref が無い場合 409 NO_CHECKPOINT を返す
- rollback 成功後、root の checkpoint_ref がクリアされる

---

## 6. QueueItem スキーマ拡張

```typescript
interface QueueItem {
  // ... existing fields ...

  /** Serialized checkpoint (git stash ref or snapshot dir). Set on root tasks only. */
  checkpoint_ref?: string;

  /** Rollback history reference — set after rollback is performed */
  rolled_back_at?: string;
}

/**
 * Recovery config (read from project config)
 */
interface RecoveryConfig {
  /** Default: 10 * 60 * 1000 = 10 minutes */
  staleThresholdMs: number;
  /** Default: 5 * 60 * 1000 = 5 minutes */
  recoveryCheckIntervalMs: number;
  /** Default: true — automatically transition stale RUNNING → ERROR on detection */
  autoCancelStale: boolean;
}

interface RollbackHistoryEntry {
  rollback_id: string;
  rolled_back_task_id: string;
  project_path: string;
  checkpoint_type: 'git-stash' | 'file-snapshot' | 'none';
  success: boolean;
  cancelled_count: number;
  triggered_at: string;
  triggered_by?: string;
  error?: string;
}
```

---

## 7. Configurable Stale Threshold

### 7.1 Config location

`~/.pm-orchestrator-runner/config.json` に `recovery` セクションを追加:

```json
{
  "recovery": {
    "staleThresholdMs": 600000,
    "recoveryCheckIntervalMs": 300000,
    "autoCancelStale": true
  }
}
```

### 7.2 Precedence

1. Command-line flag: `--stale-threshold-ms 900000`
2. Environment variable: `PM_RUNNER_STALE_THRESHOLD_MS=900000`
3. Config file `recovery.staleThresholdMs`
4. Default: `600000` (10 minutes)

### 7.3 `/api/health` response include

```typescript
{
  ok: true,
  stale_threshold_ms: 600000,
  stale_recovered_on_startup: 3,  // number recovered at this server's startup
  // ... existing fields
}
```

---

## 8. Migration from Task Tracker (削除対象)

以下を削除する:

- `src/task-tracker/` ディレクトリ全体
- `src/web/routes/task-tracker.ts`
- `src/web/dal/task-tracker-types.ts`
- `src/web/public/index.html` 内の `renderTaskTrackerPage()`
- サイドバーの `Task Tracker` メニュー項目
- `spec/34_TASK_TRACKER_PERSISTENCE.md` (本ドキュメントで置き換え)

既存 DynamoDB テーブルに Task Tracker データが残っていても **無害**（新コードは読まないだけ）。必要であれば手動クリーンアップスクリプト `scripts/cleanup-task-tracker.sh` を提供する。

---

## 9. Test Plan

### 9.1 単体テスト (`test/unit/`)

- `test/unit/checkpoint/parent-owned.test.ts`
  - ルートタスクが createCheckpoint を呼ぶ
  - サブタスクは createCheckpoint を呼ばない
  - checkpoint_ref が QueueItem に永続化される

- `test/unit/queue/stale-threshold.test.ts`
  - Default threshold が 10 分 (600,000 ms)
  - Config ファイルからの上書き
  - 環境変数からの上書き
  - CLI flag からの上書き

- `test/unit/recovery/rollback-tree.test.ts`
  - `collectDescendants(rootId)` が全子孫を返す
  - `rollbackTask(childId)` が root から rollback
  - rollback 後に全 descendants が CANCELLED
  - checkpoint_ref が存在しない場合 NO_CHECKPOINT エラー

### 9.2 Playwright テスト (`test/playwright/`)

- `test/playwright/live-tasks.spec.ts`
  - RUNNING / WAITING_CHILDREN / AWAITING_RESPONSE のタスクがすべて表示される
  - stale タスクが "STALE" バッジ + 赤背景で表示される
  - Event History が折りたたみ可能
  - 自動リフレッシュがオン/オフできる
  - Cancel ボタンが CANCELLED への遷移を引き起こす

- `test/playwright/recovery-page.spec.ts`
  - stale タスクが Stale セクションに表示される
  - ERROR タスクが Recent Failed セクションに表示される
  - Retry ボタンで QUEUED に戻る
  - Rollback ボタン (確認ダイアログあり) で checkpoint から復元
  - サブタスクの Rollback を押しても root から巻き戻り、全 descendants が CANCELLED になる
  - Rollback History エントリが追加される

- `test/playwright/checkpoint-parent-ownership.spec.ts`
  - root task 実行時に checkpoint_ref が設定される
  - subtask 実行時に checkpoint_ref が設定されない（親のが使われる）
  - rollback API 呼び出しで subtask を指定しても root の checkpoint が使われる

### 9.3 specs/*.spec.md の追加 / 更新

- `specs/recovery-rollback.spec.md`（新規）— Rollback 機能の仕様書 + テストケース
- `specs/live-tasks.spec.md`（新規）— Live Tasks ページの仕様書 + テストケース
- `specs/task-lifecycle.md`（更新）— WAITING_CHILDREN 状態と rollback cascade 言及

---

## 10. Implementation Phases

### Phase 1: Spec Update ← 本ドキュメント (既に進行中)

- `spec/19_WEB_UI.md` 更新 (メニュー構成)
- `spec/20_QUEUE_STORE.md` 更新 (WAITING_CHILDREN, checkpoint_ref field, stale threshold)
- `spec/34_TASK_TRACKER_PERSISTENCE.md` 削除
- `spec/36_LIVE_TASKS_AND_RECOVERY.md` (本ドキュメント) 作成
- `specs/recovery-rollback.spec.md` 作成
- `specs/live-tasks.spec.md` 作成

### Phase 2: Task Tracker 削除

- `src/task-tracker/` 削除
- `src/web/routes/task-tracker.ts` 削除
- `src/web/public/index.html` から renderTaskTrackerPage と関連コード削除
- `src/web/dal/task-tracker-types.ts` 削除
- サイドバー "Task Tracker" メニュー項目削除
- import の参照をすべて削除

### Phase 3: Checkpoint 親子所有化

- `QueueItem` に `checkpoint_ref?: string` フィールド追加
- `QueueStore.setCheckpointRef(taskId, ref)` メソッド追加
- `cli/index.ts` の checkpoint 作成ロジックを `if (!item.parent_task_id)` で gate
- checkpoint 成功時に `setCheckpointRef` を呼ぶ

### Phase 4: Live Tasks 実装

- `GET /api/live-tasks` エンドポイント実装
- `renderLiveTasks` 関数実装
- サイドバーを "Activity" → "Live Tasks" に rename
- Event History を折りたたみで下部に配置

### Phase 5: Recovery 実装

- `GET /api/recovery/stale`, `GET /api/recovery/failed` エンドポイント実装
- `POST /api/tasks/:id/rollback` with parent-walk logic
- `POST /api/tasks/:id/retry` エンドポイント実装
- `renderRecoveryPage` 関数実装
- サイドバー "Recovery" メニュー追加 (`#/recovery`)

### Phase 6: Configurable Stale Threshold

- Config file 読み込みで `recovery.staleThresholdMs` を取得
- CLI flag `--stale-threshold-ms` 追加
- 環境変数 `PM_RUNNER_STALE_THRESHOLD_MS` 対応
- デフォルトを 30 分 → **10 分** に変更
- `/api/health` レスポンスに `stale_threshold_ms`, `stale_recovered_on_startup` 追加
- Dashboard 上部に起動時 stale 検知バナー

### Phase 7: Test Coverage

- 単体テスト (Phase 3-6 に必須)
- Playwright E2E テスト (上記 3 ファイル)
- 既存テスト (`left-menu-navigation.spec.ts` 等) の更新

### Phase 8: Documentation + Cleanup

- README 更新（必要なら）
- CHANGELOG 更新
- 旧 Task Tracker 関連の残存 import 確認
- commit + push

---

## 11. Breaking Changes

以下の API は **削除** される。クライアントは依存していてはならない:

- `GET /api/tracker/:projectId`
- `PUT /api/tracker/:projectId`
- `DELETE /api/tracker/:projectId`
- `GET /api/tracker/:projectId/snapshots`
- `POST /api/tracker/:projectId/snapshots`
- `GET /api/tracker/:projectId/summaries`
- `GET /api/tracker/:projectId/recovery`
- `POST /api/tracker/:projectId/recover`

これらを呼ぶテスト・CLI・外部ツールが無いことを Phase 2 開始前に確認する。

---

## 12. Future Work

- Rollback 履歴の永続化（現在はインメモリ / ファイル）
- Rollback の部分適用（ファイル単位の selective rollback）
- Checkpoint の manual 作成 API（タスク関係なく、project 全体をスナップショット）
- Recovery ページでの LLM-assisted diagnostics（何が原因で stale になったか）
