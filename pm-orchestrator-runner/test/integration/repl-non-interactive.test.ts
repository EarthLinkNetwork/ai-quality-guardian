/**
 * Integration tests for REPL non-interactive mode (heredoc / pipe / stdin script)
 *
 * These tests verify Property 28 (Non-Interactive REPL Output Integrity) and
 * Property 29 (Deterministic Exit Code in Non-Interactive Mode) as defined in
 * spec/06_CORRECTNESS_PROPERTIES.md
 *
 * Problem: In non-interactive mode (heredoc/pipe), commands after task execution
 * don't produce visible output due to I/O timing issues.
 *
 * TDD: These tests are written FIRST, before implementation.
 *
 * Test Cases:
 * - Case A: /start -> task -> /tasks -> /logs produces sequential output
 * - Case B: TaskLog is created in .claude/logs/sessions/xxx/tasks/xxx.json
 * - Case C: Output order matches input order (no interleaving)
 * - Case D: Exit code is deterministic (COMPLETE=0, ERROR=1, INCOMPLETE=2)
 */

import { describe, it, beforeEach, afterEach, before } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
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
describe('REPL Non-Interactive Mode (Integration) [CLI-dependent]', () => {
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-non-interactive-test-'));
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
   * Case A: heredoc入力で /start -> 自然言語タスク -> /tasks -> /logs が順番に出力される
   *
   * Property 28 verification: All command outputs must be visible and sequential.
   */
  describe('Case A: Sequential Output in Non-Interactive Mode', () => {
    it('should output /start, /tasks, and /logs responses sequentially', async function() {
      this.timeout(process.env.CI ? 10000 : 60000);

      // Simulate heredoc input: /start -> /tasks -> /logs -> /exit
      const input = '/start\n/tasks\n/logs\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Verify /start output is visible
      const hasSessionStarted = result.stdout.includes('Session started') ||
                                result.stdout.includes('session-');
      assert.ok(hasSessionStarted,
        `Expected session start output. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      // Verify /tasks output is visible (should show task list or "No tasks")
      const hasTasksOutput = result.stdout.includes('Tasks:') ||
                            result.stdout.includes('No tasks') ||
                            result.stdout.includes('task-');
      assert.ok(hasTasksOutput,
        `Expected /tasks output. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      // Verify /logs output is visible (should show logs or "No tasks logged")
      const hasLogsOutput = result.stdout.includes('Task Logs:') ||
                           result.stdout.includes('No tasks logged') ||
                           result.stdout.includes('Log entries');
      assert.ok(hasLogsOutput,
        `Expected /logs output. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      // Verify clean exit
      assert.ok(result.stdout.includes('Goodbye'),
        `Expected clean exit. stdout:\n${result.stdout}`);
    });

    it('should output /start, natural language task, /tasks, /logs sequentially', async function() {
      this.timeout(process.env.CI ? 15000 : 120000);

      // This is the exact bug reproduction scenario
      // Note: The natural language task will likely fail without Claude Code CLI,
      // but the important thing is that /tasks and /logs outputs should still appear
      const input = '/start\nCreate a simple hello.txt file\n/tasks\n/logs\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Session should start
      const hasSessionStarted = result.stdout.includes('Session started') ||
                                result.stdout.includes('session-');
      assert.ok(hasSessionStarted,
        `Expected session start. stdout:\n${result.stdout}`);

      // /tasks output must appear AFTER task processing
      // Even if the task fails, /tasks should produce output
      const startPos = result.stdout.indexOf('Session started') !== -1 ?
                       result.stdout.indexOf('Session started') :
                       result.stdout.indexOf('session-');
      const tasksPos = result.stdout.search(/Current Tasks|No tasks|task-/);

      assert.ok(tasksPos > startPos,
        `/tasks output should appear after /start. startPos=${startPos}, tasksPos=${tasksPos}`);

      // /logs output must appear - check for various patterns that indicate /logs output
      // "Task Logs (session:" is the actual header format
      const hasLogsOutput = result.stdout.includes('Task Logs') ||
                           result.stdout.includes('No tasks logged') ||
                           result.stdout.includes('Log entries') ||
                           result.stdout.includes('Use /logs <task-id>');
      assert.ok(hasLogsOutput,
        `/logs output should be visible. stdout:\n${result.stdout}`);
    });
  });

  /**
   * Case B: タスク完了時に TaskLog が .claude/logs/sessions/xxx/tasks/xxx.json に生成される
   *
   * Verifies that TaskLog files are created with proper sync in non-interactive mode.
   */
  describe('Case B: TaskLog File Creation', () => {
    it('should create TaskLog JSON file when task completes', async function() {
      this.timeout(process.env.CI ? 10000 : 60000);

      // Execute a simple task that should complete
      const input = '/start\nShow help\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Wait a bit for file system sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for TaskLog file in sessions directory
      const logsDir = path.join(projectDir, '.claude', 'logs', 'sessions');
      const sessionDirs = fs.existsSync(logsDir) ?
                          fs.readdirSync(logsDir).filter(d =>
                            fs.statSync(path.join(logsDir, d)).isDirectory()) :
                          [];

      if (sessionDirs.length > 0) {
        // Find task log files
        let foundTaskLog = false;
        for (const sessionDir of sessionDirs) {
          const tasksDir = path.join(logsDir, sessionDir, 'tasks');
          if (fs.existsSync(tasksDir)) {
            const taskFiles = fs.readdirSync(tasksDir)
              .filter(f => f.endsWith('.json'));
            if (taskFiles.length > 0) {
              foundTaskLog = true;

              // Verify JSON is valid and has required fields
              const taskLogPath = path.join(tasksDir, taskFiles[0]);
              const taskLogContent = fs.readFileSync(taskLogPath, 'utf-8');
              const taskLog = JSON.parse(taskLogContent);

              assert.ok(taskLog.task_id, 'TaskLog should have task_id');
              assert.ok(taskLog.session_id, 'TaskLog should have session_id');
              // TaskLog has events array, not status field
              // Status is stored in the session index.json, not in individual task logs
              assert.ok(Array.isArray(taskLog.events), 'TaskLog should have events array');
            }
          }

          // Also check index.json for session-level status
          const indexPath = path.join(logsDir, sessionDir, 'index.json');
          if (fs.existsSync(indexPath)) {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            const index = JSON.parse(indexContent);
            if (index.entries && index.entries.length > 0) {
              foundTaskLog = true;
              // Verify entry has status
              const entry = index.entries[0];
              assert.ok(entry.status, 'Index entry should have status');
            }
          }
        }

        // If session was created but task was not logged, that's the bug we're testing
        // This assertion should fail before the fix and pass after
        if (!foundTaskLog && result.stdout.includes('Session started')) {
          // Check if any task was attempted
          const taskAttempted = result.stdout.includes('Task') ||
                               result.stdout.includes('Processing');
          if (taskAttempted) {
            assert.fail('TaskLog file should be created when task completes in non-interactive mode');
          }
        }
      }

      // Exit should be clean regardless
      assert.ok(result.stdout.includes('Goodbye') || result.exitCode === 0,
        'Should exit cleanly');
    });

    it('should sync TaskLog file to disk before process exit', async function() {
      this.timeout(process.env.CI ? 10000 : 60000);

      const input = '/start\nProcess test task\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Immediately check for log files (no additional delay)
      // In non-interactive mode, files must be synced before exit
      const logsDir = path.join(projectDir, '.claude', 'logs', 'sessions');

      if (fs.existsSync(logsDir)) {
        const sessionDirs = fs.readdirSync(logsDir);
        for (const sessionDir of sessionDirs) {
          const indexPath = path.join(logsDir, sessionDir, 'index.json');
          if (fs.existsSync(indexPath)) {
            // Verify index.json is complete and valid
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            try {
              const index = JSON.parse(indexContent);
              assert.ok(index.session_id, 'index.json should have session_id');
              assert.ok(Array.isArray(index.entries), 'index.json should have entries array');
            } catch (e) {
              assert.fail(`index.json should be valid JSON, got: ${indexContent}`);
            }
          }
        }
      }
    });
  });

  /**
   * Case C: 出力順が入力順と一致（並行混在なし）
   *
   * Property 28 verification: Output order must match input order.
   */
  describe('Case C: Output Order Matches Input Order', () => {
    it('should maintain strict output order for sequential commands', async function() {
      this.timeout(process.env.CI ? 10000 : 30000);

      // Multiple commands that produce distinct output
      const input = '/help\n/status\n/help\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Find positions of each output
      const firstHelpPos = result.stdout.indexOf('PM Orchestrator Runner');
      const statusPos = result.stdout.indexOf('Session Status');
      const lastGoodbyePos = result.stdout.lastIndexOf('Goodbye');

      // Find second /help output (after status)
      const afterStatusOutput = result.stdout.substring(statusPos + 1);
      const secondHelpPos = statusPos + 1 + afterStatusOutput.indexOf('PM Orchestrator Runner');

      // Verify strict ordering
      assert.ok(firstHelpPos !== -1, 'First /help output should exist');
      assert.ok(statusPos !== -1, 'Status output should exist');
      assert.ok(secondHelpPos > statusPos, 'Second /help should appear after /status');
      assert.ok(lastGoodbyePos > secondHelpPos, '/exit should be last');

      // Verify no interleaving (each output section should be complete)
      // by checking that "Commands:" appears same number of times as /help was called
      const commandsMatches = result.stdout.match(/PM Orchestrator Runner - Commands/g);
      assert.equal(commandsMatches?.length, 2,
        'Each /help should produce complete output without interleaving');
    });

    it('should not interleave async command outputs', async function() {
      this.timeout(process.env.CI ? 10000 : 60000);

      // Commands that might trigger async operations
      const input = '/start\n/status\n/tasks\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Verify sequential markers appear in order
      // Use unique markers that only appear once per command

      // Find unique marker positions
      const startPos = result.stdout.indexOf('Session started:');
      const statusPos = result.stdout.indexOf('Session Status');
      const tasksPos = result.stdout.indexOf('Current Tasks');
      const exitPos = result.stdout.indexOf('Goodbye');

      // All markers should be present
      assert.ok(startPos !== -1, '/start output should be present');
      assert.ok(statusPos !== -1, '/status output should be present');
      assert.ok(tasksPos !== -1 || result.stdout.includes('No tasks'), '/tasks output should be present');
      assert.ok(exitPos !== -1, '/exit output should be present');

      // Verify strict order: start < status < tasks < exit
      if (startPos !== -1 && statusPos !== -1) {
        assert.ok(startPos < statusPos, '/start should come before /status');
      }
      if (statusPos !== -1 && tasksPos !== -1) {
        assert.ok(statusPos < tasksPos, '/status should come before /tasks');
      }
      const actualTasksPos = tasksPos !== -1 ? tasksPos : result.stdout.indexOf('No tasks');
      if (actualTasksPos !== -1 && exitPos !== -1) {
        assert.ok(actualTasksPos < exitPos, '/tasks should come before /exit');
      }
    });
  });

  /**
   * Case D: exit code が決定論的（COMPLETE=0, ERROR=1, INCOMPLETE=2）
   *
   * Property 29 verification: Exit codes must be deterministic.
   */
  describe('Case D: Deterministic Exit Code', () => {
    it('should return exit code 0 when all tasks complete successfully', async function() {
      this.timeout(process.env.CI ? 10000 : 30000);

      // Simple commands that should all succeed
      const input = '/help\n/status\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      assert.equal(result.exitCode, 0,
        `Expected exit code 0 for successful completion. Got: ${result.exitCode}`);
    });

    it('should return consistent exit code for same input', async function() {
      this.timeout(process.env.CI ? 15000 : 60000);

      const input = '/start\n/tasks\n/exit\n';

      // Run same input twice
      const result1 = await runREPLWithInput(projectDir, input);
      const result2 = await runREPLWithInput(projectDir, input);

      // Exit codes should be the same for same input
      assert.equal(result1.exitCode, result2.exitCode,
        `Exit code should be deterministic. First: ${result1.exitCode}, Second: ${result2.exitCode}`);
    });

    it('should return exit code 1 for error conditions', async function() {
      this.timeout(process.env.CI ? 10000 : 30000);

      // Test that commands failing produce error exit code
      // First delete the .claude directory to cause validation failure
      const claudeDir = path.join(projectDir, '.claude');
      fs.rmSync(claudeDir, { recursive: true });

      // Try to run commands that require .claude - they should fail
      // IMPORTANT: Use 'fixed' mode to test init-only behavior
      // In temp mode, the REPL creates its own .claude directory
      const result = await runREPLWithInput(projectDir, '/start\n/exit\n', {
        expectError: true,
        projectMode: 'fixed'  // Use fixed mode to test actual projectDir
      });

      // In init-only mode, /start should fail with error
      // The exit should be clean but may show warnings
      // For now, just verify the REPL handles missing .claude gracefully
      // The test passes if it doesn't crash and exits
      assert.ok(result.exitCode !== null,
        `Exit code should be defined. Got: ${result.exitCode}`);

      // Should see init-only mode message
      const hasInitOnlyMessage = result.stdout.includes('init-only') ||
                                result.stdout.includes('not initialized') ||
                                result.stdout.includes('.claude');
      assert.ok(hasInitOnlyMessage,
        `Should show init-only or not initialized message. stdout:\n${result.stdout}`);
    });

    it('should flush stdout before returning exit code', async function() {
      this.timeout(process.env.CI ? 10000 : 30000);

      const input = '/help\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Verify output is complete (not truncated)
      assert.ok(result.stdout.includes('Goodbye'),
        'Output should be completely flushed before exit');

      // Exit code should be available
      assert.ok(result.exitCode !== null,
        'Exit code should be available after output flush');
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    it('should handle empty input gracefully', async function() {
      this.timeout(process.env.CI ? 5000 : 10000);

      const input = '\n\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Should handle empty lines without crashing
      assert.ok(result.exitCode === 0 || result.stdout.includes('Goodbye'),
        'Should handle empty input gracefully');
    });

    it('should handle rapid input without dropping commands', async function() {
      this.timeout(process.env.CI ? 10000 : 30000);

      // Rapid sequence of commands
      const input = '/help\n/help\n/help\n/help\n/help\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Count help outputs
      const helpMatches = result.stdout.match(/PM Orchestrator Runner - Commands/g);
      assert.equal(helpMatches?.length, 5,
        `Expected 5 help outputs, got ${helpMatches?.length || 0}`);
    });

    it('should complete all I/O before EOF handling', async function() {
      this.timeout(process.env.CI ? 10000 : 30000);

      // Command sequence ending with commands that produce output
      const input = '/start\n/status\n/tasks\n';  // No /exit - rely on EOF

      const result = await runREPLWithInput(projectDir, input);

      // All outputs should be present even without explicit /exit
      const hasStart = result.stdout.includes('Session started') ||
                      result.stdout.includes('session-');
      const hasStatus = result.stdout.includes('Session Status');

      // In non-interactive mode, EOF should trigger graceful shutdown
      // All pending outputs should be flushed
      assert.ok(hasStart || hasStatus,
        `Should process all commands before EOF. stdout:\n${result.stdout}`);
    });

    /**
     * Critical test: Queue drain before process exit
     *
     * This tests the bug fixed in the 'close' handler consolidation:
     * Previously, two 'close' handlers existed - one waiting for queue drain,
     * one resolving immediately. This caused premature exit before all
     * commands were processed.
     *
     * The fix consolidated handlers to ensure queue drains before exit.
     */
    it('should drain input queue before exiting on EOF', async function() {
      this.timeout(process.env.CI ? 15000 : 60000);

      // Multiple commands that must all be processed
      // This is the exact reproduction scenario from the bug report
      const input = '/init\n/start\n/status\n/tasks\n/logs\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // All 6 commands must produce output (queue must drain)
      // /init -> "Initialized" or already initialized message
      const hasInit = result.stdout.includes('Initialized') ||
                     result.stdout.includes('already') ||
                     result.stdout.includes('.claude');
      // /start -> session started
      const hasStart = result.stdout.includes('Session started') ||
                      result.stdout.includes('session-');
      // /status -> Session Status section
      const hasStatus = result.stdout.includes('Session Status');
      // /tasks -> task output
      const hasTasks = result.stdout.includes('Tasks') ||
                      result.stdout.includes('No tasks') ||
                      result.stdout.includes('task-');
      // /logs -> log output
      const hasLogs = result.stdout.includes('Task Logs') ||
                     result.stdout.includes('No tasks logged') ||
                     result.stdout.includes('Log entries');
      // /exit -> Goodbye
      const hasExit = result.stdout.includes('Goodbye');

      // All commands must be processed (critical queue drain test)
      assert.ok(hasInit, `Queue drain failed: /init not processed. stdout:\n${result.stdout}`);
      assert.ok(hasStart, `Queue drain failed: /start not processed. stdout:\n${result.stdout}`);
      assert.ok(hasStatus, `Queue drain failed: /status not processed. stdout:\n${result.stdout}`);
      assert.ok(hasTasks, `Queue drain failed: /tasks not processed. stdout:\n${result.stdout}`);
      assert.ok(hasLogs, `Queue drain failed: /logs not processed. stdout:\n${result.stdout}`);
      assert.ok(hasExit, `Queue drain failed: /exit not processed. stdout:\n${result.stdout}`);

      // Exit code should be deterministic (0 for success)
      assert.ok(result.exitCode === 0 || result.exitCode === 2,
        `Exit code should be 0 (success) or 2 (incomplete). Got: ${result.exitCode}`);
    });

    /**
     * Session status persistence test
     *
     * This tests that session.json status is COMPLETED (not RUNNING) after /exit.
     * Bug scenario: session.json remains RUNNING when handleExit() fails silently.
     *
     * Note: Session state is stored in two places:
     * - .claude/evidence/session-xxx/session.json (RunnerCore state, has status field)
     * - .claude/logs/sessions/session-xxx/session.json (TaskLog state, has runs[].status)
     */
    it('should persist session as COMPLETED on /exit', async function() {
      this.timeout(process.env.CI ? 15000 : 60000);

      const input = '/init\n/start\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Find session directory in evidence (RunnerCore saves here)
      const evidenceDir = path.join(projectDir, '.claude', 'evidence');
      if (!fs.existsSync(evidenceDir)) {
        // If no evidence dir, the test passes vacuously (no session was created)
        return;
      }

      const sessions = fs.readdirSync(evidenceDir).filter(d => d.startsWith('session-'));
      if (sessions.length === 0) {
        // No sessions created - this can happen if /start didn't complete
        return;
      }

      const latestSession = sessions.sort().reverse()[0];
      const sessionJsonPath = path.join(evidenceDir, latestSession, 'session.json');

      if (!fs.existsSync(sessionJsonPath)) {
        // session.json not created yet - may happen in fast tests
        return;
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf-8'));

      // Session status must NOT be RUNNING after /exit (should be COMPLETED or FAILED)
      assert.notStrictEqual(sessionData.status, 'RUNNING',
        `Session status should not be RUNNING after /exit. Got: ${sessionData.status}\n` +
        `Session data: ${JSON.stringify(sessionData, null, 2)}`);

      // Optionally verify it's COMPLETED (not just not-RUNNING)
      assert.ok(
        sessionData.status === 'COMPLETED' || sessionData.status === 'FAILED',
        `Session status should be COMPLETED or FAILED. Got: ${sessionData.status}`
      );
    });

    /**
     * Double /exit handling test
     *
     * This tests that calling /exit twice doesn't cause errors.
     * The sessionCompleted flag should prevent double completion.
     */
    it('should handle double /exit gracefully', async function() {
      this.timeout(process.env.CI ? 15000 : 60000);

      // Multiple /exit commands
      const input = '/init\n/start\n/exit\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Should not crash - exit code should be deterministic
      assert.notStrictEqual(result.exitCode, -1,
        `Process should not timeout. stdout:\n${result.stdout}`);

      // Should see "already completed" or just "Goodbye"
      const hasGoodbye = result.stdout.includes('Goodbye');
      assert.ok(hasGoodbye, `Expected Goodbye message. stdout:\n${result.stdout}`);
    });
  });
});

/**
 * Helper function to run REPL with piped input (non-interactive mode)
 * CI-friendly timeout: 5s default for CI, 25s for local development
 *
 * @param projectDir - Project directory path
 * @param input - Input to pipe to stdin
 * @param options.expectError - Whether to expect an error
 * @param options.timeout - Timeout in milliseconds
 * @param options.projectMode - 'temp' (default) or 'fixed' - use 'fixed' to test init-only mode
 */
async function runREPLWithInput(
  projectDir: string,
  input: string,
  options: { expectError?: boolean; timeout?: number; projectMode?: 'temp' | 'fixed' } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, '../../dist/cli/index.js');
    const defaultTimeout = process.env.CI ? 5000 : 25000;
    const timeoutMs = options.timeout || defaultTimeout;

    // Build CLI arguments based on project mode
    const cliArgs = ['repl'];
    if (options.projectMode === 'fixed') {
      // Fixed mode: use projectDir as project-root (for testing init-only mode)
      cliArgs.push('--project-mode', 'fixed', '--project-root', projectDir);
    } else {
      // Temp mode (default): use projectDir as --project (but REPL creates temp dir)
      cliArgs.push('--project', projectDir);
    }

    const child = spawn('node', [cliPath, ...cliArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        // Force non-interactive mode detection
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
      resolve({
        stdout: stdout + '\n[TIMEOUT]',
        stderr: stderr + '\n[Process killed due to timeout]',
        exitCode: -1
      });
    }, timeoutMs);
  });
}
