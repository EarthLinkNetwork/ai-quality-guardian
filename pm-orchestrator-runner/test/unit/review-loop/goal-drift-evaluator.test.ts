/**
 * Goal Drift Guard Evaluator Unit Tests
 *
 * Per spec 32_TEMPLATE_INJECTION.md Section 2.4
 *
 * Tests GD1-GD5 criteria:
 * - GD1: No Escape Phrases
 * - GD2: No Premature Completion
 * - GD3: Requirement Checklist Present
 * - GD4: Valid Completion Statement
 * - GD5: No Scope Reduction
 */

import { strict as assert } from 'assert';
import {
  checkGD1NoEscapePhrases,
  checkGD2NoPrematureCompletion,
  checkGD3RequirementChecklistPresent,
  checkGD4CompletionStatementValid,
  checkGD5NoScopeReduction,
  evaluateGoalDrift,
  shouldRunGoalDriftEvaluator,
  safeEvaluateGoalDrift,
  GOAL_DRIFT_GUARD_TEMPLATE_ID,
  ESCAPE_PHRASES,
  PREMATURE_COMPLETION_PATTERNS,
  SCOPE_REDUCTION_PATTERNS,
} from '../../../src/review-loop/goal-drift-evaluator';
import type { ExecutorResult } from '../../../src/executor/claude-code-executor';

// Helper to create mock ExecutorResult
function createMockResult(output: string): ExecutorResult {
  return {
    output,
    status: 'COMPLETE',
    files_modified: [],
    verified_files: [],
    unverified_files: [],
    executed: true,
    duration_ms: 1000,
    cwd: '/test/project',
  };
}

describe('Goal Drift Guard Evaluator (spec/32_TEMPLATE_INJECTION.md)', () => {
  describe('GD1: No Escape Phrases', () => {
    it('should PASS when no escape phrases are present', () => {
      const output = 'Implementation complete. All files created.';
      const result = checkGD1NoEscapePhrases(output);

      assert.equal(result.passed, true);
      assert.equal(result.criteria_id, 'GD1');
      assert.deepEqual(result.violations, []);
    });

    it('should FAIL when "if needed" is present', () => {
      const output = 'You can add more tests if needed.';
      const result = checkGD1NoEscapePhrases(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.length > 0);
      assert.equal(result.violations[0].phrase, 'if needed');
    });

    it('should FAIL when "optional" is present', () => {
      const output = 'This feature is optional for now.';
      const result = checkGD1NoEscapePhrases(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.phrase === 'optional'));
    });

    it('should FAIL when "consider adding" is present', () => {
      const output = 'You may consider adding validation later.';
      const result = checkGD1NoEscapePhrases(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.phrase === 'consider adding'));
    });

    it('should detect multiple escape phrases', () => {
      const output = 'Add validation if needed. This is optional. Consider adding tests.';
      const result = checkGD1NoEscapePhrases(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.length >= 2);
    });

    it('should return line numbers for violations', () => {
      const output = 'Line 1\nLine 2 with if needed\nLine 3';
      const result = checkGD1NoEscapePhrases(output);

      assert.equal(result.passed, false);
      assert.equal(result.violations[0].line, 2);
    });

    it('should detect all defined escape phrases', () => {
      for (const phrase of ESCAPE_PHRASES) {
        const output = 'Some text ' + phrase + ' more text';
        const result = checkGD1NoEscapePhrases(output);
        assert.equal(result.passed, false, `Expected to fail for phrase "${phrase}"`);
      }
    });
  });

  describe('GD2: No Premature Completion', () => {
    it('should PASS when no premature completion patterns present', () => {
      const output = 'All requirements implemented and verified.';
      const result = checkGD2NoPrematureCompletion(output);

      assert.equal(result.passed, true);
      assert.equal(result.criteria_id, 'GD2');
    });

    it('should FAIL when "basic implementation" is present', () => {
      const output = 'The basic implementation is complete.';
      const result = checkGD2NoPrematureCompletion(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.phrase?.includes('basic implementation')));
    });

    it('should FAIL when "please verify" is present', () => {
      const output = 'Please verify the changes work correctly.';
      const result = checkGD2NoPrematureCompletion(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.phrase?.includes('please verify')));
    });

    it('should FAIL when "skeleton" is present', () => {
      const output = 'I created a skeleton implementation.';
      const result = checkGD2NoPrematureCompletion(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.phrase?.includes('skeleton')));
    });

    it('should FAIL when "scaffold" is present', () => {
      const output = 'Here is the scaffold for the feature.';
      const result = checkGD2NoPrematureCompletion(output);

      assert.equal(result.passed, false);
    });

    it('should detect all defined premature completion patterns', () => {
      for (const pattern of PREMATURE_COMPLETION_PATTERNS) {
        const output = 'Some text ' + pattern + ' more text';
        const result = checkGD2NoPrematureCompletion(output);
        assert.equal(result.passed, false, `Expected to fail for pattern "${pattern}"`);
      }
    });
  });

  describe('GD3: Requirement Checklist Present', () => {
    it('should PASS when markdown checkbox format present', () => {
      const output = '### Requirements\n- [x] Feature A\n- [x] Feature B';
      const result = checkGD3RequirementChecklistPresent(output);

      assert.equal(result.passed, true);
      assert.equal(result.criteria_id, 'GD3');
    });

    it('should PASS when unchecked checkbox present', () => {
      const output = '### Requirements\n- [ ] Feature A\n- [x] Feature B';
      const result = checkGD3RequirementChecklistPresent(output);

      assert.equal(result.passed, true);
    });

    it('should PASS when numbered list with status present', () => {
      const output = '1. Feature A: done\n2. Feature B: complete';
      const result = checkGD3RequirementChecklistPresent(output);

      assert.equal(result.passed, true);
    });

    it('should FAIL when no checklist format present', () => {
      const output = 'I implemented all the features. Everything is done.';
      const result = checkGD3RequirementChecklistPresent(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.length > 0);
      assert.ok(result.violations[0].phrase?.includes('checklist'));
    });

    it('should PASS with Requirement Checklist header', () => {
      const output = '### Requirement Checklist\n- [x] Item 1\n- [x] Item 2';
      const result = checkGD3RequirementChecklistPresent(output);

      assert.equal(result.passed, true);
    });
  });

  describe('GD4: Valid Completion Statement', () => {
    it('should PASS with "COMPLETE: All N requirements fulfilled"', () => {
      const output = 'All done.\n\nCOMPLETE: All 5 requirements fulfilled';
      const result = checkGD4CompletionStatementValid(output);

      assert.equal(result.passed, true);
      assert.equal(result.criteria_id, 'GD4');
    });

    it('should PASS with "INCOMPLETE: Requirements X, Y, Z remain"', () => {
      const output = 'INCOMPLETE: Requirements 3, 4 remain';
      const result = checkGD4CompletionStatementValid(output);

      assert.equal(result.passed, true);
    });

    it('should PASS with completion status variations', () => {
      const outputs = [
        'COMPLETE: All 3 requirements fulfilled',
        'COMPLETE: all requirements met',
        'INCOMPLETE: Requirements A, B remain',
        'INCOMPLETE: 2 requirements remain',
      ];

      for (const output of outputs) {
        const result = checkGD4CompletionStatementValid(output);
        assert.equal(result.passed, true, `Expected to pass for "${output}"`);
      }
    });

    it('should FAIL with ambiguous completion', () => {
      const output = 'This should work. Let me know if there are issues.';
      const result = checkGD4CompletionStatementValid(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations[0].phrase?.includes('completion statement'));
    });

    it('should FAIL with no completion statement', () => {
      const output = 'Here are the changes I made.';
      const result = checkGD4CompletionStatementValid(output);

      assert.equal(result.passed, false);
    });

    it('should FAIL with informal completion', () => {
      const output = 'Done! That should be everything.';
      const result = checkGD4CompletionStatementValid(output);

      assert.equal(result.passed, false);
    });
  });

  describe('GD5: No Scope Reduction', () => {
    it('should PASS when no scope reduction patterns present', () => {
      const output = 'Full implementation complete with all features.';
      const result = checkGD5NoScopeReduction(output);

      assert.equal(result.passed, true);
      assert.equal(result.criteria_id, 'GD5');
    });

    it('should FAIL when "simplified version" is present', () => {
      const output = 'I created a simplified version of the feature.';
      const result = checkGD5NoScopeReduction(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.phrase?.includes('simplified')));
    });

    it('should FAIL when "for now" is present', () => {
      const output = 'I implemented basic validation for now.';
      const result = checkGD5NoScopeReduction(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.some(v => v.phrase?.includes('for now')));
    });

    it('should FAIL when "subset of" is present', () => {
      const output = 'This covers a subset of the requirements.';
      const result = checkGD5NoScopeReduction(output);

      assert.equal(result.passed, false);
    });

    it('should FAIL when "partial" is present', () => {
      const output = 'Here is a partial implementation.';
      const result = checkGD5NoScopeReduction(output);

      assert.equal(result.passed, false);
    });

    it('should detect all defined scope reduction patterns', () => {
      for (const pattern of SCOPE_REDUCTION_PATTERNS) {
        const output = 'Some text ' + pattern + ' more text';
        const result = checkGD5NoScopeReduction(output);
        assert.equal(result.passed, false, `Expected to fail for pattern "${pattern}"`);
      }
    });
  });

  describe('evaluateGoalDrift (combined evaluation)', () => {
    it('should PASS when all criteria pass', () => {
      const output = '## Implementation\n\n### Requirement Checklist\n- [x] Feature A\n- [x] Feature B\n\n### Completion Statement\nCOMPLETE: All 2 requirements fulfilled';
      const result = evaluateGoalDrift(output);

      assert.equal(result.passed, true);
      assert.deepEqual(result.violations, []);
      assert.ok(result.criteriaResults.every(c => c.passed));
    });

    it('should FAIL when any criteria fails', () => {
      const output = 'Basic implementation if needed.';
      const result = evaluateGoalDrift(output);

      assert.equal(result.passed, false);
      assert.ok(result.violations.length > 0);
    });

    it('should return results for all 5 criteria', () => {
      const output = 'Test output';
      const result = evaluateGoalDrift(output);

      assert.equal(result.criteriaResults.length, 5);
      assert.deepEqual(result.criteriaResults.map(c => c.criteria_id), [
        'GD1', 'GD2', 'GD3', 'GD4', 'GD5'
      ]);
    });

    it('should collect all violations from all criteria', () => {
      const output = 'Basic implementation if needed. This is a simplified version for now.';
      const result = evaluateGoalDrift(output);

      assert.equal(result.passed, false);
      // Should have violations from GD1 (if needed), GD2 (basic implementation), GD3 (no checklist), GD4 (no statement), GD5 (simplified, for now)
      assert.ok(result.violations.length >= 3);
    });

    it('should have criteria_id in each violation', () => {
      const output = 'Add features if needed.';
      const result = evaluateGoalDrift(output);

      for (const violation of result.violations) {
        assert.ok(['GD1', 'GD2', 'GD3', 'GD4', 'GD5'].includes(violation.criteria_id as string));
      }
    });
  });

  describe('shouldRunGoalDriftEvaluator', () => {
    it('should return true when templateId is goal_drift_guard', () => {
      assert.equal(shouldRunGoalDriftEvaluator(GOAL_DRIFT_GUARD_TEMPLATE_ID), true);
      assert.equal(shouldRunGoalDriftEvaluator('goal_drift_guard'), true);
    });

    it('should return false for other template IDs', () => {
      assert.equal(shouldRunGoalDriftEvaluator('builtin-standard'), false);
      assert.equal(shouldRunGoalDriftEvaluator('builtin-minimal'), false);
      assert.equal(shouldRunGoalDriftEvaluator('builtin-strict'), false);
      assert.equal(shouldRunGoalDriftEvaluator('custom-template'), false);
    });

    it('should return false for null or undefined', () => {
      assert.equal(shouldRunGoalDriftEvaluator(null), false);
      assert.equal(shouldRunGoalDriftEvaluator(undefined), false);
    });

    it('should return false for empty string', () => {
      assert.equal(shouldRunGoalDriftEvaluator(''), false);
    });
  });

  describe('safeEvaluateGoalDrift (Fail-Closed)', () => {
    it('should return normal result on valid input', () => {
      const mockResult = createMockResult('### Requirement Checklist\n- [x] Done\n\nCOMPLETE: All 1 requirements fulfilled');
      const result = safeEvaluateGoalDrift(mockResult);

      assert.equal(result.passed, true);
      assert.equal(result.error, undefined);
    });

    it('should return failed result on error (fail-closed)', () => {
      const result = safeEvaluateGoalDrift(null as any);

      assert.equal(result.passed, false);
      assert.equal(typeof result.error, 'string');
    });

    it('should return failed result on undefined output', () => {
      const mockResult = createMockResult('');
      (mockResult as any).output = undefined;
      const result = safeEvaluateGoalDrift(mockResult);

      assert.equal(result.passed, false);
    });

    it('should not throw on invalid input', () => {
      assert.doesNotThrow(() => safeEvaluateGoalDrift(undefined as any));
      assert.doesNotThrow(() => safeEvaluateGoalDrift({} as any));
      assert.doesNotThrow(() => safeEvaluateGoalDrift({ output: null } as any));
    });
  });

  describe('Constants', () => {
    it('should have GOAL_DRIFT_GUARD_TEMPLATE_ID defined', () => {
      assert.equal(GOAL_DRIFT_GUARD_TEMPLATE_ID, 'goal_drift_guard');
    });

    it('should have ESCAPE_PHRASES array', () => {
      assert.ok(Array.isArray(ESCAPE_PHRASES));
      assert.ok(ESCAPE_PHRASES.length > 0);
      assert.ok(ESCAPE_PHRASES.includes('if needed'));
      assert.ok(ESCAPE_PHRASES.includes('optional'));
    });

    it('should have PREMATURE_COMPLETION_PATTERNS array', () => {
      assert.ok(Array.isArray(PREMATURE_COMPLETION_PATTERNS));
      assert.ok(PREMATURE_COMPLETION_PATTERNS.length > 0);
    });

    it('should have SCOPE_REDUCTION_PATTERNS array', () => {
      assert.ok(Array.isArray(SCOPE_REDUCTION_PATTERNS));
      assert.ok(SCOPE_REDUCTION_PATTERNS.length > 0);
    });
  });

  describe('Zero Overhead Principle', () => {
    it('should have minimal overhead when not running', () => {
      // shouldRunGoalDriftEvaluator should be fast check
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        shouldRunGoalDriftEvaluator('builtin-standard');
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 100, `Expected < 100ms, got ${elapsed}ms`);
    });
  });
});
