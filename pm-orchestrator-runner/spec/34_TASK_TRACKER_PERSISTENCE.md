# 34. Task Tracker Persistence (Single-Table DynamoDB Design)

## 1. 概要

### 1.1 目的

プロジェクト単位のタスク管理を DynamoDB に永続化する。
Claude Code のコンテキスト消失（セッション切れ、メモリ溢れ）時に、
タスクの進捗・計画・サマリを自動復元可能にする。

### 1.2 背景

- B-017: プロジェクト単位のタスク管理永続化
- B-012: Single-Table DynamoDB Design
- 決定: 案B（専用テーブル新設）+ B-012（Single-Table 統合）

### 1.3 設計原則

- **Single-Table Design**: 1テーブルに複数エンティティを格納
- **既存テーブルとの共存**: `pm-project-indexes` テーブルに TaskTracker エンティティを統合
- **DAL パターン準拠**: `IDataAccessLayer` インターフェースに追加
- **Hybrid DAL**: DynamoDAL + NoDynamo フォールバック踏襲
- **fail-closed**: 読み込み失敗時はクリーンスタート（データ消失なし、新規開始）

---

## 2. Single-Table 設計

### 2.1 テーブル: `pm-project-indexes`（既存テーブルを拡張）

既存エンティティ:

| PK | SK | エンティティ |
|----|-----|-------------|
| `ORG#<orgId>` | `PIDX#<projectId>` | ProjectIndex |
| `ORG#<orgId>` | `SESSION#<sessionId>` | Session |
| `ORG#<orgId>` | `ACT#<ts>#<id>` | ActivityEvent |
| `ORG#<orgId>` | `PLAN#<planId>` | Plan |

**新規追加エンティティ:**

| PK | SK | エンティティ | 説明 |
|----|-----|-------------|------|
| `ORG#<orgId>` | `TRACKER#<projectId>` | TaskTracker | プロジェクトのタスク管理状態 |
| `ORG#<orgId>` | `TSNAP#<projectId>#<snapshotId>` | TaskSnapshot | タスク状態のスナップショット |
| `ORG#<orgId>` | `TSUM#<projectId>#<taskId>` | TaskSummary | 個別タスクのLLMサマリ |

### 2.2 なぜ `pm-project-indexes` に統合するか

1. **ProjectIndex と TaskTracker は 1:1 対応** — 同じ projectId で紐づく
2. **Query でプロジェクト関連データを一括取得可能** — `PK=ORG#xxx, SK begins_with TRACKER#projId` 
3. **テーブル数削減** — 新テーブル作成不要、運用コスト低減
4. **既存の DAL パターンに自然に統合** — DynamoDAL の `orgId` PK パターンを踏襲

---

## 3. データモデル

### 3.1 TaskTracker エンティティ（メイン）

プロジェクトごとに1レコード。現在のタスク管理状態を保持する。

```typescript
interface TaskTracker {
  // DynamoDB Keys
  PK: string;                          // ORG#<orgId>
  SK: string;                          // TRACKER#<projectId>

  // Identifiers
  projectId: string;
  orgId: string;

  // Current Task State
  currentPlan: TaskPlan | null;        // 現在の実行計画
  activeTasks: TrackedTask[];          // アクティブなタスク一覧
  completedTaskIds: string[];          // 完了タスクIDリスト（直近100件）

  // Context Recovery
  lastContextSummary: string | null;   // LLM生成のコンテキストサマリ
  lastCheckpointAt: string | null;     // 最終チェックポイント時刻（ISO8601）
  recoveryHint: string | null;         // 復元時のヒント（次にやるべきこと）

  // Metadata
  version: number;                     // 楽観的ロック用バージョン
  createdAt: string;                   // ISO8601
  updatedAt: string;                   // ISO8601
  ttl?: number;                        // 自動クリーンアップ（90日）
}
```

### 3.2 TaskPlan（埋め込みオブジェクト）

```typescript
interface TaskPlan {
  planId: string;                      // plan_<uuid>
  title: string;                       // ユーザー指示の要約
  originalPrompt: string;              // 元のユーザー入力
  subtasks: PlannedSubtask[];          // 計画されたサブタスク
  status: PlanStatus;                  // PLANNING | EXECUTING | COMPLETED | FAILED | CANCELLED
  createdAt: string;                   // ISO8601
  updatedAt: string;                   // ISO8601
}

type PlanStatus = 'PLANNING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface PlannedSubtask {
  subtaskId: string;                   // st_<seq>
  description: string;                 // サブタスク説明
  status: SubtaskStatus;               // PENDING | IN_PROGRESS | DONE | SKIPPED | FAILED
  order: number;                       // 実行順序
  dependencies: string[];              // 依存先 subtaskId[]
  assignedRunId?: string;              // 対応する Run ID
  result?: string;                     // 完了時の結果サマリ
  error?: string;                      // 失敗時のエラー
}

type SubtaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED' | 'FAILED';
```

### 3.3 TrackedTask（埋め込みオブジェクト）

```typescript
interface TrackedTask {
  taskId: string;                      // task_<uuid>
  title: string;                       // タスク名
  status: TrackedTaskStatus;
  priority: number;                    // 0-100
  planId?: string;                     // 所属 Plan
  subtaskId?: string;                  // 所属サブタスク
  runId?: string;                      // 対応する Run ID
  startedAt?: string;
  completedAt?: string;
  lastUpdate: string;                  // 最終更新（ISO8601）
  contextSnippet?: string;             // 直近の作業コンテキスト（500文字以内）
}

type TrackedTaskStatus = 'QUEUED' | 'RUNNING' | 'BLOCKED' | 'DONE' | 'FAILED' | 'CANCELLED';
```

### 3.4 TaskSnapshot エンティティ（チェックポイント）

コンテキスト消失に備えた定期スナップショット。

```typescript
interface TaskSnapshot {
  // DynamoDB Keys
  PK: string;                          // ORG#<orgId>
  SK: string;                          // TSNAP#<projectId>#<snapshotId>

  // Identifiers
  snapshotId: string;                  // snap_<timestamp>
  projectId: string;
  orgId: string;

  // Snapshot Data
  trigger: SnapshotTrigger;            // なぜスナップショットが作られたか
  trackerState: TaskTracker;           // TaskTracker の全状態コピー
  contextSummary: string;              // LLM生成サマリ（復元用）
  filesModified: string[];             // 変更されたファイルパス
  gitState?: {
    branch: string;
    commitHash: string;
    uncommittedChanges: number;
  };

  // Metadata
  createdAt: string;                   // ISO8601
  ttl: number;                         // 自動クリーンアップ（30日）
}

type SnapshotTrigger =
  | 'PERIODIC'              // 定期保存（5分間隔）
  | 'TASK_COMPLETE'         // タスク完了時
  | 'PLAN_PHASE_CHANGE'     // 計画フェーズ変更時
  | 'CONTEXT_LIMIT_WARNING' // コンテキスト制限接近時
  | 'USER_REQUESTED'        // ユーザー明示指示
  | 'SESSION_END';          // セッション終了時
```

### 3.5 TaskSummary エンティティ（LLMサマリ）

```typescript
interface TaskSummary {
  // DynamoDB Keys
  PK: string;                          // ORG#<orgId>
  SK: string;                          // TSUM#<projectId>#<taskId>

  // Identifiers
  taskId: string;
  projectId: string;
  orgId: string;

  // Summary Content
  title: string;                       // タスク名
  summary: string;                     // LLM生成の完了サマリ
  keyDecisions: string[];              // 重要な判断事項
  filesChanged: string[];              // 変更ファイル一覧
  testResults?: {
    total: number;
    passed: number;
    failed: number;
  };

  // Metadata
  generatedBy: string;                 // LLM モデル名
  generatedAt: string;                 // ISO8601
  createdAt: string;                   // ISO8601
  ttl: number;                         // 自動クリーンアップ（90日）
}
```

---

## 4. GSI 設計

### 4.1 既存 GSI への影響

既存の `pm-project-indexes` テーブル GSI に影響なし。
TaskTracker エンティティは PK + SK の直接アクセスが主。

### 4.2 新規 GSI（必要に応じて追加）

**Phase 1 では GSI 追加なし。** PK + begins_with クエリで十分対応可能。

将来的に必要になれば:

| GSI Name | PK | SK | 用途 |
|----------|-----|-----|------|
| tracker-updated-index | `projectId` | `updatedAt` | プロジェクト横断のアクティブタスク検索 |

---

## 5. アクセスパターン

### 5.1 主要アクセスパターン

| # | 操作 | PK | SK / Condition | 頻度 |
|---|------|----|----------------|------|
| 1 | プロジェクトの TaskTracker 取得 | `ORG#<orgId>` | `TRACKER#<projectId>` | 高 |
| 2 | TaskTracker 更新（楽観的ロック） | `ORG#<orgId>` | `TRACKER#<projectId>` | 高 |
| 3 | スナップショット一覧取得 | `ORG#<orgId>` | `begins_with(TSNAP#<projectId>#)` | 中 |
| 4 | 最新スナップショット取得 | `ORG#<orgId>` | `begins_with(TSNAP#<projectId>#)` + ScanIndexForward=false, Limit=1 | 中 |
| 5 | タスクサマリ取得 | `ORG#<orgId>` | `TSUM#<projectId>#<taskId>` | 低 |
| 6 | プロジェクトの全サマリ一覧 | `ORG#<orgId>` | `begins_with(TSUM#<projectId>#)` | 低 |

### 5.2 楽観的ロック

TaskTracker の更新は `version` フィールドで楽観的ロックを実装:

```typescript
// ConditionExpression: version = :expectedVersion
await docClient.send(new UpdateCommand({
  TableName: TABLES.PROJECT_INDEXES,
  Key: { PK: orgPK(orgId), SK: `TRACKER#${projectId}` },
  UpdateExpression: 'SET #plan = :plan, #version = :newVersion, updatedAt = :now',
  ConditionExpression: '#version = :expectedVersion',
  ExpressionAttributeNames: { '#plan': 'currentPlan', '#version': 'version' },
  ExpressionAttributeValues: {
    ':plan': newPlan,
    ':newVersion': currentVersion + 1,
    ':expectedVersion': currentVersion,
    ':now': new Date().toISOString(),
  },
}));
```

---

## 6. コンテキスト消失時の自動復元フロー

### 6.1 復元トリガー

以下のいずれかで復元フローが起動する:

1. **新セッション開始時** — Runner 起動 → TaskTracker 読み込み → 未完了タスクがある → 復元
2. **明示的コマンド** — `/recover` コマンド
3. **コンテキストリセット検知** — Runner が「コンテキスト消失」を検知

### 6.2 復元フロー

```
セッション開始 / コンテキスト消失検知
    │
    ▼
TaskTrackerStore.load(projectId)
    │
    ├── TaskTracker 取得
    │   │
    │   ├── [存在しない] → 新規作成、通常起動
    │   │
    │   └── [存在する] → 未完了タスクチェック
    │       │
    │       ├── [全て完了] → 通常起動
    │       │
    │       └── [未完了あり] → 復元フロー開始
    │           │
    │           ▼
    │       最新 TaskSnapshot 取得
    │           │
    │           ├── [スナップショットあり]
    │           │   │
    │           │   ▼
    │           │   contextSummary をプロンプトに注入
    │           │   recoveryHint を表示
    │           │   activeTasks を復元
    │           │   currentPlan.subtasks の進捗を復元
    │           │
    │           └── [スナップショットなし]
    │               │
    │               ▼
    │               TaskTracker の lastContextSummary を使用
    │               activeTasks から状態を復元
    │
    ▼
復元サマリをユーザーに表示
    │
    ▼
「続行しますか？」確認
    │
    ├── [Yes] → 中断タスクから再開
    └── [No]  → 新規タスクとして開始（TaskTracker はリセット）
```

### 6.3 復元プロンプト生成

```typescript
function generateRecoveryPrompt(
  tracker: TaskTracker,
  snapshot: TaskSnapshot | null
): string {
  const parts: string[] = [];

  // 1. コンテキストサマリ
  const summary = snapshot?.contextSummary ?? tracker.lastContextSummary;
  if (summary) {
    parts.push(`## Previous Context\n${summary}`);
  }

  // 2. 現在の計画と進捗
  if (tracker.currentPlan) {
    const plan = tracker.currentPlan;
    const done = plan.subtasks.filter(s => s.status === 'DONE').length;
    const total = plan.subtasks.length;
    parts.push(`## Plan: ${plan.title} (${done}/${total} completed)`);

    const pending = plan.subtasks.filter(s => s.status !== 'DONE' && s.status !== 'SKIPPED');
    if (pending.length > 0) {
      parts.push('### Remaining Subtasks');
      pending.forEach(s => parts.push(`- [${s.status}] ${s.description}`));
    }
  }

  // 3. アクティブタスク
  const active = tracker.activeTasks.filter(t => t.status === 'RUNNING' || t.status === 'QUEUED');
  if (active.length > 0) {
    parts.push('## Active Tasks');
    active.forEach(t => {
      parts.push(`- ${t.title} (${t.status})`);
      if (t.contextSnippet) parts.push(`  Context: ${t.contextSnippet}`);
    });
  }

  // 4. 復元ヒント
  if (tracker.recoveryHint) {
    parts.push(`## Next Action\n${tracker.recoveryHint}`);
  }

  // 5. Git 状態
  if (snapshot?.gitState) {
    parts.push(`## Git State\nBranch: ${snapshot.gitState.branch}\nCommit: ${snapshot.gitState.commitHash}\nUncommitted: ${snapshot.gitState.uncommittedChanges} files`);
  }

  return parts.join('\n\n');
}
```

---

## 7. LLM 自動サマリ生成フロー

### 7.1 サマリ生成タイミング

| タイミング | 生成物 | 保存先 |
|-----------|--------|--------|
| タスク完了時 | TaskSummary | TSUM エンティティ |
| 定期チェックポイント（5分） | contextSummary | TaskSnapshot.contextSummary |
| コンテキスト制限接近時 | contextSummary + recoveryHint | TaskTracker + TaskSnapshot |
| Plan フェーズ変更時 | contextSummary | TaskSnapshot.contextSummary |

### 7.2 サマリ生成プロンプト

```typescript
const SUMMARY_SYSTEM_PROMPT = `You are a task context summarizer.
Given the current task state and recent actions, generate a concise summary
that would allow another AI session to continue the work seamlessly.

Output JSON:
{
  "contextSummary": "string (500 chars max) - What was being done and current state",
  "recoveryHint": "string (200 chars max) - The very next action to take",
  "keyDecisions": ["string[] - Important decisions made during this session"]
}`;

async function generateContextSummary(
  tracker: TaskTracker,
  recentEvents: ActivityEvent[]
): Promise<{ contextSummary: string; recoveryHint: string; keyDecisions: string[] }> {
  const prompt = `Current plan: ${JSON.stringify(tracker.currentPlan)}
Active tasks: ${JSON.stringify(tracker.activeTasks)}
Recent events: ${JSON.stringify(recentEvents.slice(-20))}`;

  const result = await llm.generate({
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userPrompt: prompt,
    maxTokens: 500,
    temperature: 0,
  });

  return JSON.parse(result);
}
```

### 7.3 コスト制御

- サマリ生成は **低コストモデル** を使用（例: `gpt-4o-mini`, `claude-3-haiku`）
- 5分間隔の定期生成 → 1時間あたり最大12回
- 入力トークン上限: 2000（超過時はイベントを切り詰め）
- 月間コスト目安: < $1（通常使用時）

---

## 8. DAL インターフェース拡張

### 8.1 IDataAccessLayer への追加メソッド

```typescript
interface IDataAccessLayer {
  // ... 既存メソッド ...

  // ==================== Task Tracker ====================

  getTaskTracker(projectId: string): Promise<TaskTracker | null>;
  upsertTaskTracker(tracker: TaskTracker): Promise<TaskTracker>;
  updateTaskTrackerPlan(
    projectId: string,
    plan: TaskPlan,
    expectedVersion: number
  ): Promise<TaskTracker>;
  updateTaskTrackerTasks(
    projectId: string,
    tasks: TrackedTask[],
    expectedVersion: number
  ): Promise<TaskTracker>;
  updateTaskTrackerContext(
    projectId: string,
    contextSummary: string,
    recoveryHint: string | null,
    expectedVersion: number
  ): Promise<TaskTracker>;
  deleteTaskTracker(projectId: string): Promise<void>;

  // ==================== Task Snapshots ====================

  createTaskSnapshot(input: CreateTaskSnapshotInput): Promise<TaskSnapshot>;
  getLatestTaskSnapshot(projectId: string): Promise<TaskSnapshot | null>;
  listTaskSnapshots(projectId: string, limit?: number): Promise<TaskSnapshot[]>;

  // ==================== Task Summaries ====================

  createTaskSummary(input: CreateTaskSummaryInput): Promise<TaskSummary>;
  getTaskSummary(projectId: string, taskId: string): Promise<TaskSummary | null>;
  listTaskSummaries(projectId: string): Promise<TaskSummary[]>;
}
```

### 8.2 Input Types

```typescript
interface CreateTaskSnapshotInput {
  projectId: string;
  orgId: string;
  trigger: SnapshotTrigger;
  trackerState: TaskTracker;
  contextSummary: string;
  filesModified: string[];
  gitState?: TaskSnapshot['gitState'];
}

interface CreateTaskSummaryInput {
  taskId: string;
  projectId: string;
  orgId: string;
  title: string;
  summary: string;
  keyDecisions: string[];
  filesChanged: string[];
  testResults?: TaskSummary['testResults'];
  generatedBy: string;
}
```

---

## 9. TaskTrackerStore（アプリケーション層）

### 9.1 クラス設計

```typescript
class TaskTrackerStore {
  private dal: IDataAccessLayer;
  private orgId: string;
  private projectId: string;
  private cachedTracker: TaskTracker | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor(dal: IDataAccessLayer, orgId: string, projectId: string);

  // Initialization
  async initialize(): Promise<TaskTracker>;
  async checkForRecovery(): Promise<RecoveryInfo | null>;

  // Plan Management
  async createPlan(prompt: string, subtasks: PlannedSubtask[]): Promise<TaskPlan>;
  async updateSubtaskStatus(subtaskId: string, status: SubtaskStatus, result?: string): Promise<void>;
  async completePlan(): Promise<void>;
  async cancelPlan(): Promise<void>;

  // Task Management
  async addTask(task: Omit<TrackedTask, 'taskId' | 'lastUpdate'>): Promise<TrackedTask>;
  async updateTaskStatus(taskId: string, status: TrackedTaskStatus): Promise<void>;
  async completeTask(taskId: string, summary?: string): Promise<void>;

  // Context Management
  async saveCheckpoint(trigger: SnapshotTrigger): Promise<TaskSnapshot>;
  async generateAndSaveContextSummary(): Promise<void>;

  // Recovery
  async recover(): Promise<RecoveryResult>;
  async resetTracker(): Promise<void>;

  // Lifecycle
  startPeriodicSnapshots(intervalMs?: number): void;  // default: 300000 (5min)
  stopPeriodicSnapshots(): void;
  async shutdown(): Promise<void>;  // 終了時スナップショット保存
}

interface RecoveryInfo {
  hasUnfinishedWork: boolean;
  lastCheckpointAt: string | null;
  activePlan: TaskPlan | null;
  activeTaskCount: number;
  contextSummary: string | null;
  recoveryHint: string | null;
}

interface RecoveryResult {
  recovered: boolean;
  plan: TaskPlan | null;
  activeTasks: TrackedTask[];
  recoveryPrompt: string;
}
```

---

## 10. REPL / CLI コマンド

### 10.1 新規コマンド

| コマンド | 説明 |
|---------|------|
| `/tracker` | 現在の TaskTracker 状態を表示 |
| `/tracker plan` | 現在の Plan と進捗を表示 |
| `/tracker tasks` | アクティブタスク一覧 |
| `/tracker snapshot` | 手動スナップショット作成 |
| `/tracker recover` | 前回セッションからの復元 |
| `/tracker reset` | TaskTracker をリセット |
| `/tracker history` | 最近のスナップショット一覧 |

### 10.2 表示例

```
╭─────────────────────────────────────────────────────╮
│ Task Tracker: /Users/user/my-project                 │
├─────────────────────────────────────────────────────┤
│ Plan: Add user authentication (3/5 completed)        │
│                                                      │
│ Subtasks:                                            │
│   [DONE]        1. Create user model                 │
│   [DONE]        2. Implement login API               │
│   [DONE]        3. Add JWT middleware                 │
│   [IN_PROGRESS] 4. Create login UI                   │
│   [PENDING]     5. Write E2E tests                   │
│                                                      │
│ Active Tasks: 1                                      │
│   - Create login form component (RUNNING)            │
│                                                      │
│ Last Checkpoint: 2 min ago                           │
│ Context: Working on LoginForm component, added       │
│          validation with zod schema...               │
╰─────────────────────────────────────────────────────╯
```

---

## 11. Web API エンドポイント

### 11.1 REST API

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/projects/:projectId/tracker` | TaskTracker 取得 |
| PUT | `/api/projects/:projectId/tracker/plan` | Plan 作成/更新 |
| PATCH | `/api/projects/:projectId/tracker/subtasks/:subtaskId` | サブタスクステータス更新 |
| POST | `/api/projects/:projectId/tracker/snapshot` | 手動スナップショット |
| GET | `/api/projects/:projectId/tracker/snapshots` | スナップショット一覧 |
| GET | `/api/projects/:projectId/tracker/recovery` | 復元情報取得 |
| POST | `/api/projects/:projectId/tracker/recover` | 復元実行 |
| DELETE | `/api/projects/:projectId/tracker` | Tracker リセット |
| GET | `/api/projects/:projectId/tracker/summaries` | タスクサマリ一覧 |

---

## 12. NoDynamo フォールバック

DynamoDB 未使用環境では、ファイルベースでフォールバック:

```
~/.pm-orchestrator/trackers/
├── <project-hash>/
│   ├── tracker.json           # TaskTracker 状態
│   ├── snapshots/
│   │   ├── snap_2026-03-30T10-00-00.json
│   │   └── snap_2026-03-30T10-05-00.json
│   └── summaries/
│       ├── task_abc123.json
│       └── task_def456.json
```

NoDynamo 実装は既存の `NoDynamoDALWithConversations` パターンに準拠:
- JSON ファイルへの同期書き込み
- メモリキャッシュ
- fail-closed（破損時はデフォルト状態で起動）

---

## 13. エラーハンドリング

### 13.1 DynamoDB エラー

| エラー | 対応 |
|--------|------|
| ConditionalCheckFailedException | 楽観的ロック失敗 → リトライ（最大3回） |
| ProvisionedThroughputExceededException | 指数バックオフリトライ |
| ResourceNotFoundException | テーブル自動作成 → リトライ |
| 接続エラー | NoDynamo フォールバック |

### 13.2 データ整合性

- TaskTracker の `version` フィールドで楽観的ロック
- スナップショットは追記のみ（更新なし）
- TTL による自動クリーンアップ

---

## 14. 容量見積もり

### 14.1 アイテムサイズ

| エンティティ | 平均サイズ | 上限 |
|-------------|-----------|------|
| TaskTracker | 5-20 KB | 50 KB |
| TaskSnapshot | 10-30 KB | 100 KB |
| TaskSummary | 1-3 KB | 10 KB |

### 14.2 保持量

| エンティティ | プロジェクトあたり | TTL |
|-------------|-------------------|-----|
| TaskTracker | 1 | 90日（非アクティブ時） |
| TaskSnapshot | 最大 ~8,640/月 (5分間隔) | 30日 |
| TaskSummary | タスク完了数に比例 | 90日 |

### 14.3 DynamoDB 容量

Phase 1 は On-Demand モードを推奨（既存テーブルと同一設定）。

---

## 15. 実装フェーズ

### Phase 1: 基盤（この PR）

1. データモデル定義（TypeScript types）
2. DAL インターフェース拡張
3. DynamoDB 実装（CRUD + 楽観的ロック）
4. NoDynamo フォールバック実装
5. TaskTrackerStore 基本実装
6. テスト

### Phase 2: 復元フロー

1. コンテキスト消失検知
2. 復元プロンプト生成
3. `/tracker recover` コマンド
4. 定期スナップショット

### Phase 3: LLM サマリ

1. サマリ生成プロンプト
2. タスク完了時の自動サマリ
3. 定期コンテキストサマリ
4. TaskSummary の Web UI 表示

### Phase 4: Web UI 統合

1. Dashboard にタスク進捗表示
2. スナップショット閲覧
3. 復元 UI

---

## 16. テスト戦略

### 16.1 ユニットテスト

- TaskTrackerStore の各メソッド
- 楽観的ロックの競合シナリオ
- 復元プロンプト生成
- サマリ生成（モック LLM）

### 16.2 統合テスト

- DynamoDB Local での CRUD
- NoDynamo フォールバック動作
- Hybrid DAL での切り替え
- TTL による自動クリーンアップ

### 16.3 E2E テスト

- セッション終了 → 再開 → 復元フロー
- 複数プロジェクト同時使用
- コンテキスト消失シミュレーション

---

## 17. 制約事項

- DynamoDB アイテムサイズ上限: 400 KB
  - TaskTracker は 50 KB 以内に収める
  - subtasks が多い場合は古い completed を切り詰め
- スナップショットの trackerState は冗長だが、復元の確実性を優先
- LLM サマリ生成は非同期（タスク完了のクリティカルパスに含めない）

---

## 18. 関連仕様

- spec/05_DATA_MODELS.md — Core Data Structures
- spec/16_TASK_GROUP.md — Task Group 階層
- spec/20_QUEUE_STORE.md — Queue Store（別テーブル）
- spec/28_CONVERSATION_TRACE.md — 会話ログ
- spec/33_PROJECT_SETTINGS_PERSISTENCE.md — プロジェクト設定永続化
- docs/specs/dynamodb.md — DynamoDB スキーマ仕様

---

## 19. マイグレーション

既存の `pm-project-indexes` テーブルへの変更は **追加のみ（非破壊的）**:

- 既存エンティティ（ProjectIndex, Session, ActivityEvent, Plan）に影響なし
- 新しい SK パターン（`TRACKER#`, `TSNAP#`, `TSUM#`）を追加するのみ
- テーブルスキーマ変更不要（PK + SK は String 型で汎用的に利用済み）
- GSI 追加も Phase 1 では不要
