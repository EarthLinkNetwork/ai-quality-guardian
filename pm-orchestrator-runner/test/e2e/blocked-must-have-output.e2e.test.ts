/**
 * E2E Test: BLOCKED Must Have Output (INV-1)
 *
 * Per docs/spec/BLOCKED_OUTPUT_INVARIANTS.md:
 * - AC-1: BLOCKED with Fallback Question
 * - INV-1: BLOCKED Output Non-Empty Guard
 *
 * Verifies that when executor returns BLOCKED status,
 * the output field always contains an actionable question.
 */

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  applyBlockedOutputGuard,
  selectFallbackQuestion,
  FALLBACK_QUESTIONS,
} from '../../src/executor/auto-resolve-executor';
import { ExecutorResult, ExecutorTask } from '../../src/executor/claude-code-executor';

describe('E2E: BLOCKED Must Have Output (INV-1)', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-blocked-e2e-'));
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('INV-1: BLOCKED Output Non-Empty Guard', () => {
    it('should add fallback question when BLOCKED with empty output', async () => {
      // Test case 1: BLOCKED with completely empty output
      const blockedEmptyResult: ExecutorResult = {
        executed: false,
        output: '',
        error: 'Executor blocked: TIMEOUT',
        files_modified: [],
        duration_ms: 5000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'TIMEOUT',
        terminated_by: 'TIMEOUT',
      };

      const task: ExecutorTask = {
        id: 'test-1',
        prompt: 'Test prompt',
        workingDir: tempDir,
        taskType: 'READ_INFO',
      };

      const guardedResult = applyBlockedOutputGuard(blockedEmptyResult, task);

      // Assert: Output should not be empty
      assert.ok(guardedResult.output, 'Output should not be empty after guard');
      assert.ok(guardedResult.output.trim().length > 0, 'Output should have non-whitespace content');

      // Assert: Output should contain a question
      const hasQuestion = guardedResult.output.includes('?') ||
                          guardedResult.output.includes('YES/NO');
      assert.ok(hasQuestion, 'Output should contain a question');

      console.log('[E2E] Guarded BLOCKED output:', guardedResult.output);
    });

    it('should preserve existing output with question', async () => {
      // Test case: BLOCKED with existing output that has a question
      const blockedWithQuestion: ExecutorResult = {
        executed: false,
        output: 'Processing failed. Would you like to retry?',
        error: 'Executor blocked: INTERACTIVE_PROMPT',
        files_modified: [],
        duration_ms: 3000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'INTERACTIVE_PROMPT',
        terminated_by: 'REPL_FAIL_CLOSED',
      };

      const task: ExecutorTask = {
        id: 'test-2',
        prompt: 'Test prompt',
        workingDir: tempDir,
      };

      const guardedResult = applyBlockedOutputGuard(blockedWithQuestion, task);

      // Assert: Original output should be preserved
      assert.ok(guardedResult.output.includes('Would you like to retry?'),
        'Original question should be preserved');

      console.log('[E2E] Preserved BLOCKED output:', guardedResult.output);
    });

    it('should add fallback question to output without question', async () => {
      // Test case: BLOCKED with output but no question
      const blockedNoQuestion: ExecutorResult = {
        executed: false,
        output: 'Task execution was interrupted due to timeout.',
        error: 'Executor blocked: TIMEOUT',
        files_modified: [],
        duration_ms: 5000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'TIMEOUT',
        terminated_by: 'TIMEOUT',
      };

      const task: ExecutorTask = {
        id: 'test-3',
        prompt: 'Test prompt',
        workingDir: tempDir,
      };

      const guardedResult = applyBlockedOutputGuard(blockedNoQuestion, task);

      // Assert: Output should contain original message AND fallback question
      assert.ok(guardedResult.output.includes('Task execution was interrupted'),
        'Original output should be preserved');
      assert.ok(guardedResult.output.includes('?') || guardedResult.output.includes('YES/NO'),
        'Fallback question should be added');

      console.log('[E2E] Output with added fallback:', guardedResult.output);
    });

    it('should select timeout-specific fallback for TIMEOUT blocked reason', async () => {
      const timeoutResult: ExecutorResult = {
        executed: false,
        output: '',
        error: 'Executor blocked: TIMEOUT',
        files_modified: [],
        duration_ms: 5000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'TIMEOUT',
        terminated_by: 'TIMEOUT',
      };

      const task: ExecutorTask = {
        id: 'test-4',
        prompt: 'Test prompt',
        workingDir: tempDir,
      };

      const fallback = selectFallbackQuestion(timeoutResult, task);

      // Assert: Should be timeout-specific question
      assert.ok(fallback.includes('タイムアウト') || fallback.includes('timed out'),
        'Should contain timeout-related text');

      console.log('[E2E] Timeout fallback question:', fallback);
    });

    it('should select interactive-specific fallback for INTERACTIVE_PROMPT blocked reason', async () => {
      const interactiveResult: ExecutorResult = {
        executed: false,
        output: '',
        error: 'Executor blocked: INTERACTIVE_PROMPT',
        files_modified: [],
        duration_ms: 3000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'INTERACTIVE_PROMPT',
        terminated_by: 'REPL_FAIL_CLOSED',
      };

      const task: ExecutorTask = {
        id: 'test-5',
        prompt: 'Test prompt',
        workingDir: tempDir,
      };

      const fallback = selectFallbackQuestion(interactiveResult, task);

      // Assert: Should be interactive-specific question
      assert.ok(fallback.includes('対話的') || fallback.includes('Interactive'),
        'Should contain interactive-related text');

      console.log('[E2E] Interactive fallback question:', fallback);
    });
  });

  describe('AC-1: BLOCKED with Fallback Question', () => {
    it('should ensure BLOCKED status always has actionable output', async () => {
      // Test various BLOCKED scenarios
      const scenarios: Array<{
        name: string;
        result: Partial<ExecutorResult>;
        task: ExecutorTask;
      }> = [
        {
          name: 'Empty output with TIMEOUT',
          result: { output: '', blocked_reason: 'TIMEOUT' as const },
          task: { id: 't1', prompt: 'p1', workingDir: tempDir },
        },
        {
          name: 'Whitespace only output',
          result: { output: '   \n\t  ', blocked_reason: 'TIMEOUT' as const },
          task: { id: 't2', prompt: 'p2', workingDir: tempDir },
        },
        {
          name: 'Output without question',
          result: { output: 'Execution stopped.', blocked_reason: 'INTERACTIVE_PROMPT' as const },
          task: { id: 't3', prompt: 'p3', workingDir: tempDir },
        },
      ];

      for (const scenario of scenarios) {
        const fullResult: ExecutorResult = {
          executed: false,
          output: scenario.result.output || '',
          error: `Executor blocked: ${scenario.result.blocked_reason}`,
          files_modified: [],
          duration_ms: 5000,
          status: 'BLOCKED',
          cwd: tempDir,
          verified_files: [],
          unverified_files: [],
          executor_blocked: true,
          blocked_reason: scenario.result.blocked_reason,
          terminated_by: 'TIMEOUT',
        };

        const guarded = applyBlockedOutputGuard(fullResult, scenario.task);

        // Assert: All scenarios should have non-empty, actionable output
        assert.ok(guarded.output.trim().length > 0,
          `${scenario.name}: Output should not be empty`);

        const hasActionable = guarded.output.includes('?') ||
                              guarded.output.includes('YES/NO') ||
                              guarded.output.includes('許可');
        assert.ok(hasActionable,
          `${scenario.name}: Output should be actionable`);

        console.log(`[E2E] ${scenario.name} -> OK`);
      }
    });
  });
});
