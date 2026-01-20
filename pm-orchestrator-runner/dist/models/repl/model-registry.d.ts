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
import { Provider } from './repl-state';
/**
 * Model information structure
 */
export interface ModelInfo {
    id: string;
    displayName: string;
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    contextSize: string;
}
/**
 * Provider information structure
 */
export interface ProviderInfo {
    id: Provider;
    displayName: string;
    description: string;
    requiresApiKey: boolean;
    envVariable: string | null;
    /** If true, this provider requires explicit --provider flag to use */
    requiresExplicitOptIn?: boolean;
}
/**
 * Provider registry
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 1.1
 *
 * IMPORTANT: claude-code is NOT the default.
 * Default is api-key mode (openai/anthropic).
 * claude-code requires explicit --provider claude-code.
 */
export declare const PROVIDER_REGISTRY: Record<Provider, ProviderInfo>;
/**
 * OpenAI models
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 2.1
 */
export declare const OPENAI_MODELS: ModelInfo[];
/**
 * Anthropic models
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 2.1
 */
export declare const ANTHROPIC_MODELS: ModelInfo[];
/**
 * Get models for a provider
 *
 * @param provider - Provider identifier
 * @returns Array of available models (empty for claude-code)
 */
export declare function getModelsForProvider(provider: Provider): ModelInfo[];
/**
 * Get provider info
 *
 * @param provider - Provider identifier
 * @returns ProviderInfo or undefined
 */
export declare function getProviderInfo(provider: Provider): ProviderInfo | undefined;
/**
 * Get all providers
 *
 * @returns Array of all provider infos
 */
export declare function getAllProviders(): ProviderInfo[];
/**
 * Check if a model exists for a provider
 *
 * @param provider - Provider identifier
 * @param modelId - Model identifier
 * @returns true if model exists
 */
export declare function isValidModelForProvider(provider: Provider, modelId: string): boolean;
/**
 * Check if a provider requires explicit opt-in
 *
 * @param provider - Provider identifier
 * @returns true if provider requires explicit opt-in
 */
export declare function requiresExplicitOptIn(provider: Provider): boolean;
//# sourceMappingURL=model-registry.d.ts.map