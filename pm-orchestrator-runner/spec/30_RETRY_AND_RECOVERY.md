# spec/30_RETRY_AND_RECOVERY.md

## 概要

リトライ戦略とリカバリーメカニズムを定義する。
タスク実行失敗時の自動リトライ、バックオフ戦略、原因別対応、ESCALATEフローを規定。

**Fail-Closed原則**: リトライ不可能な場合は安全側（ESCALATE）に倒す。

---

## 1. リトライ戦略

### 1.1 リトライ可能な失敗タイプ

| 失敗タイプ | 説明 | リトライ可能 | 最大リトライ回数 |
|-----------|------|-------------|-----------------|
| `INCOMPLETE` | 出力が不完全（省略マーカー等） | Yes | 3 |
| `QUALITY_FAILURE` | Q1-Q6 品質基準未達 | Yes | 3 |
| `TIMEOUT` | 実行タイムアウト | Yes | 2 |
| `TRANSIENT_ERROR` | 一時的なAPI/ネットワークエラー | Yes | 3 |
| `RATE_LIMIT` | APIレート制限 | Yes (with backoff) | 5 |
| `FATAL_ERROR` | 致命的エラー（認証失敗等） | No | 0 |
| `ESCALATE_REQUIRED` | 人間の判断が必要 | No | 0 |

### 1.2 RetryConfig データモデル

```typescript
interface RetryConfig {
  /** 最大リトライ回数 */
  max_retries: number;

  /** バックオフ戦略 */
  backoff: BackoffStrategy;

  /** リトライ可能な失敗タイプ */
  retryable_failures: FailureType[];

  /** 原因別の追加設定 */
  cause_specific: CauseSpecificConfig[];
}

interface BackoffStrategy {
  /** バックオフタイプ */
  type: 'fixed' | 'linear' | 'exponential';

  /** 初期待機時間（ms） */
  initial_delay_ms: number;

  /** 最大待機時間（ms） */
  max_delay_ms: number;

  /** 乗数（exponential の場合） */
  multiplier?: number;

  /** ジッター（ランダム変動、0-1） */
  jitter?: number;
}

interface CauseSpecificConfig {
  /** 失敗タイプ */
  failure_type: FailureType;

  /** 上書きリトライ回数 */
  max_retries?: number;

  /** 上書きバックオフ */
  backoff?: BackoffStrategy;

  /** 追加の修正指示 */
  modification_hint?: string;
}

type FailureType =
  | 'INCOMPLETE'
  | 'QUALITY_FAILURE'
  | 'TIMEOUT'
  | 'TRANSIENT_ERROR'
  | 'RATE_LIMIT'
  | 'FATAL_ERROR'
  | 'ESCALATE_REQUIRED';
```

### 1.3 デフォルト設定

```typescript
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  max_retries: 3,
  backoff: {
    type: 'exponential',
    initial_delay_ms: 1000,
    max_delay_ms: 30000,
    multiplier: 2,
    jitter: 0.1
  },
  retryable_failures: [
    'INCOMPLETE',
    'QUALITY_FAILURE',
    'TIMEOUT',
    'TRANSIENT_ERROR',
    'RATE_LIMIT'
  ],
  cause_specific: [
    {
      failure_type: 'RATE_LIMIT',
      max_retries: 5,
      backoff: {
        type: 'exponential',
        initial_delay_ms: 5000,
        max_delay_ms: 60000,
        multiplier: 2,
        jitter: 0.2
      }
    },
    {
      failure_type: 'TIMEOUT',
      max_retries: 2,
      backoff: {
        type: 'fixed',
        initial_delay_ms: 5000,
        max_delay_ms: 5000
      }
    }
  ]
};
```

---

## 2. リトライ判定フロー

### 2.1 判定フローチャート

```
タスク実行結果
    │
    ▼
┌─────────────────┐
│ 成功（PASS）?   │──Yes──► 完了
└────────┬────────┘
         │No
         ▼
┌─────────────────┐
│ 失敗タイプ判定   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ リトライ可能?   │──No──► ESCALATE
└────────┬────────┘
         │Yes
         ▼
┌─────────────────┐
│ リトライ上限?   │──Yes──► ESCALATE
└────────┬────────┘
         │No
         ▼
┌─────────────────┐
│ バックオフ計算   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 待機            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ リトライ実行    │
└────────┬────────┘
         │
         ▼
      再判定
```

### 2.2 RetryDecision データモデル

```typescript
interface RetryDecision {
  /** 判定結果 */
  decision: 'RETRY' | 'ESCALATE' | 'PASS';

  /** 失敗タイプ（RETRY/ESCALATE の場合） */
  failure_type?: FailureType;

  /** 現在のリトライ回数 */
  current_retry_count: number;

  /** 最大リトライ回数 */
  max_retries: number;

  /** 待機時間（ms、RETRY の場合） */
  delay_ms?: number;

  /** 修正指示（RETRY の場合） */
  modification_hint?: string;

  /** ESCALATE 理由（ESCALATE の場合） */
  escalate_reason?: string;

  /** 判定根拠 */
  reasoning: string;
}
```

### 2.3 判定ロジック

```typescript
function decideRetry(
  result: TaskResult,
  config: RetryConfig,
  history: RetryHistory
): RetryDecision {
  // 成功の場合
  if (result.status === 'PASS') {
    return {
      decision: 'PASS',
      current_retry_count: history.retry_count,
      max_retries: config.max_retries,
      reasoning: 'Task completed successfully'
    };
  }

  // 失敗タイプを判定
  const failureType = classifyFailure(result);

  // リトライ不可能な失敗
  if (!config.retryable_failures.includes(failureType)) {
    return {
      decision: 'ESCALATE',
      failure_type: failureType,
      current_retry_count: history.retry_count,
      max_retries: config.max_retries,
      escalate_reason: `Non-retryable failure: ${failureType}`,
      reasoning: `Failure type ${failureType} is not retryable`
    };
  }

  // 原因別の設定を取得
  const causeConfig = config.cause_specific.find(
    c => c.failure_type === failureType
  );
  const effectiveMaxRetries = causeConfig?.max_retries ?? config.max_retries;

  // リトライ上限チェック
  if (history.retry_count >= effectiveMaxRetries) {
    return {
      decision: 'ESCALATE',
      failure_type: failureType,
      current_retry_count: history.retry_count,
      max_retries: effectiveMaxRetries,
      escalate_reason: `Max retries (${effectiveMaxRetries}) exceeded`,
      reasoning: `Retry count ${history.retry_count} >= max ${effectiveMaxRetries}`
    };
  }

  // バックオフ計算
  const effectiveBackoff = causeConfig?.backoff ?? config.backoff;
  const delay = calculateBackoff(effectiveBackoff, history.retry_count);

  // 修正指示を生成
  const hint = generateModificationHint(failureType, result, causeConfig);

  return {
    decision: 'RETRY',
    failure_type: failureType,
    current_retry_count: history.retry_count,
    max_retries: effectiveMaxRetries,
    delay_ms: delay,
    modification_hint: hint,
    reasoning: `Retryable failure, attempt ${history.retry_count + 1}/${effectiveMaxRetries}`
  };
}
```

---

## 3. 原因別リトライ処理

### 3.1 INCOMPLETE（不完全な出力）

**検出条件:**
- 省略マーカー検出（`...`, `// 残り省略`, `etc.`）
- ファイル途中終了
- コード断片のみ

**修正指示テンプレート:**

```
前回の出力は不完全でした。

検出された問題:
{detected_issues}

修正要求:
1. 省略せず、全てのコードを出力してください
2. ファイルの最初から最後まで完全に出力してください
3. "..." や "残り省略" 等のマーカーを使用しないでください
4. Runner が完了を判定するため、完了宣言は不要です

前回の出力:
{previous_output_summary}
```

### 3.2 QUALITY_FAILURE（品質基準未達）

**検出条件:**
- Q1-Q6 のいずれかが FAIL

**修正指示テンプレート:**

```
品質基準を満たしていません。

失敗した基準:
{failed_criteria}

具体的な問題:
{specific_issues}

修正要求:
{modification_requirements}

前回の判定結果:
{previous_judgment}
```

### 3.3 TIMEOUT（タイムアウト）

**検出条件:**
- 実行時間が制限を超過
- レスポンスなし

**修正指示テンプレート:**

```
前回の実行がタイムアウトしました。

タイムアウト情報:
- 制限時間: {timeout_ms}ms
- 経過時間: {elapsed_ms}ms

修正要求:
1. より小さな単位に分割して実行してください
2. 複雑な処理は段階的に実行してください
3. 中間結果を出力してください
```

### 3.4 TRANSIENT_ERROR（一時的エラー）

**検出条件:**
- 5xx エラー
- ネットワークエラー
- 一時的なリソース不足

**対応:**
- バックオフ後に同一リクエストを再送
- 修正指示なし（同一タスクを再実行）

### 3.5 RATE_LIMIT（レート制限）

**検出条件:**
- 429 エラー
- Retry-After ヘッダー

**対応:**
- Retry-After があれば従う
- なければ exponential backoff
- 修正指示なし

---

## 4. ESCALATE フロー

### 4.1 ESCALATE 条件

以下の場合に ESCALATE:

1. **リトライ上限超過**: max_retries に到達
2. **致命的エラー**: 認証失敗、権限不足等
3. **人間の判断が必要**: 仕様の曖昧さ、倫理的判断等
4. **リソース枯渇**: トークン上限、ストレージ不足等

### 4.2 EscalationReport データモデル

```typescript
interface EscalationReport {
  /** タスクID */
  task_id: string;

  /** サブタスクID（該当する場合） */
  subtask_id?: string;

  /** ESCALATE 日時 */
  escalated_at: string;

  /** ESCALATE 理由 */
  reason: EscalationReason;

  /** 失敗履歴サマリー */
  failure_summary: FailureSummary;

  /** ユーザーへの最小限の情報 */
  user_message: string;

  /** 詳細情報（デバッグ用） */
  debug_info: DebugInfo;

  /** 推奨アクション */
  recommended_actions: string[];
}

interface EscalationReason {
  type: 'MAX_RETRIES' | 'FATAL_ERROR' | 'HUMAN_JUDGMENT' | 'RESOURCE_EXHAUSTED';
  description: string;
}

interface FailureSummary {
  total_attempts: number;
  failure_types: FailureType[];
  last_failure: {
    type: FailureType;
    message: string;
    timestamp: string;
  };
}

interface DebugInfo {
  retry_history: RetryAttempt[];
  trace_file: string;
  relevant_logs: string[];
}
```

### 4.3 ユーザーメッセージ生成

**Fail-Closed原則**: ユーザーには最小限の情報のみ表示。詳細はトレースファイルに記録。

```typescript
function generateUserMessage(report: EscalationReport): string {
  const templates: Record<string, string> = {
    MAX_RETRIES: `タスク「{task_summary}」は {total_attempts} 回試行しましたが完了できませんでした。

主な問題: {main_issue}

推奨アクション:
{recommended_actions}

詳細: /trace {task_id}`,

    FATAL_ERROR: `タスク「{task_summary}」で回復不能なエラーが発生しました。

エラー: {error_message}

推奨アクション:
{recommended_actions}`,

    HUMAN_JUDGMENT: `タスク「{task_summary}」は人間の判断が必要です。

理由: {judgment_reason}

確認事項:
{confirmation_items}`,

    RESOURCE_EXHAUSTED: `タスク「{task_summary}」はリソース制限により中断されました。

制限: {resource_limit}

推奨アクション:
{recommended_actions}`
  };

  return formatTemplate(templates[report.reason.type], report);
}
```

---

## 5. リカバリーメカニズム

### 5.1 部分成功のリカバリー

チャンク化されたタスクで一部のサブタスクが失敗した場合:

```typescript
interface PartialRecovery {
  /** タスクID */
  task_id: string;

  /** 成功したサブタスク */
  succeeded_subtasks: string[];

  /** 失敗したサブタスク */
  failed_subtasks: string[];

  /** リカバリー戦略 */
  strategy: RecoveryStrategy;

  /** リカバリー後の状態 */
  recovered_state?: TaskState;
}

type RecoveryStrategy =
  | 'RETRY_FAILED_ONLY'      // 失敗したサブタスクのみリトライ
  | 'ROLLBACK_AND_RETRY'     // ロールバックして全体をリトライ
  | 'PARTIAL_COMMIT'         // 成功分のみコミット
  | 'ESCALATE';              // 人間に委譲
```

### 5.2 依存関係を考慮したリカバリー

```typescript
function determineRecoveryStrategy(
  task: ChunkedTask,
  results: SubtaskResult[]
): RecoveryStrategy {
  const failed = results.filter(r => r.status === 'FAILED');
  const succeeded = results.filter(r => r.status === 'SUCCEEDED');

  // 失敗がなければリカバリー不要
  if (failed.length === 0) {
    return 'PARTIAL_COMMIT';
  }

  // 失敗したサブタスクに依存するサブタスクがあるか確認
  const hasDependentFailures = failed.some(f =>
    succeeded.some(s => s.dependencies.includes(f.subtask_id))
  );

  if (hasDependentFailures) {
    // 依存関係がある場合はロールバック
    return 'ROLLBACK_AND_RETRY';
  }

  // 独立した失敗のみならリトライ
  return 'RETRY_FAILED_ONLY';
}
```

### 5.3 状態復元

```typescript
interface StateSnapshot {
  /** スナップショットID */
  snapshot_id: string;

  /** 作成日時 */
  created_at: string;

  /** タスクID */
  task_id: string;

  /** スナップショット時点の状態 */
  state: {
    completed_subtasks: string[];
    pending_subtasks: string[];
    files_created: string[];
    files_modified: string[];
  };

  /** 復元可能期限 */
  expires_at: string;
}

async function restoreFromSnapshot(
  snapshot: StateSnapshot
): Promise<RestoredState> {
  // ファイル変更をリバート
  for (const file of snapshot.state.files_modified) {
    await revertFile(file, snapshot.snapshot_id);
  }

  // 作成されたファイルを削除
  for (const file of snapshot.state.files_created) {
    await deleteFile(file);
  }

  return {
    snapshot_id: snapshot.snapshot_id,
    restored_at: new Date().toISOString(),
    pending_subtasks: snapshot.state.pending_subtasks
  };
}
```

---

## 6. Conversation Trace イベント

### 6.1 リトライ関連イベント

```typescript
// リトライ判定
{
  "event": "RETRY_DECISION",
  "timestamp": "2026-01-23T10:15:32.100Z",
  "task_id": "task-001",
  "subtask_id": "subtask-002",
  "data": {
    "decision": "RETRY",
    "failure_type": "INCOMPLETE",
    "current_retry_count": 1,
    "max_retries": 3,
    "delay_ms": 2000,
    "modification_hint": "省略せず全てのコードを出力してください",
    "reasoning": "Omission marker detected in output"
  }
}

// リトライ開始
{
  "event": "RETRY_START",
  "timestamp": "2026-01-23T10:15:34.100Z",
  "task_id": "task-001",
  "subtask_id": "subtask-002",
  "iteration_index": 2,
  "data": {
    "retry_count": 1,
    "previous_failure_type": "INCOMPLETE",
    "modification_hint": "省略せず全てのコードを出力してください"
  }
}

// リトライ成功
{
  "event": "RETRY_SUCCESS",
  "timestamp": "2026-01-23T10:15:45.000Z",
  "task_id": "task-001",
  "subtask_id": "subtask-002",
  "iteration_index": 2,
  "data": {
    "retry_count": 1,
    "total_attempts": 2,
    "final_status": "PASS"
  }
}
```

### 6.2 ESCALATE 関連イベント

```typescript
// ESCALATE 判定
{
  "event": "ESCALATE_DECISION",
  "timestamp": "2026-01-23T10:20:00.000Z",
  "task_id": "task-001",
  "subtask_id": "subtask-003",
  "data": {
    "reason": {
      "type": "MAX_RETRIES",
      "description": "Maximum retries (3) exceeded"
    },
    "failure_summary": {
      "total_attempts": 4,
      "failure_types": ["INCOMPLETE", "INCOMPLETE", "QUALITY_FAILURE", "QUALITY_FAILURE"],
      "last_failure": {
        "type": "QUALITY_FAILURE",
        "message": "Q2 failed: TODO marker detected",
        "timestamp": "2026-01-23T10:19:55.000Z"
      }
    }
  }
}

// ESCALATE 実行
{
  "event": "ESCALATE_EXECUTED",
  "timestamp": "2026-01-23T10:20:01.000Z",
  "task_id": "task-001",
  "data": {
    "user_message": "タスク「ユーザー認証機能の実装」は 4 回試行しましたが完了できませんでした...",
    "recommended_actions": [
      "タスクを小さく分割してください",
      "/trace task-001 で詳細を確認してください"
    ]
  }
}
```

### 6.3 リカバリー関連イベント

```typescript
// リカバリー開始
{
  "event": "RECOVERY_START",
  "timestamp": "2026-01-23T10:25:00.000Z",
  "task_id": "task-001",
  "data": {
    "strategy": "RETRY_FAILED_ONLY",
    "failed_subtasks": ["subtask-003"],
    "succeeded_subtasks": ["subtask-001", "subtask-002"]
  }
}

// スナップショット復元
{
  "event": "SNAPSHOT_RESTORE",
  "timestamp": "2026-01-23T10:25:05.000Z",
  "task_id": "task-001",
  "data": {
    "snapshot_id": "snap-001",
    "restored_files": ["src/auth.ts"],
    "deleted_files": ["src/temp.ts"]
  }
}

// リカバリー完了
{
  "event": "RECOVERY_COMPLETE",
  "timestamp": "2026-01-23T10:30:00.000Z",
  "task_id": "task-001",
  "data": {
    "strategy": "RETRY_FAILED_ONLY",
    "recovered_subtasks": ["subtask-003"],
    "final_status": "PASS"
  }
}
```

---

## 7. 設定

### 7.1 グローバル設定

```json
{
  "retry": {
    "default_max_retries": 3,
    "default_backoff": {
      "type": "exponential",
      "initial_delay_ms": 1000,
      "max_delay_ms": 30000,
      "multiplier": 2,
      "jitter": 0.1
    },
    "retryable_failures": [
      "INCOMPLETE",
      "QUALITY_FAILURE",
      "TIMEOUT",
      "TRANSIENT_ERROR",
      "RATE_LIMIT"
    ],
    "cause_specific": {
      "RATE_LIMIT": {
        "max_retries": 5,
        "backoff": {
          "type": "exponential",
          "initial_delay_ms": 5000,
          "max_delay_ms": 60000
        }
      },
      "TIMEOUT": {
        "max_retries": 2,
        "backoff": {
          "type": "fixed",
          "initial_delay_ms": 5000
        }
      }
    }
  },
  "recovery": {
    "enable_snapshots": true,
    "snapshot_retention_hours": 24,
    "partial_commit_enabled": true
  },
  "escalate": {
    "notify_immediately": true,
    "include_trace_link": true,
    "max_message_length": 500
  }
}
```

### 7.2 タスク単位の設定

```typescript
interface TaskRetryOverride {
  /** タスクID */
  task_id: string;

  /** 上書き設定 */
  overrides: Partial<RetryConfig>;
}

// 例: 特定タスクでリトライを無効化
const override: TaskRetryOverride = {
  task_id: 'critical-task-001',
  overrides: {
    max_retries: 0  // リトライなし、即座に ESCALATE
  }
};
```

---

## 8. エラーハンドリング

### 8.1 リトライ中のエラー

| エラー | 対応 |
|--------|------|
| バックオフ計算失敗 | デフォルト値（1000ms）を使用 |
| 修正指示生成失敗 | 汎用的な指示を使用 |
| スナップショット作成失敗 | 警告ログ、リカバリー無効化 |
| スナップショット復元失敗 | ESCALATE |

### 8.2 致命的エラーのハンドリング

```typescript
const FATAL_ERRORS: Record<string, FatalErrorHandler> = {
  'AUTHENTICATION_FAILED': {
    message: 'API認証に失敗しました',
    recommended_actions: ['API Keyを確認してください', '/keys set で再設定してください']
  },
  'PERMISSION_DENIED': {
    message: '権限がありません',
    recommended_actions: ['アクセス権限を確認してください']
  },
  'RESOURCE_NOT_FOUND': {
    message: '必要なリソースが見つかりません',
    recommended_actions: ['ファイルパスを確認してください', 'リソースが存在することを確認してください']
  }
};
```

---

## 9. 相互参照

- **spec/25_REVIEW_LOOP.md**: PASS/REJECT 判定との連携
- **spec/26_TASK_CHUNKING.md**: サブタスク失敗時のリカバリー
- **spec/28_CONVERSATION_TRACE.md**: RETRY_*, ESCALATE_* イベント記録
- **spec/29_TASK_PLANNING.md**: 計画フェーズとの連携
- **spec/13_LOGGING_AND_OBSERVABILITY.md**: ログ記録

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0.0 | 2026-01-23 | 初版作成 |
