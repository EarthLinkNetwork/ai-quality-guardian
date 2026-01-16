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

/**
 * Valid provider identifiers
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 1.1
 */
export const VALID_PROVIDERS = ['claude-code', 'openai', 'anthropic'] as const;
export type Provider = typeof VALID_PROVIDERS[number];

/**
 * ReplState structure
 * Per spec 05_DATA_MODELS.md Section "REPL State Structures"
 */
export interface ReplState {
  selected_provider: Provider | null;
  selected_model: string | null;
  updated_at: string | null;
}

/**
 * Initial ReplState value
 * Per spec 10_REPL_UX.md L163-168
 */
export const INITIAL_REPL_STATE: ReplState = {
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
export function validateProvider(providerId: string | null | undefined): {
  valid: boolean;
  error?: string;
} {
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

  if (!VALID_PROVIDERS.includes(providerId as Provider)) {
    const validList = VALID_PROVIDERS.join(', ');
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
export function validateModel(
  providerId: string | null,
  modelId: string | null | undefined
): { valid: boolean; error?: string } {
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
export function validateReplState(state: unknown): {
  valid: boolean;
  error?: string;
} {
  if (state === null || state === undefined) {
    return { valid: false, error: 'ReplState cannot be null or undefined' };
  }

  if (typeof state !== 'object') {
    return { valid: false, error: 'ReplState must be an object' };
  }

  const s = state as Record<string, unknown>;

  // Validate selected_provider
  if ('selected_provider' in s && s.selected_provider !== null) {
    const providerValidation = validateProvider(s.selected_provider as string);
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
    const date = new Date(s.updated_at as string);
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
export function changeProvider(current: ReplState, provider: Provider): ReplState {
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
export function changeModel(current: ReplState, model: string): ReplState {
  return {
    ...current,
    selected_model: model,
    updated_at: new Date().toISOString(),
  };
}
