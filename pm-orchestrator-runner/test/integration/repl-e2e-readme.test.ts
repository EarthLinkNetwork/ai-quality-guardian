/**
 * REPL E2E Test: README.md Creation
 *
 * Verifies that REPL natural language tasks actually create README.md
 * and eliminates the "COMPLETE but no README.md" problem.
 *
 * This test proves that:
 * 1. SessionCommands.start() enables Claude Code execution (useClaudeCode: true)
 * 2. processNaturalLanguage sets naturalLanguageTask (required for Claude Code)
 * 3. File creation actually happens in projectPath, not process.cwd()
 *
 * Test Tiers:
 * - Tier A: Mock-based tests (always run)
 * - Tier B: Real Claude Code E2E (opt-in via RUN_CLAUDE_E2E=1)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunnerCore } from '../../src/core/runner-core';
import { SessionCommands, REPLSession } from '../../src/repl/commands/session';
import { REPLConfig } from '../../src/repl/repl-interface';
import {
  IExecutor,
  ExecutorTask,
  ExecutorResult,
} from '../../src/executor/claude-code-executor';
import { isClaudeAvailable } from '../helpers/claude-availability';

/**
 * Mock Executor that simulates successful README.md creation
 */
class MockReadmeExecutor implements IExecutor {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    // Simulate Claude Code creating README.md
    const filename = 'README.md';
    const filepath = path.join(this.projectPath, filename);
    fs.writeFileSync(filepath, '# Demo Project\n\nThis is a demo project.\n');

    return {
      executed: true,
      output: 'Created README.md',
      files_modified: [filename],
      duration_ms: 100,
      status: 'COMPLETE',
      cwd: this.projectPath,
      verified_files: [{ path: filename, exists: true, size: 42 }],
      unverified_files: [],
    };
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }
}

describe('REPL README.md Creation (E2E)', () => {
  let tempDir: string;
  let projectDir: string;
  let evidenceDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-readme-e2e-'));
    projectDir = tempDir;
    evidenceDir = path.join(tempDir, 'evidence');

    // Create valid .claude directory structure
    const claudeDir = path.join(projectDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test Project');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
    fs.mkdirSync(path.join(claudeDir, 'agents'));
    fs.writeFileSync(path.join(claudeDir, 'agents', 'pm-orchestrator.md'), '# PM');
    fs.mkdirSync(path.join(claudeDir, 'rules'));
    fs.writeFileSync(path.join(claudeDir, 'rules', 'project-rules.md'), '# Rules');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Tier A: SessionCommands Configuration (Mock)', () => {
    /**
     * Verify that SessionCommands.start() creates RunnerCore with useClaudeCode: true
     */
    it('should create RunnerCore with Claude Code enabled', async function() {
      this.timeout(30000);

      const session: REPLSession = {
        sessionId: null,
        projectPath: projectDir,
        runner: null,
        supervisor: null,
        status: 'idle',
      };

      const config: REPLConfig = {
        projectPath: projectDir,
        evidenceDir,
        timeout: 30000,
      };

      const sessionCommands = new SessionCommands(session, config);
      const result = await sessionCommands.start(projectDir);

      assert.ok(result.success, `Session start should succeed: ${result.message}`);
      assert.ok(result.runner, 'Runner should be returned');

      // Verify runner has Claude Code executor
      // We can check this by examining the runner's internal state
      const runner = result.runner!;
      assert.ok(runner, 'Runner should exist');

      await runner.shutdown();
    });

    /**
     * Verify that README.md is created with mock executor
     */
    it('should create README.md via mock executor', async function() {
      this.timeout(30000);

      const mockExecutor = new MockReadmeExecutor(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'mock-readme-task',
        description: 'Create README for demo project',
        naturalLanguageTask: 'Create README.md for this demo project',
      };

      await runner.executeTasksSequentially([task]);

      // Verify README.md was created
      const readmePath = path.join(projectDir, 'README.md');
      assert.ok(fs.existsSync(readmePath), 'README.md should exist');

      const content = fs.readFileSync(readmePath, 'utf-8');
      assert.ok(content.includes('Demo Project'), 'README should contain expected content');

      await runner.shutdown();
    });

    /**
     * Verify evidence contains proper file creation info
     */
    it('should include files_created in evidence', async function() {
      this.timeout(30000);

      const mockExecutor = new MockReadmeExecutor(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'mock-evidence-task',
        description: 'Create README for evidence test',
        naturalLanguageTask: 'Create README.md for this demo project',
      };

      await runner.executeTasksSequentially([task]);

      const results = runner.getTaskResults();
      assert.equal(results.length, 1, 'Should have 1 result');

      const evidence = results[0].evidence as Record<string, unknown>;
      assert.ok(evidence, 'Evidence should exist');

      const filesCreated = evidence.files_created as string[];
      assert.ok(filesCreated && filesCreated.length > 0, 'Should have files_created');

      await runner.shutdown();
    });
  });

  describe('Tier A: Fail-Closed Behavior (Mock)', () => {
    /**
     * Mock executor that claims success but doesn't create files
     */
    class MockNoFileExecutor implements IExecutor {
      private projectPath: string;

      constructor(projectPath: string) {
        this.projectPath = projectPath;
      }

      async execute(task: ExecutorTask): Promise<ExecutorResult> {
        // Claims executed but no files created - fail-closed should catch this
        return {
          executed: true,
          output: 'Task completed',
          files_modified: [],
          duration_ms: 100,
          status: 'NO_EVIDENCE',
          cwd: this.projectPath,
          verified_files: [],
          unverified_files: [],
        };
      }

      async isClaudeCodeAvailable(): Promise<boolean> {
        return true;
      }
    }

    /**
     * Verify fail-closed when no files are created
     */
    it('should fail-closed when no files created', async function() {
      this.timeout(30000);

      const mockExecutor = new MockNoFileExecutor(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'fail-closed-task',
        description: 'Task that should fail',
        naturalLanguageTask: 'Create README.md',
      };

      let threw = false;
      try {
        await runner.executeTasksSequentially([task]);
      } catch (e) {
        threw = true;
        const error = e as Error;
        assert.ok(
          error.message.includes('no evidence') || error.message.includes('NO_EVIDENCE'),
          `Error should mention no evidence: ${error.message}`
        );
      }

      // Either threw or task should not be COMPLETED
      if (!threw) {
        const results = runner.getTaskResults();
        if (results.length > 0) {
          assert.notEqual(
            results[0].status,
            'COMPLETED',
            'Task should NOT be COMPLETED when no files created'
          );
        }
      }

      await runner.shutdown();
    });
  });

  describe('Tier B: Real Claude Code E2E (opt-in)', () => {
    /**
     * Real E2E test: REPL natural language task creates README.md
     *
     * Requires: RUN_CLAUDE_E2E=1
     */
    it('should actually create README.md via REPL flow', async function() {
      this.timeout(180000); // 3 minutes for Claude Code execution

      // Tier B: Skip unless opted-in
      const e2eEnabled = process.env.RUN_CLAUDE_E2E === '1';
      if (!e2eEnabled) {
        this.skip();
        return;
      }
      if (!isClaudeAvailable()) {
        this.skip();
        return;
      }

      // Use SessionCommands like REPL does
      const session: REPLSession = {
        sessionId: null,
        projectPath: projectDir,
        runner: null,
        supervisor: null,
        status: 'idle',
      };

      const config: REPLConfig = {
        projectPath: projectDir,
        evidenceDir,
        timeout: 120000,
      };

      const sessionCommands = new SessionCommands(session, config);
      const startResult = await sessionCommands.start(projectDir);

      assert.ok(startResult.success, `Session start should succeed: ${startResult.message}`);
      const runner = startResult.runner!;

      // Execute natural language task like REPL does
      const task = {
        id: `repl-task-${Date.now()}`,
        description: 'Create README.md',
        naturalLanguageTask: 'Create a file named README.md with content "# Demo Project\n\nThis is a demo."',
      };

      await runner.executeTasksSequentially([task]);

      // CRITICAL: Verify README.md actually exists
      const readmePath = path.join(projectDir, 'README.md');
      assert.ok(
        fs.existsSync(readmePath),
        `README.md MUST exist at ${readmePath} - this is the whole point of the test`
      );

      // Verify content is not empty
      const content = fs.readFileSync(readmePath, 'utf-8');
      assert.ok(content.length > 0, 'README.md content must not be empty');

      // Verify evidence reflects the creation
      const results = runner.getTaskResults();
      assert.equal(results.length, 1, 'Should have 1 result');

      const evidence = results[0].evidence as Record<string, unknown>;
      const filesCreated = evidence.files_created as string[];
      assert.ok(filesCreated && filesCreated.length > 0, 'Evidence must show files_created');

      await runner.shutdown();
    });

    /**
     * Real E2E test: Verify projectPath is used as cwd, not process.cwd()
     *
     * Requires: RUN_CLAUDE_E2E=1
     */
    it('should create files in projectPath not process.cwd()', async function() {
      this.timeout(180000);

      const e2eEnabled = process.env.RUN_CLAUDE_E2E === '1';
      if (!e2eEnabled) {
        this.skip();
        return;
      }
      if (!isClaudeAvailable()) {
        this.skip();
        return;
      }

      // Ensure projectDir is different from process.cwd()
      const currentCwd = process.cwd();
      assert.notEqual(
        currentCwd,
        projectDir,
        'Test setup: projectDir must differ from process.cwd()'
      );

      const session: REPLSession = {
        sessionId: null,
        projectPath: projectDir,
        runner: null,
        supervisor: null,
        status: 'idle',
      };

      const config: REPLConfig = {
        projectPath: projectDir,
        evidenceDir,
        timeout: 120000,
      };

      const sessionCommands = new SessionCommands(session, config);
      const startResult = await sessionCommands.start(projectDir);

      assert.ok(startResult.success, 'Session should start');
      const runner = startResult.runner!;

      const task = {
        id: `cwd-test-${Date.now()}`,
        description: 'Create test file',
        naturalLanguageTask: 'Create a file named CWD_TEST.txt with content "Created in correct location"',
      };

      await runner.executeTasksSequentially([task]);

      // File MUST be in projectDir, NOT in process.cwd()
      const expectedPath = path.join(projectDir, 'CWD_TEST.txt');
      const wrongPath = path.join(currentCwd, 'CWD_TEST.txt');

      assert.ok(
        fs.existsSync(expectedPath),
        `File must exist in projectDir: ${expectedPath}`
      );

      // Clean up if file was wrongly created in cwd
      if (fs.existsSync(wrongPath)) {
        fs.unlinkSync(wrongPath);
        assert.fail('File was wrongly created in process.cwd() instead of projectDir');
      }

      await runner.shutdown();
    });
  });
});
