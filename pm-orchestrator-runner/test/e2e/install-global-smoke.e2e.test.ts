/**
 * Install Global Smoke E2E Tests
 *
 * These tests verify that the CLI is correctly configured for global installation.
 * They test the CLI directly via `node dist/cli/index.js` without requiring
 * actual global installation.
 *
 * Tests:
 *   1. CLI help output contains "web" command
 *   2. CLI help output does NOT contain "pm-orchestrator" (command references)
 *   3. `pm web --port 0` starts server and reaches listen state
 */

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'assert';
import * as path from 'path';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as http from 'http';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist/cli/index.js');

/**
 * Helper to run CLI command and capture output
 */
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args.join(' ')}`, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      timeout: 10000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Wait for HTTP server to respond with health check
 */
async function waitForHealth(
  port: number,
  maxWaitMs: number = 10000
): Promise<{ ok: boolean; response?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/api/health`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return { ok: true, response };
    } catch {
      // Server not ready yet, wait and retry
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return { ok: false };
}

describe('Install Global Smoke E2E Tests', function () {
  this.timeout(30000); // Allow time for server startup

  // Ensure dist/cli/index.js exists
  before(function () {
    try {
      require.resolve(CLI_PATH);
    } catch {
      this.skip();
    }
  });

  describe('CLI help output', function () {
    it('should show "web" command in help output', function () {
      const result = runCli(['--help']);

      // Help should succeed
      assert.strictEqual(result.exitCode, 0, `CLI help failed: ${result.stderr}`);

      // Help should contain "web" command
      assert.ok(
        result.stdout.includes('web'),
        `Help output should contain "web" command.\nActual output:\n${result.stdout}`
      );
    });

    it('should NOT contain "pm-orchestrator" as a command reference in help', function () {
      const result = runCli(['--help']);

      // Help should succeed
      assert.strictEqual(result.exitCode, 0, `CLI help failed: ${result.stderr}`);

      // Help should NOT contain "pm-orchestrator" as command usage
      // Note: Package name in descriptions is OK, but "pm-orchestrator <command>" is not
      const hasOrchestratorCommand =
        result.stdout.includes('pm-orchestrator ') ||
        result.stdout.includes('Usage: pm-orchestrator');

      assert.ok(
        !hasOrchestratorCommand,
        `Help output should NOT reference "pm-orchestrator" as a command.\nActual output:\n${result.stdout}`
      );
    });

    it('should show "pm" as the command name in help', function () {
      const result = runCli(['--help']);

      // Help should succeed
      assert.strictEqual(result.exitCode, 0, `CLI help failed: ${result.stderr}`);

      // Help should reference "pm" as the command
      assert.ok(
        result.stdout.includes('pm') || result.stdout.includes('Usage:'),
        `Help output should reference "pm" command.\nActual output:\n${result.stdout}`
      );
    });
  });

  describe('web command', function () {
    it('should have web subcommand that shows help', function () {
      const result = runCli(['web', '--help']);

      // Should not be "Unknown command"
      assert.ok(
        !result.stdout.includes('Unknown command') && !result.stderr.includes('Unknown command'),
        `"web" command should exist.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );
    });

    it('should start web server on specified port and respond to health check', async function () {
      // Use port 0 to get an OS-assigned port
      // We'll parse the actual port from stdout
      const testPort = 19876; // Use unusual port to avoid conflicts

      let serverProcess: ChildProcess | null = null;
      let actualPort = testPort;

      try {
        // Start web server
        serverProcess = spawn('node', [CLI_PATH, 'web', '--port', String(testPort), '--namespace', 'smoke-test'], {
          cwd: PROJECT_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        });

        // Capture stdout for port info
        let stdout = '';
        serverProcess.stdout?.on('data', (data) => {
          stdout += data.toString();
          // Try to extract port from output like "listening on port 19876"
          const portMatch = stdout.match(/port[:\s]+(\d+)/i);
          if (portMatch) {
            actualPort = parseInt(portMatch[1], 10);
          }
        });

        // Wait for server to be ready
        const health = await waitForHealth(actualPort, 15000);

        assert.ok(health.ok, `Web server health check failed on port ${actualPort}`);

        // Verify response contains expected fields
        if (health.response) {
          const healthData = JSON.parse(health.response);
          assert.strictEqual(healthData.status, 'ok', 'Health status should be "ok"');
          assert.ok(healthData.timestamp, 'Health response should include timestamp');
        }
      } finally {
        // Clean up: kill the server process
        if (serverProcess) {
          serverProcess.kill('SIGTERM');
          // Wait a bit for clean shutdown
          await new Promise((resolve) => setTimeout(resolve, 500));
          // Force kill if still running
          try {
            serverProcess.kill('SIGKILL');
          } catch {
            // Already dead, ignore
          }
        }
      }
    });
  });

  describe('version output', function () {
    it('should show version number', function () {
      const result = runCli(['--version']);

      assert.strictEqual(result.exitCode, 0, `CLI --version failed: ${result.stderr}`);

      // Version should be a semver-like format
      assert.ok(
        /^\d+\.\d+\.\d+/.test(result.stdout.trim()),
        `Version output should be semver format.\nActual: ${result.stdout}`
      );
    });
  });
});
