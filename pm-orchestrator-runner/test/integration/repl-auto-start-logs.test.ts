/**
 * Integration tests for REPL auto-start and /logs consistency
 *
 * Per redesign requirements:
 * - Auto-start: Natural language input = automatic task creation (no /start required)
 * - /logs consistency: Task ID shown in /logs list must be usable with /logs <task-id>
 * - NO_EVIDENCE: Must show next action, not complete silently
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

describe('REPL Auto-Start and /logs Consistency (Integration)', function() {
  this.timeout(60000);

  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-auto-logs-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to run REPL with piped input
   */
  async function runREPLWithInput(
    projectDir: string,
    input: string,
    timeoutMs: number = 30000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
      const proc: ChildProcess = spawn('node', [cliPath, 'repl', '--project', projectDir], {
        env: { ...process.env, NO_COLOR: '1' },
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 0,
          });
        }
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      // Set timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill('SIGTERM');
          resolve({ stdout, stderr, exitCode: -1 });
        }
      }, timeoutMs);

      // Send input
      proc.stdin?.write(input);
      proc.stdin?.end();
    });
  }

  describe('Auto-start (no /start required)', () => {
    /**
     * Test: Natural language input should auto-start a session
     * Expected: No /start needed, task is created automatically
     */
    it('should auto-start session on natural language input', async function() {
      if (process.env.CLI_TEST_MODE !== '1') {
        this.skip();
        return;
      }

      // Input: natural language without /start, then /exit
      const input = 'Create a file called test.txt\n/exit\n';
      const result = await runREPLWithInput(tempDir, input);

      // Should see auto-start message
      assert.ok(
        result.stdout.includes('Auto-starting session') || result.stdout.includes('[Auto-starting'),
        `Should show auto-start message.\nstdout:\n${result.stdout}`
      );

      // Should see task ID (task-{timestamp} format)
      const taskIdMatch = result.stdout.match(/task-\d{10,}/);
      assert.ok(
        taskIdMatch,
        `Should show task ID in timestamp format (task-{timestamp}).\nstdout:\n${result.stdout}`
      );

      // Should NOT require /start first
      assert.ok(
        !result.stdout.includes('Use /start to begin') ||
        result.stdout.indexOf('Auto-starting') < result.stdout.indexOf('Use /start'),
        `Should not require /start before natural language.\nstdout:\n${result.stdout}`
      );
    });

    /**
     * Test: Task ID shown at start should be consistent
     */
    it('should show Task ID at task start', async function() {
      if (process.env.CLI_TEST_MODE !== '1') {
        this.skip();
        return;
      }

      const input = 'Create README.md\n/exit\n';
      const result = await runREPLWithInput(tempDir, input);

      // Should show "Task ID:" line
      assert.ok(
        result.stdout.includes('Task ID:'),
        `Should display "Task ID:" at task start.\nstdout:\n${result.stdout}`
      );

      // Task ID should be in timestamp format
      const taskIdLineMatch = result.stdout.match(/Task ID:\s*(task-\d+)/);
      assert.ok(
        taskIdLineMatch,
        `Task ID should be in timestamp format.\nstdout:\n${result.stdout}`
      );
    });
  });

  describe('/logs consistency (no dummy IDs)', () => {
    /**
     * CRITICAL TEST: Task ID in /logs list must match Task ID usable with /logs <task-id>
     *
     * Problem being fixed: /logs showed "task-001" but actual task was "task-1737012345678"
     * Expected: /logs shows same ID that was assigned at task start
     */
    it('should show consistent task IDs in /logs list', async function() {
      if (process.env.CLI_TEST_MODE !== '1') {
        this.skip();
        return;
      }

      // Create a task, then check /logs
      const input = 'Create test.txt\n/logs\n/exit\n';
      const result = await runREPLWithInput(tempDir, input);

      // Extract task ID shown at task start
      const startTaskIdMatch = result.stdout.match(/Task ID:\s*(task-\d+)/);
      if (!startTaskIdMatch) {
        // If no task was created (e.g., no executor), skip
        this.skip();
        return;
      }
      const startTaskId = startTaskIdMatch[1];

      // /logs list should contain the same task ID
      const logsSection = result.stdout.substring(result.stdout.indexOf('/logs'));
      assert.ok(
        logsSection.includes(startTaskId),
        `Task ID shown at start (${startTaskId}) should appear in /logs list.\nstdout:\n${result.stdout}`
      );

      // Should NOT show dummy IDs like "task-001" if start ID was different
      if (startTaskId.match(/task-\d{10,}/)) {
        assert.ok(
          !logsSection.includes('task-001') && !logsSection.includes('task-002'),
          `/logs should not show sequential IDs (task-001) when task was created with timestamp ID.\nstdout:\n${result.stdout}`
        );
      }
    });

    /**
     * Test: /logs <task-id> should work with ID from /logs list
     */
    it('should be able to view task detail with ID from list', async function() {
      if (process.env.CLI_TEST_MODE !== '1') {
        this.skip();
        return;
      }

      // First, create a task and get its ID
      const input1 = 'Create test.txt\n/exit\n';
      const result1 = await runREPLWithInput(tempDir, input1);

      const taskIdMatch = result1.stdout.match(/Task ID:\s*(task-\d+)/);
      if (!taskIdMatch) {
        this.skip();
        return;
      }
      const taskId = taskIdMatch[1];

      // Now start new session and try /logs <task-id>
      const input2 = `/start\n/logs ${taskId}\n/exit\n`;
      const result2 = await runREPLWithInput(tempDir, input2);

      // Should NOT show "Task not found"
      assert.ok(
        !result2.stdout.includes('Task not found'),
        `Task ID from /logs list (${taskId}) should be viewable with /logs <task-id>.\nstdout:\n${result2.stdout}`
      );

      // Should show task details
      assert.ok(
        result2.stdout.includes(taskId) || result2.stdout.includes('Task Detail'),
        `Should show task details for ${taskId}.\nstdout:\n${result2.stdout}`
      );
    });
  });

  describe('NO_EVIDENCE handling', () => {
    /**
     * Test: NO_EVIDENCE should show next action, not complete silently
     */
    it('should show next action hint on NO_EVIDENCE', async function() {
      if (process.env.CLI_TEST_MODE !== '1') {
        this.skip();
        return;
      }

      // Create a task that will likely result in NO_EVIDENCE (no file created)
      const input = 'Think about nothing\n/exit\n';
      const result = await runREPLWithInput(tempDir, input);

      // If NO_EVIDENCE appears, should have hint for next action
      if (result.stdout.includes('NO_EVIDENCE')) {
        assert.ok(
          result.stdout.includes('/logs') || result.stdout.includes('HINT') || result.stdout.includes('NEXT'),
          `NO_EVIDENCE should include hint for next action.\nstdout:\n${result.stdout}`
        );
      }
    });
  });
});
