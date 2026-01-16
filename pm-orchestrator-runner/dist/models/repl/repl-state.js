"use strict";
/**
 * ReplState - REPL Session State Model
 *
 * Per spec 05_DATA_MODELS.md:
 * - selected_provider: "claude-code" | "openai" | "anthropic" | null
 * - selected_model: string | null
 * - updated_at: string (ISO 8601) | null
 *
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md:
 * - Valid providers: claude-code, openai, anthropic
 * - claude-code: no API key required
 * - openai/anthropic: API key required
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_REPL_STATE = exports.VALID_PROVIDERS = void 0;
exports.validateProvider = validateProvider;
exports.validateModel = validateModel;
exports.validateReplState = validateReplState;
exports.changeProvider = changeProvider;
exports.changeModel = changeModel;
/**
 * Valid provider identifiers
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 1.1
 */
exports.VALID_PROVIDERS = ['claude-code', 'openai', 'anthropic'];
/**
 * Initial ReplState value
 * Per spec 10_REPL_UX.md L163-168
 */
exports.INITIAL_REPL_STATE = {
    selected_provider: null,
    selected_model: null,
    updated_at: null,
};
/**
 * Validate provider identifier
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 1.2
 *
 * @param providerId - Provider identifier to validate
 * @returns ValidationResult
 */
function validateProvider(providerId) {
    if (providerId === null || providerId === undefined) {
        return { valid: true }; // null is allowed (unset state)
    }
    if (typeof providerId !== 'string' || providerId.trim() === '') {
        return { valid: false, error: 'Provider ID must be a non-empty string' };
    }
    // Per spec: Provider ID must match pattern [a-z0-9-]+
    if (!/^[a-z0-9-]+$/.test(providerId)) {
        return { valid: false, error: 'Provider ID must match pattern [a-z0-9-]+' };
    }
    if (!exports.VALID_PROVIDERS.includes(providerId)) {
        const validList = exports.VALID_PROVIDERS.join(', ');
        return { valid: false, error: 'Unknown provider: ' + providerId + '. Valid providers: ' + validList };
    }
    return { valid: true };
}
/**
 * Validate model identifier
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 5.2
 *
 * @param providerId - Provider identifier
 * @param modelId - Model identifier to validate
 * @returns ValidationResult
 */
function validateModel(providerId, modelId) {
    // claude-code: model can be null (Claude Code manages internally)
    if (providerId === 'claude-code') {
        return { valid: true };
    }
    // For other providers, model is required
    if (!modelId || modelId.trim() === '') {
        return { valid: false, error: 'Model selection is required for this provider' };
    }
    return { valid: true };
}
/**
 * Validate ReplState structure
 * Per spec 05_DATA_MODELS.md
 *
 * @param state - ReplState to validate
 * @returns ValidationResult
 */
function validateReplState(state) {
    if (state === null || state === undefined) {
        return { valid: false, error: 'ReplState cannot be null or undefined' };
    }
    if (typeof state !== 'object') {
        return { valid: false, error: 'ReplState must be an object' };
    }
    const s = state;
    // Validate selected_provider
    if ('selected_provider' in s && s.selected_provider !== null) {
        const providerValidation = validateProvider(s.selected_provider);
        if (!providerValidation.valid) {
            return providerValidation;
        }
    }
    // Validate selected_model (if selected_provider is not claude-code)
    if ('selected_provider' in s && s.selected_provider !== 'claude-code') {
        if ('selected_model' in s && s.selected_model !== null) {
            if (typeof s.selected_model !== 'string') {
                return { valid: false, error: 'selected_model must be a string or null' };
            }
        }
    }
    // Validate updated_at (if present)
    if ('updated_at' in s && s.updated_at !== null) {
        if (typeof s.updated_at !== 'string') {
            return { valid: false, error: 'updated_at must be a string or null' };
        }
        // Check ISO 8601 format
        const date = new Date(s.updated_at);
        if (isNaN(date.getTime())) {
            return { valid: false, error: 'updated_at must be a valid ISO 8601 date string' };
        }
    }
    return { valid: true };
}
/**
 * Create a new ReplState with provider change
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 4.2:
 * Provider change resets selected_model to null
 *
 * @param current - Current ReplState
 * @param provider - New provider
 * @returns Updated ReplState
 */
function changeProvider(current, provider) {
    return {
        selected_provider: provider,
        selected_model: null, // Reset model on provider change
        updated_at: new Date().toISOString(),
    };
}
/**
 * Create a new ReplState with model change
 *
 * @param current - Current ReplState
 * @param model - New model
 * @returns Updated ReplState
 */
function changeModel(current, model) {
    return {
        ...current,
        selected_model: model,
        updated_at: new Date().toISOString(),
    };
}
//# sourceMappingURL=repl-state.js.map