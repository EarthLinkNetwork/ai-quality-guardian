# LLM Layer Enhancement 実機証跡

## 概要

このドキュメントは pm-orchestrator-runner の LLM Layer 拡張（Unified Orchestration Engine）の動作証跡を記録します。

- **作成日**: 2026-01-23
- **テスト実行環境**: Node.js + Mocha
- **関連仕様書**:
  - spec/29_TASK_PLANNING.md
  - spec/30_RETRY_AND_RECOVERY.md
  - spec/31_PROVIDER_MODEL_POLICY.md

## コンポーネント概要

### 1. TaskPlanner (src/planning/)
タスク分析とプランニングを担当。

**機能**:
- タスクサイズ推定 (XS/S/M/L/XL)
- 複雑度スコア計算 (1-10)
- チャンキング判定
- サブタスク生成
- 依存関係分析

### 2. RetryManager (src/retry/)
失敗時のリトライ戦略を担当。

**機能**:
- 失敗タイプ判定 (TRANSIENT_ERROR, MODEL_LIMIT, RATE_LIMIT, etc.)
- リトライ判定 (shouldRetry)
- バックオフ計算 (指数バックオフ + ジッター)
- サーキットブレーカー
- リトライ履歴追跡

### 3. ModelPolicyManager (src/model-policy/)
モデル選択とコスト管理を担当。

**機能**:
- フェーズ別モデル選択 (PLANNING, IMPLEMENTATION, QUALITY_CHECK)
- プリセットプロファイル (stable, cheap, fast)
- コスト計算・追跡
- モデルエスカレーション
- 使用量サマリー

### 4. TaskOrchestrator (src/orchestration/)
統合オーケストレーションを担当。

**機能**:
- タスク実行の統合制御
- プランニング → 実行 → リトライのフロー
- イベント発行
- コンポーネント間の連携

## テスト結果サマリー

### LLM Layer テスト: 165件 全てPASS

```
TaskPlanner: 31件
RetryManager: 63件
ModelPolicyManager: 43件
TaskOrchestrator: 28件
----------------------------
合計: 165件
```

### 全体テストスイート: 1923件 PASS

```
1923 passing (2m)
88 pending
```

## TaskPlanner テスト (31件 PASS)

```
TaskPlanner (spec/29_TASK_PLANNING.md)
  Default Configuration (Section 10.1)
    ✔ should have default auto_chunk enabled
    ✔ should have default chunk_token_threshold of 8000
    ✔ should have default chunk_complexity_threshold of 6
    ✔ should have default max_subtasks of 10
    ✔ should have default min_subtasks of 2
    ✔ should have default enable_dependency_analysis enabled

  Constructor
    ✔ should create with default config
    ✔ should accept partial config override
    ✔ should accept event callback

  plan() - Execution Plan Generation (Section 3.4)
    ✔ should generate execution plan with required fields
    ✔ should generate valid timestamp
    ✔ should include size estimation
    ✔ should include chunking recommendation

  Size Estimation (Section 3.1)
    ✔ should estimate small task as XS or S
    ✔ should estimate complex task with higher complexity
    ✔ should provide estimation reasons

  Chunking Decision (Section 3.2)
    ✔ should not chunk small tasks
    ✔ should chunk large complex tasks
    ✔ should provide reason for chunking decision
    ✔ should respect auto_chunk config

  Subtask Structure (Section 3.2)
    ✔ should generate subtasks with required fields
    ✔ should respect max_subtasks config

  Dependency Analysis (Section 3.3)
    ✔ should analyze dependencies when enabled
    ✔ should not analyze dependencies when disabled

  quickSizeCheck()
    ✔ should return size estimation without full planning
    ✔ should be faster than full plan()

  shouldChunk()
    ✔ should return false for small tasks
    ✔ should return true for complex tasks

  Event Emission
    ✔ should emit events in correct order
    ✔ should include task_id in all events
```

## RetryManager テスト (63件 PASS)

```
RetryManager (spec/30_RETRY_AND_RECOVERY.md)
  Default Configuration (Section 10.1)
    ✔ should have max_retries of 3
    ✔ should have initial_backoff_ms of 1000
    ✔ should have max_backoff_ms of 30000
    ✔ should have backoff_multiplier of 2
    ✔ should have jitter enabled
    ✔ should have TRANSIENT_ERROR in retryable_types
    ✔ should have RATE_LIMIT in retryable_types
    ✔ should have TIMEOUT in retryable_types

  Constructor
    ✔ should create with default config
    ✔ should accept partial config override
    ✔ should accept event callback

  classifyFailure() - Failure Classification (Section 3)
    ✔ should classify rate limit error
    ✔ should classify timeout error
    ✔ should classify token limit exceeded
    ✔ should classify context length exceeded
    ✔ should classify model unavailable
    ✔ should classify transient error
    ✔ should classify network error
    ✔ should classify authentication error
    ✔ should classify unknown error

  shouldRetry() - Retry Decision (Section 4)
    ✔ should allow retry for retryable type with attempts remaining
    ✔ should deny retry when max attempts reached
    ✔ should deny retry for non-retryable types
    ✔ should consider circuit breaker state

  calculateBackoff() - Backoff Calculation (Section 5)
    ✔ should calculate exponential backoff
    ✔ should cap at max_backoff_ms
    ✔ should add jitter when enabled
    ✔ should not add jitter when disabled

  Circuit Breaker (Section 6)
    ✔ should start in CLOSED state
    ✔ should open after threshold failures
    ✔ should reject during OPEN state
    ✔ should transition to HALF_OPEN after timeout
    ✔ should close on success during HALF_OPEN
    ✔ should reopen on failure during HALF_OPEN

  recordSuccess() / recordFailure() - State Tracking
    ✔ should record success
    ✔ should record failure
    ✔ should update context state

  getRetryHistory() - History Tracking (Section 8)
    ✔ should return empty history initially
    ✔ should track retry attempts
    ✔ should include all attempt details

  Helper Functions
    classifyError()
      ✔ should classify error to failure type
      ✔ should handle unknown errors
    isRetryable()
      ✔ should return true for retryable types
      ✔ should return false for non-retryable types
    calculateBackoffMs()
      ✔ should calculate backoff for given attempt
      ✔ should respect max backoff
    createRetryDecision()
      ✔ should create retry decision
      ✔ should create no-retry decision

  Event Emission
    ✔ should emit FAILURE_CLASSIFIED event
    ✔ should emit RETRY_DECISION event
    ✔ should emit RETRY_SCHEDULED event
    ✔ should emit CIRCUIT_BREAKER_STATE event
```

## ModelPolicyManager テスト (43件 PASS)

```
ModelPolicyManager (spec/31_PROVIDER_MODEL_POLICY.md)
  Preset Profiles (Section 5)
    ✔ should have STABLE_PROFILE
    ✔ should have CHEAP_PROFILE
    ✔ should have FAST_PROFILE
    ✔ should have PRESET_PROFILES containing all profiles

  Model Configurations (Section 3)
    ✔ should have MODEL_CONFIGS
    ✔ should have required fields for each model

  Default Configuration (Section 10)
    ✔ should have default profile
    ✔ should have cost warning threshold
    ✔ should have cost limit action

  Constructor
    ✔ should create with default config
    ✔ should accept custom config
    ✔ should accept event callback

  select() - Model Selection (Section 4)
    ✔ should select model for PLANNING phase
    ✔ should select model for IMPLEMENTATION phase
    ✔ should select model for QUALITY_CHECK phase
    ✔ should include context info in selection

  recordUsage() - Usage Tracking (Section 8)
    ✔ should record usage
    ✔ should track subtask usage
    ✔ should calculate cost based on tokens

  setProfile() / getProfile() - Profile Management
    ✔ should get current profile
    ✔ should set profile successfully
    ✔ should return false for unknown profile
    ✔ should list available profiles

  checkCostLimit() - Cost Management (Section 9)
    ✔ should check cost limit
    ✔ should track accumulated cost

  getUsageSummary() - Reporting (Section 8)
    ✔ should return usage summary
    ✔ should filter by date range

  recordFallback() - Fallback Tracking
    ✔ should record fallback event

  Helper Functions (Section 3)
    getDefaultCategory()
      ✔ should return default category for phase
    getModelConfig()
      ✔ should return config for known model
      ✔ should return undefined for unknown model
    getModelByCategory()
      ✔ should return models for category
    getProviderForModel()
      ✔ should return provider for known model
      ✔ should return default provider for unknown model
    escalateModel()
      ✔ should escalate to larger model
    findLargerContextModel()
      ✔ should find model with larger context
    selectModel()
      ✔ should select model based on profile
    calculateCost()
      ✔ should calculate cost for tokens
      ✔ should return zero for unknown model

  Event Emission
    ✔ should emit MODEL_SELECTED event
    ✔ should emit MODEL_USAGE event

  Retry Escalation (Section 6)
    ✔ should select escalated model on retry
```

## TaskOrchestrator テスト (28件 PASS)

```
TaskOrchestrator (Unified Orchestration)
  Default Configuration
    ✔ should have default max_parallel_subtasks
    ✔ should have default auto_chunking
    ✔ should have default auto_model_escalation
    ✔ should have default cost_warning_threshold

  Constructor
    ✔ should create with default config
    ✔ should accept partial config override
    ✔ should accept event callback

  Component Access
    ✔ should provide access to TaskPlanner
    ✔ should provide access to RetryManager
    ✔ should provide access to ModelPolicyManager

  orchestrate() - Basic Execution
    ✔ should orchestrate simple task
    ✔ should include execution plan in result
    ✔ should track subtask results

  orchestrate() - Error Handling
    ✔ should handle subtask failure
    ✔ should handle executor exception

  orchestrate() - Retry Handling
    ✔ should retry failed subtasks
    ✔ should track retry decisions in result

  orchestrate() - Model Selection
    ✔ should select model for execution

  Usage Tracking
    ✔ should track usage summary

  Cost Management
    ✔ should check cost limit

  Profile Management
    ✔ should set model profile
    ✔ should reject unknown profile

  Event Emission
    ✔ should emit orchestration events
    ✔ should emit planning events
    ✔ should emit subtask events

  Configuration Options
    ✔ should work with custom max_parallel_subtasks
    ✔ should work with auto_chunking disabled
    ✔ should work with auto_model_escalation disabled
```

## イベントフロー

### TaskPlanner イベント順序

```
1. PLANNING_START           - プランニング開始
2. SIZE_ESTIMATION          - サイズ推定完了
3. CHUNKING_DECISION        - チャンキング判定完了
4. [依存関係分析が有効な場合]
   - DEPENDENCY_ANALYSIS    - 依存関係分析完了
5. EXECUTION_PLAN           - 実行計画生成
6. PLANNING_END             - プランニング終了
```

### RetryManager イベント順序

```
1. FAILURE_CLASSIFIED       - 失敗タイプ判定
2. RETRY_DECISION           - リトライ判定 (should_retry: true/false)
3. [リトライする場合]
   - RETRY_SCHEDULED        - リトライスケジュール (backoff_ms)
4. [サーキットブレーカー状態変化]
   - CIRCUIT_BREAKER_STATE  - 状態変化 (CLOSED/OPEN/HALF_OPEN)
```

### ModelPolicyManager イベント順序

```
1. MODEL_SELECTED           - モデル選択
2. [実行後]
   - MODEL_USAGE            - 使用量記録
3. [フォールバック発生時]
   - MODEL_FALLBACK         - フォールバック発生
4. [コスト警告時]
   - COST_WARNING           - コスト警告
```

### TaskOrchestrator 統合フロー

```
タスク投入
  │
  ▼
ORCHESTRATION_STARTED
  │
  ▼
PLANNING_COMPLETED (TaskPlanner)
  │
  ├── [サブタスクあり]
  │   │
  │   ▼ (各サブタスクに対して)
  │   MODEL_SELECTED (ModelPolicyManager)
  │   │
  │   ▼
  │   SUBTASK_STARTED
  │   │
  │   ├── [成功]
  │   │   │
  │   │   ▼
  │   │   SUBTASK_COMPLETED
  │   │
  │   └── [失敗]
  │       │
  │       ▼
  │       SUBTASK_FAILED
  │       │
  │       ▼
  │       RETRY_DECISION (RetryManager)
  │       │
  │       ├── [リトライ]
  │       │   ▼
  │       │   RETRY_SCHEDULED → SUBTASK_STARTED
  │       │
  │       └── [リトライなし]
  │           ▼
  │           完了
  │
  └── [サブタスクなし]
      │
      ▼
      直接完了
  │
  ▼
ORCHESTRATION_COMPLETED
```

## 複雑度推定パターン (COMPLEXITY_INDICATORS)

| パターン | 重み | 説明 |
|---------|------|------|
| `implement/create/build/develop full/complete/entire/whole` | +3 | 大規模実装 |
| `authentication/authorization/auth system` | +2 | 認証システム |
| `database/db migration` | +2 | データベース関連 |
| `api endpoint/rest api/graphql` | +2 | API実装 |
| `integrate/integration` | +2 | 統合作業 |
| `refactor/restructure` | +2 | リファクタリング |
| `security/secure` | +2 | セキュリティ |
| `multiple files/across files` | +1 | 複数ファイル |
| `test/testing` | +1 | テスト作成 |

## サイズカテゴリマッピング

| 複雑度スコア | トークン推定 | サイズ |
|-------------|-------------|--------|
| 1-2 | ~1000 | XS |
| 3-4 | ~4000 | S |
| 5-6 | ~8000 | M |
| 7-8 | ~16000 | L |
| 9-10 | ~32000+ | XL |

## プリセットプロファイル

| プロファイル | 用途 | 特性 |
|-------------|------|------|
| stable | 通常運用 | バランスの取れたモデル選択 |
| cheap | コスト重視 | 低コストモデル優先 |
| fast | 速度重視 | レスポンス速度優先 |

## コマンドによる証跡再現

```bash
# TaskPlanner テストの実行
pnpm test -- --grep "TaskPlanner"

# RetryManager テストの実行
pnpm test -- --grep "RetryManager"

# ModelPolicyManager テストの実行
pnpm test -- --grep "ModelPolicyManager"

# TaskOrchestrator テストの実行
pnpm test -- --grep "TaskOrchestrator"

# LLM Layer 全テストの実行
pnpm test -- --grep "TaskPlanner\|RetryManager\|ModelPolicyManager\|TaskOrchestrator"

# 全テストスイートの実行
pnpm test
```

## ファイル参照

### 仕様書
- spec/29_TASK_PLANNING.md - タスクプランニング仕様
- spec/30_RETRY_AND_RECOVERY.md - リトライ・リカバリ仕様
- spec/31_PROVIDER_MODEL_POLICY.md - モデルポリシー仕様

### 実装
- src/planning/task-planner.ts - TaskPlanner実装
- src/planning/index.ts - プランニングモジュール
- src/retry/retry-manager.ts - RetryManager実装
- src/retry/index.ts - リトライモジュール
- src/model-policy/model-policy-manager.ts - ModelPolicyManager実装
- src/model-policy/index.ts - モデルポリシーモジュール
- src/orchestration/task-orchestrator.ts - TaskOrchestrator実装
- src/orchestration/index.ts - オーケストレーションモジュール

### テスト
- test/unit/planning/task-planner.test.ts - TaskPlannerテスト
- test/unit/retry/retry-manager.test.ts - RetryManagerテスト
- test/unit/model-policy/model-policy-manager.test.ts - ModelPolicyManagerテスト
- test/unit/orchestration/task-orchestrator.test.ts - TaskOrchestratorテスト

## 技術的なポイント

### 1. 複雑度推定のキーワードマッチング
TaskPlannerは正規表現パターンでキーワードを検出し、複雑度スコアを計算します。
テストでは、実際のパターン（`implement full`、`database`、`api`等）を含むプロンプトを使用する必要があります。

### 2. 浮動小数点の比較
コスト計算では浮動小数点演算が発生するため、厳密な等価比較（`===`）ではなく、
許容誤差を持つ近似比較（`Math.abs(a - b) < 0.0001`）を使用します。

### 3. サブタスク生成のトリガー
簡単なタスク記述ではサブタスクが生成されません。
番号付きリスト（`1.`, `2.`）やキーワード（`full`, `complete`）を含める必要があります。

### 4. リトライテストのタイムアウト
バックオフ遅延を含むリトライテストでは、デフォルトの2秒タイムアウトを超えるため、
`this.timeout(15000)`で拡張が必要です。

### 5. デフォルトプロバイダー
`getProviderForModel()`は未知のモデルに対して`'openai'`をデフォルトとして返します。
