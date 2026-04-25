/**
 * AI Cost Calculation Service
 *
 * Provides cost calculations based on model pricing from the model registry.
 * Used by dashboard and project detail views to display per-project AI costs.
 */

import {
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  type ModelInfo,
  type ModelTier,
} from '../../models/repl/model-registry';

/**
 * All known models (combined OpenAI + Anthropic)
 */
const ALL_MODELS: ModelInfo[] = [...OPENAI_MODELS, ...ANTHROPIC_MODELS];

/**
 * Cost calculation result for a project
 */
export interface ProjectCostInfo {
  /** AI model ID (e.g. "gpt-4o") */
  modelId: string;
  /** AI provider (e.g. "openai") */
  provider: string;
  /** Model display name (e.g. "GPT-4o") */
  modelDisplayName: string;
  /** Cost per 1M input tokens in USD */
  inputPricePerMillion: number;
  /** Cost per 1M output tokens in USD */
  outputPricePerMillion: number;
  /** Context window size (e.g. "128K") */
  contextSize: string;
  /** Capability tier (basic / standard / advanced / flagship) - see spec/19_WEB_UI.md */
  tier: ModelTier;
}

/**
 * Resolve the model info for a given model ID.
 * Returns undefined if the model is not found in the registry.
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return ALL_MODELS.find(m => m.id === modelId);
}

/**
 * Determine the provider for a given model ID.
 */
export function getProviderForModelId(modelId: string): string | undefined {
  if (OPENAI_MODELS.some(m => m.id === modelId)) return 'openai';
  if (ANTHROPIC_MODELS.some(m => m.id === modelId)) return 'anthropic';
  return undefined;
}

/**
 * Build a ProjectCostInfo from a model ID and optional provider.
 * Falls back to auto-detecting the provider from the model ID.
 * Returns null if the model is not recognized.
 */
export function buildProjectCostInfo(
  modelId: string,
  provider?: string
): ProjectCostInfo | null {
  const info = getModelInfo(modelId);
  if (!info) return null;

  const resolvedProvider = provider || getProviderForModelId(modelId) || 'unknown';

  return {
    modelId: info.id,
    provider: resolvedProvider,
    modelDisplayName: info.displayName,
    inputPricePerMillion: info.inputPricePerMillion,
    outputPricePerMillion: info.outputPricePerMillion,
    contextSize: info.contextSize,
    tier: info.tier,
  };
}

/**
 * Calculate the estimated cost for a given token usage.
 */
export function calculateTokenCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number; totalCost: number } | null {
  const info = getModelInfo(modelId);
  if (!info) return null;

  const inputCost = (inputTokens / 1_000_000) * info.inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * info.outputPricePerMillion;

  return {
    inputCost: Math.round(inputCost * 10000) / 10000,
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
  };
}

/**
 * Get all available models with their cost info, grouped by provider.
 */
export function getAllModelCostInfo(): Record<string, ProjectCostInfo[]> {
  const result: Record<string, ProjectCostInfo[]> = {
    openai: [],
    anthropic: [],
  };

  for (const m of OPENAI_MODELS) {
    result.openai.push({
      modelId: m.id,
      provider: 'openai',
      modelDisplayName: m.displayName,
      inputPricePerMillion: m.inputPricePerMillion,
      outputPricePerMillion: m.outputPricePerMillion,
      contextSize: m.contextSize,
      tier: m.tier,
    });
  }

  for (const m of ANTHROPIC_MODELS) {
    result.anthropic.push({
      modelId: m.id,
      provider: 'anthropic',
      modelDisplayName: m.displayName,
      inputPricePerMillion: m.inputPricePerMillion,
      outputPricePerMillion: m.outputPricePerMillion,
      contextSize: m.contextSize,
      tier: m.tier,
    });
  }

  return result;
}
