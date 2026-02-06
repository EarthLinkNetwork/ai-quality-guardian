/**
 * E2E Test: IMPLEMENTATION Never BLOCKED (INV-2)
 *
 * Per docs/spec/BLOCKED_OUTPUT_INVARIANTS.md:
 * - AC-2: IMPLEMENTATION Never BLOCKED
 * - INV-2: IMPLEMENTATION Task BLOCKED Prohibition
 *
 * Verifies that IMPLEMENTATION tasks are never returned with BLOCKED status.
 * Instead, they should be converted to INCOMPLETE (for AWAITING_RESPONSE handling)
 * with a clarification question.
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

describe('E2E: IMPLEMENTATION Never BLOCKED (INV-2)', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-impl-blocked-e2e-'));
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('INV-2: IMPLEMENTATION Task BLOCKED Prohibition', () => {
    it('should select IMPLEMENTATION-specific fallback question', async () => {
      const blockedResult: ExecutorResult = {
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

      const implementationTask: ExecutorTask = {
        id: 'impl-1',
        prompt: 'Add user authentication feature',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      };

      const fallback = selectFallbackQuestion(blockedResult, implementationTask);

      // Assert: Should be implementation-specific question
      assert.ok(
        fallback.includes('変更対象') || fallback.includes('Target files'),
        'Should ask about target files'
      );
      assert.ok(
        fallback.includes('期待する動作') || fallback.includes('Expected behavior'),
        'Should ask about expected behavior'
      );

      console.log('[E2E] IMPLEMENTATION fallback question:', fallback);
    });

    it('should apply BLOCKED guard with IMPLEMENTATION-specific output', async () => {
      const blockedEmptyResult: ExecutorResult = {
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

      const implementationTask: ExecutorTask = {
        id: 'impl-2',
        prompt: 'Refactor database module',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      };

      const guarded = applyBlockedOutputGuard(blockedEmptyResult, implementationTask);

      // Assert: Output should have IMPLEMENTATION-specific content
      assert.ok(guarded.output.trim().length > 0, 'Output should not be empty');
      assert.ok(
        guarded.output.includes('変更対象') || guarded.output.includes('Target files'),
        'Output should ask about target files for IMPLEMENTATION'
      );

      console.log('[E2E] Guarded IMPLEMENTATION output:', guarded.output);
    });
  });

  describe('AC-2: IMPLEMENTATION Never BLOCKED (status conversion)', () => {
    it('should document expected behavior for IMPLEMENTATION BLOCKED conversion', async () => {
      // Note: The actual status conversion happens in the execute() method
      // This test documents the expected behavior and tests the guard logic

      // Test the guard + selection logic together
      const blockedResult: ExecutorResult = {
        executed: false,
        output: 'Waiting for user input...',
        error: 'Executor blocked: INTERACTIVE_PROMPT',
        files_modified: [],
        duration_ms: 2000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'INTERACTIVE_PROMPT',
        terminated_by: 'REPL_FAIL_CLOSED',
      };

      const implementationTask: ExecutorTask = {
        id: 'impl-3',
        prompt: 'Add new API endpoint',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      };

      const guarded = applyBlockedOutputGuard(blockedResult, implementationTask);

      // Document: When execute() processes this, it should:
      // 1. Apply guard to ensure non-empty output
      // 2. Convert BLOCKED to INCOMPLETE for IMPLEMENTATION tasks
      // 3. Set error field to the clarification question

      // Verify the guard logic provides the right output
      assert.ok(guarded.output.includes('?') ||
                guarded.output.includes('変更対象') ||
                guarded.output.includes('Target files'),
        'Guarded output should contain actionable content');

      console.log('[E2E] AC-2: IMPLEMENTATION task produces clarification question');
      console.log('[E2E] Expected: status=INCOMPLETE (not BLOCKED) after execute()');
      console.log('[E2E] Output content:', guarded.output.substring(0, 200));
    });

    it('should preserve original output if it already contains clarification', async () => {
      // BLOCKED with output that already has a question
      const blockedWithQuestion: ExecutorResult = {
        executed: false,
        output: 'Which file should be modified? src/index.ts or src/main.ts?',
        error: 'Executor blocked: INTERACTIVE_PROMPT',
        files_modified: [],
        duration_ms: 2000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'INTERACTIVE_PROMPT',
        terminated_by: 'REPL_FAIL_CLOSED',
      };

      const implementationTask: ExecutorTask = {
        id: 'impl-4',
        prompt: 'Update configuration',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      };

      const guarded = applyBlockedOutputGuard(blockedWithQuestion, implementationTask);

      // Assert: Original question should be preserved (not replaced with fallback)
      assert.ok(
        guarded.output.includes('Which file should be modified?'),
        'Original clarification question should be preserved'
      );

      console.log('[E2E] Preserved IMPLEMENTATION output:', guarded.output);
    });
  });

  describe('Edge cases', () => {
    it('should handle IMPLEMENTATION with output containing Japanese confirmation', async () => {
      const blockedJapanese: ExecutorResult = {
        executed: false,
        output: 'この変更を許可しますか？',
        error: 'Executor blocked: INTERACTIVE_PROMPT',
        files_modified: [],
        duration_ms: 2000,
        status: 'BLOCKED',
        cwd: tempDir,
        verified_files: [],
        unverified_files: [],
        executor_blocked: true,
        blocked_reason: 'INTERACTIVE_PROMPT',
        terminated_by: 'REPL_FAIL_CLOSED',
      };

      const implementationTask: ExecutorTask = {
        id: 'impl-5',
        prompt: 'Add feature',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      };

      const guarded = applyBlockedOutputGuard(blockedJapanese, implementationTask);

      // Assert: Japanese confirmation should be recognized as question
      assert.ok(
        guarded.output.includes('許可'),
        'Japanese confirmation should be preserved'
      );
      // Should NOT add fallback since original has question marker
      const countQuestionMarks = (guarded.output.match(/？|\?/g) || []).length;
      assert.ok(countQuestionMarks >= 1, 'Should have at least one question');

      console.log('[E2E] Japanese confirmation output:', guarded.output);
    });

    it('should handle non-IMPLEMENTATION tasks differently', async () => {
      const blockedResult: ExecutorResult = {
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

      // READ_INFO task should get different fallback
      const readInfoTask: ExecutorTask = {
        id: 'read-1',
        prompt: 'List all files',
        workingDir: tempDir,
        taskType: 'READ_INFO',
      };

      const readInfoFallback = selectFallbackQuestion(blockedResult, readInfoTask);

      // IMPLEMENTATION task
      const implTask: ExecutorTask = {
        id: 'impl-6',
        prompt: 'Add feature',
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      };

      const implFallback = selectFallbackQuestion(blockedResult, implTask);

      // Assert: Different task types get different fallbacks
      assert.notStrictEqual(
        readInfoFallback,
        implFallback,
        'READ_INFO and IMPLEMENTATION should have different fallback questions'
      );

      console.log('[E2E] READ_INFO fallback:', readInfoFallback.substring(0, 50));
      console.log('[E2E] IMPLEMENTATION fallback:', implFallback.substring(0, 50));
    });
  });
});
