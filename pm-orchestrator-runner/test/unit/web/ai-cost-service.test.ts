/**
 * Unit tests for AI Cost Service
 *
 * Tests:
 *   - getModelInfo resolves known models
 *   - getModelInfo returns undefined for unknown models
 *   - getProviderForModelId detects OpenAI and Anthropic
 *   - buildProjectCostInfo builds correct cost info
 *   - buildProjectCostInfo returns null for unknown models
 *   - calculateTokenCost computes costs correctly
 *   - getAllModelCostInfo returns grouped models
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  getModelInfo,
  getProviderForModelId,
  buildProjectCostInfo,
  calculateTokenCost,
  getAllModelCostInfo,
} from '../../../src/web/services/ai-cost-service';

describe('AI Cost Service - Unit Tests', () => {
  describe('getModelInfo', () => {
    it('resolves a known OpenAI model', () => {
      const info = getModelInfo('gpt-4o');
      assert.ok(info);
      assert.equal(info.id, 'gpt-4o');
      assert.equal(info.displayName, 'GPT-4o');
      assert.equal(info.inputPricePerMillion, 2.5);
      assert.equal(info.outputPricePerMillion, 10.0);
    });

    it('resolves a known Anthropic model', () => {
      const info = getModelInfo('claude-3-5-sonnet-20241022');
      assert.ok(info);
      assert.equal(info.id, 'claude-3-5-sonnet-20241022');
      assert.equal(info.displayName, 'Claude 3.5 Sonnet');
    });

    it('returns undefined for an unknown model', () => {
      const info = getModelInfo('nonexistent-model-xyz');
      assert.equal(info, undefined);
    });
  });

  describe('getProviderForModelId', () => {
    it('returns "openai" for OpenAI models', () => {
      assert.equal(getProviderForModelId('gpt-4o'), 'openai');
      assert.equal(getProviderForModelId('gpt-4o-mini'), 'openai');
      assert.equal(getProviderForModelId('gpt-4-turbo'), 'openai');
    });

    it('returns "anthropic" for Anthropic models', () => {
      assert.equal(getProviderForModelId('claude-3-5-sonnet-20241022'), 'anthropic');
      assert.equal(getProviderForModelId('claude-3-haiku-20240307'), 'anthropic');
    });

    it('returns undefined for unknown model', () => {
      assert.equal(getProviderForModelId('unknown-model'), undefined);
    });
  });

  describe('buildProjectCostInfo', () => {
    it('builds cost info for a known model', () => {
      const info = buildProjectCostInfo('gpt-4o');
      assert.ok(info);
      assert.equal(info.modelId, 'gpt-4o');
      assert.equal(info.provider, 'openai');
      assert.equal(info.modelDisplayName, 'GPT-4o');
      assert.equal(info.inputPricePerMillion, 2.5);
      assert.equal(info.outputPricePerMillion, 10.0);
      assert.equal(info.contextSize, '128K');
    });

    it('uses provided provider over auto-detected', () => {
      const info = buildProjectCostInfo('gpt-4o', 'custom-provider');
      assert.ok(info);
      assert.equal(info.provider, 'custom-provider');
    });

    it('auto-detects provider when not provided', () => {
      const info = buildProjectCostInfo('claude-3-haiku-20240307');
      assert.ok(info);
      assert.equal(info.provider, 'anthropic');
    });

    it('returns null for unknown model', () => {
      const info = buildProjectCostInfo('nonexistent-model');
      assert.equal(info, null);
    });
  });

  describe('calculateTokenCost', () => {
    it('calculates cost for gpt-4o usage', () => {
      // gpt-4o: $2.50/1M input, $10.00/1M output
      const result = calculateTokenCost('gpt-4o', 1_000_000, 1_000_000);
      assert.ok(result);
      assert.equal(result.inputCost, 2.5);
      assert.equal(result.outputCost, 10.0);
      assert.equal(result.totalCost, 12.5);
    });

    it('calculates cost for small token counts', () => {
      // gpt-4o-mini: $0.15/1M input, $0.60/1M output
      const result = calculateTokenCost('gpt-4o-mini', 1000, 500);
      assert.ok(result);
      // 1000/1M * 0.15 = 0.00015 -> rounds to 0.0001 (4 decimal places)
      assert.equal(result.inputCost, 0.0001);
      // 500/1M * 0.60 = 0.0003
      assert.equal(result.outputCost, 0.0003);
    });

    it('returns null for unknown model', () => {
      const result = calculateTokenCost('nonexistent', 1000, 1000);
      assert.equal(result, null);
    });

    it('handles zero tokens', () => {
      const result = calculateTokenCost('gpt-4o', 0, 0);
      assert.ok(result);
      assert.equal(result.inputCost, 0);
      assert.equal(result.outputCost, 0);
      assert.equal(result.totalCost, 0);
    });
  });

  describe('getAllModelCostInfo', () => {
    it('returns models grouped by provider', () => {
      const all = getAllModelCostInfo();
      assert.ok(all.openai);
      assert.ok(all.anthropic);
      assert.ok(all.openai.length > 0);
      assert.ok(all.anthropic.length > 0);
    });

    it('openai models have correct provider', () => {
      const all = getAllModelCostInfo();
      for (const m of all.openai) {
        assert.equal(m.provider, 'openai');
      }
    });

    it('anthropic models have correct provider', () => {
      const all = getAllModelCostInfo();
      for (const m of all.anthropic) {
        assert.equal(m.provider, 'anthropic');
      }
    });

    it('all models have required fields', () => {
      const all = getAllModelCostInfo();
      const allModels = [...all.openai, ...all.anthropic];
      for (const m of allModels) {
        assert.ok(m.modelId, 'modelId is required');
        assert.ok(m.provider, 'provider is required');
        assert.ok(m.modelDisplayName, 'modelDisplayName is required');
        assert.ok(typeof m.inputPricePerMillion === 'number', 'inputPricePerMillion must be number');
        assert.ok(typeof m.outputPricePerMillion === 'number', 'outputPricePerMillion must be number');
        assert.ok(m.contextSize, 'contextSize is required');
      }
    });
  });
});
