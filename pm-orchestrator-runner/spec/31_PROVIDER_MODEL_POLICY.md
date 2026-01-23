# spec/31_PROVIDER_MODEL_POLICY.md

## 概要

Provider/Model の動的切り替えポリシーを定義する。
フェーズ別のモデル選択、失敗時のエスカレーション、使用状況の追跡を規定。

**Fail-Closed原則**: モデル切り替え失敗時は安全側（デフォルトモデル）に倒す。

---

## 1. Provider/Model 構造

### 1.1 サポートするProvider

| Provider | 説明 | モデル例 |
|----------|------|---------|
| `openai` | OpenAI API | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| `anthropic` | Anthropic API | claude-3-5-sonnet, claude-3-haiku |
| `claude-code` | Claude Code CLI | - |

### 1.2 データモデル

```typescript
interface ProviderConfig {
  /** Provider ID */
  provider: Provider;

  /** API Key（環境変数名 or 直接値） */
  api_key: string | { env: string };

  /** Base URL（カスタムエンドポイント用） */
  base_url?: string;

  /** 組織ID（OpenAI等） */
  organization_id?: string;

  /** 有効/無効 */
  enabled: boolean;

  /** 優先度（数値が小さいほど高優先） */
  priority: number;
}

interface ModelConfig {
  /** モデルID */
  model_id: string;

  /** Provider */
  provider: Provider;

  /** モデルカテゴリ */
  category: ModelCategory;

  /** コスト（相対値、1000トークンあたり） */
  cost_per_1k_tokens: {
    input: number;
    output: number;
  };

  /** 最大コンテキスト長 */
  max_context_tokens: number;

  /** 最大出力長 */
  max_output_tokens: number;

  /** 特性 */
  capabilities: ModelCapabilities;
}

type Provider = 'openai' | 'anthropic' | 'claude-code';

type ModelCategory =
  | 'planning'      // 計画・分析用（高速・低コスト）
  | 'standard'      // 標準実装用
  | 'advanced'      // 複雑なタスク用（高品質・高コスト）
  | 'fallback';     // フォールバック用

interface ModelCapabilities {
  /** 推論能力（1-10） */
  reasoning: number;

  /** コーディング能力（1-10） */
  coding: number;

  /** 速度（1-10、高いほど速い） */
  speed: number;

  /** コスト効率（1-10、高いほど安い） */
  cost_efficiency: number;
}
```

---

## 2. フェーズ別モデル選択

### 2.1 フェーズとモデルカテゴリの対応

| フェーズ | デフォルトカテゴリ | 理由 |
|---------|------------------|------|
| PLANNING | `planning` | 高速・低コスト優先 |
| SIZE_ESTIMATION | `planning` | 分析タスク、高速優先 |
| CHUNKING_DECISION | `planning` | 判断タスク、高速優先 |
| IMPLEMENTATION | `standard` | バランス重視 |
| QUALITY_CHECK | `standard` | 品質判定、精度重視 |
| RETRY | `advanced` | 難しいタスク、品質重視 |
| ESCALATION_PREP | `standard` | レポート生成 |

### 2.2 ModelSelection データモデル

```typescript
interface ModelSelection {
  /** 選択されたモデル */
  model_id: string;

  /** Provider */
  provider: Provider;

  /** 選択理由 */
  reason: SelectionReason;

  /** フェーズ */
  phase: TaskPhase;

  /** 選択時刻 */
  selected_at: string;
}

type SelectionReason =
  | 'PHASE_DEFAULT'       // フェーズのデフォルト
  | 'PROFILE_OVERRIDE'    // プロファイルによる上書き
  | 'RETRY_ESCALATION'    // リトライによるエスカレーション
  | 'FALLBACK'            // フォールバック
  | 'USER_OVERRIDE';      // ユーザー指定

type TaskPhase =
  | 'PLANNING'
  | 'SIZE_ESTIMATION'
  | 'CHUNKING_DECISION'
  | 'IMPLEMENTATION'
  | 'QUALITY_CHECK'
  | 'RETRY'
  | 'ESCALATION_PREP';
```

### 2.3 選択ロジック

```typescript
function selectModel(
  phase: TaskPhase,
  profile: ModelProfile,
  context: SelectionContext
): ModelSelection {
  // 1. ユーザー指定があれば優先
  if (context.user_override) {
    return {
      model_id: context.user_override,
      provider: getProviderForModel(context.user_override),
      reason: 'USER_OVERRIDE',
      phase,
      selected_at: new Date().toISOString()
    };
  }

  // 2. リトライエスカレーション
  if (context.retry_count > 0 && phase === 'RETRY') {
    const escalated = escalateModel(
      context.previous_model,
      context.retry_count,
      profile
    );
    if (escalated) {
      return {
        model_id: escalated.model_id,
        provider: escalated.provider,
        reason: 'RETRY_ESCALATION',
        phase,
        selected_at: new Date().toISOString()
      };
    }
  }

  // 3. プロファイルのフェーズ設定
  const phaseConfig = profile.phase_models[phase];
  if (phaseConfig) {
    return {
      model_id: phaseConfig.model_id,
      provider: phaseConfig.provider,
      reason: 'PROFILE_OVERRIDE',
      phase,
      selected_at: new Date().toISOString()
    };
  }

  // 4. デフォルトカテゴリから選択
  const category = getDefaultCategory(phase);
  const model = getModelByCategory(category, profile);

  return {
    model_id: model.model_id,
    provider: model.provider,
    reason: 'PHASE_DEFAULT',
    phase,
    selected_at: new Date().toISOString()
  };
}
```

---

## 3. モデルプロファイル

### 3.1 プリセットプロファイル

```typescript
interface ModelProfile {
  /** プロファイル名 */
  name: string;

  /** 説明 */
  description: string;

  /** カテゴリ別デフォルトモデル */
  category_defaults: Record<ModelCategory, ModelReference>;

  /** フェーズ別モデル（オプション） */
  phase_models?: Partial<Record<TaskPhase, ModelReference>>;

  /** エスカレーション設定 */
  escalation: EscalationConfig;

  /** コスト上限（日次、USD） */
  daily_cost_limit?: number;
}

interface ModelReference {
  model_id: string;
  provider: Provider;
}

interface EscalationConfig {
  /** エスカレーション有効 */
  enabled: boolean;

  /** リトライ回数閾値 */
  retry_threshold: number;

  /** エスカレーション先 */
  escalation_path: ModelReference[];
}
```

### 3.2 stable プロファイル

```typescript
const STABLE_PROFILE: ModelProfile = {
  name: 'stable',
  description: '安定性と品質を重視したプロファイル',
  category_defaults: {
    planning: { model_id: 'gpt-4o-mini', provider: 'openai' },
    standard: { model_id: 'gpt-4o', provider: 'openai' },
    advanced: { model_id: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
    fallback: { model_id: 'gpt-4o', provider: 'openai' }
  },
  escalation: {
    enabled: true,
    retry_threshold: 2,
    escalation_path: [
      { model_id: 'gpt-4o', provider: 'openai' },
      { model_id: 'claude-3-5-sonnet-20241022', provider: 'anthropic' }
    ]
  },
  daily_cost_limit: 50.0
};
```

### 3.3 cheap プロファイル

```typescript
const CHEAP_PROFILE: ModelProfile = {
  name: 'cheap',
  description: 'コスト効率を重視したプロファイル',
  category_defaults: {
    planning: { model_id: 'gpt-4o-mini', provider: 'openai' },
    standard: { model_id: 'gpt-4o-mini', provider: 'openai' },
    advanced: { model_id: 'gpt-4o', provider: 'openai' },
    fallback: { model_id: 'gpt-4o-mini', provider: 'openai' }
  },
  phase_models: {
    // 実装フェーズのみ標準モデル
    IMPLEMENTATION: { model_id: 'gpt-4o', provider: 'openai' }
  },
  escalation: {
    enabled: true,
    retry_threshold: 3,
    escalation_path: [
      { model_id: 'gpt-4o', provider: 'openai' }
    ]
  },
  daily_cost_limit: 10.0
};
```

### 3.4 fast プロファイル

```typescript
const FAST_PROFILE: ModelProfile = {
  name: 'fast',
  description: '速度を重視したプロファイル',
  category_defaults: {
    planning: { model_id: 'claude-3-haiku-20240307', provider: 'anthropic' },
    standard: { model_id: 'gpt-4o-mini', provider: 'openai' },
    advanced: { model_id: 'gpt-4o', provider: 'openai' },
    fallback: { model_id: 'gpt-4o-mini', provider: 'openai' }
  },
  escalation: {
    enabled: true,
    retry_threshold: 2,
    escalation_path: [
      { model_id: 'gpt-4o', provider: 'openai' }
    ]
  },
  daily_cost_limit: 30.0
};
```

---

## 4. 自動エスカレーション

### 4.1 エスカレーショントリガー

| トリガー | 説明 | アクション |
|---------|------|-----------|
| リトライ閾値超過 | `retry_count >= retry_threshold` | 上位モデルに切り替え |
| 品質基準未達 | Q1-Q6 連続失敗 | 上位モデルに切り替え |
| タイムアウト | 応答時間超過 | 高速モデルに切り替え |
| コンテキスト超過 | 入力トークン超過 | 大コンテキストモデルに切り替え |

### 4.2 エスカレーションロジック

```typescript
interface EscalationContext {
  current_model: ModelReference;
  retry_count: number;
  failure_reasons: FailureType[];
  context_tokens: number;
}

function escalateModel(
  current: ModelReference,
  retryCount: number,
  profile: ModelProfile
): ModelReference | null {
  if (!profile.escalation.enabled) {
    return null;
  }

  if (retryCount < profile.escalation.retry_threshold) {
    return null;
  }

  // エスカレーションパスから次のモデルを探す
  const currentIndex = profile.escalation.escalation_path.findIndex(
    m => m.model_id === current.model_id && m.provider === current.provider
  );

  if (currentIndex === -1) {
    // 現在のモデルがパスにない場合、パスの最初から
    return profile.escalation.escalation_path[0];
  }

  if (currentIndex >= profile.escalation.escalation_path.length - 1) {
    // すでに最上位モデル
    return null;
  }

  // 次のモデルに切り替え
  return profile.escalation.escalation_path[currentIndex + 1];
}
```

### 4.3 コンテキスト超過時の切り替え

```typescript
function handleContextOverflow(
  context: EscalationContext,
  availableModels: ModelConfig[]
): ModelReference | null {
  // 現在のモデルより大きなコンテキストを持つモデルを探す
  const currentModel = availableModels.find(
    m => m.model_id === context.current_model.model_id
  );

  if (!currentModel) {
    return null;
  }

  const largerModels = availableModels
    .filter(m => m.max_context_tokens > currentModel.max_context_tokens)
    .sort((a, b) => a.max_context_tokens - b.max_context_tokens);

  if (largerModels.length === 0) {
    return null;
  }

  // 最小の十分なモデルを選択
  const suitable = largerModels.find(
    m => m.max_context_tokens >= context.context_tokens
  );

  return suitable
    ? { model_id: suitable.model_id, provider: suitable.provider }
    : null;
}
```

---

## 5. 使用状況トラッキング

### 5.1 ModelUsage データモデル

```typescript
interface ModelUsage {
  /** 使用ID */
  usage_id: string;

  /** タスクID */
  task_id: string;

  /** サブタスクID（該当する場合） */
  subtask_id?: string;

  /** モデル情報 */
  model: ModelReference;

  /** フェーズ */
  phase: TaskPhase;

  /** 選択理由 */
  selection_reason: SelectionReason;

  /** トークン使用量 */
  tokens: {
    input: number;
    output: number;
    total: number;
  };

  /** コスト（USD） */
  cost: {
    input: number;
    output: number;
    total: number;
  };

  /** 実行時間（ms） */
  duration_ms: number;

  /** 結果 */
  result: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';

  /** タイムスタンプ */
  timestamp: string;
}
```

### 5.2 使用量集計

```typescript
interface UsageSummary {
  /** 集計期間 */
  period: {
    start: string;
    end: string;
  };

  /** タスク数 */
  task_count: number;

  /** モデル別使用量 */
  by_model: Record<string, {
    call_count: number;
    total_tokens: number;
    total_cost: number;
    avg_duration_ms: number;
    success_rate: number;
  }>;

  /** フェーズ別使用量 */
  by_phase: Record<TaskPhase, {
    call_count: number;
    total_tokens: number;
    total_cost: number;
  }>;

  /** 総コスト */
  total_cost: number;

  /** 総トークン */
  total_tokens: number;

  /** エスカレーション回数 */
  escalation_count: number;
}
```

### 5.3 コスト制限

```typescript
interface CostLimitCheck {
  /** 現在の使用量 */
  current_cost: number;

  /** 日次上限 */
  daily_limit: number;

  /** 残り予算 */
  remaining: number;

  /** 超過フラグ */
  exceeded: boolean;

  /** 警告フラグ（80%超過） */
  warning: boolean;
}

async function checkCostLimit(
  profile: ModelProfile
): Promise<CostLimitCheck> {
  if (!profile.daily_cost_limit) {
    return {
      current_cost: 0,
      daily_limit: Infinity,
      remaining: Infinity,
      exceeded: false,
      warning: false
    };
  }

  const todayUsage = await getTodayUsage();
  const currentCost = todayUsage.total_cost;

  return {
    current_cost: currentCost,
    daily_limit: profile.daily_cost_limit,
    remaining: profile.daily_cost_limit - currentCost,
    exceeded: currentCost >= profile.daily_cost_limit,
    warning: currentCost >= profile.daily_cost_limit * 0.8
  };
}
```

---

## 6. Conversation Trace イベント

### 6.1 モデル選択イベント

```typescript
// モデル選択
{
  "event": "MODEL_SELECTED",
  "timestamp": "2026-01-23T10:15:32.000Z",
  "task_id": "task-001",
  "data": {
    "model_id": "gpt-4o-mini",
    "provider": "openai",
    "phase": "PLANNING",
    "reason": "PHASE_DEFAULT",
    "profile": "stable"
  }
}

// モデル切り替え（エスカレーション）
{
  "event": "MODEL_SWITCH",
  "timestamp": "2026-01-23T10:20:00.000Z",
  "task_id": "task-001",
  "subtask_id": "subtask-002",
  "data": {
    "previous_model": {
      "model_id": "gpt-4o-mini",
      "provider": "openai"
    },
    "new_model": {
      "model_id": "gpt-4o",
      "provider": "openai"
    },
    "reason": "RETRY_ESCALATION",
    "retry_count": 2,
    "trigger": "retry_threshold_exceeded"
  }
}
```

### 6.2 使用量イベント

```typescript
// トークン使用量
{
  "event": "MODEL_USAGE",
  "timestamp": "2026-01-23T10:15:45.000Z",
  "task_id": "task-001",
  "data": {
    "model_id": "gpt-4o-mini",
    "provider": "openai",
    "phase": "PLANNING",
    "tokens": {
      "input": 1500,
      "output": 500,
      "total": 2000
    },
    "cost": {
      "input": 0.00015,
      "output": 0.00015,
      "total": 0.0003
    },
    "duration_ms": 2500,
    "result": "SUCCESS"
  }
}

// コスト警告
{
  "event": "COST_WARNING",
  "timestamp": "2026-01-23T18:00:00.000Z",
  "data": {
    "current_cost": 42.50,
    "daily_limit": 50.00,
    "usage_percentage": 85,
    "remaining": 7.50,
    "profile": "stable"
  }
}

// コスト上限到達
{
  "event": "COST_LIMIT_EXCEEDED",
  "timestamp": "2026-01-23T20:00:00.000Z",
  "data": {
    "current_cost": 50.25,
    "daily_limit": 50.00,
    "action": "SWITCH_TO_CHEAP_PROFILE",
    "message": "日次コスト上限に到達しました。cheap プロファイルに切り替えます。"
  }
}
```

### 6.3 フォールバックイベント

```typescript
// フォールバック発動
{
  "event": "MODEL_FALLBACK",
  "timestamp": "2026-01-23T10:25:00.000Z",
  "task_id": "task-001",
  "data": {
    "attempted_model": {
      "model_id": "claude-3-5-sonnet-20241022",
      "provider": "anthropic"
    },
    "fallback_model": {
      "model_id": "gpt-4o",
      "provider": "openai"
    },
    "reason": "API_ERROR",
    "error_message": "Rate limit exceeded"
  }
}
```

---

## 7. REPL コマンド

### 7.1 /model コマンド

```
/model                     現在のモデル設定を表示
/model list                利用可能なモデル一覧
/model set <model_id>      セッションのデフォルトモデルを設定
/model profile <name>      プロファイルを切り替え
/model usage               本日の使用量を表示
```

### 7.2 /provider コマンド

```
/provider                  現在のProvider設定を表示
/provider list             利用可能なProvider一覧
/provider status           各Providerの状態を表示
/provider priority <list>  優先度を設定（例: openai,anthropic）
```

### 7.3 表示例

```
$ /model

Current Model Configuration:
  Profile: stable
  Phase Models:
    PLANNING:        gpt-4o-mini (openai)
    IMPLEMENTATION:  gpt-4o (openai)
    RETRY:           claude-3-5-sonnet (anthropic)

Today's Usage:
  Total Cost:  $12.35 / $50.00 (24.7%)
  Total Tokens: 245,000
  Escalations: 2

$ /model usage

Model Usage Summary (Today):
┌────────────────────────────┬───────┬──────────┬─────────┬─────────┐
│ Model                      │ Calls │ Tokens   │ Cost    │ Success │
├────────────────────────────┼───────┼──────────┼─────────┼─────────┤
│ gpt-4o-mini (openai)       │ 45    │ 120,000  │ $2.40   │ 95.6%   │
│ gpt-4o (openai)            │ 12    │ 80,000   │ $6.40   │ 91.7%   │
│ claude-3-5-sonnet (anthr.) │ 3     │ 45,000   │ $3.55   │ 100.0%  │
└────────────────────────────┴───────┴──────────┴─────────┴─────────┘
  Total: 60 calls, 245,000 tokens, $12.35
```

---

## 8. 設定

### 8.1 グローバル設定

```json
{
  "model_policy": {
    "default_profile": "stable",
    "profiles": {
      "stable": { ... },
      "cheap": { ... },
      "fast": { ... }
    },
    "providers": {
      "openai": {
        "api_key": { "env": "OPENAI_API_KEY" },
        "enabled": true,
        "priority": 1
      },
      "anthropic": {
        "api_key": { "env": "ANTHROPIC_API_KEY" },
        "enabled": true,
        "priority": 2
      }
    },
    "models": {
      "gpt-4o": {
        "provider": "openai",
        "category": "standard",
        "cost_per_1k_tokens": { "input": 0.005, "output": 0.015 },
        "max_context_tokens": 128000,
        "max_output_tokens": 16384
      },
      "gpt-4o-mini": {
        "provider": "openai",
        "category": "planning",
        "cost_per_1k_tokens": { "input": 0.00015, "output": 0.0006 },
        "max_context_tokens": 128000,
        "max_output_tokens": 16384
      },
      "claude-3-5-sonnet-20241022": {
        "provider": "anthropic",
        "category": "advanced",
        "cost_per_1k_tokens": { "input": 0.003, "output": 0.015 },
        "max_context_tokens": 200000,
        "max_output_tokens": 8192
      }
    },
    "fallback": {
      "enabled": true,
      "order": ["openai", "anthropic"]
    },
    "cost_alerts": {
      "warning_threshold": 0.8,
      "action_on_limit": "switch_to_cheap"
    }
  }
}
```

### 8.2 タスク単位の設定

```typescript
interface TaskModelOverride {
  /** タスクID */
  task_id: string;

  /** モデル指定 */
  model?: ModelReference;

  /** プロファイル指定 */
  profile?: string;

  /** エスカレーション無効化 */
  disable_escalation?: boolean;
}

// 例: 特定タスクで高品質モデルを強制
const override: TaskModelOverride = {
  task_id: 'critical-task-001',
  model: { model_id: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
  disable_escalation: true
};
```

---

## 9. エラーハンドリング

### 9.1 Provider障害時のフォールバック

```typescript
async function executeWithFallback(
  request: LLMRequest,
  profile: ModelProfile
): Promise<LLMResponse> {
  const providers = getProvidersByPriority(profile);

  for (const provider of providers) {
    try {
      return await executeRequest(request, provider);
    } catch (error) {
      if (isRetryableError(error)) {
        // トレースにフォールバックを記録
        recordFallbackEvent(request.task_id, provider, error);
        continue;
      }
      throw error;
    }
  }

  throw new Error('All providers failed');
}
```

### 9.2 エラー種別と対応

| エラー | 対応 |
|--------|------|
| API Key無効 | ESCALATE（設定エラー） |
| レート制限 | バックオフ後リトライ、または別Providerへフォールバック |
| サービス障害 | 別Providerへフォールバック |
| コンテキスト超過 | 大コンテキストモデルへ切り替え |
| コスト上限 | cheap プロファイルへ切り替え |

---

## 10. 相互参照

- **spec/25_REVIEW_LOOP.md**: 品質判定結果によるエスカレーション
- **spec/29_TASK_PLANNING.md**: 計画フェーズのモデル選択
- **spec/30_RETRY_AND_RECOVERY.md**: リトライ時のモデルエスカレーション
- **spec/28_CONVERSATION_TRACE.md**: MODEL_* イベント記録
- **spec/10_REPL_UX.md**: /model, /provider コマンド

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0.0 | 2026-01-23 | 初版作成 |
