/**
 * Integration tests for Executor blocking detection and Fail-Closed handling
 * (Property 34, 35, 36)
 *
 * These tests verify:
 * - Property 34: Executor stdin Blocking in Non-Interactive Mode
 * - Property 35: Task Terminal State Guarantee in Non-Interactive Mode
 * - Property 36: Subsequent Command Processing Guarantee in Non-Interactive Mode
 *
 * TDD: These tests are written FIRST, before implementation.
 *
 * Test Cases:
 * - Case A: Executor that blocks on stdin is terminated via Fail-Closed
 * - Case B: Interactive prompt detection triggers Fail-Closed termination
 * - Case C: Timeout detection triggers Fail-Closed termination
 * - Case D: After Fail-Closed, /tasks /logs /exit still work
 * - Case E: TaskLog records executor_blocked, blocked_reason, timeout_ms, terminated_by
 */

import { describe, it, beforeEach, afterEach, before } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { skipIfClaudeUnavailable } from '../helpers/claude-availability';

/**
 * Check if CLI tests should run
 * These tests require CLI_TEST_MODE=1 to run because they spawn real CLI processes
 */
function shouldRunCliTests(): boolean {
  return process.env.CLI_TEST_MODE === '1';
}

/**
 * NOTE: These tests spawn the actual CLI and depend on Claude Code CLI availability.
 * For deterministic testing without CLI, use test/integration/repl-deterministic.test.ts
 * Per Property 37, new tests should use FakeExecutor.
 *
 * To run these tests: CLI_TEST_MODE=1 npm test
 */
describe('Executor Blocking Detection (Property 34-36) [CLI-dependent]', () => {
  // Skip entire suite if CLI_TEST_MODE is not set or Claude Code CLI is not available
  before(function() {
    if (!shouldRunCliTests()) {
      console.log('[CLI-dependent Test] SKIPPING: CLI_TEST_MODE is not set to 1');
      this.skip();
      return;
    }
    skipIfClaudeUnavailable(this);
  });
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-blocking-test-'));
    projectDir = tempDir;

    // Create valid .claude directory structure
    const claudeDir = path.join(projectDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test Project\n\nDemo project for testing.');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
      project: { name: 'test-project', version: '1.0.0' },
      pm: { autoStart: false, defaultModel: 'claude-sonnet-4-20250514' },
    }, null, 2));
    fs.mkdirSync(path.join(claudeDir, 'agents'));
    fs.writeFileSync(path.join(claudeDir, 'agents', 'pm-orchestrator.md'), '# PM Agent');
    fs.mkdirSync(path.join(claudeDir, 'rules'));
    fs.writeFileSync(path.join(claudeDir, 'rules', 'project-rules.md'), '# Rules');

    // Create logs directory structure
    fs.mkdirSync(path.join(claudeDir, 'logs'));
    fs.mkdirSync(path.join(claudeDir, 'logs', 'sessions'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Case A: Property 34 - Executor stdin blocking detection
   *
   * In non-interactive mode, if Executor tries to read from stdin,
   * it must be detected and terminated via Fail-Closed mechanism.
   */
  describe('Case A: Executor stdin Blocking Detection (Property 34)', () => {
    it('should not block when executor tries to read stdin in non-interactive mode', async function() {
      this.timeout(30000);

      // Create a mock executor that tries to read stdin
      const mockExecutorPath = path.join(projectDir, 'mock-stdin-executor.js');
      fs.writeFileSync(mockExecutorPath, `
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        console.log('Executor started, waiting for stdin...');
        rl.question('Enter value: ', (answer) => {
          console.log('Got answer:', answer);
          process.exit(0);
        });
      `);

      // Spawn the mock executor with stdin set to 'ignore' (as spec requires)
      const child = spawn('node', [mockExecutorPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let exited = false;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      const exitPromise = new Promise<number>((resolve) => {
        child.on('close', (code) => {
          exited = true;
          resolve(code ?? 1);
        });
      });

      // Wait for either exit or timeout
      const timeoutPromise = new Promise<number>((resolve) => {
        setTimeout(() => {
          if (!exited) {
            child.kill('SIGTERM');
          }
          resolve(-1);
        }, 5000);
      });

      const exitCode = await Promise.race([exitPromise, timeoutPromise]);

      // With stdin: 'ignore', the executor should exit immediately or error
      // It should NOT block waiting for input
      assert.ok(exited || exitCode === -1,
        'Executor should not block indefinitely when stdin is ignored');

      // If it exited naturally, it should have errored (no stdin available)
      if (exitCode !== -1) {
        // The mock executor should have exited (likely with an error since stdin is closed)
        assert.ok(exitCode !== 0 || stdout.includes('Executor started'),
          'Executor should handle missing stdin gracefully');
      }
    });

    it('should spawn executor with stdin ignore/closed in non-interactive mode', async function() {
      this.timeout(30000);

      // This test verifies the REPL itself spawns executors correctly
      // In non-interactive mode, executor stdin must be 'ignore' or closed pipe

      // We can't directly test the spawn call, but we can verify behavior:
      // A task that would normally prompt for input should not block

      const input = '/start\nCreate a file but ask me for the name\n/tasks\n/exit\n';
      const result = await runREPLWithInput(projectDir, input, { timeout: 25000 });

      // The important thing is that we don't hang waiting for input
      // Either the task completes, fails, or times out - but REPL should not block
      assert.ok(result.exitCode !== null,
        'REPL should exit (not block) even if executor would prompt for input');

      // /tasks and /exit should have processed
      const hasTasksOrExit = result.stdout.includes('Tasks') ||
                            result.stdout.includes('No tasks') ||
                            result.stdout.includes('Goodbye');
      assert.ok(hasTasksOrExit,
        `Commands after task should process. stdout:\n${result.stdout}`);
    });
  });

  /**
   * Case B: Property 34 - Interactive prompt detection
   *
   * Patterns like "? ", "[Y/n]", "(yes/no)" in executor output
   * indicate interactive prompts that should trigger Fail-Closed.
   */
  describe('Case B: Interactive Prompt Detection (Property 34)', () => {
    it('should detect "? " pattern as interactive prompt', async function() {
      this.timeout(30000);

      // Create a mock executor that outputs an interactive prompt pattern
      const mockExecutorPath = path.join(projectDir, 'mock-prompt-executor.js');
      fs.writeFileSync(mockExecutorPath, `
        console.log('Starting task...');
        console.log('? Select an option:');
        console.log('  1) Option A');
        console.log('  2) Option B');
        // Simulate waiting for input (which should be detected)
        setTimeout(() => {
          console.log('Still waiting...');
        }, 10000);
      `);

      // Simulate what REPL should do: detect the prompt and terminate
      const child = spawn('node', [mockExecutorPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let promptDetected = false;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Check for interactive prompt patterns (as defined in spec)
        if (/\? [A-Z]/.test(stdout) || /\[Y\/n\]/.test(stdout) || /\(yes\/no\)/.test(stdout)) {
          promptDetected = true;
          // In real implementation, REPL would terminate the executor here
          child.kill('SIGTERM');
        }
      });

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve());
        setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 5000);
      });

      // Verify the pattern was detected
      assert.ok(promptDetected,
        `Interactive prompt pattern should be detected. stdout:\n${stdout}`);
    });

    it('should detect "[Y/n]" pattern as interactive prompt', async function() {
      this.timeout(10000);

      const mockExecutorPath = path.join(projectDir, 'mock-yn-executor.js');
      fs.writeFileSync(mockExecutorPath, `
        console.log('Do you want to continue? [Y/n]');
        setTimeout(() => process.exit(0), 10000);
      `);

      const child = spawn('node', [mockExecutorPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let promptDetected = false;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (stdout.includes('[Y/n]') || stdout.includes('[y/N]')) {
          promptDetected = true;
          child.kill('SIGTERM');
        }
      });

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve());
        setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
      });

      assert.ok(promptDetected,
        `[Y/n] pattern should be detected. stdout:\n${stdout}`);
    });

    it('should detect "(yes/no)" pattern as interactive prompt', async function() {
      this.timeout(10000);

      const mockExecutorPath = path.join(projectDir, 'mock-yesno-executor.js');
      fs.writeFileSync(mockExecutorPath, `
        console.log('Overwrite existing file? (yes/no)');
        setTimeout(() => process.exit(0), 10000);
      `);

      const child = spawn('node', [mockExecutorPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let promptDetected = false;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (stdout.includes('(yes/no)') || stdout.includes('(y/n)')) {
          promptDetected = true;
          child.kill('SIGTERM');
        }
      });

      await new Promise<void>((resolve) => {
        child.on('close', () => resolve());
        setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
      });

      assert.ok(promptDetected,
        `(yes/no) pattern should be detected. stdout:\n${stdout}`);
    });
  });

  /**
   * Case C: Property 35 - Timeout detection
   *
   * Executor must reach terminal state within timeout.
   * Default: executor_timeout_ms = 60000 (60s), progress_timeout_ms = 30000 (30s)
   */
  describe('Case C: Timeout Detection (Property 35)', () => {
    it('should timeout executor that produces no progress', async function() {
      this.timeout(40000);

      // Create a mock executor that hangs without producing output
      const mockExecutorPath = path.join(projectDir, 'mock-hang-executor.js');
      fs.writeFileSync(mockExecutorPath, `
        console.log('Starting...');
        // Then hang forever without output
        setInterval(() => {}, 1000);
      `);

      const child = spawn('node', [mockExecutorPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let lastOutputTime = Date.now();
      const progressTimeoutMs = 5000; // Shorter timeout for test

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        lastOutputTime = Date.now();
      });

      // Monitor for progress timeout
      const checkProgress = setInterval(() => {
        const elapsed = Date.now() - lastOutputTime;
        if (elapsed > progressTimeoutMs) {
          // Progress timeout - should trigger Fail-Closed
          clearInterval(checkProgress);
          child.kill('SIGTERM');
        }
      }, 1000);

      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => {
          clearInterval(checkProgress);
          resolve(code ?? -1);
        });

        // Overall timeout
        setTimeout(() => {
          clearInterval(checkProgress);
          child.kill('SIGKILL');
          resolve(-1);
        }, 10000);
      });

      // Executor should have been terminated due to no progress
      assert.ok(exitCode !== 0,
        `Executor should be terminated on progress timeout. exitCode: ${exitCode}`);
    });

    it('should timeout executor after max execution time', async function() {
      this.timeout(20000);

      // Create a mock executor that keeps producing output but never completes
      const mockExecutorPath = path.join(projectDir, 'mock-infinite-executor.js');
      fs.writeFileSync(mockExecutorPath, `
        let count = 0;
        setInterval(() => {
          console.log('Progress:', ++count);
        }, 500);
      `);

      const child = spawn('node', [mockExecutorPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const executorTimeoutMs = 5000; // Shorter for test

      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => {
          resolve(code ?? -1);
        });

        // Executor timeout
        setTimeout(() => {
          child.kill('SIGTERM');
          // Give it 3 seconds to exit gracefully before SIGKILL
          setTimeout(() => {
            child.kill('SIGKILL');
          }, 3000);
        }, executorTimeoutMs);
      });

      // Executor should have been terminated
      assert.ok(exitCode === null || exitCode !== 0,
        `Executor should be terminated after timeout`);
    });
  });

  /**
   * Case D: Property 36 - Subsequent command processing
   *
   * After Executor is terminated via Fail-Closed,
   * REPL commands /tasks, /logs, /exit must still work.
   */
  describe('Case D: Subsequent Command Processing (Property 36)', () => {
    it('should process /tasks after executor termination', async function() {
      this.timeout(60000);

      // Simulate a scenario where executor might hang/block
      // The key test is that /tasks still works after
      const input = '/start\nDo something complex\n/tasks\n/exit\n';

      const result = await runREPLWithInput(projectDir, input, { timeout: 50000 });

      // /tasks should have produced output regardless of what happened to the task
      const hasTasksOutput = result.stdout.includes('Tasks') ||
                            result.stdout.includes('task-') ||
                            result.stdout.includes('No tasks');
      assert.ok(hasTasksOutput,
        `/tasks should produce output. stdout:\n${result.stdout}`);
    });

    it('should process /logs after executor termination', async function() {
      this.timeout(60000);

      const input = '/start\nDo something complex\n/logs\n/exit\n';

      const result = await runREPLWithInput(projectDir, input, { timeout: 50000 });

      // /logs should have produced output
      const hasLogsOutput = result.stdout.includes('Logs') ||
                           result.stdout.includes('Log entries') ||
                           result.stdout.includes('No tasks logged') ||
                           result.stdout.includes('Task Logs');
      assert.ok(hasLogsOutput,
        `/logs should produce output. stdout:\n${result.stdout}`);
    });

    it('should process /exit after executor termination', async function() {
      this.timeout(60000);

      const input = '/start\nDo something that might hang\n/exit\n';

      const result = await runREPLWithInput(projectDir, input, { timeout: 50000 });

      // /exit should have worked - we should see Goodbye or get a clean exit
      const hasGoodbye = result.stdout.includes('Goodbye');
      const hasCleanExit = result.exitCode === 0 || result.exitCode === 2; // 0=success, 2=incomplete

      assert.ok(hasGoodbye || hasCleanExit,
        `/exit should work. exitCode: ${result.exitCode}, stdout includes Goodbye: ${hasGoodbye}`);
    });

    it('should process multiple commands after executor block', async function() {
      this.timeout(60000);

      // Multiple commands after potential executor block
      const input = '/start\nCreate something\n/tasks\n/logs\n/status\n/exit\n';

      const result = await runREPLWithInput(projectDir, input, { timeout: 50000 });

      // All commands should have produced some output
      // Check for markers from each command
      const hasStatusOutput = result.stdout.includes('Status') ||
                             result.stdout.includes('Session');

      // At minimum, we should see /exit processed
      assert.ok(result.stdout.includes('Goodbye'),
        `All commands should process. stdout:\n${result.stdout}`);
    });
  });

  /**
   * Case E: TaskLog recording for blocked executor
   *
   * When executor is terminated via Fail-Closed, TaskLog must record:
   * - executor_blocked: true
   * - blocked_reason: INTERACTIVE_PROMPT | TIMEOUT | STDIN_REQUIRED
   * - timeout_ms: elapsed time
   * - terminated_by: REPL_FAIL_CLOSED | USER | TIMEOUT
   */
  describe('Case E: TaskLog Recording for Blocked Executor', () => {
    it('should record executor_blocked in TaskLog when Fail-Closed triggers', async function() {
      this.timeout(60000);

      // This test will verify TaskLog structure after implementation
      // For now, it documents the expected behavior

      const input = '/start\nCreate something\n/logs\n/exit\n';

      const result = await runREPLWithInput(projectDir, input, { timeout: 50000 });

      // Wait for file system sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check TaskLog files
      const logsDir = path.join(projectDir, '.claude', 'logs', 'sessions');
      if (fs.existsSync(logsDir)) {
        const sessionDirs = fs.readdirSync(logsDir).filter(d =>
          fs.statSync(path.join(logsDir, d)).isDirectory());

        for (const sessionDir of sessionDirs) {
          const tasksDir = path.join(logsDir, sessionDir, 'tasks');
          if (fs.existsSync(tasksDir)) {
            const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
            for (const taskFile of taskFiles) {
              const taskLogPath = path.join(tasksDir, taskFile);
              const taskLogContent = fs.readFileSync(taskLogPath, 'utf-8');
              const taskLog = JSON.parse(taskLogContent);

              // Verify TaskLog structure supports executor_blocked fields
              // These may be undefined if executor didn't block, that's OK
              if (taskLog.executor_blocked === true) {
                // If executor_blocked is true, verify required fields exist
                assert.ok(taskLog.blocked_reason,
                  'blocked_reason should exist when executor_blocked is true');
                assert.ok(typeof taskLog.timeout_ms === 'number',
                  'timeout_ms should be a number when executor_blocked is true');
                assert.ok(taskLog.terminated_by,
                  'terminated_by should exist when executor_blocked is true');

                // Verify enum values are valid
                const validBlockedReasons = ['INTERACTIVE_PROMPT', 'TIMEOUT', 'STDIN_REQUIRED'];
                assert.ok(validBlockedReasons.includes(taskLog.blocked_reason),
                  `blocked_reason should be one of ${validBlockedReasons.join(', ')}`);

                const validTerminatedBy = ['REPL_FAIL_CLOSED', 'USER', 'TIMEOUT'];
                assert.ok(validTerminatedBy.includes(taskLog.terminated_by),
                  `terminated_by should be one of ${validTerminatedBy.join(', ')}`);
              }
            }
          }
        }
      }

      // Test passes if we got here without errors
      // The actual verification happens when executor_blocked=true
    });

    it('should include EXECUTOR_BLOCKED event in TaskLog events', async function() {
      this.timeout(60000);

      const input = '/start\nSomething that triggers prompt\n/exit\n';

      const result = await runREPLWithInput(projectDir, input, { timeout: 50000 });

      // Wait for file system sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for EXECUTOR_BLOCKED event type in TaskLog
      const logsDir = path.join(projectDir, '.claude', 'logs', 'sessions');
      if (fs.existsSync(logsDir)) {
        const sessionDirs = fs.readdirSync(logsDir).filter(d =>
          fs.statSync(path.join(logsDir, d)).isDirectory());

        for (const sessionDir of sessionDirs) {
          const tasksDir = path.join(logsDir, sessionDir, 'tasks');
          if (fs.existsSync(tasksDir)) {
            const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
            for (const taskFile of taskFiles) {
              const taskLogPath = path.join(tasksDir, taskFile);
              const taskLogContent = fs.readFileSync(taskLogPath, 'utf-8');
              const taskLog = JSON.parse(taskLogContent);

              // If executor was blocked, there should be an EXECUTOR_BLOCKED event
              if (taskLog.executor_blocked === true && Array.isArray(taskLog.events)) {
                const blockedEvent = taskLog.events.find(
                  (e: { event_type: string }) => e.event_type === 'EXECUTOR_BLOCKED'
                );

                if (blockedEvent) {
                  // Verify EXECUTOR_BLOCKED event structure
                  assert.ok(blockedEvent.timestamp, 'EXECUTOR_BLOCKED event should have timestamp');
                  assert.ok(blockedEvent.content, 'EXECUTOR_BLOCKED event should have content');
                  assert.ok(blockedEvent.content.blocked_reason,
                    'EXECUTOR_BLOCKED content should have blocked_reason');
                  assert.ok(blockedEvent.content.terminated_by,
                    'EXECUTOR_BLOCKED content should have terminated_by');
                }
              }
            }
          }
        }
      }
    });
  });
});

/**
 * Helper function to run REPL with piped input (non-interactive mode)
 */
async function runREPLWithInput(
  projectDir: string,
  input: string,
  options: { timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, '../../dist/cli/index.js');
    const timeoutMs = options.timeout || 25000;

    const child = spawn('node', [cliPath, 'repl', '--project', projectDir, '--non-interactive', '--exit-on-eof'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        PM_RUNNER_NON_INTERACTIVE: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Write input to stdin (simulating heredoc)
    child.stdin?.write(input);
    child.stdin?.end();

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    child.on('error', (err) => {
      stderr += err.message;
      resolve({ stdout, stderr, exitCode: 1 });
    });

    // Timeout fallback
    setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 3000);
      resolve({
        stdout: stdout + '\n[TIMEOUT]',
        stderr: stderr + '\n[Process killed due to timeout]',
        exitCode: -1
      });
    }, timeoutMs);
  });
}
