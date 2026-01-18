/**
 * Self-Heal Integration Tests
 *
 * These tests verify that the Runner's mediation loop works correctly:
 * 1. Detects INCOMPLETE status
 * 2. Auto-queues correction task
 * 3. Maintains context across correction cycles
 * 4. Eventually reaches COMPLETE status
 *
 * Uses StepwiseMockExecutor to simulate:
 * - Step 1: Buggy implementation -> INCOMPLETE
 * - Step 2: Fixed implementation -> COMPLETE
 *
 * NOTE: Some tests are pending until RunnerCore implements auto-queuing.
 * The current implementation executes tasks sequentially without correction loops.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { RunnerCore } from '../../src/core/runner-core';
import { StepwiseMockExecutor, createTinyCliMockExecutor } from '../../src/executor/stepwise-mock-executor';

describe('Self-Heal Integration Tests (Tier A: Deterministic)', () => {
  let tempDir: string;
  let projectDir: string;
  let evidenceDir: string;
  let fixtureDir: string;

  beforeEach(async function() {
    this.timeout(60000);

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-heal-test-'));
    projectDir = path.join(tempDir, 'tiny-cli');
    evidenceDir = path.join(tempDir, 'evidence');

    // Copy fixture to temp directory
    fixtureDir = path.resolve(__dirname, '../../fixtures/e2e-tiny-cli');

    // Check if fixture exists
    if (!fs.existsSync(fixtureDir)) {
      console.log('Fixture not found at:', fixtureDir);
      this.skip();
      return;
    }

    // Copy fixture
    fs.cpSync(fixtureDir, projectDir, { recursive: true });

    // Install dependencies in temp project
    execSync('npm install', { cwd: projectDir, stdio: 'pipe' });

    // Initial build
    execSync('npm run build', { cwd: projectDir, stdio: 'pipe' });

    // Create .claude directory structure for Runner
    const claudeDir = path.join(projectDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Tiny CLI Project');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'agents', 'pm-orchestrator.md'), '# PM');
    fs.mkdirSync(path.join(claudeDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'rules', 'project-rules.md'), '# Rules');
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('StepwiseMockExecutor Basic Functionality', () => {
    it('should execute steps in order', async function() {
      this.timeout(60000);

      const mockExecutor = createTinyCliMockExecutor(projectDir);

      // Call execute multiple times
      const result1 = await mockExecutor.execute({
        id: 'test-1',
        prompt: 'Fix bugs',
        workingDir: projectDir,
      });

      assert.equal(result1.status, 'INCOMPLETE', 'First call should return INCOMPLETE');
      assert.equal(mockExecutor.getCallCount(), 1, 'Should have 1 call');

      const result2 = await mockExecutor.execute({
        id: 'test-2',
        prompt: 'Fix bugs again',
        workingDir: projectDir,
      });

      assert.equal(result2.status, 'COMPLETE', 'Second call should return COMPLETE');
      assert.equal(mockExecutor.getCallCount(), 2, 'Should have 2 calls');
    });

    it('should create files on disk', async function() {
      this.timeout(60000);

      const mockExecutor = createTinyCliMockExecutor(projectDir);

      await mockExecutor.execute({
        id: 'test-1',
        prompt: 'Fix bugs',
        workingDir: projectDir,
      });

      const filePath = path.join(projectDir, 'src', 'tiny-cli.ts');
      assert.ok(fs.existsSync(filePath), 'tiny-cli.ts should exist after first call');
    });

    it('should track execution log', async function() {
      this.timeout(60000);

      const mockExecutor = createTinyCliMockExecutor(projectDir);

      await mockExecutor.execute({
        id: 'task-1',
        prompt: 'Fix bugs',
        workingDir: projectDir,
      });

      await mockExecutor.execute({
        id: 'task-2',
        prompt: 'Continue fixing',
        workingDir: projectDir,
      });

      const log = mockExecutor.getExecutionLog();
      assert.equal(log.length, 2, 'Should have 2 log entries');
      assert.equal(log[0].status, 'INCOMPLETE');
      assert.equal(log[1].status, 'COMPLETE');
    });

    it('should reset state correctly', async function() {
      const mockExecutor = createTinyCliMockExecutor(projectDir);

      await mockExecutor.execute({
        id: 'test-1',
        prompt: 'Fix bugs',
        workingDir: projectDir,
      });

      assert.equal(mockExecutor.getCallCount(), 1);

      mockExecutor.reset();

      assert.equal(mockExecutor.getCallCount(), 0);
      assert.equal(mockExecutor.getExecutionLog().length, 0);
    });
  });

  describe('RunnerCore with Mock Executor', () => {
    it('should use injected mock executor', async function() {
      this.timeout(60000);

      const mockExecutor = createTinyCliMockExecutor(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'test-mock-injection',
        description: 'Test mock injection',
        naturalLanguageTask: 'Fix tiny-cli bugs',
      };

      await runner.executeTasksSequentially([task]);

      // Verify mock was called
      assert.ok(mockExecutor.getCallCount() >= 1, 'Mock executor should have been called');

      await runner.shutdown();
    });

    it('should handle INCOMPLETE status from mock', async function() {
      this.timeout(60000);

      // Create mock that always returns INCOMPLETE
      const incompleteExecutor = new StepwiseMockExecutor({
        projectPath: projectDir,
        steps: [
          {
            status: 'INCOMPLETE',
            output: 'Work not finished',
          },
        ],
        defaultStatus: 'INCOMPLETE',
      });

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: incompleteExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'incomplete-test',
        description: 'Test incomplete handling',
        naturalLanguageTask: 'Do something that stays incomplete',
      };

      await runner.executeTasksSequentially([task]);

      // Verify executor was called
      assert.equal(incompleteExecutor.getCallCount(), 1, 'Executor should have been called once');

      await runner.shutdown();
    });
  });

  describe('Mediation Loop: INCOMPLETE -> COMPLETE (Pending: requires auto-queuing)', () => {
    // NOTE: These tests are pending until RunnerCore implements the auto-queuing feature
    // where INCOMPLETE status triggers automatic correction task creation

    it.skip('should detect INCOMPLETE and auto-queue correction until COMPLETE', async function() {
      // Pending: requires auto-queuing implementation
    });

    it.skip('should maintain context across correction cycles', async function() {
      // Pending: requires auto-queuing implementation
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('should return NO_EVIDENCE when executor returns NO_EVIDENCE', async function() {
      this.timeout(60000);

      const noEvidenceExecutor = new StepwiseMockExecutor({
        projectPath: projectDir,
        steps: [
          {
            status: 'NO_EVIDENCE',
            output: 'Made changes but no evidence provided',
          },
        ],
        defaultStatus: 'NO_EVIDENCE',
      });

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: noEvidenceExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'no-evidence-test',
        description: 'Test NO_EVIDENCE handling',
        naturalLanguageTask: 'Do something without evidence',
      };

      let errorThrown = false;
      try {
        await runner.executeTasksSequentially([task]);
      } catch (e) {
        errorThrown = true;
        const error = e as Error;
        assert.ok(
          error.message.includes('NO_EVIDENCE') || 
          error.message.includes('no evidence') ||
          error.message.includes('fail'),
          'Error should mention NO_EVIDENCE: ' + error.message
        );
      }

      // Either error was thrown or task has non-COMPLETE status
      if (!errorThrown) {
        const results = runner.getTaskResults();
        if (results.length > 0) {
          // NO_EVIDENCE should not be marked as COMPLETED
          const status = String(results[0].status);
          assert.notStrictEqual(
            status,
            'COMPLETED',
            'Task with NO_EVIDENCE status should not be marked COMPLETED, got: ' + status
          );
        }
      }

      await runner.shutdown();
    });

    it.skip('should not mark COMPLETE without verified test pass', async function() {
      // Pending: requires test verification integration
    });
  });

  describe('User Output: Essential Info Only', () => {
    it('should produce evidence with required fields', async function() {
      this.timeout(60000);

      const mockExecutor = createTinyCliMockExecutor(projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'output-test',
        description: 'Test output structure',
        naturalLanguageTask: 'Fix tiny-cli',
      };

      await runner.executeTasksSequentially([task]);

      const results = runner.getTaskResults();
      assert.ok(results.length > 0, 'Should have results');

      const result = results[results.length - 1];
      assert.ok(result.evidence, 'Should have evidence');

      await runner.shutdown();
    });
  });

  describe('Maximum Loop Protection', () => {
    it.skip('should stop after maximum correction attempts', async function() {
      // Pending: requires auto-queuing with max loop limit
    });
  });
});
