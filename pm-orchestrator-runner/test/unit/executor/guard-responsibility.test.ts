/**
 * Unit Tests for AC D: Guard Responsibility
 *
 * Per AC D: Refactor Guard to not block execution (only DANGEROUS_OP and forgery prevention)
 *
 * Guards should:
 * - Allow BLOCKED status ONLY for DANGEROUS_OP tasks
 * - Convert BLOCKED to INCOMPLETE for all other task types
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  applyBlockedOutputGuard,
  selectFallbackQuestion,
  canTaskTypeBeBlocked,
  FALLBACK_QUESTIONS,
  BLOCKABLE_TASK_TYPES,
} from '../../../src/executor/auto-resolve-executor';
import { ExecutorResult, ExecutorTask } from '../../../src/executor/claude-code-executor';

// Helper to create minimal ExecutorResult for testing
function createBlockedResult(output: string, blocked_reason?: string): ExecutorResult {
  return {
    executed: true,
    output,
    files_modified: [],
    duration_ms: 100,
    status: 'BLOCKED',
    cwd: '/tmp',
    verified_files: [],
    unverified_files: [],
    blocked_reason: blocked_reason as any,
  };
}

// Helper to create minimal ExecutorTask for testing
function createTestTask(taskType: string): ExecutorTask {
  return {
    id: 'test-1',
    prompt: 'test prompt',
    workingDir: '/tmp',
    taskType,
  };
}

describe('AC D: Guard Responsibility', () => {
  describe('BLOCKABLE_TASK_TYPES', () => {
    it('should only include DANGEROUS_OP', () => {
      assert.deepStrictEqual(BLOCKABLE_TASK_TYPES, ['DANGEROUS_OP']);
    });
  });

  describe('canTaskTypeBeBlocked', () => {
    it('should return true for DANGEROUS_OP', () => {
      assert.strictEqual(canTaskTypeBeBlocked('DANGEROUS_OP'), true);
    });

    it('should return false for IMPLEMENTATION', () => {
      assert.strictEqual(canTaskTypeBeBlocked('IMPLEMENTATION'), false);
    });

    it('should return false for READ_INFO', () => {
      assert.strictEqual(canTaskTypeBeBlocked('READ_INFO'), false);
    });

    it('should return false for REPORT', () => {
      assert.strictEqual(canTaskTypeBeBlocked('REPORT'), false);
    });

    it('should return false for LIGHT_EDIT', () => {
      assert.strictEqual(canTaskTypeBeBlocked('LIGHT_EDIT'), false);
    });

    it('should return false for REVIEW_RESPONSE', () => {
      assert.strictEqual(canTaskTypeBeBlocked('REVIEW_RESPONSE'), false);
    });

    it('should return false for CONFIG_CI_CHANGE', () => {
      assert.strictEqual(canTaskTypeBeBlocked('CONFIG_CI_CHANGE'), false);
    });

    it('should return false for undefined taskType', () => {
      assert.strictEqual(canTaskTypeBeBlocked(undefined), false);
    });

    it('should return false for unknown taskType', () => {
      assert.strictEqual(canTaskTypeBeBlocked('UNKNOWN_TYPE'), false);
    });
  });

  describe('selectFallbackQuestion', () => {
    it('should return dangerous_op question for DANGEROUS_OP tasks', () => {
      const result = createBlockedResult('');
      const task = createTestTask('DANGEROUS_OP');
      const question = selectFallbackQuestion(result, task);
      assert.strictEqual(question, FALLBACK_QUESTIONS.dangerous_op);
    });

    it('should return implementation question for IMPLEMENTATION tasks', () => {
      const result = createBlockedResult('');
      const task = createTestTask('IMPLEMENTATION');
      const question = selectFallbackQuestion(result, task);
      assert.strictEqual(question, FALLBACK_QUESTIONS.implementation);
    });

    it('should return timeout question for TIMEOUT blocked reason', () => {
      const result = createBlockedResult('', 'TIMEOUT');
      const task = createTestTask('READ_INFO');
      const question = selectFallbackQuestion(result, task);
      assert.strictEqual(question, FALLBACK_QUESTIONS.blocked_timeout);
    });

    it('should return interactive question for INTERACTIVE_PROMPT blocked reason', () => {
      const result = createBlockedResult('', 'INTERACTIVE_PROMPT');
      const task = createTestTask('READ_INFO');
      const question = selectFallbackQuestion(result, task);
      assert.strictEqual(question, FALLBACK_QUESTIONS.blocked_interactive);
    });

    it('should return default question for unknown task types', () => {
      const result = createBlockedResult('');
      const task = createTestTask('READ_INFO');
      const question = selectFallbackQuestion(result, task);
      assert.strictEqual(question, FALLBACK_QUESTIONS.default);
    });
  });

  describe('applyBlockedOutputGuard (INV-1)', () => {

    it('should add fallback question when output is empty', () => {
      const result = createBlockedResult('');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.ok(guarded.output.length > 0, 'Output should not be empty');
      assert.ok(guarded.output.includes('?'), 'Output should contain question');
    });

    it('should add fallback question when output is whitespace only', () => {
      const result = createBlockedResult('   \n\t  ');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.ok(guarded.output.includes('?'), 'Output should contain question');
    });

    it('should preserve output with existing question', () => {
      const result = createBlockedResult('Do you want to proceed?');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.strictEqual(guarded.output, 'Do you want to proceed?');
    });

    it('should append question to output without question', () => {
      const result = createBlockedResult('Operation will delete files');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.ok(guarded.output.includes('Operation will delete files'), 'Should preserve original');
      assert.ok(guarded.output.includes('---'), 'Should have separator');
      assert.ok(guarded.output.includes('?'), 'Should add question');
    });

    it('should recognize YES/NO as question indicator', () => {
      const result = createBlockedResult('Proceed with deletion YES/NO');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.strictEqual(guarded.output, 'Proceed with deletion YES/NO');
    });

    it('should recognize Japanese question mark', () => {
      const result = createBlockedResult('続行しますか？');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.strictEqual(guarded.output, '続行しますか？');
    });

    it('should recognize confirm keyword', () => {
      const result = createBlockedResult('Please confirm the operation');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.strictEqual(guarded.output, 'Please confirm the operation');
    });

    it('should recognize Japanese confirmation words', () => {
      const result = createBlockedResult('操作の許可が必要です');
      const task = createTestTask('DANGEROUS_OP');
      const guarded = applyBlockedOutputGuard(result, task);

      assert.strictEqual(guarded.output, '操作の許可が必要です');
    });
  });

  describe('Guard logic integration', () => {
    // These tests verify the expected behavior of the Guard
    // The actual execute() method test would require mocking the innerExecutor

    it('should document that DANGEROUS_OP is the only blockable type', () => {
      // This is a documentation test - verifies the design intent
      const allTaskTypes = [
        'READ_INFO',
        'REPORT',
        'LIGHT_EDIT',
        'IMPLEMENTATION',
        'REVIEW_RESPONSE',
        'CONFIG_CI_CHANGE',
        'DANGEROUS_OP',
      ];

      const blockableTypes = allTaskTypes.filter(canTaskTypeBeBlocked);
      assert.deepStrictEqual(blockableTypes, ['DANGEROUS_OP']);
    });

    it('should document that all non-DANGEROUS_OP types convert BLOCKED to INCOMPLETE', () => {
      const nonBlockableTypes = [
        'READ_INFO',
        'REPORT',
        'LIGHT_EDIT',
        'IMPLEMENTATION',
        'REVIEW_RESPONSE',
        'CONFIG_CI_CHANGE',
      ];

      for (const taskType of nonBlockableTypes) {
        assert.strictEqual(
          canTaskTypeBeBlocked(taskType),
          false,
          `${taskType} should not be blockable`
        );
      }
    });
  });
});
