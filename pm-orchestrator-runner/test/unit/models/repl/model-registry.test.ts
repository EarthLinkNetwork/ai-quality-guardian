/**
 * Model Registry Tests
 *
 * Tests for provider descriptions and recommendations.
 * Per spec: claude-code should NOT be default/recommended.
 *           openai should be recommended for API key based usage.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  PROVIDER_REGISTRY,
  getAllProviders,
  getProviderInfo,
} from '../../../../src/models/repl/model-registry';

describe('Model Registry - Provider Recommendations', () => {
  describe('Provider descriptions', () => {
    it('openai should be marked as recommended', () => {
      const openai = PROVIDER_REGISTRY['openai'];
      assert.ok(
        openai.description.toLowerCase().includes('recommended'),
        'OpenAI description should include "recommended"'
      );
    });

    it('claude-code should NOT be marked as recommended', () => {
      const claudeCode = PROVIDER_REGISTRY['claude-code'];
      assert.ok(
        !claudeCode.description.toLowerCase().includes('recommended'),
        'claude-code description should NOT include "recommended"'
      );
    });

    it('claude-code description should mention explicit opt-in requirement', () => {
      const claudeCode = PROVIDER_REGISTRY['claude-code'];
      // claude-code requires explicit --provider claude-code
      assert.ok(
        claudeCode.description.toLowerCase().includes('explicit') ||
        claudeCode.description.toLowerCase().includes('opt-in') ||
        claudeCode.description.toLowerCase().includes('cli'),
        'claude-code description should mention explicit opt-in or CLI requirement'
      );
    });
  });

  describe('Provider registry structure', () => {
    it('should have openai, anthropic, and claude-code providers', () => {
      assert.ok(PROVIDER_REGISTRY['openai'], 'Should have openai provider');
      assert.ok(PROVIDER_REGISTRY['anthropic'], 'Should have anthropic provider');
      assert.ok(PROVIDER_REGISTRY['claude-code'], 'Should have claude-code provider');
    });

    it('openai and anthropic should require API key', () => {
      assert.equal(PROVIDER_REGISTRY['openai'].requiresApiKey, true);
      assert.equal(PROVIDER_REGISTRY['anthropic'].requiresApiKey, true);
    });

    it('claude-code should NOT require API key', () => {
      assert.equal(PROVIDER_REGISTRY['claude-code'].requiresApiKey, false);
    });

    it('openai should have OPENAI_API_KEY as envVariable', () => {
      assert.equal(PROVIDER_REGISTRY['openai'].envVariable, 'OPENAI_API_KEY');
    });

    it('anthropic should have ANTHROPIC_API_KEY as envVariable', () => {
      assert.equal(PROVIDER_REGISTRY['anthropic'].envVariable, 'ANTHROPIC_API_KEY');
    });
  });

  describe('getAllProviders', () => {
    it('should return all providers', () => {
      const providers = getAllProviders();
      assert.ok(providers.length >= 3, 'Should have at least 3 providers');

      const ids = providers.map(p => p.id);
      assert.ok(ids.includes('openai'), 'Should include openai');
      assert.ok(ids.includes('anthropic'), 'Should include anthropic');
      assert.ok(ids.includes('claude-code'), 'Should include claude-code');
    });
  });

  describe('getProviderInfo', () => {
    it('should return correct info for openai', () => {
      const info = getProviderInfo('openai');
      assert.ok(info);
      assert.equal(info.id, 'openai');
      assert.equal(info.requiresApiKey, true);
    });

    it('should return correct info for anthropic', () => {
      const info = getProviderInfo('anthropic');
      assert.ok(info);
      assert.equal(info.id, 'anthropic');
      assert.equal(info.requiresApiKey, true);
    });

    it('should return correct info for claude-code', () => {
      const info = getProviderInfo('claude-code');
      assert.ok(info);
      assert.equal(info.id, 'claude-code');
      assert.equal(info.requiresApiKey, false);
    });
  });
});

describe('Model Registry - claude-code explicit opt-in', () => {
  describe('PROVIDER_REGISTRY metadata', () => {
    it('claude-code should have requiresExplicitOptIn flag', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claudeCode = PROVIDER_REGISTRY['claude-code'] as any;

      // requiresExplicitOptIn should be set
      assert.ok(
        claudeCode.requiresExplicitOptIn === true,
        'claude-code should have requiresExplicitOptIn flag set to true'
      );
    });
  });
});

// ==================================================================
// Task E: additive-only model registry refresh (2026-04-24)
// ==================================================================
// These tests verify that:
//   1. New OpenAI model IDs (verified live via OpenAI /v1/models API)
//      are registered without removing any existing models.
//   2. New Anthropic un-dated aliases are registered, and the
//      previously-drifting claude-haiku-4-5-20251001 is now formally
//      in the registry (resolving the gap between model-registry and
//      internalLlm defaults / UI dropdown / question-detector).
//   3. New models carry placeholder pricing (0 / TBD); actual pricing
//      is deferred to a follow-up task tracked in docs/BACKLOG.md.
// ==================================================================

import {
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
} from '../../../../src/models/repl/model-registry';

describe('Model Registry - Task E: additive OpenAI refresh', () => {
  // Batch 2 fix: gpt-5, gpt-5.1, o3-mini removed (no published API price,
  // likely retired). Remaining entries received real pricing.
  const NEW_OPENAI_IDS = [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-pro',
    'gpt-4.1',
    'gpt-4.1-mini',
    'o3',
    'o4-mini',
  ] as const;

  // Models that were removed in Batch 2 fix — must NOT be in the registry.
  const REMOVED_OPENAI_IDS = ['gpt-5', 'gpt-5.1', 'o3-mini'] as const;

  const EXISTING_OPENAI_IDS = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
    'o1-preview',
  ] as const;

  it('new OpenAI IDs (verified via live API) must be registered', () => {
    const ids = OPENAI_MODELS.map((m) => m.id);
    for (const newId of NEW_OPENAI_IDS) {
      assert.ok(
        ids.includes(newId),
        `OPENAI_MODELS must include "${newId}" (verified live via OpenAI /v1/models on 2026-04-24)`
      );
    }
  });

  it('all pre-existing OpenAI IDs must still be registered (no removal)', () => {
    const ids = OPENAI_MODELS.map((m) => m.id);
    for (const existingId of EXISTING_OPENAI_IDS) {
      assert.ok(
        ids.includes(existingId),
        `OPENAI_MODELS must still include legacy "${existingId}" (additive-only refresh; removal is tracked in docs/BACKLOG.md)`
      );
    }
  });

  it('new OpenAI models must carry real non-zero pricing (Batch 2 fix)', () => {
    for (const newId of NEW_OPENAI_IDS) {
      const model = OPENAI_MODELS.find((m) => m.id === newId);
      assert.ok(model, `Model "${newId}" not found`);
      assert.ok(
        model!.inputPricePerMillion > 0,
        `"${newId}" inputPricePerMillion must be > 0 (Batch 2 fix: real prices, no placeholders)`
      );
      assert.ok(
        model!.outputPricePerMillion > 0,
        `"${newId}" outputPricePerMillion must be > 0 (Batch 2 fix)`
      );
    }
  });

  it('Batch 2 fix: removed OpenAI models must NOT be in registry', () => {
    const ids = OPENAI_MODELS.map((m) => m.id);
    for (const removedId of REMOVED_OPENAI_IDS) {
      assert.ok(
        !ids.includes(removedId),
        `OPENAI_MODELS must NOT include "${removedId}" (Batch 2 fix: removed due to no published API price / likely retired)`
      );
    }
  });
});

describe('Model Registry - Task E: additive Anthropic refresh', () => {
  const NEW_ANTHROPIC_IDS = [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    // Previously referenced by internalLlm defaults / UI / question-detector
    // but NOT registered → drift. Task E formally registers it.
    'claude-haiku-4-5-20251001',
  ] as const;

  const EXISTING_ANTHROPIC_IDS = [
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ] as const;

  it('new Anthropic aliases must be registered', () => {
    const ids = ANTHROPIC_MODELS.map((m) => m.id);
    for (const newId of NEW_ANTHROPIC_IDS) {
      assert.ok(
        ids.includes(newId),
        `ANTHROPIC_MODELS must include "${newId}" (un-dated alias / drift resolution)`
      );
    }
  });

  it('all pre-existing Anthropic IDs must still be registered (no removal)', () => {
    const ids = ANTHROPIC_MODELS.map((m) => m.id);
    for (const existingId of EXISTING_ANTHROPIC_IDS) {
      assert.ok(
        ids.includes(existingId),
        `ANTHROPIC_MODELS must still include "${existingId}" (additive-only refresh)`
      );
    }
  });

  it('new Anthropic models must carry real non-zero pricing (Batch 2 fix)', () => {
    for (const newId of NEW_ANTHROPIC_IDS) {
      const model = ANTHROPIC_MODELS.find((m) => m.id === newId);
      assert.ok(model, `Model "${newId}" not found`);
      assert.ok(
        model!.inputPricePerMillion > 0,
        `"${newId}" inputPricePerMillion must be > 0 (Batch 2 fix: real prices, no placeholders)`
      );
      assert.ok(
        model!.outputPricePerMillion > 0,
        `"${newId}" outputPricePerMillion must be > 0 (Batch 2 fix)`
      );
    }
  });
});
