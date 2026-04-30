/**
 * Model Registry tier field - Unit Tests (Batch 2)
 *
 * Validates that every ModelInfo entry in OPENAI_MODELS and ANTHROPIC_MODELS
 * carries a non-null `tier` field whose value is one of the allowed literals.
 *
 * Spec: spec/19_WEB_UI.md "Model Dropdown Cost / Tier Display".
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  type ModelInfo,
} from '../../../src/models/repl/model-registry';

const ALLOWED_TIERS = ['basic', 'standard', 'advanced', 'flagship'] as const;
type Tier = typeof ALLOWED_TIERS[number];

function isValidTier(value: unknown): value is Tier {
  return typeof value === 'string' && (ALLOWED_TIERS as readonly string[]).includes(value);
}

describe('Model Registry - tier field (Batch 2)', () => {
  describe('OPENAI_MODELS', () => {
    it('has at least one entry', () => {
      assert.ok(OPENAI_MODELS.length > 0);
    });

    it('every entry has a tier field', () => {
      for (const m of OPENAI_MODELS) {
        const hasTier = Object.prototype.hasOwnProperty.call(m, 'tier');
        assert.ok(hasTier, `OpenAI model ${m.id} is missing "tier" field`);
      }
    });

    it('every tier value is one of basic|standard|advanced|flagship', () => {
      for (const m of OPENAI_MODELS) {
        const t = (m as ModelInfo).tier;
        assert.ok(
          isValidTier(t),
          `OpenAI model ${m.id} has invalid tier: ${JSON.stringify(t)}`
        );
      }
    });
  });

  describe('ANTHROPIC_MODELS', () => {
    it('has at least one entry', () => {
      assert.ok(ANTHROPIC_MODELS.length > 0);
    });

    it('every entry has a tier field', () => {
      for (const m of ANTHROPIC_MODELS) {
        const hasTier = Object.prototype.hasOwnProperty.call(m, 'tier');
        assert.ok(hasTier, `Anthropic model ${m.id} is missing "tier" field`);
      }
    });

    it('every tier value is one of basic|standard|advanced|flagship', () => {
      for (const m of ANTHROPIC_MODELS) {
        const t = (m as ModelInfo).tier;
        assert.ok(
          isValidTier(t),
          `Anthropic model ${m.id} has invalid tier: ${JSON.stringify(t)}`
        );
      }
    });
  });

  describe('Tier heuristic sanity checks', () => {
    it('GPT-4o is flagship (most capable, $2.50/$10 tier)', () => {
      const m = OPENAI_MODELS.find(x => x.id === 'gpt-4o');
      assert.ok(m, 'gpt-4o must be in registry');
      assert.equal((m as ModelInfo).tier, 'flagship');
    });

    it('GPT-4o Mini is basic (cheapest OpenAI, $0.15/$0.60)', () => {
      const m = OPENAI_MODELS.find(x => x.id === 'gpt-4o-mini');
      assert.ok(m, 'gpt-4o-mini must be in registry');
      assert.equal((m as ModelInfo).tier, 'basic');
    });

    it('Claude 3 Haiku is basic (cheapest Anthropic, $0.25/$1.25)', () => {
      const m = ANTHROPIC_MODELS.find(x => x.id === 'claude-3-haiku-20240307');
      assert.ok(m, 'claude-3-haiku-20240307 must be in registry');
      assert.equal((m as ModelInfo).tier, 'basic');
    });

    it('Claude Opus 4 is flagship ($15/$75)', () => {
      const m = ANTHROPIC_MODELS.find(x => x.id === 'claude-opus-4-20250514');
      assert.ok(m, 'claude-opus-4-20250514 must be in registry');
      assert.equal((m as ModelInfo).tier, 'flagship');
    });
  });
});
