/**
 * AC-2: env から API Key が漏れない
 *
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md AC-2:
 * - child_process に process.env をそのまま渡していない
 * - ALLOWLIST 以外の環境変数が Executor に渡っていない
 *
 * Per spec/15_API_KEY_ENV_SANITIZE.md:
 * - ALLOWLIST 方式を使用（DELETELIST 方式は禁止）
 * - 許可する環境変数のみを明示的に渡す（PATH, HOME, USER, SHELL 等）
 * - API Key (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) は渡さない
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import { buildSanitizedEnv } from '../../src/executor/claude-code-executor';

describe('AC-2: env から API Key が漏れない', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('buildSanitizedEnv()', () => {
    it('OPENAI_API_KEY が子プロセスに渡らない', () => {
      // Set a test API key
      const testKey = 'sk-test-openai-secret-12345';
      process.env.OPENAI_API_KEY = testKey;

      // Build sanitized environment
      const sanitized = buildSanitizedEnv();

      // OPENAI_API_KEY should NOT be in sanitized env
      assert.strictEqual(
        sanitized.OPENAI_API_KEY,
        undefined,
        'OPENAI_API_KEY should NOT be passed to subprocess'
      );
    });

    it('ANTHROPIC_API_KEY が子プロセスに渡らない', () => {
      // Set a test API key
      const testKey = 'sk-ant-test-anthropic-secret-12345';
      process.env.ANTHROPIC_API_KEY = testKey;

      // Build sanitized environment
      const sanitized = buildSanitizedEnv();

      // ANTHROPIC_API_KEY should NOT be in sanitized env
      assert.strictEqual(
        sanitized.ANTHROPIC_API_KEY,
        undefined,
        'ANTHROPIC_API_KEY should NOT be passed to subprocess'
      );
    });

    it('CLAUDE_API_KEY が子プロセスに渡らない', () => {
      // Set a test API key
      const testKey = 'sk-claude-test-secret-12345';
      process.env.CLAUDE_API_KEY = testKey;

      // Build sanitized environment
      const sanitized = buildSanitizedEnv();

      // CLAUDE_API_KEY should NOT be in sanitized env
      assert.strictEqual(
        sanitized.CLAUDE_API_KEY,
        undefined,
        'CLAUDE_API_KEY should NOT be passed to subprocess'
      );
    });

    it('AWS_SECRET_ACCESS_KEY が子プロセスに渡らない', () => {
      // Set a test AWS key
      process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret-test-12345';

      const sanitized = buildSanitizedEnv();

      assert.strictEqual(
        sanitized.AWS_SECRET_ACCESS_KEY,
        undefined,
        'AWS_SECRET_ACCESS_KEY should NOT be passed to subprocess'
      );
    });

    it('GCP_PRIVATE_KEY が子プロセスに渡らない', () => {
      // Set a test GCP key
      process.env.GCP_PRIVATE_KEY = 'gcp-private-key-test-12345';

      const sanitized = buildSanitizedEnv();

      assert.strictEqual(
        sanitized.GCP_PRIVATE_KEY,
        undefined,
        'GCP_PRIVATE_KEY should NOT be passed to subprocess'
      );
    });

    it('DATABASE_URL が子プロセスに渡らない', () => {
      // Set a test database URL
      process.env.DATABASE_URL = 'postgres://user:password@localhost/db';

      const sanitized = buildSanitizedEnv();

      assert.strictEqual(
        sanitized.DATABASE_URL,
        undefined,
        'DATABASE_URL should NOT be passed to subprocess'
      );
    });

    it('ALLOWLIST の環境変数のみが渡される', () => {
      // Set up test environment with various variables
      process.env.PATH = '/usr/bin:/bin';
      process.env.HOME = '/home/test';
      process.env.USER = 'testuser';
      process.env.SHELL = '/bin/bash';
      process.env.OPENAI_API_KEY = 'sk-secret';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-secret';
      process.env.CUSTOM_SECRET = 'custom-secret';

      const sanitized = buildSanitizedEnv();

      // ALLOWLIST variables should be present
      const allowlist = [
        'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL',
        'LC_CTYPE', 'TERM', 'TMPDIR', 'XDG_CONFIG_HOME',
        'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'NODE_ENV', 'DEBUG',
      ];

      // All keys in sanitized env should be in allowlist
      for (const key of Object.keys(sanitized)) {
        assert.ok(
          allowlist.includes(key),
          `Key "${key}" should be in ALLOWLIST, but found in sanitized env`
        );
      }

      // Non-allowlist variables should NOT be present
      assert.strictEqual(sanitized.OPENAI_API_KEY, undefined);
      assert.strictEqual(sanitized.ANTHROPIC_API_KEY, undefined);
      assert.strictEqual(sanitized.CUSTOM_SECRET, undefined);
    });

    it('ALLOWLIST の変数が正しく渡される（存在する場合）', () => {
      // Set up test environment
      process.env.PATH = '/usr/bin:/bin:/test/path';
      process.env.HOME = '/home/testuser';
      process.env.USER = 'testuser';
      process.env.NODE_ENV = 'test';

      const sanitized = buildSanitizedEnv();

      // These should be passed through
      assert.strictEqual(sanitized.PATH, '/usr/bin:/bin:/test/path');
      assert.strictEqual(sanitized.HOME, '/home/testuser');
      assert.strictEqual(sanitized.USER, 'testuser');
      assert.strictEqual(sanitized.NODE_ENV, 'test');
    });

    it('未定義の ALLOWLIST 変数は省略される', () => {
      // Remove some allowlist variables
      delete process.env.DEBUG;
      delete process.env.TMPDIR;

      const sanitized = buildSanitizedEnv();

      // Should not have undefined values
      for (const [key, value] of Object.entries(sanitized)) {
        assert.ok(
          value !== undefined,
          `${key} should not be undefined in sanitized env`
        );
      }
    });
  });

  describe('ALLOWLIST vs DELETELIST approach', () => {
    it('新しい API Key 形式も自動的にブロックされる（ALLOWLIST の利点）', () => {
      // Set various API key formats that might be added in the future
      process.env.NEW_AI_API_KEY = 'new-ai-key-12345';
      process.env.FUTURE_SECRET_TOKEN = 'future-token-12345';
      process.env.AZURE_OPENAI_KEY = 'azure-key-12345';
      process.env.GOOGLE_AI_KEY = 'google-ai-key-12345';

      const sanitized = buildSanitizedEnv();

      // All these should be blocked by ALLOWLIST approach
      assert.strictEqual(sanitized.NEW_AI_API_KEY, undefined);
      assert.strictEqual(sanitized.FUTURE_SECRET_TOKEN, undefined);
      assert.strictEqual(sanitized.AZURE_OPENAI_KEY, undefined);
      assert.strictEqual(sanitized.GOOGLE_AI_KEY, undefined);
    });

    it('process.env を直接渡していないことを確認', () => {
      // Set a unique test variable
      const uniqueKey = `UNIQUE_TEST_VAR_${Date.now()}`;
      (process.env as Record<string, string>)[uniqueKey] = 'test-value';

      const sanitized = buildSanitizedEnv();

      // This unique variable should NOT appear in sanitized env
      assert.strictEqual(
        (sanitized as Record<string, string>)[uniqueKey],
        undefined,
        'Random env variables should not be passed through'
      );

      // Cleanup
      delete (process.env as Record<string, string>)[uniqueKey];
    });
  });
});
