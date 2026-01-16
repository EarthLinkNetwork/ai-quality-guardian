/**
 * File Creation Verification - Mock-based Deterministic Tests (Tier A)
 *
 * These tests verify fail-closed file creation behavior using mock executors.
 * They do NOT call real Claude Code CLI and always pass in any environment.
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md:
 * - Property 7: All operations MUST generate Evidence
 * - Property 8: COMPLETE status ONLY when Evidence collected
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunnerCore } from '../../src/core/runner-core';
import {
  IExecutor,
  ExecutorTask,
  ExecutorResult,
} from '../../src/executor/claude-code-executor';

/**
 * Mock Executor that simulates successful file creation
 */
class MockExecutorSuccess implements IExecutor {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    // Simulate creating a file
    const filename = 'README.md';
    const filepath = path.join(this.projectPath, filename);
    fs.writeFileSync(filepath, '# Demo Project\n\nThis is a demo.');

    return {
      executed: true,
      output: 'Created README.md',
      files_modified: [filename],
      duration_ms: 100,
      status: 'COMPLETE',
      cwd: this.projectPath,
      verified_files: [{ path: filename, exists: true, size: 40 }],
      unverified_files: [],
    };
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Mock Executor that reports files_modified but doesn't create them (fail-closed test)
 */
class MockExecutorNoFile implements IExecutor {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    // Report files_modified but don't actually create the file
    // This simulates Claude claiming to create a file but not doing it
    return {
      executed: true,
      output: 'Created README.md',
      files_modified: [], // No files modified
      duration_ms: 100,
      status: 'NO_EVIDENCE', // Fail-closed: no evidence of work
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
 * Mock Executor that returns error status
 */
class MockExecutorError implements IExecutor {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    return {
      executed: false,
      output: '',
      error: 'Mock execution error',
      files_modified: [],
      duration_ms: 50,
      status: 'ERROR',
      cwd: this.projectPath,
      verified_files: [],
      unverified_files: [],
    };
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }
}

describe('File Creation Verification - Mock (Tier A: Deterministic)', () => {
  let tempDir: string;
  let projectDir: string;
  let evidenceDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-creation-mock-'));
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

  describe('Case 1: Executor reports files_modified AND file exists', () => {
    it('should mark task COMPLETE with proper evidence', async function() {
      this.timeout(30000);

      const mockExecutor = new MockExecutorSuccess(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'mock-readme-creation',
        description: 'Create README file (mock)',
        naturalLanguageTask: 'Create a README.md file',
      };

      await runner.executeTasksSequentially([task]);

      // Verify file was actually created
      const readmePath = path.join(projectDir, 'README.md');
      assert.ok(fs.existsSync(readmePath), 'README.md should exist');

      // Verify evidence contains files_created
      const results = runner.getTaskResults();
      assert.equal(results.length, 1, 'Should have 1 result');

      const evidence = results[0].evidence as Record<string, unknown>;
      assert.ok(evidence, 'Should have evidence');
      assert.ok(evidence.started_at, 'Evidence should have started_at');
      assert.ok(evidence.completed_at, 'Evidence should have completed_at');

      const filesCreated = evidence.files_created as string[];
      assert.ok(filesCreated && filesCreated.length > 0, 'Should have files_created');

      await runner.shutdown();
    });
  });

  describe('Case 2: Executor reports empty files_modified (fail-closed)', () => {
    it('should NOT mark task COMPLETE when no files modified', async function() {
      this.timeout(30000);

      const mockExecutor = new MockExecutorNoFile(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'mock-no-file-task',
        description: 'Task that produces no files',
        naturalLanguageTask: 'Create a README.md file',
      };

      // Execution should throw or result in non-COMPLETE status
      let threw = false;
      try {
        await runner.executeTasksSequentially([task]);
      } catch (e) {
        threw = true;
        // Expected: task failed because no evidence
        const error = e as Error;
        assert.ok(
          error.message.includes('no evidence') || error.message.includes('NO_EVIDENCE'),
          `Error should mention "no evidence": ${error.message}`
        );
      }

      // Either it threw, or the task should not be COMPLETE
      if (!threw) {
        const results = runner.getTaskResults();
        if (results.length > 0) {
          const status = results[0].status;
          assert.notEqual(
            status,
            'COMPLETED',
            'Task should NOT be marked COMPLETE when no files modified'
          );
        }
      }

      await runner.shutdown();
    });
  });

  describe('Case 3: Executor returns error status', () => {
    it('should propagate error when executor fails', async function() {
      this.timeout(30000);

      const mockExecutor = new MockExecutorError(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'mock-error-task',
        description: 'Task that fails',
        naturalLanguageTask: 'Do something that will fail',
      };

      // Execution should throw or result in error status
      let threw = false;
      try {
        await runner.executeTasksSequentially([task]);
      } catch (e) {
        threw = true;
        // Expected: execution failed
      }

      // Either it threw, or the task should have error status
      if (!threw) {
        const results = runner.getTaskResults();
        if (results.length > 0) {
          const status = results[0].status;
          assert.notEqual(
            status,
            'COMPLETED',
            'Task should NOT be marked COMPLETE when executor fails'
          );
        }
      }

      await runner.shutdown();
    });
  });

  describe('Dependency injection verification', () => {
    it('should use injected executor instead of real ClaudeCodeExecutor', async function() {
      this.timeout(30000);

      let executeCalled = false;

      // Custom mock to verify DI works
      const tracingExecutor: IExecutor = {
        async execute(task: ExecutorTask): Promise<ExecutorResult> {
          executeCalled = true;
          const filepath = path.join(projectDir, 'traced.txt');
          fs.writeFileSync(filepath, 'traced');
          return {
            executed: true,
            output: 'Traced execution',
            files_modified: ['traced.txt'],
            duration_ms: 10,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'traced.txt', exists: true, size: 6 }],
            unverified_files: [],
          };
        },
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        },
      };

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: tracingExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'di-test',
        description: 'Test DI',
        naturalLanguageTask: 'Do something',
      };

      await runner.executeTasksSequentially([task]);

      assert.ok(executeCalled, 'Injected executor should have been called');
      assert.ok(
        fs.existsSync(path.join(projectDir, 'traced.txt')),
        'File created by injected executor should exist'
      );

      await runner.shutdown();
    });
  });
});
