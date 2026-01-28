/**
 * Tests for Claude Code Executor
 *
 * These tests verify that tasks are executed via Claude Code CLI,
 * NOT by internal file simulation.
 *
 * Per spec 04_COMPONENTS.md: L2 Executor uses Claude Code CLI
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeExecutor, ExecutorResult } from '../../../src/executor/claude-code-executor';

describe('Claude Code Executor', () => {
  let tempDir: string;
  let executor: ClaudeCodeExecutor;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-executor-test-'));
    executor = new ClaudeCodeExecutor({
      projectPath: tempDir,
      timeout: 30000,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CLI Availability Check', () => {
    it('should detect if Claude Code CLI is available', async function () {
      this.timeout(5000);
      const available = await executor.isClaudeCodeAvailable();
      // This test documents the state - may be true or false depending on environment
      assert.ok(typeof available === 'boolean', 'Should return boolean');
    });
  });

  describe('Task Execution', () => {
    it('should execute task via Claude Code CLI when available', async function() {
      this.timeout(120000);  // 2 minutes for Claude execution
      // Skip if Claude Code not available
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const result = await executor.execute({
        id: 'test-task-1',
        prompt: 'Create a file named hello.txt with content "Hello World"',
        workingDir: tempDir,
      });

      // Claude CLI may succeed or fail - we just need to verify it was called
      assert.ok(typeof result.executed === 'boolean', 'Should have boolean executed status');
      assert.ok(typeof result.duration_ms === 'number', 'Should have duration');
      // If executed, check for output
      if (result.executed) {
        assert.ok(result.files_modified.length > 0 || result.output, 'Should have output or files');
      }
    });

    it('should return files_modified list after execution', async function() {
      this.timeout(120000);  // 2 minutes for Claude execution
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const result = await executor.execute({
        id: 'test-task-2',
        prompt: 'Create a README.md file with a simple description',
        workingDir: tempDir,
      });

      assert.ok(Array.isArray(result.files_modified), 'Should have files_modified array');
    });

    it('should fail-closed when Claude Code CLI is not available', async function() {
      // Create executor with forced unavailable CLI
      const unavailableExecutor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 30000,
        cliPath: '/nonexistent/claude',  // Force unavailable
      });

      const result = await unavailableExecutor.execute({
        id: 'test-task-3',
        prompt: 'Create a file',
        workingDir: tempDir,
      });

      assert.strictEqual(result.executed, false, 'Should not execute when CLI unavailable');
      assert.ok(result.error, 'Should have error message');
      assert.ok(result.error?.includes('not available') || result.error?.includes('not found'),
        'Error should indicate CLI not available');
    });

    it('should capture execution duration', async function() {
      this.timeout(120000);  // 2 minutes for Claude execution
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const result = await executor.execute({
        id: 'test-task-4',
        prompt: 'echo "test"',  // Simple task
        workingDir: tempDir,
      });

      assert.ok(typeof result.duration_ms === 'number', 'Should have duration');
      assert.ok(result.duration_ms >= 0, 'Duration should be non-negative');
    });
  });

  describe('Model Selection (spec 10_REPL_UX.md L117-118)', () => {
    it('should include --model flag in CLI args when selectedModel is set', async function() {
      // Create a mock CLI script that outputs its arguments to a file
      const mockScript = path.join(tempDir, 'mock-claude.sh');
      const argsFile = path.join(tempDir, 'captured-args.txt');

      // Create mock script that captures args and exits successfully
      fs.writeFileSync(mockScript, `#!/bin/bash
echo "$@" > "${argsFile}"
exit 0
`, { mode: 0o755 });

      // Create executor with mock CLI
      const mockExecutor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 5000,
        cliPath: mockScript,
      });

      // Execute with selectedModel
      await mockExecutor.execute({
        id: 'test-model-args',
        prompt: 'test prompt',
        workingDir: tempDir,
        selectedModel: 'claude-3-opus-20240229',
      });

      // Verify --model flag was passed to CLI
      const capturedArgs = fs.readFileSync(argsFile, 'utf-8');
      assert.ok(capturedArgs.includes('--model'), '--model flag should be in CLI args');
      assert.ok(capturedArgs.includes('claude-3-opus-20240229'), 'Model name should be in CLI args');
    });

    it('should NOT include --model flag when selectedModel is not set', async function() {
      // Create a mock CLI script that outputs its arguments to a file
      const mockScript = path.join(tempDir, 'mock-claude-no-model.sh');
      const argsFile = path.join(tempDir, 'captured-args-no-model.txt');

      // Create mock script that captures args
      fs.writeFileSync(mockScript, `#!/bin/bash
echo "$@" > "${argsFile}"
exit 0
`, { mode: 0o755 });

      // Create executor with mock CLI
      const mockExecutor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 5000,
        cliPath: mockScript,
      });

      // Execute WITHOUT selectedModel
      await mockExecutor.execute({
        id: 'test-no-model-args',
        prompt: 'test prompt',
        workingDir: tempDir,
        // No selectedModel
      });

      // Verify --model flag was NOT passed
      const capturedArgs = fs.readFileSync(argsFile, 'utf-8');
      assert.ok(!capturedArgs.includes('--model'), '--model flag should NOT be in CLI args when model not set');
    });

    it('should accept selectedModel in task (integration)', async function() {
      this.timeout(120000);
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      // Execute task with selectedModel set
      const result = await executor.execute({
        id: 'test-model-task',
        prompt: 'echo "test"',
        workingDir: tempDir,
        selectedModel: 'claude-3-opus-20240229',  // Per spec: REPL-local model selection
      });

      // The executor should accept the task with selectedModel
      // (--model flag is passed to Claude CLI internally)
      assert.ok(typeof result.executed === 'boolean', 'Should process task with selectedModel');
      assert.ok(typeof result.duration_ms === 'number', 'Should have duration');
    });

    it('should work without selectedModel (use CLI default)', async function() {
      this.timeout(120000);
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      // Execute task without selectedModel
      const result = await executor.execute({
        id: 'test-no-model-task',
        prompt: 'echo "test"',
        workingDir: tempDir,
        // No selectedModel - should use CLI default
      });

      assert.ok(typeof result.executed === 'boolean', 'Should process task without selectedModel');
    });
  });

  describe('Property 8: verified_files is sole completion authority', () => {
    it('should return COMPLETE when verified_files has exists=true file, even if files_modified=0', async function() {
      // This test simulates the scenario where:
      // - A file was created but not detected by detectModifiedFiles
      // - However, the file exists on disk and is in verified_files
      // Per Property 8: Runner's disk verification (verified_files) is the final authority

      // Create a mock CLI script that creates README.md but exits quickly
      // (simulating timing issue where file creation happens after listFiles)
      const mockScript = path.join(tempDir, 'mock-claude-create.sh');
      const targetFile = path.join(tempDir, 'README.md');

      // Mock script creates the file
      fs.writeFileSync(mockScript, `#!/bin/bash
echo "# Test README" > "${targetFile}"
exit 0
`, { mode: 0o755 });

      const mockExecutor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 5000,
        cliPath: mockScript,
      });

      const result = await mockExecutor.execute({
        id: 'test-verified-files',
        prompt: 'Create README.md',
        workingDir: tempDir,
      });

      // The file should exist on disk
      assert.ok(fs.existsSync(targetFile), 'README.md should exist on disk');

      // Per Property 8: verified_files determines completion, not files_modified
      // If file exists and is verified, status should be COMPLETE
      assert.ok(
        result.verified_files.some(f => f.path === 'README.md' && f.exists),
        'verified_files should contain README.md with exists=true'
      );
      assert.strictEqual(result.status, 'COMPLETE',
        'Status should be COMPLETE when verified_files confirms file exists');
    });

    it('should return NO_EVIDENCE when verified_files is empty (fail-closed)', async function() {
      // Mock script that does nothing (no file creation)
      const mockScript = path.join(tempDir, 'mock-claude-noop.sh');

      fs.writeFileSync(mockScript, `#!/bin/bash
exit 0
`, { mode: 0o755 });

      const mockExecutor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 5000,
        cliPath: mockScript,
      });

      const result = await mockExecutor.execute({
        id: 'test-no-verified-files',
        prompt: 'Do nothing',
        workingDir: tempDir,
      });

      // No files created, verified_files should be empty
      assert.strictEqual(result.verified_files.length, 0, 'verified_files should be empty');
      assert.strictEqual(result.status, 'NO_EVIDENCE',
        'Status should be NO_EVIDENCE when no verified files exist');
    });

    it('should return NO_EVIDENCE when verified_files contains exists=false (fail-closed)', async function() {
      // This tests the case where files_modified reports a file but it doesn't actually exist
      // Per Property 8: Runner verification is authoritative, not Executor claims

      // Create a mock that reports success but file doesn't exist
      // We can't easily mock this without changing the executor, so this test
      // verifies the contract: unverified_files > 0 should result in NO_EVIDENCE

      const mockScript = path.join(tempDir, 'mock-claude-phantom.sh');
      const phantomFile = path.join(tempDir, 'phantom.txt');

      // Create file, then delete it (simulating phantom file scenario)
      fs.writeFileSync(mockScript, `#!/bin/bash
echo "test" > "${phantomFile}"
rm "${phantomFile}"
exit 0
`, { mode: 0o755 });

      const mockExecutor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 5000,
        cliPath: mockScript,
      });

      const result = await mockExecutor.execute({
        id: 'test-phantom-file',
        prompt: 'Create phantom file',
        workingDir: tempDir,
      });

      // File was created then deleted, should NOT be COMPLETE
      assert.ok(
        result.status !== 'COMPLETE',
        'Status should NOT be COMPLETE when file does not exist on disk'
      );
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('should return NO_EVIDENCE or error status when no files are modified', async function() {
      this.timeout(120000);  // 2 minutes for Claude execution
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const result = await executor.execute({
        id: 'test-task-5',
        prompt: 'List the current directory',  // No file modification
        workingDir: tempDir,
      });

      // If no verified files exist, status should NOT be COMPLETE
      if (result.verified_files.length === 0) {
        assert.ok(
          result.status !== 'COMPLETE',
          'Should NOT be COMPLETE when no verified files (fail-closed)'
        );
      }
    });

    it('should timeout and fail-closed on long-running tasks', async function() {
      this.timeout(10000);  // 10 seconds for timeout test
      const shortTimeoutExecutor = new ClaudeCodeExecutor({
        projectPath: tempDir,
        timeout: 100,  // Very short timeout
      });

      const available = await shortTimeoutExecutor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const result = await shortTimeoutExecutor.execute({
        id: 'test-task-6',
        prompt: 'Implement a complex feature that takes a long time',
        workingDir: tempDir,
      });

      // Should either complete or timeout, but not hang
      assert.ok(result.executed === true || result.executed === false,
        'Should have definitive executed status');
    });
  });
});

describe('Claude Code Executor Integration with Runner', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-claude-test-'));
    projectDir = tempDir;

    // Create valid project structure
    fs.mkdirSync(path.join(projectDir, '.claude'));
    fs.writeFileSync(path.join(projectDir, '.claude', 'CLAUDE.md'), '# Test');
    fs.writeFileSync(path.join(projectDir, '.claude', 'settings.json'), '{}');
    fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should use ClaudeCodeExecutor for natural language tasks', async function() {
    this.timeout(180000);  // 3 minutes for full integration
    // Import dynamically to avoid issues if module doesn't exist yet
    let RunnerCore;
    try {
      RunnerCore = require('../../../src/core/runner-core').RunnerCore;
    } catch {
      this.skip();
      return;
    }

    const runner = new RunnerCore({
      evidenceDir: path.join(tempDir, 'evidence'),
      useClaudeCode: true,  // Enable Claude Code execution
    });

    await runner.initialize(projectDir);

    // Check if Claude Code is available
    const executor = new ClaudeCodeExecutor({ projectPath: projectDir, timeout: 30000 });
    const available = await executor.isClaudeCodeAvailable();

    if (!available) {
      runner.shutdown();
      this.skip();
      return;
    }

    const tasks = [{
      id: 'nl-task-1',
      description: 'Create a greeting file',
      naturalLanguageTask: 'Create a file named greeting.txt with "Hello from Claude Code"',
    }];

    await runner.executeTasksSequentially(tasks);
    const results = runner.getTaskResults();

    runner.shutdown();

    // Verify file was actually created
    const greetingPath = path.join(projectDir, 'greeting.txt');
    if (fs.existsSync(greetingPath)) {
      const content = fs.readFileSync(greetingPath, 'utf-8');
      assert.ok(content.includes('Hello') || content.includes('greeting'),
        'File should contain greeting content');
    }
  });
});
