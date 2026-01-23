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
/**
 * Provider type
 */
export type Provider = 'openai' | 'anthropic' | 'claude-code';
/**
 * Model category for phase-based selection
 */
export type ModelCategory = 'planning' | 'standard' | 'advanced' | 'fallback';
/**
 * Task phase for model selection
 */
export type TaskPhase = 'PLANNING' | 'SIZE_ESTIMATION' | 'CHUNKING_DECISION' | 'IMPLEMENTATION' | 'QUALITY_CHECK' | 'RETRY' | 'ESCALATION_PREP';
/**
 * Selection reason for audit trail
 */
export type SelectionReason = 'PHASE_DEFAULT' | 'PROFILE_OVERRIDE' | 'RETRY_ESCALATION' | 'FALLBACK' | 'USER_OVERRIDE' | 'CONTEXT_OVERFLOW' | 'COST_LIMIT';
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
export type ModelPolicyEvent = {
    type: 'MODEL_SELECTED';
    selection: ModelSelection;
    task_id: string;
    subtask_id?: string;
    profile: string;
} | {
    type: 'MODEL_SWITCH';
    previous: ModelReference;
    next: ModelReference;
    reason: SelectionReason;
    task_id: string;
    retry_count: number;
} | {
    type: 'MODEL_USAGE';
    usage: ModelUsage;
} | {
    type: 'MODEL_FALLBACK';
    attempted: ModelReference;
    fallback: ModelReference;
    reason: string;
    error_message: string;
} | {
    type: 'COST_WARNING';
    current_cost: number;
    daily_limit: number;
    usage_percentage: number;
} | {
    type: 'COST_LIMIT_EXCEEDED';
    current_cost: number;
    daily_limit: number;
    action: string;
};
/**
 * Event callback
 */
export type ModelPolicyEventCallback = (event: ModelPolicyEvent) => void;
/**
 * Default model configurations
 */
export declare const MODEL_CONFIGS: ModelConfig[];
/**
 * Stable profile - balances quality and cost
 */
export declare const STABLE_PROFILE: ModelProfile;
/**
 * Cheap profile - minimizes cost
 */
export declare const CHEAP_PROFILE: ModelProfile;
/**
 * Fast profile - prioritizes speed
 */
export declare const FAST_PROFILE: ModelProfile;
/**
 * All preset profiles
 */
export declare const PRESET_PROFILES: Record<string, ModelProfile>;
/**
 * Map task phase to default model category
 */
export declare function getDefaultCategory(phase: TaskPhase): ModelCategory;
/**
 * Get model config by ID
 */
export declare function getModelConfig(modelId: string): ModelConfig | undefined;
/**
 * Get model by category from profile
 */
export declare function getModelByCategory(category: ModelCategory, profile: ModelProfile): ModelReference;
/**
 * Get provider for a model
 */
export declare function getProviderForModel(modelId: string): Provider;
/**
 * Escalate to a better model
 */
export declare function escalateModel(current: ModelReference, retryCount: number, profile: ModelProfile): ModelReference | null;
/**
 * Find a model with larger context
 */
export declare function findLargerContextModel(current: ModelReference, requiredTokens: number, availableModels: ModelConfig[]): ModelReference | null;
/**
 * Select a model for a task phase
 */
export declare function selectModel(phase: TaskPhase, profile: ModelProfile, context: SelectionContext): ModelSelection;
/**
 * Calculate cost for token usage
 */
export declare function calculateCost(modelId: string, inputTokens: number, outputTokens: number): {
    input: number;
    output: number;
    total: number;
};
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
export declare const DEFAULT_MODEL_POLICY_CONFIG: ModelPolicyManagerConfig;
/**
 * ModelPolicyManager - Manages model selection and usage tracking
 */
export declare class ModelPolicyManager {
    private config;
    private currentProfile;
    private usageHistory;
    private escalationCount;
    private eventCallback?;
    private conversationTracer?;
    constructor(config?: Partial<ModelPolicyManagerConfig>, eventCallback?: ModelPolicyEventCallback, conversationTracer?: ConversationTracer);
    /**
     * Emit an event
     */
    private emitEvent;
    /**
     * Select a model for a task phase
     */
    select(phase: TaskPhase, context: SelectionContext): ModelSelection;
    /**
     * Record model usage
     */
    recordUsage(taskId: string, subtaskId: string | undefined, selection: ModelSelection, inputTokens: number, outputTokens: number, durationMs: number, result: 'SUCCESS' | 'FAILURE' | 'TIMEOUT'): ModelUsage;
    /**
     * Record a fallback event
     */
    recordFallback(attempted: ModelReference, fallback: ModelReference, reason: string, errorMessage: string): void;
    /**
     * Set the active profile
     */
    setProfile(profileName: string): boolean;
    /**
     * Get the active profile
     */
    getProfile(): ModelProfile;
    /**
     * Get all available profiles
     */
    getAvailableProfiles(): string[];
    /**
     * Check cost limit
     */
    checkCostLimit(): CostLimitCheck;
    /**
     * Get usage summary for a period
     */
    getUsageSummary(startDate?: Date, endDate?: Date): UsageSummary;
    /**
     * Get today's usage summary
     */
    getTodayUsage(): UsageSummary;
    /**
     * Get model config
     */
    getModelConfig(modelId: string): ModelConfig | undefined;
    /**
     * Get all available models
     */
    getAvailableModels(): ModelConfig[];
    /**
     * Get fallback model for a provider error
     */
    getFallbackModel(failedProvider: Provider): ModelReference | null;
    /**
     * Reset usage history (for testing)
     */
    resetUsage(): void;
    /**
     * Get configuration
     */
    getConfig(): ModelPolicyManagerConfig;
}
//# sourceMappingURL=model-policy-manager.d.ts.map