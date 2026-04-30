/**
 * AI Cost Service tier exposure - Unit Tests (Batch 2)
 *
 * Validates that getAllModelCostInfo() returns ProjectCostInfo entries
 * including the `tier` field forwarded from the underlying registry.
 *
 * Spec: spec/19_WEB_UI.md "Model Dropdown Cost / Tier Display".
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { getAllModelCostInfo } from '../../../src/web/services/ai-cost-service';

const ALLOWED_TIERS = ['basic', 'standard', 'advanced', 'flagship'];

describe('AI Cost Service - tier field (Batch 2)', () => {
  it('returns models grouped under openai and anthropic', () => {
    const all = getAllModelCostInfo();
    assert.ok(all.openai, 'openai bucket missing');
    assert.ok(all.anthropic, 'anthropic bucket missing');
    assert.ok(all.openai.length > 0);
    assert.ok(all.anthropic.length > 0);
  });

  it('every openai entry has a tier field with allowed value', () => {
    const all = getAllModelCostInfo();
    for (const m of all.openai) {
      const tier = (m as { tier?: unknown }).tier;
      assert.ok(
        typeof tier === 'string' && ALLOWED_TIERS.includes(tier),
        `OpenAI cost-info entry ${m.modelId} has invalid tier: ${JSON.stringify(tier)}`
      );
    }
  });

  it('every anthropic entry has a tier field with allowed value', () => {
    const all = getAllModelCostInfo();
    for (const m of all.anthropic) {
      const tier = (m as { tier?: unknown }).tier;
      assert.ok(
        typeof tier === 'string' && ALLOWED_TIERS.includes(tier),
        `Anthropic cost-info entry ${m.modelId} has invalid tier: ${JSON.stringify(tier)}`
      );
    }
  });

  it('tier matches registry: gpt-4o is flagship via API surface', () => {
    const all = getAllModelCostInfo();
    const gpt4o = all.openai.find(m => m.modelId === 'gpt-4o');
    assert.ok(gpt4o, 'gpt-4o must be in cost info');
    assert.equal((gpt4o as { tier?: string }).tier, 'flagship');
  });

  it('tier matches registry: gpt-4o-mini is basic via API surface', () => {
    const all = getAllModelCostInfo();
    const mini = all.openai.find(m => m.modelId === 'gpt-4o-mini');
    assert.ok(mini, 'gpt-4o-mini must be in cost info');
    assert.equal((mini as { tier?: string }).tier, 'basic');
  });
});
