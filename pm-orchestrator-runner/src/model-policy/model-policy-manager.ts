/**
 * Model Policy Manager Module
 *
 * Per spec 31_PROVIDER_MODEL_POLICY.md
 *
 * Provides:
 * - Phase-based model selection
 * - Model profiles (stable, cheap, fast)
 * - Automatic escalation on retry
 * - Usage tracking and cost limits
 * - Provider fallback
 *
 * Fail-Closed Principle: When model switch fails, use default model.
 */

import type { ConversationTracer } from '../trace/conversation-tracer';
import type { FailureType } from '../retry/retry-manager';
import {
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  type ModelInfo,
} from '../models/repl/model-registry';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Provider type
 */
export type Provider = 'openai' | 'anthropic' | 'claude-code';

/**
 * Model category for phase-based selection
 */
export type ModelCategory =
  | 'planning'   // Fast, low-cost for analysis
  | 'standard'   // Balanced for implementation
  | 'advanced'   // High quality for complex tasks
  | 'fallback';  // Fallback option

/**
 * Task phase for model selection
 */
export type TaskPhase =
  | 'PLANNING'
  | 'SIZE_ESTIMATION'
  | 'CHUNKING_DECISION'
  | 'IMPLEMENTATION'
  | 'QUALITY_CHECK'
  | 'RETRY'
  | 'ESCALATION_PREP';

/**
 * Selection reason for audit trail
 */
export type SelectionReason =
  | 'PHASE_DEFAULT'      // Default for the phase
  | 'PROFILE_OVERRIDE'   // Profile configuration override
  | 'RETRY_ESCALATION'   // Escalated due to retry
  | 'FALLBACK'           // Fallback due to error
  | 'USER_OVERRIDE'      // User-specified model
  | 'CONTEXT_OVERFLOW'   // Switched for larger context
  | 'COST_LIMIT';        // Switched due to cost limit

/**
 * Model reference (ID + provider)
 */
export interface ModelReference {
  model_id: string;
  provider: Provider;
}

/**
 * Model selection result
 */
export interface ModelSelection {
  model_id: string;
  provider: Provider;
  reason: SelectionReason;
  phase: TaskPhase;
  selected_at: string;
}

/**
 * Model capabilities for comparison
 */
export interface ModelCapabilities {
  /** Reasoning ability (1-10) */
  reasoning: number;

  /** Coding ability (1-10) */
  coding: number;

  /** Speed (1-10, higher = faster) */
  speed: number;

  /** Cost efficiency (1-10, higher = cheaper) */
  cost_efficiency: number;
}

/**
 * Extended model configuration
 */
export interface ModelConfig {
  model_id: string;
  provider: Provider;
  category: ModelCategory;
  cost_per_1k_tokens: {
    input: number;
    output: number;
  };
  max_context_tokens: number;
  max_output_tokens: number;
  capabilities: ModelCapabilities;
}

/**
 * Escalation configuration
 */
export interface EscalationConfig {
  /** Enable escalation */
  enabled: boolean;

  /** Retry count threshold to trigger escalation */
  retry_threshold: number;

  /** Escalation path (ordered list of models) */
  escalation_path: ModelReference[];
}

/**
 * Model profile for presets
 */
export interface ModelProfile {
  name: string;
  description: string;
  category_defaults: Record<ModelCategory, ModelReference>;
  phase_models?: Partial<Record<TaskPhase, ModelReference>>;
  escalation: EscalationConfig;
  daily_cost_limit?: number;
}

/**
 * Model usage record
 */
export interface ModelUsage {
  usage_id: string;
  task_id: string;
  subtask_id?: string;
  model: ModelReference;
  phase: TaskPhase;
  selection_reason: SelectionReason;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: {
    input: number;
    output: number;
    total: number;
  };
  duration_ms: number;
  result: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
  timestamp: string;
}

/**
 * Usage summary
 */
export interface UsageSummary {
  period: {
    start: string;
    end: string;
  };
  task_count: number;
  by_model: Record<string, {
    call_count: number;
    total_tokens: number;
    total_cost: number;
    avg_duration_ms: number;
    success_rate: number;
  }>;
  by_phase: Partial<Record<TaskPhase, {
    call_count: number;
    total_tokens: number;
    total_cost: number;
  }>>;
  total_cost: number;
  total_tokens: number;
  escalation_count: number;
}

/**
 * Cost limit check result
 */
export interface CostLimitCheck {
  current_cost: number;
  daily_limit: number;
  remaining: number;
  exceeded: boolean;
  warning: boolean;
}

/**
 * Selection context for model selection
 */
export interface SelectionContext {
  task_id: string;
  subtask_id?: string;
  retry_count: number;
  previous_model?: ModelReference;
  context_tokens?: number;
  user_override?: string;
  failure_reasons?: FailureType[];
}

/**
 * Model policy event for tracing
 */
export type ModelPolicyEvent =
  | { type: 'MODEL_SELECTED'; selection: ModelSelection; task_id: string; subtask_id?: string; profile: string }
  | { type: 'MODEL_SWITCH'; previous: ModelReference; next: ModelReference; reason: SelectionReason; task_id: string; retry_count: number }
  | { type: 'MODEL_USAGE'; usage: ModelUsage }
  | { type: 'MODEL_FALLBACK'; attempted: ModelReference; fallback: ModelReference; reason: string; error_message: string }
  | { type: 'COST_WARNING'; current_cost: number; daily_limit: number; usage_percentage: number }
  | { type: 'COST_LIMIT_EXCEEDED'; current_cost: number; daily_limit: number; action: string };

/**
 * Event callback
 */
export type ModelPolicyEventCallback = (event: ModelPolicyEvent) => void;

// ============================================================
// Model Configuration Database
// ============================================================

/**
 * Build model config from ModelInfo
 */
function buildModelConfig(
  info: ModelInfo,
  provider: Provider,
  category: ModelCategory,
  capabilities: ModelCapabilities
): ModelConfig {
  // Convert price per million to price per 1k
  const inputPer1k = info.inputPricePerMillion / 1000;
  const outputPer1k = info.outputPricePerMillion / 1000;

  // Parse context size (e.g., "128K" -> 128000)
  const contextMatch = info.contextSize.match(/(\d+)K/i);
  const maxContext = contextMatch ? parseInt(contextMatch[1]) * 1000 : 8000;

  return {
    model_id: info.id,
    provider,
    category,
    cost_per_1k_tokens: {
      input: inputPer1k,
      output: outputPer1k,
    },
    max_context_tokens: maxContext,
    max_output_tokens: 16384, // Default, varies by model
    capabilities,
  };
}

/**
 * Default model configurations
 */
export const MODEL_CONFIGS: ModelConfig[] = [
  // OpenAI models
  buildModelConfig(
    OPENAI_MODELS.find((m) => m.id === 'gpt-4o')!,
    'openai',
    'standard',
    { reasoning: 8, coding: 9, speed: 7, cost_efficiency: 5 }
  ),
  buildModelConfig(
    OPENAI_MODELS.find((m) => m.id === 'gpt-4o-mini')!,
    'openai',
    'planning',
    { reasoning: 7, coding: 7, speed: 9, cost_efficiency: 9 }
  ),
  buildModelConfig(
    OPENAI_MODELS.find((m) => m.id === 'gpt-4-turbo')!,
    'openai',
    'advanced',
    { reasoning: 9, coding: 9, speed: 6, cost_efficiency: 3 }
  ),
  // Anthropic models
  buildModelConfig(
    ANTHROPIC_MODELS.find((m) => m.id === 'claude-3-5-sonnet-20241022')!,
    'anthropic',
    'advanced',
    { reasoning: 9, coding: 10, speed: 7, cost_efficiency: 6 }
  ),
  buildModelConfig(
    ANTHROPIC_MODELS.find((m) => m.id === 'claude-3-haiku-20240307')!,
    'anthropic',
    'planning',
    { reasoning: 6, coding: 6, speed: 10, cost_efficiency: 10 }
  ),
];

// ============================================================
// Preset Profiles
// ============================================================

/**
 * Stable profile - balances quality and cost
 */
export const STABLE_PROFILE: ModelProfile = {
  name: 'stable',
  description: '安定性と品質を重視したプロファイル',
  category_defaults: {
    planning: { model_id: 'gpt-4o-mini', provider: 'openai' },
    standard: { model_id: 'gpt-4o', provider: 'openai' },
    advanced: { model_id: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
    fallback: { model_id: 'gpt-4o', provider: 'openai' },
  },
  escalation: {
    enabled: true,
    retry_threshold: 2,
    escalation_path: [
      { model_id: 'gpt-4o', provider: 'openai' },
      { model_id: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
    ],
  },
  daily_cost_limit: 50.0,
};

/**
 * Cheap profile - minimizes cost
 */
export const CHEAP_PROFILE: ModelProfile = {
  name: 'cheap',
  description: 'コスト効率を重視したプロファイル',
  category_defaults: {
    planning: { model_id: 'gpt-4o-mini', provider: 'openai' },
    standard: { model_id: 'gpt-4o-mini', provider: 'openai' },
    advanced: { model_id: 'gpt-4o', provider: 'openai' },
    fallback: { model_id: 'gpt-4o-mini', provider: 'openai' },
  },
  phase_models: {
    IMPLEMENTATION: { model_id: 'gpt-4o', provider: 'openai' },
  },
  escalation: {
    enabled: true,
    retry_threshold: 3,
    escalation_path: [{ model_id: 'gpt-4o', provider: 'openai' }],
  },
  daily_cost_limit: 10.0,
};

/**
 * Fast profile - prioritizes speed
 */
export const FAST_PROFILE: ModelProfile = {
  name: 'fast',
  description: '速度を重視したプロファイル',
  category_defaults: {
    planning: { model_id: 'claude-3-haiku-20240307', provider: 'anthropic' },
    standard: { model_id: 'gpt-4o-mini', provider: 'openai' },
    advanced: { model_id: 'gpt-4o', provider: 'openai' },
    fallback: { model_id: 'gpt-4o-mini', provider: 'openai' },
  },
  escalation: {
    enabled: true,
    retry_threshold: 2,
    escalation_path: [{ model_id: 'gpt-4o', provider: 'openai' }],
  },
  daily_cost_limit: 30.0,
};

/**
 * All preset profiles
 */
export const PRESET_PROFILES: Record<string, ModelProfile> = {
  stable: STABLE_PROFILE,
  cheap: CHEAP_PROFILE,
  fast: FAST_PROFILE,
};

// ============================================================
// Default Category Mapping
// ============================================================

/**
 * Map task phase to default model category
 */
export function getDefaultCategory(phase: TaskPhase): ModelCategory {
  switch (phase) {
    case 'PLANNING':
    case 'SIZE_ESTIMATION':
    case 'CHUNKING_DECISION':
      return 'planning';

    case 'IMPLEMENTATION':
    case 'QUALITY_CHECK':
    case 'ESCALATION_PREP':
      return 'standard';

    case 'RETRY':
      return 'advanced';

    default:
      return 'standard';
  }
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Get model config by ID
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODEL_CONFIGS.find((m) => m.model_id === modelId);
}

/**
 * Get model by category from profile
 */
export function getModelByCategory(
  category: ModelCategory,
  profile: ModelProfile
): ModelReference {
  return profile.category_defaults[category];
}

/**
 * Get provider for a model
 */
export function getProviderForModel(modelId: string): Provider {
  const config = getModelConfig(modelId);
  return config?.provider ?? 'openai';
}

/**
 * Escalate to a better model
 */
export function escalateModel(
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

  const path = profile.escalation.escalation_path;

  // Find current position in escalation path
  const currentIndex = path.findIndex(
    (m) => m.model_id === current.model_id && m.provider === current.provider
  );

  if (currentIndex === -1) {
    // Current model not in path, start from beginning
    return path[0] || null;
  }

  if (currentIndex >= path.length - 1) {
    // Already at top of escalation path
    return null;
  }

  // Move to next model in path
  return path[currentIndex + 1];
}

/**
 * Find a model with larger context
 */
export function findLargerContextModel(
  current: ModelReference,
  requiredTokens: number,
  availableModels: ModelConfig[]
): ModelReference | null {
  const currentConfig = availableModels.find(
    (m) => m.model_id === current.model_id
  );

  if (!currentConfig) {
    return null;
  }

  // Find models with larger context, sorted by context size
  const largerModels = availableModels
    .filter((m) => m.max_context_tokens > currentConfig.max_context_tokens)
    .sort((a, b) => a.max_context_tokens - b.max_context_tokens);

  // Find smallest model that fits
  const suitable = largerModels.find(
    (m) => m.max_context_tokens >= requiredTokens
  );

  return suitable
    ? { model_id: suitable.model_id, provider: suitable.provider }
    : null;
}

/**
 * Select a model for a task phase
 */
export function selectModel(
  phase: TaskPhase,
  profile: ModelProfile,
  context: SelectionContext
): ModelSelection {
  const now = new Date().toISOString();

  // 1. User override takes priority
  if (context.user_override) {
    return {
      model_id: context.user_override,
      provider: getProviderForModel(context.user_override),
      reason: 'USER_OVERRIDE',
      phase,
      selected_at: now,
    };
  }

  // 2. Check for retry escalation
  if (context.retry_count > 0 && phase === 'RETRY' && context.previous_model) {
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
        selected_at: now,
      };
    }
  }

  // 3. Check for context overflow
  if (context.context_tokens && context.previous_model) {
    const larger = findLargerContextModel(
      context.previous_model,
      context.context_tokens,
      MODEL_CONFIGS
    );
    if (larger) {
      return {
        model_id: larger.model_id,
        provider: larger.provider,
        reason: 'CONTEXT_OVERFLOW',
        phase,
        selected_at: now,
      };
    }
  }

  // 4. Check phase-specific model in profile
  const phaseModel = profile.phase_models?.[phase];
  if (phaseModel) {
    return {
      model_id: phaseModel.model_id,
      provider: phaseModel.provider,
      reason: 'PROFILE_OVERRIDE',
      phase,
      selected_at: now,
    };
  }

  // 5. Use default category model
  const category = getDefaultCategory(phase);
  const model = getModelByCategory(category, profile);

  return {
    model_id: model.model_id,
    provider: model.provider,
    reason: 'PHASE_DEFAULT',
    phase,
    selected_at: now,
  };
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): { input: number; output: number; total: number } {
  const config = getModelConfig(modelId);

  if (!config) {
    return { input: 0, output: 0, total: 0 };
  }

  const inputCost = (inputTokens / 1000) * config.cost_per_1k_tokens.input;
  const outputCost = (outputTokens / 1000) * config.cost_per_1k_tokens.output;

  return {
    input: Math.round(inputCost * 10000) / 10000, // Round to 4 decimal places
    output: Math.round(outputCost * 10000) / 10000,
    total: Math.round((inputCost + outputCost) * 10000) / 10000,
  };
}

// ============================================================
// ModelPolicyManager Class
// ============================================================

/**
 * Configuration for ModelPolicyManager
 */
export interface ModelPolicyManagerConfig {
  /** Default profile name */
  defaultProfile: string;

  /** Available profiles */
  profiles: Record<string, ModelProfile>;

  /** Available models */
  models: ModelConfig[];

  /** Fallback order for providers */
  fallbackOrder: Provider[];

  /** Cost warning threshold (0-1) */
  costWarningThreshold: number;

  /** Action on cost limit: 'switch_to_cheap' | 'stop' */
  costLimitAction: 'switch_to_cheap' | 'stop';
}

/**
 * Default configuration
 */
export const DEFAULT_MODEL_POLICY_CONFIG: ModelPolicyManagerConfig = {
  defaultProfile: 'stable',
  profiles: PRESET_PROFILES,
  models: MODEL_CONFIGS,
  fallbackOrder: ['openai', 'anthropic'],
  costWarningThreshold: 0.8,
  costLimitAction: 'switch_to_cheap',
};

/**
 * ModelPolicyManager - Manages model selection and usage tracking
 */
export class ModelPolicyManager {
  private config: ModelPolicyManagerConfig;
  private currentProfile: ModelProfile;
  private usageHistory: ModelUsage[];
  private escalationCount: number;
  private eventCallback?: ModelPolicyEventCallback;
  private conversationTracer?: ConversationTracer;

  constructor(
    config: Partial<ModelPolicyManagerConfig> = {},
    eventCallback?: ModelPolicyEventCallback,
    conversationTracer?: ConversationTracer
  ) {
    this.config = {
      ...DEFAULT_MODEL_POLICY_CONFIG,
      ...config,
    };

    // Initialize with default profile
    const profileName = this.config.defaultProfile;
    this.currentProfile =
      this.config.profiles[profileName] || STABLE_PROFILE;

    this.usageHistory = [];
    this.escalationCount = 0;
    this.eventCallback = eventCallback;
    this.conversationTracer = conversationTracer;
  }

  /**
   * Emit an event
   */
  private emitEvent(event: ModelPolicyEvent): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch (e) {
        // Ignore callback errors
      }
    }

    // Note: ConversationTracer integration for model policy events
    // could be added here when specific event types are defined in the tracer
  }

  /**
   * Select a model for a task phase
   */
  select(
    phase: TaskPhase,
    context: SelectionContext
  ): ModelSelection {
    // Check cost limit first
    const costCheck = this.checkCostLimit();
    if (costCheck.exceeded) {
      this.emitEvent({
        type: 'COST_LIMIT_EXCEEDED',
        current_cost: costCheck.current_cost,
        daily_limit: costCheck.daily_limit,
        action: this.config.costLimitAction,
      });

      if (this.config.costLimitAction === 'switch_to_cheap') {
        this.setProfile('cheap');
      }
    } else if (costCheck.warning) {
      this.emitEvent({
        type: 'COST_WARNING',
        current_cost: costCheck.current_cost,
        daily_limit: costCheck.daily_limit,
        usage_percentage: Math.round(
          (costCheck.current_cost / costCheck.daily_limit) * 100
        ),
      });
    }

    const selection = selectModel(phase, this.currentProfile, context);

    // Track escalation
    if (selection.reason === 'RETRY_ESCALATION') {
      this.escalationCount++;

      if (context.previous_model) {
        this.emitEvent({
          type: 'MODEL_SWITCH',
          previous: context.previous_model,
          next: { model_id: selection.model_id, provider: selection.provider },
          reason: selection.reason,
          task_id: context.task_id,
          retry_count: context.retry_count,
        });
      }
    }

    // Emit selection event
    this.emitEvent({
      type: 'MODEL_SELECTED',
      selection,
      task_id: context.task_id,
      subtask_id: context.subtask_id,
      profile: this.currentProfile.name,
    });

    return selection;
  }

  /**
   * Record model usage
   */
  recordUsage(
    taskId: string,
    subtaskId: string | undefined,
    selection: ModelSelection,
    inputTokens: number,
    outputTokens: number,
    durationMs: number,
    result: 'SUCCESS' | 'FAILURE' | 'TIMEOUT'
  ): ModelUsage {
    const cost = calculateCost(selection.model_id, inputTokens, outputTokens);

    const usage: ModelUsage = {
      usage_id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      task_id: taskId,
      subtask_id: subtaskId,
      model: { model_id: selection.model_id, provider: selection.provider },
      phase: selection.phase,
      selection_reason: selection.reason,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      cost,
      duration_ms: durationMs,
      result,
      timestamp: new Date().toISOString(),
    };

    this.usageHistory.push(usage);

    this.emitEvent({
      type: 'MODEL_USAGE',
      usage,
    });

    return usage;
  }

  /**
   * Record a fallback event
   */
  recordFallback(
    attempted: ModelReference,
    fallback: ModelReference,
    reason: string,
    errorMessage: string
  ): void {
    this.emitEvent({
      type: 'MODEL_FALLBACK',
      attempted,
      fallback,
      reason,
      error_message: errorMessage,
    });
  }

  /**
   * Set the active profile
   */
  setProfile(profileName: string): boolean {
    const profile = this.config.profiles[profileName];
    if (!profile) {
      return false;
    }
    this.currentProfile = profile;
    return true;
  }

  /**
   * Get the active profile
   */
  getProfile(): ModelProfile {
    return this.currentProfile;
  }

  /**
   * Get all available profiles
   */
  getAvailableProfiles(): string[] {
    return Object.keys(this.config.profiles);
  }

  /**
   * Check cost limit
   */
  checkCostLimit(): CostLimitCheck {
    const limit = this.currentProfile.daily_cost_limit;

    if (!limit) {
      return {
        current_cost: 0,
        daily_limit: Infinity,
        remaining: Infinity,
        exceeded: false,
        warning: false,
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayUsage = this.usageHistory.filter(
      (u) => new Date(u.timestamp) >= todayStart
    );

    const currentCost = todayUsage.reduce((sum, u) => sum + u.cost.total, 0);

    return {
      current_cost: Math.round(currentCost * 100) / 100,
      daily_limit: limit,
      remaining: Math.max(0, Math.round((limit - currentCost) * 100) / 100),
      exceeded: currentCost >= limit,
      warning: currentCost >= limit * this.config.costWarningThreshold,
    };
  }

  /**
   * Get usage summary for a period
   */
  getUsageSummary(startDate?: Date, endDate?: Date): UsageSummary {
    const start = startDate || new Date(0);
    const end = endDate || new Date();

    const filtered = this.usageHistory.filter((u) => {
      const ts = new Date(u.timestamp);
      return ts >= start && ts <= end;
    });

    // Calculate by-model stats
    const byModel: UsageSummary['by_model'] = {};
    for (const usage of filtered) {
      const key = `${usage.model.model_id}:${usage.model.provider}`;
      if (!byModel[key]) {
        byModel[key] = {
          call_count: 0,
          total_tokens: 0,
          total_cost: 0,
          avg_duration_ms: 0,
          success_rate: 0,
        };
      }
      byModel[key].call_count++;
      byModel[key].total_tokens += usage.tokens.total;
      byModel[key].total_cost += usage.cost.total;
    }

    // Calculate averages and success rates
    for (const key of Object.keys(byModel)) {
      const modelUsages = filtered.filter(
        (u) => `${u.model.model_id}:${u.model.provider}` === key
      );
      const totalDuration = modelUsages.reduce(
        (sum, u) => sum + u.duration_ms,
        0
      );
      const successCount = modelUsages.filter(
        (u) => u.result === 'SUCCESS'
      ).length;

      byModel[key].avg_duration_ms = Math.round(
        totalDuration / modelUsages.length
      );
      byModel[key].success_rate =
        Math.round((successCount / modelUsages.length) * 1000) / 10;
    }

    // Calculate by-phase stats
    const byPhase: UsageSummary['by_phase'] = {};
    for (const usage of filtered) {
      if (!byPhase[usage.phase]) {
        byPhase[usage.phase] = {
          call_count: 0,
          total_tokens: 0,
          total_cost: 0,
        };
      }
      byPhase[usage.phase]!.call_count++;
      byPhase[usage.phase]!.total_tokens += usage.tokens.total;
      byPhase[usage.phase]!.total_cost += usage.cost.total;
    }

    // Get unique task IDs
    const taskIds = new Set(filtered.map((u) => u.task_id));

    return {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      task_count: taskIds.size,
      by_model: byModel,
      by_phase: byPhase,
      total_cost: Math.round(
        filtered.reduce((sum, u) => sum + u.cost.total, 0) * 100
      ) / 100,
      total_tokens: filtered.reduce((sum, u) => sum + u.tokens.total, 0),
      escalation_count: this.escalationCount,
    };
  }

  /**
   * Get today's usage summary
   */
  getTodayUsage(): UsageSummary {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return this.getUsageSummary(todayStart);
  }

  /**
   * Get model config
   */
  getModelConfig(modelId: string): ModelConfig | undefined {
    return this.config.models.find((m) => m.model_id === modelId);
  }

  /**
   * Get all available models
   */
  getAvailableModels(): ModelConfig[] {
    return this.config.models;
  }

  /**
   * Get fallback model for a provider error
   */
  getFallbackModel(failedProvider: Provider): ModelReference | null {
    const fallbackOrder = this.config.fallbackOrder.filter(
      (p) => p !== failedProvider
    );

    for (const provider of fallbackOrder) {
      const models = this.config.models.filter((m) => m.provider === provider);
      const fallback = models.find((m) => m.category === 'fallback');
      if (fallback) {
        return { model_id: fallback.model_id, provider: fallback.provider };
      }
      if (models.length > 0) {
        return { model_id: models[0].model_id, provider: models[0].provider };
      }
    }

    return null;
  }

  /**
   * Reset usage history (for testing)
   */
  resetUsage(): void {
    this.usageHistory = [];
    this.escalationCount = 0;
  }

  /**
   * Get configuration
   */
  getConfig(): ModelPolicyManagerConfig {
    return { ...this.config };
  }
}
