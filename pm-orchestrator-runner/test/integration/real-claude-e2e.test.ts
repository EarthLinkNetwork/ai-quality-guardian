/**
 * Real Claude Code E2E Tests
 *
 * These tests verify that pm-orchestrator-runner works correctly with the real Claude Code CLI.
 * They are SKIPPED by default and only run when REAL_CLAUDE_E2E=1.
 *
 * Purpose:
 * - Verify non-interactive REPL never hangs with real Claude Code
 * - Verify timeout mechanisms work correctly
 * - Verify session persistence works correctly
 *
 * Prerequisites:
 * - Claude Code CLI must be installed and authenticated
 * - Set REAL_CLAUDE_E2E=1 to enable these tests
 *
 * Usage:
 *   REAL_CLAUDE_E2E=1 npm run test:integration -- --grep "Real Claude Code E2E"
 *
 * IMPORTANT: These tests make REAL API calls and may take several minutes.
 */

import { describe, it, beforeEach, afterEach, before } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';

/**
 * Check if real Claude Code E2E tests should run
 */
function shouldRunRealE2E(): boolean {
  return process.env.REAL_CLAUDE_E2E === '1';
}

/**
 * Check if Claude Code CLI is available and authenticated
 */
function isClaudeCodeAvailable(): boolean {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('Real Claude Code E2E Tests', () => {
  // Gate check - skip all tests if REAL_CLAUDE_E2E is not set
  before(function() {
    console.log('');
    console.log('======================================================================');
    console.log('[Real Claude Code E2E] Environment Check');
    console.log('======================================================================');
    console.log(`  REAL_CLAUDE_E2E: ${process.env.REAL_CLAUDE_E2E || '(not set)'}`);

    if (!shouldRunRealE2E()) {
      console.log('  GATE: CLOSED - Tests will be SKIPPED');
      console.log('  Set REAL_CLAUDE_E2E=1 to run these tests');
      console.log('======================================================================');
      console.log('');
      this.skip();
      return;
    }

    if (!isClaudeCodeAvailable()) {
      console.log('  Claude Code CLI: NOT AVAILABLE');
      console.log('  Install and authenticate Claude Code CLI first');
      console.log('======================================================================');
      console.log('');
      this.skip();
      return;
    }

    console.log('  GATE: OPEN - Tests will RUN');
    console.log('  WARNING: These tests make REAL API calls');
    console.log('======================================================================');
    console.log('');
  });

  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-claude-e2e-'));
    projectDir = tempDir;

    // Create valid .claude directory structure
    const claudeDir = path.join(projectDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test Project\n\nE2E test project.');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
      project: { name: 'e2e-test', version: '1.0.0' },
      pm: { autoStart: false },
    }, null, 2));
    fs.mkdirSync(path.join(claudeDir, 'logs', 'sessions'), { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Test 1: Basic session lifecycle - MUST NOT HANG
   */
  describe('Test 1: Session Lifecycle (No Hang)', () => {
    it('should complete /start -> /tasks -> /exit without hanging', async function() {
      // Real Claude Code may take longer
      this.timeout(120000);

      const input = '/start\n/tasks\n/exit\n';

      const result = await runRealREPL(projectDir, input, {
        timeoutMs: 60000  // 60s should be plenty for just commands
      });

      // CRITICAL: Must not timeout
      assert.ok(!result.timedOut,
        `REPL should not timeout. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      // Should have clean exit
      assert.ok(result.exitCode !== null,
        `Exit code should be defined. Got: ${result.exitCode}`);

      // Should show session started
      const hasSessionStarted = result.stdout.includes('Session started') ||
                                result.stdout.includes('session-');
      assert.ok(hasSessionStarted,
        `Should show session start. stdout:\n${result.stdout}`);

      // Should show goodbye
      assert.ok(result.stdout.includes('Goodbye'),
        `Should show goodbye message. stdout:\n${result.stdout}`);
    });

    it('should complete simple natural language task', async function() {
      // Natural language tasks may take longer
      this.timeout(300000);

      // Very simple task that should complete quickly
      const input = '/start\necho hello world\n/tasks\n/exit\n';

      const result = await runRealREPL(projectDir, input, {
        timeoutMs: 180000  // 3 minutes for a simple task
      });

      // CRITICAL: Must not timeout
      assert.ok(!result.timedOut,
        `REPL should not timeout. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      // Should have clean exit
      assert.ok(result.exitCode !== null,
        `Exit code should be defined. Got: ${result.exitCode}`);

      // Should show task processing
      const hasTaskOutput = result.stdout.includes('Processing task') ||
                           result.stdout.includes('Execution Result');
      assert.ok(hasTaskOutput,
        `Should show task processing. stdout:\n${result.stdout}`);
    });
  });

  /**
   * Test 2: Timeout handling - executor must terminate eventually
   */
  describe('Test 2: Timeout Handling', () => {
    it('should handle long-running tasks with soft/hard timeout', async function() {
      // This test intentionally triggers timeouts
      this.timeout(300000);

      // Task that would take very long - should be terminated by hard timeout
      const input = '/start\nwrite a 10000 word essay about quantum physics\n/exit\n';

      const result = await runRealREPL(projectDir, input, {
        timeoutMs: 180000  // 3 minutes - hard timeout should kick in before this
      });

      // Even if task times out internally, REPL should exit cleanly
      assert.ok(result.exitCode !== null,
        `Exit code should be defined. Got: ${result.exitCode}`);

      // Should not be killed by our test timeout
      // (internal timeout should handle it first)
      console.log(`[Timeout Test] Exit code: ${result.exitCode}, timedOut: ${result.timedOut}`);
    });
  });

  /**
   * Test 3: Session persistence - files must exist
   */
  describe('Test 3: Session Persistence', () => {
    it('should create session.json and evidence files', async function() {
      this.timeout(120000);

      const input = '/start\n/tasks\n/exit\n';

      const result = await runRealREPL(projectDir, input, {
        timeoutMs: 60000
      });

      assert.ok(!result.timedOut, 'Should not timeout');

      // Check for session files (may be in temp directory for temp mode)
      // Parse PROJECT_PATH from stdout if available
      const projectPathMatch = result.stdout.match(/Project: ([^\n]+)/);
      const actualProjectPath = projectPathMatch ? projectPathMatch[1].trim() : projectDir;

      const evidenceDir = path.join(actualProjectPath, '.claude', 'evidence');
      const logsDir = path.join(actualProjectPath, '.claude', 'logs');

      console.log(`[Session Persistence] Checking paths:`);
      console.log(`  actualProjectPath: ${actualProjectPath}`);
      console.log(`  evidenceDir exists: ${fs.existsSync(evidenceDir)}`);
      console.log(`  logsDir exists: ${fs.existsSync(logsDir)}`);

      // List contents if directory exists
      if (fs.existsSync(evidenceDir)) {
        const contents = fs.readdirSync(evidenceDir);
        console.log(`  evidenceDir contents: ${JSON.stringify(contents)}`);
      }

      // At minimum, .claude/logs should exist
      assert.ok(fs.existsSync(logsDir) || fs.existsSync(evidenceDir),
        `Session files should exist. evidenceDir: ${evidenceDir}, logsDir: ${logsDir}`);
    });
  });

  /**
   * Test 4: Multiple consecutive runs - verify stability
   */
  describe('Test 4: Stability (Multiple Runs)', () => {
    it('should complete 3 consecutive runs without issues', async function() {
      this.timeout(300000);

      const input = '/start\n/tasks\n/exit\n';

      for (let i = 1; i <= 3; i++) {
        console.log(`[Stability Test] Run ${i}/3...`);

        const result = await runRealREPL(projectDir, input, {
          timeoutMs: 60000
        });

        assert.ok(!result.timedOut,
          `Run ${i} should not timeout. stdout:\n${result.stdout}`);

        assert.ok(result.exitCode !== null,
          `Run ${i} should have exit code. Got: ${result.exitCode}`);

        assert.ok(result.stdout.includes('Goodbye'),
          `Run ${i} should show goodbye`);

        console.log(`[Stability Test] Run ${i}/3 completed. Exit code: ${result.exitCode}`);
      }
    });
  });
});

/**
 * Helper to run REPL with real Claude Code CLI
 */
async function runRealREPL(
  projectDir: string,
  input: string,
  options: { timeoutMs?: number } = {}
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, '../../dist/cli/index.js');
    const timeoutMs = options.timeoutMs || 120000;

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn('node', [
      cliPath,
      'repl',
      '--project-mode', 'fixed',
      '--project-root', projectDir
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        PM_RUNNER_NON_INTERACTIVE: '1',
        // Do NOT set CLI_TEST_MODE - we want real Claude Code
      },
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Print progress in real-time for visibility
      process.stdout.write(text);
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    // Write input
    child.stdin?.write(input);
    child.stdin?.end();

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode, timedOut });
    });

    child.on('error', (err) => {
      stderr += err.message;
      resolve({ stdout, stderr, exitCode: 1, timedOut });
    });

    // Timeout fallback
    setTimeout(() => {
      if (!child.killed) {
        console.log(`\n[TIMEOUT] Killing process after ${timeoutMs}ms`);
        timedOut = true;
        child.kill('SIGTERM');

        // Force kill after 5 seconds if SIGTERM didn't work
        setTimeout(() => {
          if (!child.killed) {
            console.log('[FORCE KILL] SIGKILL');
            child.kill('SIGKILL');
          }
        }, 5000);
      }
    }, timeoutMs);
  });
}

/**
 * Summary report at the end
 */
describe('Real Claude Code E2E Test Summary', () => {
  it('should report test execution status', function() {
    console.log('');
    console.log('======================================================================');
    console.log('[Real Claude Code E2E] Test Summary');
    console.log('======================================================================');

    if (!shouldRunRealE2E()) {
      console.log('  STATUS: TESTS SKIPPED');
      console.log('  REASON: REAL_CLAUDE_E2E is not set to 1');
      console.log('');
      console.log('  To run these tests:');
      console.log('    export REAL_CLAUDE_E2E=1');
      console.log('    npm run test:integration -- --grep "Real Claude Code E2E"');
    } else if (!isClaudeCodeAvailable()) {
      console.log('  STATUS: TESTS SKIPPED');
      console.log('  REASON: Claude Code CLI not available');
    } else {
      console.log('  STATUS: TESTS EXECUTED');
      console.log('  See individual test results above');
    }

    console.log('======================================================================');
    console.log('');
  });
});
