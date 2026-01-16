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
export const PROVIDER_REGISTRY: Record<Provider, ProviderInfo> = {
  'claude-code': {
    id: 'claude-code',
    displayName: 'Claude Code',
    description: 'Claude Code Executor - recommended',
    requiresApiKey: false,
    envVariable: null,
  },
  'openai': {
    id: 'openai',
    displayName: 'OpenAI',
    description: 'OpenAI API direct',
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
export const OPENAI_MODELS: ModelInfo[] = [
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
export const ANTHROPIC_MODELS: ModelInfo[] = [
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
export function getModelsForProvider(provider: Provider): ModelInfo[] {
  switch (provider) {
    case 'openai':
      return OPENAI_MODELS;
    case 'anthropic':
      return ANTHROPIC_MODELS;
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
export function getProviderInfo(provider: Provider): ProviderInfo | undefined {
  return PROVIDER_REGISTRY[provider];
}

/**
 * Get all providers
 *
 * @returns Array of all provider infos
 */
export function getAllProviders(): ProviderInfo[] {
  return Object.values(PROVIDER_REGISTRY);
}

/**
 * Check if a model exists for a provider
 *
 * @param provider - Provider identifier
 * @param modelId - Model identifier
 * @returns true if model exists
 */
export function isValidModelForProvider(provider: Provider, modelId: string): boolean {
  const models = getModelsForProvider(provider);
  return models.some(m => m.id === modelId);
}
