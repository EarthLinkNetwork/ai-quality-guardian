/**
 * Provider Command Tests
 *
 * Per spec 10_REPL_UX.md Section 2.1 and 06_CORRECTNESS_PROPERTIES.md Property 23
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderCommand } from '../../../../src/repl/commands/provider';

describe('ProviderCommand', () => {
  let tempDir: string;
  let claudeDir: string;
  let providerCommand: ProviderCommand;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-cmd-test-'));
    claudeDir = path.join(tempDir, '.claude');
    providerCommand = new ProviderCommand();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getProvider', () => {
    it('should return E101 when .claude directory does not exist', async () => {
      const result = await providerCommand.getProvider(tempDir);

      assert.equal(result.success, false);
      assert.equal(result.error?.code, 'E101');
    });

    it('should return UNSET when repl.json does not exist', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await providerCommand.getProvider(tempDir);

      assert.equal(result.success, true);
      assert.equal(result.provider, 'UNSET');
    });

    it('should return UNSET when selected_provider is null', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'repl.json'),
        JSON.stringify({ selected_provider: null, selected_model: null, updated_at: null })
      );

      const result = await providerCommand.getProvider(tempDir);

      assert.equal(result.success, true);
      assert.equal(result.provider, 'UNSET');
    });

    it('should return current provider when set', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'repl.json'),
        JSON.stringify({
          selected_provider: 'claude-code',
          selected_model: null,
          updated_at: new Date().toISOString()
        })
      );

      const result = await providerCommand.getProvider(tempDir);

      assert.equal(result.success, true);
      assert.equal(result.provider, 'claude-code');
    });

    it('should return E105 when repl.json is corrupted', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'repl.json'), 'invalid json');

      const result = await providerCommand.getProvider(tempDir);

      assert.equal(result.success, false);
      assert.equal(result.error?.code, 'E105');
    });
  });

  describe('setProvider', () => {
    it('should return E101 when .claude directory does not exist', async () => {
      const result = await providerCommand.setProvider(tempDir, 'claude-code');

      assert.equal(result.success, false);
      assert.equal(result.error?.code, 'E101');
    });

    it('should return E102 for invalid provider', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await providerCommand.setProvider(tempDir, 'invalid-provider');

      assert.equal(result.success, false);
      assert.equal(result.error?.code, 'E102');
    });

    it('should set provider successfully', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await providerCommand.setProvider(tempDir, 'openai');

      assert.equal(result.success, true);
      assert.equal(result.provider, 'openai');
      assert.ok(result.configPath);

      // Verify file was written
      const content = fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8');
      const state = JSON.parse(content);
      assert.equal(state.selected_provider, 'openai');
    });

    it('should reset model when provider changes', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'repl.json'),
        JSON.stringify({
          selected_provider: 'claude-code',
          selected_model: 'some-model',
          updated_at: new Date().toISOString()
        })
      );

      const result = await providerCommand.setProvider(tempDir, 'anthropic');

      assert.equal(result.success, true);

      const content = fs.readFileSync(path.join(claudeDir, 'repl.json'), 'utf-8');
      const state = JSON.parse(content);
      assert.equal(state.selected_provider, 'anthropic');
      assert.equal(state.selected_model, null);
    });

    it('should generate evidence on provider change', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });

      const result = await providerCommand.setProvider(tempDir, 'openai');

      assert.equal(result.success, true);
      assert.ok(result.evidencePath);
      assert.ok(fs.existsSync(result.evidencePath!));
    });
  });

  describe('listProviders', () => {
    it('should return all providers', async () => {
      const result = await providerCommand.listProviders();

      assert.equal(result.success, true);
      assert.ok(result.providers);
      assert.ok(result.providers.length >= 3);

      const ids = result.providers.map(p => p.id);
      assert.ok(ids.includes('claude-code'));
      assert.ok(ids.includes('openai'));
      assert.ok(ids.includes('anthropic'));
    });
  });

  describe('formatProviderList', () => {
    it('should format provider list with current marker', async () => {
      const result = await providerCommand.listProviders();
      const output = providerCommand.formatProviderList(result.providers!, 'openai');

      assert.ok(output.includes('Available Providers'));
      assert.ok(output.includes('OpenAI (current)'));
      assert.ok(!output.includes('Claude Code (current)'));
    });
  });
});
