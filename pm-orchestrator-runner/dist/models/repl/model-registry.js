"use strict";
/**
 * Model Registry
 *
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 2:
 * - OpenAI models with pricing
 * - Anthropic models with pricing
 * - claude-code does not have explicit models (delegated)
 *
 * Provider Recommendations:
 * - openai: RECOMMENDED - API key based, direct control
 * - anthropic: API key based, direct control
 * - claude-code: NOT recommended by default, requires explicit opt-in (--provider claude-code)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANTHROPIC_MODELS = exports.OPENAI_MODELS = exports.PROVIDER_REGISTRY = void 0;
exports.getModelsForProvider = getModelsForProvider;
exports.getProviderInfo = getProviderInfo;
exports.getAllProviders = getAllProviders;
exports.isValidModelForProvider = isValidModelForProvider;
exports.requiresExplicitOptIn = requiresExplicitOptIn;
/**
 * Provider registry
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 1.1
 *
 * IMPORTANT: claude-code is NOT the default.
 * Default is api-key mode (openai/anthropic).
 * claude-code requires explicit --provider claude-code.
 */
exports.PROVIDER_REGISTRY = {
    'claude-code': {
        id: 'claude-code',
        displayName: 'Claude Code',
        description: 'Claude Code CLI - requires explicit --provider claude-code opt-in',
        requiresApiKey: false,
        envVariable: null,
        requiresExplicitOptIn: true,
    },
    'openai': {
        id: 'openai',
        displayName: 'OpenAI',
        description: 'OpenAI API direct - recommended',
        requiresApiKey: true,
        envVariable: 'OPENAI_API_KEY',
    },
    'anthropic': {
        id: 'anthropic',
        displayName: 'Anthropic',
        description: 'Anthropic API direct',
        requiresApiKey: true,
        envVariable: 'ANTHROPIC_API_KEY',
    },
};
/**
 * OpenAI models
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 2.1
 */
exports.OPENAI_MODELS = [
    { id: 'gpt-4o', displayName: 'GPT-4o', inputPricePerMillion: 2.50, outputPricePerMillion: 10.00, contextSize: '128K' },
    { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', inputPricePerMillion: 0.15, outputPricePerMillion: 0.60, contextSize: '128K' },
    { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', inputPricePerMillion: 10.00, outputPricePerMillion: 30.00, contextSize: '128K' },
    { id: 'gpt-4', displayName: 'GPT-4', inputPricePerMillion: 30.00, outputPricePerMillion: 60.00, contextSize: '8K' },
    { id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', inputPricePerMillion: 0.50, outputPricePerMillion: 1.50, contextSize: '16K' },
    { id: 'o1', displayName: 'o1', inputPricePerMillion: 15.00, outputPricePerMillion: 60.00, contextSize: '200K' },
    { id: 'o1-mini', displayName: 'o1 Mini', inputPricePerMillion: 3.00, outputPricePerMillion: 12.00, contextSize: '128K' },
    { id: 'o1-preview', displayName: 'o1 Preview', inputPricePerMillion: 15.00, outputPricePerMillion: 60.00, contextSize: '128K' },
];
/**
 * Anthropic models
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 2.1
 */
exports.ANTHROPIC_MODELS = [
    { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', inputPricePerMillion: 15.00, outputPricePerMillion: 75.00, contextSize: '200K' },
    { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, contextSize: '200K' },
    { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, contextSize: '200K' },
    { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', inputPricePerMillion: 0.80, outputPricePerMillion: 4.00, contextSize: '200K' },
    { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus', inputPricePerMillion: 15.00, outputPricePerMillion: 75.00, contextSize: '200K' },
    { id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, contextSize: '200K' },
    { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku', inputPricePerMillion: 0.25, outputPricePerMillion: 1.25, contextSize: '200K' },
];
/**
 * Get models for a provider
 *
 * @param provider - Provider identifier
 * @returns Array of available models (empty for claude-code)
 */
function getModelsForProvider(provider) {
    switch (provider) {
        case 'openai':
            return exports.OPENAI_MODELS;
        case 'anthropic':
            return exports.ANTHROPIC_MODELS;
        case 'claude-code':
            return []; // Claude Code manages models internally
        default:
            return [];
    }
}
/**
 * Get provider info
 *
 * @param provider - Provider identifier
 * @returns ProviderInfo or undefined
 */
function getProviderInfo(provider) {
    return exports.PROVIDER_REGISTRY[provider];
}
/**
 * Get all providers
 *
 * @returns Array of all provider infos
 */
function getAllProviders() {
    return Object.values(exports.PROVIDER_REGISTRY);
}
/**
 * Check if a model exists for a provider
 *
 * @param provider - Provider identifier
 * @param modelId - Model identifier
 * @returns true if model exists
 */
function isValidModelForProvider(provider, modelId) {
    const models = getModelsForProvider(provider);
    return models.some(m => m.id === modelId);
}
/**
 * Check if a provider requires explicit opt-in
 *
 * @param provider - Provider identifier
 * @returns true if provider requires explicit opt-in
 */
function requiresExplicitOptIn(provider) {
    const info = exports.PROVIDER_REGISTRY[provider];
    return info?.requiresExplicitOptIn ?? false;
}
//# sourceMappingURL=model-registry.js.map