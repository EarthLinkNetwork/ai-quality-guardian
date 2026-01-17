/**
 * AC-1: API Key 未設定でも起動する
 *
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md AC-1:
 * - OPENAI_API_KEY 環境変数がなくても Runner は起動する
 * - ANTHROPIC_API_KEY 環境変数がなくても Runner は起動する
 * - Claude Code CLI のログイン状態のみで動作する
 *
 * Per spec/15_API_KEY_ENV_SANITIZE.md:
 * - API Key 環境変数は子プロセスに渡さない
 * - ALLOWLIST 方式で許可する変数のみを渡す
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { REPLInterface } from '../../src/repl/repl-interface';
import { ClaudeCodeExecutor } from '../../src/executor/claude-code-executor';

describe('AC-1: API Key 未設定でも起動する', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temp directory with valid project structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-1-test-'));
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test Project\n');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('REPLInterface should start without OPENAI_API_KEY', () => {
    // Remove API keys from environment
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // REPLInterface should instantiate without error
    let repl: REPLInterface | undefined;
    assert.doesNotThrow(() => {
      repl = new REPLInterface({
        projectMode: 'fixed',
        projectRoot: tempDir,
        forceNonInteractive: true,
      });
    }, 'REPLInterface should start without API keys');

    assert.ok(repl, 'REPLInterface instance should be created');
  });

  it('REPLInterface should start without ANTHROPIC_API_KEY', () => {
    // Remove API keys from environment
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    let repl: REPLInterface | undefined;
    assert.doesNotThrow(() => {
      repl = new REPLInterface({
        projectMode: 'fixed',
        projectRoot: tempDir,
        forceNonInteractive: true,
      });
    }, 'REPLInterface should start without ANTHROPIC_API_KEY');

    assert.ok(repl, 'REPLInterface instance should be created');
  });

  it('ClaudeCodeExecutor should instantiate without API keys', () => {
    // Remove API keys from environment
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    let executor: ClaudeCodeExecutor | undefined;
    assert.doesNotThrow(() => {
      executor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 30000,
      });
    }, 'ClaudeCodeExecutor should instantiate without API keys');

    assert.ok(executor, 'ClaudeCodeExecutor instance should be created');
  });

  it('REPLInterface should start with temp mode without API keys', () => {
    // Remove API keys from environment
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    let repl: REPLInterface | undefined;
    assert.doesNotThrow(() => {
      repl = new REPLInterface({
        projectMode: 'temp',
        forceNonInteractive: true,
      });
    }, 'REPLInterface should start in temp mode without API keys');

    assert.ok(repl, 'REPLInterface instance should be created');
  });

  it('REPLInterface should start with cwd mode without API keys', () => {
    // Remove API keys from environment
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // Change to temp directory to ensure it has a valid structure
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    let repl: REPLInterface | undefined;
    try {
      assert.doesNotThrow(() => {
        repl = new REPLInterface({
          projectMode: 'cwd',
          forceNonInteractive: true,
        });
      }, 'REPLInterface should start in cwd mode without API keys');

      assert.ok(repl, 'REPLInterface instance should be created');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
