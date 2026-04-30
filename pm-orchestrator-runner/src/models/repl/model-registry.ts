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
 *
 * Task E (2026-04-24): additive-only model registry refresh.
 *   - New OpenAI IDs verified live via OpenAI /v1/models on 2026-04-24.
 *   - New Anthropic un-dated aliases added.
 *   - claude-haiku-4-5-20251001 formally registered (drift resolution).
 *   - Some legacy IDs marked @deprecated (JSDoc only, not removed).
 *   - Cleanup of @deprecated IDs tracked in docs/BACKLOG.md
 *     ("Legacy Model Cleanup (Task E follow-up)").
 */

import { match } from 'ts-pattern';
import { Provider } from './repl-state';

/**
 * Capability tier for a model.
 *
 * Used by the Web UI to surface "how smart vs how expensive" alongside
 * the displayName + price in model dropdowns. See spec/19_WEB_UI.md
 * "Model Dropdown Cost / Tier Display".
 *
 * Heuristic (input price per 1M tokens, with generation override):
 *   - flagship  : > $10/M, or top-of-line generation (GPT-4o, Opus 4, GPT-5.x, o1)
 *   - advanced  : $2 – $10/M (GPT-4 Turbo, Sonnet 4, Claude 3.5 Sonnet)
 *   - standard  : $0.5 – $2/M (GPT-3.5 Turbo, Claude 3.5 Haiku)
 *   - basic     : < $0.5/M (GPT-4o Mini, Claude 3 Haiku)
 *
 * For pricing-TBD entries (input=0, output=0), tier is assigned by
 * generation/positioning intent (e.g. "Pro" → flagship, "Mini" → advanced).
 */
export type ModelTier = 'basic' | 'standard' | 'advanced' | 'flagship';

/**
 * Model information structure
 */
export interface ModelInfo {
  id: string;
  displayName: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  contextSize: string;
  /**
   * Capability tier (basic / standard / advanced / flagship).
   * Surfaced in Web UI model dropdowns alongside cost.
   */
  tier: ModelTier;
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
export const PROVIDER_REGISTRY: Record<Provider, ProviderInfo> = {
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
 *
 * Existing models retain their validated pricing.
 * Task E additions (gpt-5.x / gpt-4.1 / o3 / o4-mini) carry
 * placeholder pricing (0 / TBD) — actual pricing verification is
 * deferred to the Legacy Model Cleanup follow-up task
 * (docs/BACKLOG.md). See spec/12 "TODO: Legacy Cleanup" section.
 *
 * Models verified live via OpenAI /v1/models on 2026-04-24:
 *   gpt-5.4, gpt-5.4-mini, gpt-5.4-pro,
 *   gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, o3, o4-mini.
 *
 * Batch 2 fix (2026-04-25): removed gpt-5, gpt-5.1, o3-mini — these IDs
 * exist in OpenAI's /v1/models response but have no published API pricing
 * and are likely retired / preview-only. Display in the dropdown would
 * have shown "$0.00 / $0.00" misleading the user. Re-add with real
 * pricing if/when published.
 */
export const OPENAI_MODELS: ModelInfo[] = [
  // ---- Existing (pricing validated) ----
  // GPT-4o is the flagship multimodal model (top-of-line for general use).
  { id: 'gpt-4o', displayName: 'GPT-4o', inputPricePerMillion: 2.50, outputPricePerMillion: 10.00, contextSize: '128K', tier: 'flagship' },
  // GPT-4o Mini at $0.15/M is the cheapest first-class model.
  { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', inputPricePerMillion: 0.15, outputPricePerMillion: 0.60, contextSize: '128K', tier: 'basic' },
  /** @deprecated Legacy (Task E follow-up). See docs/BACKLOG.md "Legacy Model Cleanup". */
  // GPT-4 Turbo at $10/M sits at the upper edge of advanced.
  { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', inputPricePerMillion: 10.00, outputPricePerMillion: 30.00, contextSize: '128K', tier: 'advanced' },
  // Original GPT-4 at $30/$60 is flagship-priced but legacy generation.
  { id: 'gpt-4', displayName: 'GPT-4', inputPricePerMillion: 30.00, outputPricePerMillion: 60.00, contextSize: '8K', tier: 'flagship' },
  /** @deprecated Legacy (Task E follow-up). See docs/BACKLOG.md "Legacy Model Cleanup". */
  // GPT-3.5 Turbo at $0.50/$1.50 is the canonical "standard" tier.
  { id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', inputPricePerMillion: 0.50, outputPricePerMillion: 1.50, contextSize: '16K', tier: 'standard' },
  /** @deprecated Legacy (Task E follow-up). See docs/BACKLOG.md "Legacy Model Cleanup". */
  // o1 reasoning model at $15/$60 is flagship.
  { id: 'o1', displayName: 'o1', inputPricePerMillion: 15.00, outputPricePerMillion: 60.00, contextSize: '200K', tier: 'flagship' },
  /** @deprecated Legacy (Task E follow-up). See docs/BACKLOG.md "Legacy Model Cleanup". */
  // o1 Mini at $3/$12 is advanced.
  { id: 'o1-mini', displayName: 'o1 Mini', inputPricePerMillion: 3.00, outputPricePerMillion: 12.00, contextSize: '128K', tier: 'advanced' },
  /** @deprecated Legacy (Task E follow-up). See docs/BACKLOG.md "Legacy Model Cleanup". */
  // o1 Preview at $15/$60 mirrors o1 → flagship.
  { id: 'o1-preview', displayName: 'o1 Preview', inputPricePerMillion: 15.00, outputPricePerMillion: 60.00, contextSize: '128K', tier: 'flagship' },

  // ---- Task E additions (2026-04-24, real pricing applied 2026-04-25 Batch 2 fix) ----
  // GPT-5.4 lines: main → flagship, mini → advanced, pro → flagship.
  { id: 'gpt-5.4', displayName: 'GPT-5.4', inputPricePerMillion: 2.50, outputPricePerMillion: 15.00, contextSize: 'TBD', tier: 'flagship' },
  { id: 'gpt-5.4-mini', displayName: 'GPT-5.4 Mini', inputPricePerMillion: 0.75, outputPricePerMillion: 4.50, contextSize: 'TBD', tier: 'advanced' },
  { id: 'gpt-5.4-pro', displayName: 'GPT-5.4 Pro', inputPricePerMillion: 30.00, outputPricePerMillion: 180.00, contextSize: 'TBD', tier: 'flagship' },
  // GPT-4.1 generation: main → advanced, mini → standard.
  { id: 'gpt-4.1', displayName: 'GPT-4.1', inputPricePerMillion: 2.00, outputPricePerMillion: 8.00, contextSize: 'TBD', tier: 'advanced' },
  { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', inputPricePerMillion: 0.40, outputPricePerMillion: 1.60, contextSize: 'TBD', tier: 'standard' },
  // o3 / o4 reasoning models.
  { id: 'o3', displayName: 'o3', inputPricePerMillion: 2.00, outputPricePerMillion: 8.00, contextSize: 'TBD', tier: 'flagship' },
  { id: 'o4-mini', displayName: 'o4 Mini', inputPricePerMillion: 1.10, outputPricePerMillion: 4.40, contextSize: 'TBD', tier: 'advanced' },
];

/**
 * Anthropic models
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md Section 2.1
 *
 * Existing models retain their validated pricing.
 * Task E additions (un-dated aliases + claude-haiku-4-5-20251001)
 * carry placeholder pricing (0 / TBD) — actual pricing verification
 * is deferred to the Legacy Model Cleanup follow-up task
 * (docs/BACKLOG.md).
 *
 * claude-haiku-4-5-20251001 was previously referenced by
 * internalLlm.defaults.anthropic, the Web UI dropdown, and
 * utils/question-detector.ts without being in this registry
 * (drift). Task E formally registers it here.
 */
export const ANTHROPIC_MODELS: ModelInfo[] = [
  // ---- Existing (pricing validated) ----
  // Opus 4 at $15/$75 → flagship.
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', inputPricePerMillion: 15.00, outputPricePerMillion: 75.00, contextSize: '200K', tier: 'flagship' },
  // Sonnet 4 at $3/$15 → advanced.
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, contextSize: '200K', tier: 'advanced' },
  // Claude 3.5 Sonnet at $3/$15 → advanced.
  { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, contextSize: '200K', tier: 'advanced' },
  // Claude 3.5 Haiku at $0.80/$4 → standard.
  { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', inputPricePerMillion: 0.80, outputPricePerMillion: 4.00, contextSize: '200K', tier: 'standard' },
  // Claude 3 Opus at $15/$75 → flagship.
  { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus', inputPricePerMillion: 15.00, outputPricePerMillion: 75.00, contextSize: '200K', tier: 'flagship' },
  // Claude 3 Sonnet at $3/$15 → advanced.
  { id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, contextSize: '200K', tier: 'advanced' },
  // Claude 3 Haiku at $0.25/$1.25 → basic (cheapest).
  { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku', inputPricePerMillion: 0.25, outputPricePerMillion: 1.25, contextSize: '200K', tier: 'basic' },

  // ---- Task E additions (2026-04-24, real pricing applied 2026-04-25 Batch 2 fix) ----
  // Generation-based positioning (Opus → flagship, Sonnet → advanced, Haiku → basic/standard).
  { id: 'claude-opus-4-7', displayName: 'Claude Opus 4.7', inputPricePerMillion: 5.00, outputPricePerMillion: 25.00, contextSize: 'TBD', tier: 'flagship' },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, contextSize: 'TBD', tier: 'advanced' },
  { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', inputPricePerMillion: 1.00, outputPricePerMillion: 5.00, contextSize: 'TBD', tier: 'basic' },
  // Drift resolution: previously referenced elsewhere but not registered
  { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5 (2025-10-01)', inputPricePerMillion: 1.00, outputPricePerMillion: 5.00, contextSize: 'TBD', tier: 'basic' },
];

/**
 * Get models for a provider
 *
 * @param provider - Provider identifier
 * @returns Array of available models (empty for claude-code)
 */
export function getModelsForProvider(provider: Provider): ModelInfo[] {
  return match(provider)
    .with('openai', () => OPENAI_MODELS)
    .with('anthropic', () => ANTHROPIC_MODELS)
    .with('claude-code', () => [] as ModelInfo[])
    .otherwise(() => [] as ModelInfo[]);
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

/**
 * Check if a provider requires explicit opt-in
 *
 * @param provider - Provider identifier
 * @returns true if provider requires explicit opt-in
 */
export function requiresExplicitOptIn(provider: Provider): boolean {
  const info = PROVIDER_REGISTRY[provider];
  return info?.requiresExplicitOptIn ?? false;
}
