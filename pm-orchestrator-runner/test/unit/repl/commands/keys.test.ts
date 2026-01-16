/**
 * Keys Command Tests
 *
 * Per spec 10_REPL_UX.md Section 2.3 and 06_CORRECTNESS_PROPERTIES.md Property 24
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import { KeysCommand } from '../../../../src/repl/commands/keys';

describe('KeysCommand', () => {
  let keysCommand: KeysCommand;

  beforeEach(() => {
    keysCommand = new KeysCommand();
  });

  describe('getKeyStatus', () => {
    it('should return status for all providers', async () => {
      const result = await keysCommand.getKeyStatus();

      assert.equal(result.success, true);
      assert.ok(result.keys);
      assert.ok(result.keys.length >= 3);

      // Verify claude-code does not require API key
      const claudeCode = result.keys.find(k => k.provider === 'Claude Code');
      assert.ok(claudeCode);
      assert.equal(claudeCode.required, false);
      assert.equal(claudeCode.status, 'NOT_REQUIRED');
    });

    it('should not expose actual API key values (Property 24)', async () => {
      const result = await keysCommand.getKeyStatus();

      assert.equal(result.success, true);
      // Verify no actual key values are present
      for (const key of result.keys!) {
        assert.ok(
          key.status === 'SET' || key.status === 'NOT SET' || key.status === 'NOT_REQUIRED',
          'Status should only be SET, NOT SET, or NOT_REQUIRED'
        );
      }
    });
  });

  describe('checkProviderKey', () => {
    it('should return E102 for invalid provider', async () => {
      const result = await keysCommand.checkProviderKey('invalid-provider');

      assert.equal(result.success, false);
      assert.equal(result.error?.code, 'E102');
    });

    it('should return status for valid provider', async () => {
      const result = await keysCommand.checkProviderKey('openai');

      assert.equal(result.success, true);
      assert.ok(result.keys);
      assert.equal(result.keys.length, 1);
      assert.equal(result.keys[0].provider, 'OpenAI');
    });

    it('should return NOT_REQUIRED for claude-code', async () => {
      const result = await keysCommand.checkProviderKey('claude-code');

      assert.equal(result.success, true);
      assert.ok(result.keys);
      assert.equal(result.keys[0].required, false);
      assert.equal(result.keys[0].status, 'NOT_REQUIRED');
    });
  });


  describe('formatKeyStatus', () => {
    it('should format key status without exposing actual values', async () => {
      const result = await keysCommand.getKeyStatus();
      assert.equal(result.success, true);
      assert.ok(result.keys);
      
      const output = keysCommand.formatKeyStatus(result.keys!);

      assert.ok(output.includes('API Key Status'));
      assert.ok(output.includes('Claude Code'));
      assert.ok(output.includes('Not required'));
      
      // Verify no actual key values appear (full key patterns)
      // Help text contains examples like 'sk-...' which are acceptable
      // But actual keys like 'sk-abc123...' (20+ chars) should not appear
      assert.ok(!output.match(/sk-[A-Za-z0-9]{20,}/), 'Should not contain actual OpenAI keys');
      assert.ok(!output.match(/sk-ant-[A-Za-z0-9-]{20,}/), 'Should not contain actual Anthropic keys');
    });
  });
});
