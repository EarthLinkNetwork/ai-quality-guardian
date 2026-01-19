/**
 * Key Validator Tests
 *
 * Tests for API key validation against OpenAI and Anthropic APIs.
 * Network calls are mocked to avoid actual API requests.
 *
 * SECURITY: Keys are NEVER logged in tests. All test keys are clearly fake.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  validateOpenAIKey,
  validateAnthropicKey,
  validateApiKey,
  isKeyFormatValid,
} from '../../../src/keys/key-validator';

describe('Key Validator', () => {
  // Store original fetch
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('isKeyFormatValid', () => {
    it('should return false for empty key', () => {
      assert.equal(isKeyFormatValid('openai', ''), false);
      assert.equal(isKeyFormatValid('anthropic', ''), false);
    });

    it('should return false for short key', () => {
      assert.equal(isKeyFormatValid('openai', 'sk-abc'), false);
      assert.equal(isKeyFormatValid('anthropic', 'sk-ant'), false);
    });

    it('should return true for valid OpenAI key format', () => {
      // Test key format only, not validity
      assert.equal(isKeyFormatValid('openai', 'sk-1234567890abcdefghijklmnopqrstuvwxyz'), true);
    });

    it('should return false for OpenAI key with wrong prefix', () => {
      assert.equal(isKeyFormatValid('openai', 'wrong-1234567890abcdefghijklmnopqrstuvwxyz'), false);
    });

    it('should return true for valid Anthropic key format', () => {
      // Test key format only, not validity
      assert.equal(isKeyFormatValid('anthropic', 'sk-ant-1234567890abcdefghijklmnopqrstuvwxyz'), true);
    });

    it('should return false for Anthropic key with wrong prefix', () => {
      assert.equal(isKeyFormatValid('anthropic', 'sk-1234567890abcdefghijklmnopqrstuvwxyz'), false);
    });

    it('should return true for unknown provider with sufficient length', () => {
      assert.equal(isKeyFormatValid('unknown', '1234567890abcdefghij'), true);
    });
  });

  describe('validateOpenAIKey', () => {
    it('should return valid=true for 200 response', async () => {
      // Mock fetch to return 200
      global.fetch = async () => ({
        status: 200,
        ok: true,
      }) as Response;

      const result = await validateOpenAIKey('sk-test-valid-key-1234567890');

      assert.equal(result.valid, true);
      assert.equal(result.provider, 'openai');
      assert.equal(result.error, undefined);
    });

    it('should return valid=false for 401 response (invalid key)', async () => {
      global.fetch = async () => ({
        status: 401,
        ok: false,
      }) as Response;

      const result = await validateOpenAIKey('sk-test-invalid-key-1234567890');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'openai');
      assert.equal(result.error, 'Invalid API key');
    });

    it('should return valid=false for 429 response (rate limited)', async () => {
      global.fetch = async () => ({
        status: 429,
        ok: false,
      }) as Response;

      const result = await validateOpenAIKey('sk-test-ratelimit-key-1234567890');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'openai');
      assert.equal(result.error, 'Rate limited - please try again');
    });

    it('should return valid=false for network error', async () => {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const result = await validateOpenAIKey('sk-test-network-error-key-1234567890');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'openai');
      assert.ok(result.error?.includes('Network error'));
    });

    it('should return valid=false for short key', async () => {
      const result = await validateOpenAIKey('sk-abc');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'openai');
      assert.equal(result.error, 'Key too short');
    });

    it('should return valid=false for empty key', async () => {
      const result = await validateOpenAIKey('');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'openai');
      assert.equal(result.error, 'Key too short');
    });

    it('should call correct OpenAI endpoint', async () => {
      let calledUrl = '';
      let calledHeaders: Record<string, string> = {};

      global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        calledUrl = url.toString();
        calledHeaders = init?.headers as Record<string, string>;
        return { status: 200, ok: true } as Response;
      };

      await validateOpenAIKey('sk-test-endpoint-check-1234567890');

      assert.equal(calledUrl, 'https://api.openai.com/v1/models');
      assert.ok(calledHeaders['Authorization']?.startsWith('Bearer '));
    });
  });

  describe('validateAnthropicKey', () => {
    it('should return valid=true for 400 response (auth OK, invalid request)', async () => {
      // Anthropic returns 400 for valid auth but invalid request
      global.fetch = async () => ({
        status: 400,
        ok: false,
      }) as Response;

      const result = await validateAnthropicKey('sk-ant-test-valid-key-1234567890');

      assert.equal(result.valid, true);
      assert.equal(result.provider, 'anthropic');
      assert.equal(result.error, undefined);
    });

    it('should return valid=true for 200 response', async () => {
      global.fetch = async () => ({
        status: 200,
        ok: true,
      }) as Response;

      const result = await validateAnthropicKey('sk-ant-test-valid-200-key-1234567890');

      assert.equal(result.valid, true);
      assert.equal(result.provider, 'anthropic');
    });

    it('should return valid=false for 401 response (invalid key)', async () => {
      global.fetch = async () => ({
        status: 401,
        ok: false,
      }) as Response;

      const result = await validateAnthropicKey('sk-ant-test-invalid-key-1234567890');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'anthropic');
      assert.equal(result.error, 'Invalid API key');
    });

    it('should return valid=false for 429 response (rate limited)', async () => {
      global.fetch = async () => ({
        status: 429,
        ok: false,
      }) as Response;

      const result = await validateAnthropicKey('sk-ant-test-ratelimit-key-1234567890');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'anthropic');
      assert.equal(result.error, 'Rate limited - please try again');
    });

    it('should return valid=false for network error', async () => {
      global.fetch = async () => {
        throw new Error('Connection refused');
      };

      const result = await validateAnthropicKey('sk-ant-test-network-error-key-1234567890');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'anthropic');
      assert.ok(result.error?.includes('Connection refused'));
    });

    it('should return valid=false for short key', async () => {
      const result = await validateAnthropicKey('sk-ant');

      assert.equal(result.valid, false);
      assert.equal(result.provider, 'anthropic');
      assert.equal(result.error, 'Key too short');
    });

    it('should call correct Anthropic endpoint with headers', async () => {
      let calledUrl = '';
      let calledHeaders: Record<string, string> = {};
      let calledMethod = '';

      global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        calledUrl = url.toString();
        calledHeaders = init?.headers as Record<string, string>;
        calledMethod = init?.method || '';
        return { status: 400, ok: false } as Response;
      };

      await validateAnthropicKey('sk-ant-test-endpoint-check-1234567890');

      assert.equal(calledUrl, 'https://api.anthropic.com/v1/messages');
      assert.equal(calledMethod, 'POST');
      assert.ok(calledHeaders['x-api-key']);
      assert.equal(calledHeaders['anthropic-version'], '2023-06-01');
      assert.equal(calledHeaders['content-type'], 'application/json');
    });
  });

  describe('validateApiKey', () => {
    it('should route to validateOpenAIKey for openai provider', async () => {
      global.fetch = async () => ({
        status: 200,
        ok: true,
      }) as Response;

      const result = await validateApiKey('openai', 'sk-test-valid-key-1234567890');

      assert.equal(result.provider, 'openai');
      assert.equal(result.valid, true);
    });

    it('should route to validateAnthropicKey for anthropic provider', async () => {
      global.fetch = async () => ({
        status: 400,
        ok: false,
      }) as Response;

      const result = await validateApiKey('anthropic', 'sk-ant-test-valid-key-1234567890');

      assert.equal(result.provider, 'anthropic');
      assert.equal(result.valid, true);
    });

    it('should handle case-insensitive provider name', async () => {
      global.fetch = async () => ({
        status: 200,
        ok: true,
      }) as Response;

      const result = await validateApiKey('OpenAI', 'sk-test-valid-key-1234567890');

      assert.equal(result.provider, 'openai');
      assert.equal(result.valid, true);
    });

    it('should return error for unknown provider', async () => {
      const result = await validateApiKey('unknown-provider', 'test-key-1234567890');

      assert.equal(result.valid, false);
      assert.ok(result.error?.includes('Unknown provider'));
    });
  });

  describe('Security: Keys never logged', () => {
    it('should not include key in error messages', async () => {
      const testKey = 'sk-secret-key-should-not-appear-1234567890';

      global.fetch = async () => ({
        status: 500,
        ok: false,
      }) as Response;

      const result = await validateOpenAIKey(testKey);

      // Error message should not contain the key
      if (result.error) {
        assert.ok(!result.error.includes(testKey), 'Error message should not contain the key');
        assert.ok(!result.error.includes('sk-secret'), 'Error message should not contain key prefix');
      }
    });

    it('should not include key in result object', async () => {
      const testKey = 'sk-ant-secret-key-should-not-appear-1234567890';

      global.fetch = async () => ({
        status: 401,
        ok: false,
      }) as Response;

      const result = await validateAnthropicKey(testKey);

      // Result should not have any field containing the key
      const resultStr = JSON.stringify(result);
      assert.ok(!resultStr.includes(testKey), 'Result should not contain the key');
      assert.ok(!resultStr.includes('sk-ant-secret'), 'Result should not contain key prefix');
    });
  });
});
