"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelPolicyManager = exports.DEFAULT_MODEL_POLICY_CONFIG = exports.PRESET_PROFILES = exports.FAST_PROFILE = exports.CHEAP_PROFILE = exports.STABLE_PROFILE = exports.MODEL_CONFIGS = void 0;
exports.getDefaultCategory = getDefaultCategory;
exports.getModelConfig = getModelConfig;
exports.getModelByCategory = getModelByCategory;
exports.getProviderForModel = getProviderForModel;
exports.escalateModel = escalateModel;
exports.findLargerContextModel = findLargerContextModel;
exports.selectModel = selectModel;
exports.calculateCost = calculateCost;
const model_registry_1 = require("../models/repl/model-registry");
// ============================================================
// Model Configuration Database
// ============================================================
/**
 * Build model config from ModelInfo
 */
function buildModelConfig(info, provider, category, capabilities) {
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
exports.MODEL_CONFIGS = [
    // OpenAI models
    buildModelConfig(model_registry_1.OPENAI_MODELS.find((m) => m.id === 'gpt-4o'), 'openai', 'standard', { reasoning: 8, coding: 9, speed: 7, cost_efficiency: 5 }),
    buildModelConfig(model_registry_1.OPENAI_MODELS.find((m) => m.id === 'gpt-4o-mini'), 'openai', 'planning', { reasoning: 7, coding: 7, speed: 9, cost_efficiency: 9 }),
    buildModelConfig(model_registry_1.OPENAI_MODELS.find((m) => m.id === 'gpt-4-turbo'), 'openai', 'advanced', { reasoning: 9, coding: 9, speed: 6, cost_efficiency: 3 }),
    // Anthropic models
    buildModelConfig(model_registry_1.ANTHROPIC_MODELS.find((m) => m.id === 'claude-3-5-sonnet-20241022'), 'anthropic', 'advanced', { reasoning: 9, coding: 10, speed: 7, cost_efficiency: 6 }),
    buildModelConfig(model_registry_1.ANTHROPIC_MODELS.find((m) => m.id === 'claude-3-haiku-20240307'), 'anthropic', 'planning', { reasoning: 6, coding: 6, speed: 10, cost_efficiency: 10 }),
];
// ============================================================
// Preset Profiles
// ============================================================
/**
 * Stable profile - balances quality and cost
 */
exports.STABLE_PROFILE = {
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
exports.CHEAP_PROFILE = {
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
exports.FAST_PROFILE = {
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
exports.PRESET_PROFILES = {
    stable: exports.STABLE_PROFILE,
    cheap: exports.CHEAP_PROFILE,
    fast: exports.FAST_PROFILE,
};
// ============================================================
// Default Category Mapping
// ============================================================
/**
 * Map task phase to default model category
 */
function getDefaultCategory(phase) {
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
function getModelConfig(modelId) {
    return exports.MODEL_CONFIGS.find((m) => m.model_id === modelId);
}
/**
 * Get model by category from profile
 */
function getModelByCategory(category, profile) {
    return profile.category_defaults[category];
}
/**
 * Get provider for a model
 */
function getProviderForModel(modelId) {
    const config = getModelConfig(modelId);
    return config?.provider ?? 'openai';
}
/**
 * Escalate to a better model
 */
function escalateModel(current, retryCount, profile) {
    if (!profile.escalation.enabled) {
        return null;
    }
    if (retryCount < profile.escalation.retry_threshold) {
        return null;
    }
    const path = profile.escalation.escalation_path;
    // Find current position in escalation path
    const currentIndex = path.findIndex((m) => m.model_id === current.model_id && m.provider === current.provider);
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
function findLargerContextModel(current, requiredTokens, availableModels) {
    const currentConfig = availableModels.find((m) => m.model_id === current.model_id);
    if (!currentConfig) {
        return null;
    }
    // Find models with larger context, sorted by context size
    const largerModels = availableModels
        .filter((m) => m.max_context_tokens > currentConfig.max_context_tokens)
        .sort((a, b) => a.max_context_tokens - b.max_context_tokens);
    // Find smallest model that fits
    const suitable = largerModels.find((m) => m.max_context_tokens >= requiredTokens);
    return suitable
        ? { model_id: suitable.model_id, provider: suitable.provider }
        : null;
}
/**
 * Select a model for a task phase
 */
function selectModel(phase, profile, context) {
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
        const escalated = escalateModel(context.previous_model, context.retry_count, profile);
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
        const larger = findLargerContextModel(context.previous_model, context.context_tokens, exports.MODEL_CONFIGS);
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
function calculateCost(modelId, inputTokens, outputTokens) {
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
/**
 * Default configuration
 */
exports.DEFAULT_MODEL_POLICY_CONFIG = {
    defaultProfile: 'stable',
    profiles: exports.PRESET_PROFILES,
    models: exports.MODEL_CONFIGS,
    fallbackOrder: ['openai', 'anthropic'],
    costWarningThreshold: 0.8,
    costLimitAction: 'switch_to_cheap',
};
/**
 * ModelPolicyManager - Manages model selection and usage tracking
 */
class ModelPolicyManager {
    config;
    currentProfile;
    usageHistory;
    escalationCount;
    eventCallback;
    conversationTracer;
    constructor(config = {}, eventCallback, conversationTracer) {
        this.config = {
            ...exports.DEFAULT_MODEL_POLICY_CONFIG,
            ...config,
        };
        // Initialize with default profile
        const profileName = this.config.defaultProfile;
        this.currentProfile =
            this.config.profiles[profileName] || exports.STABLE_PROFILE;
        this.usageHistory = [];
        this.escalationCount = 0;
        this.eventCallback = eventCallback;
        this.conversationTracer = conversationTracer;
    }
    /**
     * Emit an event
     */
    emitEvent(event) {
        if (this.eventCallback) {
            try {
                this.eventCallback(event);
            }
            catch (e) {
                // Ignore callback errors
            }
        }
        // Note: ConversationTracer integration for model policy events
        // could be added here when specific event types are defined in the tracer
    }
    /**
     * Select a model for a task phase
     */
    select(phase, context) {
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
        }
        else if (costCheck.warning) {
            this.emitEvent({
                type: 'COST_WARNING',
                current_cost: costCheck.current_cost,
                daily_limit: costCheck.daily_limit,
                usage_percentage: Math.round((costCheck.current_cost / costCheck.daily_limit) * 100),
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
    recordUsage(taskId, subtaskId, selection, inputTokens, outputTokens, durationMs, result) {
        const cost = calculateCost(selection.model_id, inputTokens, outputTokens);
        const usage = {
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
    recordFallback(attempted, fallback, reason, errorMessage) {
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
    setProfile(profileName) {
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
    getProfile() {
        return this.currentProfile;
    }
    /**
     * Get all available profiles
     */
    getAvailableProfiles() {
        return Object.keys(this.config.profiles);
    }
    /**
     * Check cost limit
     */
    checkCostLimit() {
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
        const todayUsage = this.usageHistory.filter((u) => new Date(u.timestamp) >= todayStart);
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
    getUsageSummary(startDate, endDate) {
        const start = startDate || new Date(0);
        const end = endDate || new Date();
        const filtered = this.usageHistory.filter((u) => {
            const ts = new Date(u.timestamp);
            return ts >= start && ts <= end;
        });
        // Calculate by-model stats
        const byModel = {};
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
            const modelUsages = filtered.filter((u) => `${u.model.model_id}:${u.model.provider}` === key);
            const totalDuration = modelUsages.reduce((sum, u) => sum + u.duration_ms, 0);
            const successCount = modelUsages.filter((u) => u.result === 'SUCCESS').length;
            byModel[key].avg_duration_ms = Math.round(totalDuration / modelUsages.length);
            byModel[key].success_rate =
                Math.round((successCount / modelUsages.length) * 1000) / 10;
        }
        // Calculate by-phase stats
        const byPhase = {};
        for (const usage of filtered) {
            if (!byPhase[usage.phase]) {
                byPhase[usage.phase] = {
                    call_count: 0,
                    total_tokens: 0,
                    total_cost: 0,
                };
            }
            byPhase[usage.phase].call_count++;
            byPhase[usage.phase].total_tokens += usage.tokens.total;
            byPhase[usage.phase].total_cost += usage.cost.total;
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
            total_cost: Math.round(filtered.reduce((sum, u) => sum + u.cost.total, 0) * 100) / 100,
            total_tokens: filtered.reduce((sum, u) => sum + u.tokens.total, 0),
            escalation_count: this.escalationCount,
        };
    }
    /**
     * Get today's usage summary
     */
    getTodayUsage() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        return this.getUsageSummary(todayStart);
    }
    /**
     * Get model config
     */
    getModelConfig(modelId) {
        return this.config.models.find((m) => m.model_id === modelId);
    }
    /**
     * Get all available models
     */
    getAvailableModels() {
        return this.config.models;
    }
    /**
     * Get fallback model for a provider error
     */
    getFallbackModel(failedProvider) {
        const fallbackOrder = this.config.fallbackOrder.filter((p) => p !== failedProvider);
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
    resetUsage() {
        this.usageHistory = [];
        this.escalationCount = 0;
    }
    /**
     * Get configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
exports.ModelPolicyManager = ModelPolicyManager;
//# sourceMappingURL=model-policy-manager.js.map