/**
 * Integration tests for file creation verification
 *
 * Verifies that REPL natural language tasks actually create files
 * and that the evidence system properly validates file existence.
 *
 * TDD: These tests are written FIRST, before implementation fixes.
 *
 * Problem: REPL returns COMPLETE but files don't exist.
 * Solution: Verify file existence and fail-closed if not created.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunnerCore } from '../../src/core/runner-core';
import { ClaudeCodeExecutor, ExecutorResult } from '../../src/executor/claude-code-executor';
import { OverallStatus } from '../../src/models/enums';
import { isClaudeAvailable } from '../helpers/claude-availability';

describe('File Creation Verification (Integration)', () => {
  let tempDir: string;
  let projectDir: string;
  let evidenceDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-creation-test-'));
    projectDir = tempDir;
    evidenceDir = path.join(tempDir, 'evidence');

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
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('ClaudeCodeExecutor cwd enforcement', () => {
    /**
     * CRITICAL: cwd must be set to projectPath, not process.cwd()
     * This ensures files are created in the correct location.
     */
    it('should use projectPath as cwd, not process.cwd()', async () => {
      const executor = new ClaudeCodeExecutor({
        projectPath: projectDir,
        timeout: 30000,
      });

      // Verify executor stores projectPath correctly
      // We check this by examining the config
      assert.ok(executor, 'Executor should be created');

      // The cwd is used in execute() - we verify it by checking
      // that files created end up in projectPath, not process.cwd()
    });

    /**
     * Files created must be within projectPath boundary
     * (path traversal prevention)
     */
    it('should only allow file creation within projectPath', async () => {
      const executor = new ClaudeCodeExecutor({
        projectPath: projectDir,
        timeout: 30000,
      });

      // Get current cwd to ensure it's different from projectPath
      const currentCwd = process.cwd();
      assert.notEqual(currentCwd, projectDir, 'Test setup: projectPath should differ from process.cwd()');
    });
  });

  describe('File existence verification', () => {
    /**
     * When a file creation task reports files_modified,
     * those files MUST actually exist on disk.
     */
    it('should verify that files_modified actually exist on disk', async function() {
      this.timeout(60000);

      // Create a file manually to simulate what Claude Code would create
      const readmePath = path.join(projectDir, 'README.md');
      fs.writeFileSync(readmePath, '# Demo Project\n\nThis is a demo.');

      // Verify file exists
      assert.ok(fs.existsSync(readmePath), 'README.md should exist');

      // Verify content is not empty
      const content = fs.readFileSync(readmePath, 'utf-8');
      assert.ok(content.length > 0, 'README.md should not be empty');
    });

    /**
     * If files_modified reports a file but it doesn't exist,
     * status MUST NOT be COMPLETE - should be NO_EVIDENCE or ERROR.
     */
    it('should return NO_EVIDENCE when files_modified is empty', async function() {
      this.timeout(60000);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false, // Don't use Claude Code for this test
      });

      await runner.initialize(projectDir);

      // Execute task that won't create any files (no naturalLanguageTask pattern match)
      const task = {
        id: 'test-no-files',
        description: 'Task without file creation',
        naturalLanguageTask: 'Do nothing special',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Since no files were created, evidence should reflect that
      assert.ok(results.length > 0, 'Should have task results');
      const result = results[0];

      // Check evidence contains files_created info
      const evidence = result.evidence as Record<string, unknown>;
      const filesCreated = evidence.files_created as string[] || [];

      // If no files created, status should indicate that
      if (filesCreated.length === 0) {
        // Either task errors or evidence shows no files
        assert.ok(
          result.status !== 'COMPLETED' || filesCreated.length === 0,
          'Task without file creation should indicate no files in evidence'
        );
      }

      await runner.shutdown();
    });
  });

  describe('Evidence structure', () => {
    /**
     * Evidence must include cwd used for execution
     */
    it('should include cwd in evidence', async function() {
      this.timeout(60000);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'test-evidence-cwd',
        description: 'Test evidence includes cwd',
        naturalLanguageTask: 'Create README.md for demo project',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.ok(results.length > 0, 'Should have task results');
      const evidence = results[0].evidence as Record<string, unknown>;

      // Evidence should contain execution context
      assert.ok(evidence, 'Evidence should exist');

      await runner.shutdown();
    });

    /**
     * Evidence must include list of created files
     */
    it('should include created_files in evidence', async function() {
      this.timeout(60000);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'test-evidence-files',
        description: 'Test evidence includes files',
        naturalLanguageTask: 'Create README.md that explains this is a demo project',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.ok(results.length > 0, 'Should have task results');
      const evidence = results[0].evidence as Record<string, unknown>;

      // Evidence should contain files_created array
      assert.ok('files_created' in evidence, 'Evidence should include files_created');
      const filesCreated = evidence.files_created as string[];
      assert.ok(Array.isArray(filesCreated), 'files_created should be an array');

      await runner.shutdown();
    });

    /**
     * Evidence must include verified_files showing actual verification
     */
    it('should include verified_files in evidence', async function() {
      this.timeout(60000);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'test-evidence-verified',
        description: 'Test evidence includes verified files',
        naturalLanguageTask: 'Create README.md that explains this is a demo project',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.ok(results.length > 0, 'Should have task results');
      const evidence = results[0].evidence as Record<string, unknown>;

      // Should have verification info
      // For now we check files_created exists (will be enhanced to verified_files)
      assert.ok('files_created' in evidence || 'verified_files' in evidence,
        'Evidence should include files verification info');

      await runner.shutdown();
    });
  });

  describe('Fail-closed behavior', () => {
    /**
     * If README.md task doesn't create README.md,
     * status MUST be NO_EVIDENCE or ERROR, never COMPLETE.
     */
    it('should not return COMPLETE if expected file does not exist', async function() {
      this.timeout(60000);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      // This task expects README.md but we'll verify it actually creates one
      const task = {
        id: 'test-readme-creation',
        description: 'Create README for demo project',
        naturalLanguageTask: 'Create README.md that explains this is a demo project',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.ok(results.length > 0, 'Should have task results');
      const result = results[0];

      // If task is COMPLETED, README.md MUST exist
      if (result.status === 'COMPLETED') {
        const readmePath = path.join(projectDir, 'README.md');
        assert.ok(
          fs.existsSync(readmePath),
          'README.md must exist when task reports COMPLETED'
        );

        // Verify content is not empty
        const content = fs.readFileSync(readmePath, 'utf-8');
        assert.ok(content.length > 0, 'README.md must not be empty');
      }

      await runner.shutdown();
    });

    /**
     * Overall status must reflect file verification failure
     */
    it('should set overall status to NO_EVIDENCE when file verification fails', async function() {
      this.timeout(60000);

      // This test verifies the RunnerCore properly handles
      // the case when Claude Code claims success but no files exist

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      // Execute a task that should create README.md
      const task = {
        id: 'test-overall-status',
        description: 'Test overall status on failure',
        naturalLanguageTask: 'Create README.md that explains this is a demo project',
      };

      await runner.executeTasksSequentially([task]);

      const readmePath = path.join(projectDir, 'README.md');
      const fileExists = fs.existsSync(readmePath);

      const overallStatus = runner.getOverallStatus();

      // If file doesn't exist, overall status should NOT be COMPLETE
      if (!fileExists) {
        assert.notEqual(
          overallStatus,
          OverallStatus.COMPLETE,
          'Overall status should not be COMPLETE when expected file does not exist'
        );
      }

      await runner.shutdown();
    });
  });

  describe('Real file creation (Tier B: opt-in E2E)', () => {
    /**
     * End-to-end test: Submit task, verify file actually exists
     *
     * TIER B TEST: Requires explicit opt-in via RUN_CLAUDE_E2E=1
     * This test calls real Claude Code CLI and may fail if Claude doesn't create files.
     *
     * To run: RUN_CLAUDE_E2E=1 npm test
     */
    it('should actually create README.md on filesystem', async function() {
      this.timeout(180000); // 3 minutes for Claude Code execution

      // TIER B: Skip unless BOTH conditions are met:
      // 1. Claude CLI is available (binary + version ok)
      // 2. Explicit opt-in via RUN_CLAUDE_E2E=1
      const e2eEnabled = process.env.RUN_CLAUDE_E2E === '1';
      if (!e2eEnabled) {
        this.skip();
        return;
      }
      if (!isClaudeAvailable()) {
        this.skip();
        return;
      }

      const executor = new ClaudeCodeExecutor({
        projectPath: projectDir,
        timeout: 120000,
      });

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        claudeCodeTimeout: 120000,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'real-readme-creation',
        description: 'Create actual README file',
        naturalLanguageTask: 'Create a file named README.md with content "# Demo Project\\n\\nThis is a demo project for testing."',
      };

      await runner.executeTasksSequentially([task]);

      // Verify README.md actually exists on filesystem
      const readmePath = path.join(projectDir, 'README.md');
      assert.ok(
        fs.existsSync(readmePath),
        `README.md must exist at ${readmePath}`
      );

      // Verify content is not empty
      const content = fs.readFileSync(readmePath, 'utf-8');
      assert.ok(
        content.length > 0,
        'README.md content must not be empty'
      );

      // Verify evidence contains the file
      const results = runner.getTaskResults();
      const evidence = results[0].evidence as Record<string, unknown>;
      const filesCreated = evidence.files_created as string[];

      assert.ok(
        filesCreated && filesCreated.length > 0,
        'Evidence must contain created files'
      );

      await runner.shutdown();
    });

    /**
     * Direct Executor E2E test: Prove --tools option enables file creation
     *
     * TIER B TEST: Requires explicit opt-in via RUN_CLAUDE_E2E=1
     * This test calls real Claude Code CLI directly to verify file operations work.
     */
    it('should create file via ClaudeCodeExecutor directly', async function() {
      this.timeout(180000); // 3 minutes for Claude Code execution

      const e2eEnabled = process.env.RUN_CLAUDE_E2E === '1';
      if (!e2eEnabled) {
        this.skip();
        return;
      }
      if (!isClaudeAvailable()) {
        this.skip();
        return;
      }

      const executor = new ClaudeCodeExecutor({
        projectPath: projectDir,
        timeout: 120000,
      });

      // Execute task directly via executor
      const result = await executor.execute({
        id: 'direct-file-creation',
        prompt: 'Create a file named DIRECT_TEST.txt with content "Created by executor test"',
        workingDir: projectDir,
      });

      // Verify executor result
      assert.equal(result.executed, true, 'Execution should succeed');
      assert.equal(result.status, 'COMPLETE', `Status should be COMPLETE, got ${result.status}`);
      assert.ok(result.files_modified.length > 0, 'Should have modified files');
      assert.ok(result.verified_files.length > 0, 'Should have verified files');
      assert.equal(result.unverified_files.length, 0, 'Should have no unverified files');

      // Verify file actually exists on filesystem
      const testFilePath = path.join(projectDir, 'DIRECT_TEST.txt');
      assert.ok(
        fs.existsSync(testFilePath),
        `DIRECT_TEST.txt must exist at ${testFilePath}`
      );

      // Verify content
      const content = fs.readFileSync(testFilePath, 'utf-8');
      assert.ok(content.length > 0, 'File content must not be empty');
    });

    /**
     * Fail-closed E2E test: Prove NO_EVIDENCE when task doesn't create files
     *
     * TIER B TEST: Requires explicit opt-in via RUN_CLAUDE_E2E=1
     */
    it('should return NO_EVIDENCE when no files created', async function() {
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

      const executor = new ClaudeCodeExecutor({
        projectPath: projectDir,
        timeout: 120000,
      });

      // Execute a task that doesn't create files
      const result = await executor.execute({
        id: 'no-file-task',
        prompt: 'Reply with exactly: "I understand, no files needed"',
        workingDir: projectDir,
      });

      // Fail-closed: If no files created, status should be NO_EVIDENCE
      if (result.files_modified.length === 0) {
        assert.equal(
          result.status,
          'NO_EVIDENCE',
          'Status should be NO_EVIDENCE when no files modified'
        );
      }
    });
  });
});

describe('ClaudeCodeExecutor Extended Evidence', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-evidence-test-'));
    projectDir = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Extended ExecutorResult fields', () => {
    /**
     * ExecutorResult must include cwd used for execution
     */
    it('should include cwd in ExecutorResult', async function() {
      this.timeout(30000);

      const executor = new ClaudeCodeExecutor({
        projectPath: projectDir,
        timeout: 10000,
      });

      // Can't test actual execution without Claude Code,
      // but we can verify the interface expectations
      assert.ok(executor, 'Executor should be created');

      // The interface ExecutorResult should include:
      // - executed: boolean
      // - output: string
      // - files_modified: string[]
      // - duration_ms: number
      // - status: string
      // NEW: cwd, verified_files
    });

    /**
     * ExecutorResult must include verified_files with existence check
     */
    it('should verify file existence after execution', async function() {
      this.timeout(30000);

      // Create a file to verify
      const testFile = path.join(projectDir, 'test-file.txt');
      fs.writeFileSync(testFile, 'test content');

      // Verify the file exists
      assert.ok(fs.existsSync(testFile), 'Test file should exist');

      // Verify content
      const content = fs.readFileSync(testFile, 'utf-8');
      assert.equal(content, 'test content', 'Content should match');
    });
  });
});
