/**
 * Model Registry
 *
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 2:
 * - OpenAI models with pricing
 * - Anthropic models with pricing
 * - claude-code does not have explicit models (delegated)
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
}
/**
 * Provider registry
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 1.1
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
//# sourceMappingURL=model-registry.d.ts.map