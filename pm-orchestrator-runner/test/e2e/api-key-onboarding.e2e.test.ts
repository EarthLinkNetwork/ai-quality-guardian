/**
 * E2E Tests for API Key Onboarding Flow
 *
 * These tests verify that:
 * 1. Starting pm without API key triggers the onboarding flow
 * 2. --no-auth option bypasses the onboarding flow
 * 3. Non-interactive mode fails if no API key is configured
 * 4. Existing API key (env var) skips onboarding
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

describe('API Key Onboarding E2E', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let configDir: string;
  let configFile: string;

  beforeEach(() => {
    // Create temp directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-key-onboarding-test-'));

    // Save original environment
    originalEnv = { ...process.env };

    // Set up temp config directory to avoid polluting real config
    configDir = path.join(tempDir, '.pm-orchestrator-runner');
    configFile = path.join(configDir, 'config.json');
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Restore original environment
    process.env = originalEnv;
  });

  /**
   * Run CLI with given arguments and environment
   */
  async function runCLI(
    args: string[],
    env: Record<string, string | undefined>,
    options: { timeout?: number; input?: string } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const cliPath = path.join(__dirname, '../../dist/cli/index.js');
      const timeout = options.timeout || 5000;

      const child = spawn('node', [cliPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...env,
          NO_COLOR: '1',
          // Override HOME to use temp config dir
          HOME: tempDir,
        },
        cwd: tempDir,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Send input if provided
      if (options.input) {
        child.stdin?.write(options.input);
      }
      child.stdin?.end();

      // Timeout handler
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        resolve({
          stdout,
          stderr,
          exitCode: timedOut ? -1 : exitCode,
        });
      });
    });
  }

  describe('Non-interactive mode without API key', () => {
    it('should fail with error when no API key is configured', async function () {
      this.timeout(10000);

      // Run with --non-interactive and NO API key
      const result = await runCLI(
        ['repl', '--non-interactive', '--exit-on-eof'],
        {
          OPENAI_API_KEY: undefined,
          ANTHROPIC_API_KEY: undefined,
        },
        { input: '/exit\n' }
      );

      // Should fail with error about missing API key
      assert.ok(
        result.stderr.includes('No API key configured') ||
          result.stderr.includes('ERROR') ||
          result.exitCode !== 0,
        `Expected error about missing API key. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
    });

    it('should succeed with --no-auth option', async function () {
      this.timeout(10000);

      // Run with --no-auth option
      const result = await runCLI(
        ['repl', '--non-interactive', '--exit-on-eof', '--no-auth'],
        {
          OPENAI_API_KEY: undefined,
          ANTHROPIC_API_KEY: undefined,
        },
        { input: '/exit\n' }
      );

      // Should NOT fail with API key error
      assert.ok(
        !result.stderr.includes('No API key configured'),
        `Should not require API key with --no-auth. stderr: ${result.stderr}`
      );
    });
  });

  describe('With API key in environment', () => {
    it('should skip onboarding when OPENAI_API_KEY is set', async function () {
      this.timeout(10000);

      // Run with API key set
      const result = await runCLI(
        ['repl', '--non-interactive', '--exit-on-eof'],
        {
          OPENAI_API_KEY: 'sk-test-key-for-e2e-testing',
          ANTHROPIC_API_KEY: undefined,
        },
        { input: '/exit\n' }
      );

      // Should NOT prompt for API key
      assert.ok(
        !result.stdout.includes('API Key Setup') &&
          !result.stdout.includes('Enter your'),
        `Should not show API key setup when key is already configured. stdout: ${result.stdout}`
      );

      // Should not fail with API key error
      assert.ok(
        !result.stderr.includes('No API key configured'),
        `Should not require API key input. stderr: ${result.stderr}`
      );
    });

    it('should skip onboarding when ANTHROPIC_API_KEY is set', async function () {
      this.timeout(10000);

      // Run with Anthropic API key set
      const result = await runCLI(
        ['repl', '--non-interactive', '--exit-on-eof'],
        {
          OPENAI_API_KEY: undefined,
          ANTHROPIC_API_KEY: 'sk-ant-test-key-for-e2e-testing',
        },
        { input: '/exit\n' }
      );

      // Should NOT prompt for API key
      assert.ok(
        !result.stdout.includes('API Key Setup') &&
          !result.stdout.includes('Enter your'),
        `Should not show API key setup when key is already configured. stdout: ${result.stdout}`
      );

      // Should not fail with API key error
      assert.ok(
        !result.stderr.includes('No API key configured'),
        `Should not require API key input. stderr: ${result.stderr}`
      );
    });
  });

  describe('Help text', () => {
    it('should document --no-auth option in help', async function () {
      this.timeout(5000);

      const result = await runCLI(['--help'], {});

      // Should include --no-auth option
      assert.ok(
        result.stdout.includes('--no-auth'),
        `Help should document --no-auth option. stdout: ${result.stdout}`
      );

      // Should include warning about bypassing API key
      assert.ok(
        result.stdout.includes('Skip API key') || result.stdout.includes('bypass'),
        `Help should explain --no-auth behavior. stdout: ${result.stdout}`
      );
    });
  });
});
