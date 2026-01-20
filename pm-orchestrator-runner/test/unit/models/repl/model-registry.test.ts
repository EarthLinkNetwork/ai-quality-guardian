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
