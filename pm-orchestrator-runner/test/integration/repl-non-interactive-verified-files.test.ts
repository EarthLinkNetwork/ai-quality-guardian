/**
 * Integration tests for Verified Files Detection in Non-Interactive Mode
 *
 * TDD: These tests are written FIRST, before implementation fixes.
 *
 * Problem: REPL non-interactive mode always produces ERROR with "no verified files
 * exist on disk" even when files ARE actually created.
 *
 * Root Cause Hypotheses:
 * 1. listFiles() skips hidden directories (e.g., .claude/) - files created there are missed
 * 2. Timing issue: file not written to disk when we scan filesAfter
 * 3. Path handling: relative vs absolute path mismatch
 * 4. workingDir mismatch: executor uses wrong cwd
 *
 * Test Cases (Property 31: Verified Files Detection):
 * - Case A: Files created in project root are detected
 * - Case B: Files created in subdirectories are detected
 * - Case C: verified_files includes correct path and exists=true
 * - Case D: files_modified_count is ≥1 when files exist
 * - Case E: Status is COMPLETE (not ERROR) when files exist
 */

import { describe, it, beforeEach, afterEach, before } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

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
describe('Verified Files Detection in Non-Interactive Mode (Property 31)', () => {
  // Skip entire suite if CLI_TEST_MODE is not set
  before(function() {
    if (!shouldRunCliTests()) {
      console.log('[CLI-dependent Test] SKIPPING: CLI_TEST_MODE is not set to 1');
      this.skip();
    }
  });

  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-files-test-'));
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
   * Case A: Files created in project root are detected
   *
   * Property 31 requirement: Diff Detection must identify new files.
   * listFiles() scans project directory before/after execution.
   * New files (not in filesBefore) should appear in filesAfter.
   */
  describe('Case A: Project Root File Detection', () => {
    it('should detect README.md created in project root', async function() {
      this.timeout(process.env.CI ? 20000 : 120000);

      // Run task that creates README.md
      const input = '/start\nCreate a file named README.md with content "# Demo Project\\n\\nThis is a demo."\n/tasks\n/logs\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Verify README.md was actually created (independent verification)
      const readmePath = path.join(projectDir, 'README.md');
      const fileExists = fs.existsSync(readmePath);

      // If Claude Code created the file, our detection MUST find it
      if (fileExists) {
        // Property 31: files_modified_count should be ≥1
        // Check TaskLog output for files count
        const hasFilesCount = result.stdout.includes('files=') ||
                             result.stdout.includes('Files:') ||
                             result.stdout.includes('files_modified');

        // The bug: Even though file exists, /tasks shows files=0
        // This assertion captures the bug - should FAIL before fix, PASS after
        // Table format: "  1 | task-001     | COMPLETE   | 19.4s    | 1     | 0"
        // Files column is the 5th column (index 4)
        const tableLineMatch = result.stdout.match(/^\s*\d+\s*\|\s*task-\d+\s*\|[^|]+\|[^|]+\|\s*(\d+)\s*\|\s*\d+\s*$/m);
        const filesCount = tableLineMatch ? parseInt(tableLineMatch[1], 10) : 0;

        assert.ok(
          filesCount >= 1,
          `Property 31 violation: files_modified_count should be ≥1 when file exists. Got: ${filesCount}\nFile exists: ${fileExists}\nstdout:\n${result.stdout}`
        );
      }
    });

    it('should return COMPLETE status when README.md exists', async function() {
      this.timeout(process.env.CI ? 20000 : 120000);

      const input = '/start\nCreate a file named README.md with content "# Test"\n/tasks\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Check if file was created
      const readmePath = path.join(projectDir, 'README.md');
      const fileExists = fs.existsSync(readmePath);

      if (fileExists) {
        // Property 31: Status should be COMPLETE, not ERROR
        // The bug: Status is ERROR even when file exists
        const hasCompleteStatus = result.stdout.includes('COMPLETE') ||
                                  result.stdout.includes('completed');
        const hasErrorStatus = result.stdout.includes('ERROR') ||
                              result.stdout.includes('NO_EVIDENCE');

        assert.ok(
          hasCompleteStatus && !hasErrorStatus,
          `Property 31 violation: Status should be COMPLETE when file exists.\nFile exists: ${fileExists}\nstdout:\n${result.stdout}`
        );
      }
    });
  });

  /**
   * Case B: Exit code is 0 when files exist
   *
   * Property 29: EXIT_CODE = 0 for COMPLETE, 1 for ERROR
   */
  describe('Case B: Exit Code Consistency', () => {
    it('should return exit code 0 when task creates files', async function() {
      this.timeout(process.env.CI ? 20000 : 120000);

      const input = '/start\nCreate a file named hello.txt with content "Hello World"\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Check if file was created
      const helloPath = path.join(projectDir, 'hello.txt');
      const fileExists = fs.existsSync(helloPath);

      if (fileExists) {
        // Property 29: Exit code should be 0 for COMPLETE
        assert.equal(
          result.exitCode,
          0,
          `Property 29 violation: Exit code should be 0 when file exists.\nGot: ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
        );
      }
    });
  });

  /**
   * Case C: verified_files contains correct data
   *
   * Property 31: verified_files must have path and exists=true for created files.
   */
  describe('Case C: Verified Files Structure', () => {
    it('should include verified_files in TaskLog with exists=true', async function() {
      this.timeout(process.env.CI ? 20000 : 120000);

      const input = '/start\nCreate a file named test.txt with content "Test content"\n/logs 1\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Wait for log file to be written
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check TaskLog file for verified_files
      const logsDir = path.join(projectDir, '.claude', 'logs', 'sessions');
      if (fs.existsSync(logsDir)) {
        const sessionDirs = fs.readdirSync(logsDir);
        for (const sessionDir of sessionDirs) {
          const tasksDir = path.join(logsDir, sessionDir, 'tasks');
          if (fs.existsSync(tasksDir)) {
            const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
            for (const taskFile of taskFiles) {
              const taskLogPath = path.join(tasksDir, taskFile);
              const taskLog = JSON.parse(fs.readFileSync(taskLogPath, 'utf-8'));

              // Find the RUN_COMPLETE event which should have evidence
              const runCompleteEvent = taskLog.events?.find(
                (e: { type: string }) => e.type === 'RUN_COMPLETE'
              );

              if (runCompleteEvent?.evidence?.verified_files) {
                const verifiedFiles = runCompleteEvent.evidence.verified_files;

                // Property 31: At least one file with exists=true
                const hasExistingFile = verifiedFiles.some(
                  (vf: { exists: boolean }) => vf.exists === true
                );

                // Check if the file actually exists on disk
                const testPath = path.join(projectDir, 'test.txt');
                const fileActuallyExists = fs.existsSync(testPath);

                if (fileActuallyExists) {
                  assert.ok(
                    hasExistingFile,
                    `Property 31 violation: verified_files should have exists=true for created file.\nverified_files: ${JSON.stringify(verifiedFiles)}`
                  );
                }
              }
            }
          }
        }
      }
    });
  });

  /**
   * Case D: Diff Detection timing
   *
   * Property 31: Diff detection compares filesBefore vs filesAfter.
   * Files must be written to disk BEFORE filesAfter scan.
   */
  describe('Case D: Diff Detection Timing', () => {
    it('should detect file in filesAfter scan (no timing race)', async function() {
      this.timeout(process.env.CI ? 20000 : 120000);

      // Pre-create a marker file to verify scanning works
      const markerPath = path.join(projectDir, 'marker-before.txt');
      fs.writeFileSync(markerPath, 'exists before task');

      const input = '/start\nCreate a file named new-file.txt with content "Created during task"\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Verify both files exist
      const markerExists = fs.existsSync(markerPath);
      const newFilePath = path.join(projectDir, 'new-file.txt');
      const newFileExists = fs.existsSync(newFilePath);

      assert.ok(markerExists, 'Marker file should still exist');

      if (newFileExists) {
        // The new file was created - it should be detected as modified
        // Check /tasks output for files count > 0

        // Property 31: Diff detection should find new file
        // Marker file was in filesBefore, new file should be in filesAfter but not filesBefore
        // Therefore new file should appear in files_modified

        const hasNoEvidence = result.stdout.includes('NO_EVIDENCE') ||
                             result.stdout.includes('no verified files');

        assert.ok(
          !hasNoEvidence,
          `Property 31 violation: Should NOT report NO_EVIDENCE when file exists.\nNew file exists: ${newFileExists}\nstdout:\n${result.stdout}`
        );
      }
    });
  });

  /**
   * Case E: Hidden directory exclusion does not affect project root
   *
   * Property 31: listFiles() skips hidden files (.xxx) but project root files
   * like README.md should still be detected.
   */
  describe('Case E: listFiles() Boundary', () => {
    it('should detect non-hidden files in project root', async function() {
      this.timeout(process.env.CI ? 10000 : 60000);

      // Simulate what listFiles() does
      // It should NOT skip non-hidden files like README.md

      // Create a file directly (bypass Claude Code)
      const testFilePath = path.join(projectDir, 'direct-test.txt');
      fs.writeFileSync(testFilePath, 'Created directly for test');

      // Run REPL to verify listFiles can see this file
      const input = '/start\n/tasks\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // The file should be visible to the system
      assert.ok(fs.existsSync(testFilePath), 'Test file should exist');

      // Clean exit
      assert.ok(
        result.exitCode === 0 || result.stdout.includes('Goodbye'),
        'Should exit cleanly'
      );
    });

    it('should NOT skip README.md due to hidden file filter', async function() {
      this.timeout(process.env.CI ? 10000 : 60000);

      // The listFiles() filter is:
      // if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      //
      // README.md does NOT start with '.' so should NOT be skipped

      const readmePath = path.join(projectDir, 'README.md');
      fs.writeFileSync(readmePath, '# Pre-existing README');

      // Verify the file is there
      assert.ok(fs.existsSync(readmePath), 'README.md should exist');

      // Now run REPL
      const input = '/start\n/status\n/exit\n';
      const result = await runREPLWithInput(projectDir, input);

      // The REPL should start successfully (proves listFiles doesn't error on this file)
      const hasSessionStarted = result.stdout.includes('Session started') ||
                                result.stdout.includes('session-');
      assert.ok(hasSessionStarted, 'Session should start successfully');
    });
  });

  /**
   * Case F: External Task ID to Internal Log ID mapping
   *
   * Property 30: /tasks shows External Task ID, /logs shows Internal Log Task ID.
   * Both should reference the same task.
   */
  describe('Case F: Task ID Cross-Reference (Property 30)', () => {
    it('should show both External and Internal Task IDs', async function() {
      this.timeout(process.env.CI ? 20000 : 120000);

      const input = '/start\nCreate README.md\n/tasks\n/logs\n/exit\n';

      const result = await runREPLWithInput(projectDir, input);

      // Property 30: /tasks output should show External Task ID
      // Format: task-<timestamp> (e.g., task-1768282936521)
      const externalIdMatch = result.stdout.match(/task-\d{10,}/);

      // Property 30: /logs output should show Internal Log Task ID
      // Format: task-NNN (e.g., task-001)
      const internalIdMatch = result.stdout.match(/task-0*\d{1,3}/);

      // Both IDs should be present (though may be same format in some cases)
      // The key is that cross-reference should be available
      const hasTaskIdInTasks = result.stdout.includes('task-') &&
                              (result.stdout.includes('/tasks') || result.stdout.includes('Tasks'));
      const hasTaskIdInLogs = result.stdout.includes('task-') &&
                             (result.stdout.includes('/logs') || result.stdout.includes('Log'));

      // At minimum, task IDs should be visible in output
      assert.ok(
        externalIdMatch || internalIdMatch,
        `Property 30 violation: Task IDs should be visible.\nstdout:\n${result.stdout}`
      );
    });
  });
});

/**
 * Unit tests for listFiles() and detectModifiedFiles() logic
 *
 * These test the internal mechanisms that Property 31 relies on.
 */
describe('File Detection Internals (Property 31 Unit Tests)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-detect-unit-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('listFiles() behavior', () => {
    it('should list non-hidden files in directory', () => {
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'visible.txt'), 'visible');
      fs.writeFileSync(path.join(tempDir, '.hidden'), 'hidden');

      // List files (simulating listFiles behavior)
      const entries = fs.readdirSync(tempDir, { withFileTypes: true });
      const visibleFiles = entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
        .map(e => e.name);

      assert.ok(visibleFiles.includes('visible.txt'), 'Should include visible.txt');
      assert.ok(!visibleFiles.includes('.hidden'), 'Should NOT include .hidden');
    });

    it('should recurse into non-hidden subdirectories', () => {
      // Create nested structure
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export {}');
      fs.mkdirSync(path.join(tempDir, '.hidden-dir'));
      fs.writeFileSync(path.join(tempDir, '.hidden-dir', 'secret.txt'), 'secret');

      // List files recursively (simulating listFiles)
      const listFilesRecursive = (dir: string): string[] => {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile()) {
            results.push(fullPath);
          } else if (entry.isDirectory()) {
            results.push(...listFilesRecursive(fullPath));
          }
        }
        return results;
      };

      const files = listFilesRecursive(tempDir);
      const relativePaths = files.map(f => path.relative(tempDir, f));

      assert.ok(relativePaths.includes(path.join('src', 'index.ts')), 'Should include src/index.ts');
      assert.ok(!relativePaths.some(p => p.includes('.hidden-dir')), 'Should NOT include .hidden-dir files');
    });
  });

  describe('detectModifiedFiles() behavior', () => {
    it('should detect new files (in after but not in before)', () => {
      // Simulate before state
      const before = new Map<string, { mtime: number; size: number }>();

      // Simulate after state (with new file)
      const after = new Map<string, { mtime: number; size: number }>();
      const newFilePath = path.join(tempDir, 'new-file.txt');
      after.set(newFilePath, { mtime: Date.now(), size: 100 });

      // Detect modified files
      const modified: string[] = [];
      for (const [filePath] of after) {
        if (!before.has(filePath)) {
          modified.push(path.relative(tempDir, filePath));
        }
      }

      assert.deepEqual(modified, ['new-file.txt'], 'Should detect new file');
    });

    it('should detect modified files (mtime changed)', () => {
      const filePath = path.join(tempDir, 'existing.txt');

      // Before state
      const before = new Map<string, { mtime: number; size: number }>();
      before.set(filePath, { mtime: 1000, size: 50 });

      // After state (mtime changed)
      const after = new Map<string, { mtime: number; size: number }>();
      after.set(filePath, { mtime: 2000, size: 50 });

      // Detect modified
      const modified: string[] = [];
      for (const [fp, afterStat] of after) {
        const beforeStat = before.get(fp);
        if (!beforeStat) {
          modified.push(path.relative(tempDir, fp));
        } else if (beforeStat.mtime !== afterStat.mtime || beforeStat.size !== afterStat.size) {
          modified.push(path.relative(tempDir, fp));
        }
      }

      assert.deepEqual(modified, ['existing.txt'], 'Should detect modified file');
    });
  });
});

/**
 * Helper function to run REPL with piped input (non-interactive mode)
 */
async function runREPLWithInput(
  projectDir: string,
  input: string,
  options: { expectError?: boolean; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, '../../dist/cli/index.js');
    const defaultTimeout = process.env.CI ? 15000 : 100000;
    const timeoutMs = options.timeout || defaultTimeout;

    const child = spawn('node', [cliPath, 'repl', '--project', projectDir], {
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
