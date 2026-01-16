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
export declare const VALID_PROVIDERS: readonly ["claude-code", "openai", "anthropic"];
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
export declare const INITIAL_REPL_STATE: ReplState;
/**
 * Validate provider identifier
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 1.2
 *
 * @param providerId - Provider identifier to validate
 * @returns ValidationResult
 */
export declare function validateProvider(providerId: string | null | undefined): {
    valid: boolean;
    error?: string;
};
/**
 * Validate model identifier
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 5.2
 *
 * @param providerId - Provider identifier
 * @param modelId - Model identifier to validate
 * @returns ValidationResult
 */
export declare function validateModel(providerId: string | null, modelId: string | null | undefined): {
    valid: boolean;
    error?: string;
};
/**
 * Validate ReplState structure
 * Per spec 05_DATA_MODELS.md
 *
 * @param state - ReplState to validate
 * @returns ValidationResult
 */
export declare function validateReplState(state: unknown): {
    valid: boolean;
    error?: string;
};
/**
 * Create a new ReplState with provider change
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 4.2:
 * Provider change resets selected_model to null
 *
 * @param current - Current ReplState
 * @param provider - New provider
 * @returns Updated ReplState
 */
export declare function changeProvider(current: ReplState, provider: Provider): ReplState;
/**
 * Create a new ReplState with model change
 *
 * @param current - Current ReplState
 * @param model - New model
 * @returns Updated ReplState
 */
export declare function changeModel(current: ReplState, model: string): ReplState;
//# sourceMappingURL=repl-state.d.ts.map