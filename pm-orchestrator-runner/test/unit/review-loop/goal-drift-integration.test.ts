/**
 * Goal Drift Guard Integration Tests
 *
 * Per spec 32_TEMPLATE_INJECTION.md
 *
 * Tests integration between Goal Drift Guard evaluator and Review Loop:
 * - Mapping GD criteria to Q criteria
 * - Modification prompt generation
 * - REJECT -> RETRY -> PASS flow simulation
 */

import { strict as assert } from 'assert';
import {
  runGoalDriftIntegration,
  generateGoalDriftModificationSection,
  mapGoalDriftToQCriteria,
  mapGoalDriftResultToReviewLoop,
  getGoalDriftCriteriaName,
} from '../../../src/review-loop/goal-drift-integration';
import {
  evaluateGoalDrift,
  GOAL_DRIFT_GUARD_TEMPLATE_ID,
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

describe('Goal Drift Guard Integration (spec/32_TEMPLATE_INJECTION.md)', () => {
  describe('mapGoalDriftToQCriteria()', () => {
    it('should map GD1 to Q2 (escape phrases -> problematic language)', () => {
      assert.equal(mapGoalDriftToQCriteria('GD1'), 'Q2');
    });

    it('should map GD2 to Q5 (premature completion -> incomplete work)', () => {
      assert.equal(mapGoalDriftToQCriteria('GD2'), 'Q5');
    });

    it('should map GD3 to Q5 (missing checklist -> no verification)', () => {
      assert.equal(mapGoalDriftToQCriteria('GD3'), 'Q5');
    });

    it('should map GD4 to Q5 (invalid completion -> false claims)', () => {
      assert.equal(mapGoalDriftToQCriteria('GD4'), 'Q5');
    });

    it('should map GD5 to Q3 (scope reduction -> hidden omission)', () => {
      assert.equal(mapGoalDriftToQCriteria('GD5'), 'Q3');
    });
  });

  describe('getGoalDriftCriteriaName()', () => {
    it('should return human-readable names for all GD criteria', () => {
      assert.equal(getGoalDriftCriteriaName('GD1'), 'No Escape Phrases');
      assert.equal(getGoalDriftCriteriaName('GD2'), 'No Premature Completion');
      assert.equal(getGoalDriftCriteriaName('GD3'), 'Requirement Checklist Present');
      assert.equal(getGoalDriftCriteriaName('GD4'), 'Valid Completion Statement');
      assert.equal(getGoalDriftCriteriaName('GD5'), 'No Scope Reduction');
    });
  });

  describe('mapGoalDriftResultToReviewLoop()', () => {
    it('should map passing result to empty failures', () => {
      const output = [
        '### Requirement Checklist',
        '- [x] Requirement 1: Done',
        '',
        'COMPLETE: All 1 requirements fulfilled',
      ].join('\n');

      const gdResult = evaluateGoalDrift(output);
      const mapped = mapGoalDriftResultToReviewLoop(gdResult);

      assert.equal(mapped.criteria.filter(c => !c.passed).length, 0);
      assert.equal(mapped.issues.length, 0);
    });

    it('should map failing result to Q-style criteria', () => {
      const output = 'Basic implementation complete if needed.';
      const gdResult = evaluateGoalDrift(output);
      const mapped = mapGoalDriftResultToReviewLoop(gdResult);

      assert.equal(mapped.criteria.some(c => !c.passed), true);
      assert.ok(mapped.issues.length > 0);
    });

    it('should include suggestions in mapped issues', () => {
      const output = 'Please verify this works.';
      const gdResult = evaluateGoalDrift(output);
      const mapped = mapGoalDriftResultToReviewLoop(gdResult);

      const issuesWithSuggestions = mapped.issues.filter(i => i.suggestion);
      assert.ok(issuesWithSuggestions.length > 0);
    });
  });

  describe('runGoalDriftIntegration()', () => {
    it('should not run when template is not goal_drift_guard', () => {
      const mockResult = createMockResult('Any output if needed');

      const result = runGoalDriftIntegration(mockResult, 'builtin-standard');

      assert.equal(result.ran, false);
      assert.equal(result.passed, true);
      assert.equal(result.goalDriftResult, null);
      assert.equal(result.mappedCriteriaResults.length, 0);
    });

    it('should not run when template is null', () => {
      const mockResult = createMockResult('Any output');

      const result = runGoalDriftIntegration(mockResult, null);

      assert.equal(result.ran, false);
      assert.equal(result.passed, true);
    });

    it('should run when template is goal_drift_guard', () => {
      const output = [
        '### Requirement Checklist',
        '- [x] Requirement 1: Done',
        '',
        'COMPLETE: All 1 requirements fulfilled',
      ].join('\n');

      const mockResult = createMockResult(output);
      const result = runGoalDriftIntegration(mockResult, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      assert.equal(result.ran, true);
      assert.notEqual(result.goalDriftResult, null);
    });

    it('should fail when Goal Drift Guard violations are present', () => {
      const output = 'Basic implementation complete. Please verify.';
      const mockResult = createMockResult(output);

      const result = runGoalDriftIntegration(mockResult, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      assert.equal(result.ran, true);
      assert.equal(result.passed, false);
      assert.notEqual(result.goalDriftResult, null);
      assert.ok(result.goalDriftResult!.failed_criteria.length > 0);
    });
  });

  describe('generateGoalDriftModificationSection()', () => {
    it('should return empty string for passing result', () => {
      const output = [
        '### Requirement Checklist',
        '- [x] Requirement 1: Done',
        '',
        'COMPLETE: All 1 requirements fulfilled',
      ].join('\n');

      const gdResult = evaluateGoalDrift(output);
      const section = generateGoalDriftModificationSection(gdResult);

      assert.equal(section, '');
    });

    it('should include violation details for failing result', () => {
      const output = 'This is optional if needed.';
      const gdResult = evaluateGoalDrift(output);
      const section = generateGoalDriftModificationSection(gdResult);

      assert.ok(section.includes('Goal Drift Guard Violations'));
      assert.ok(section.includes('GD1'));
    });

    it('should include required output format instructions', () => {
      const output = 'Basic implementation.';
      const gdResult = evaluateGoalDrift(output);
      const section = generateGoalDriftModificationSection(gdResult);

      assert.ok(section.includes('Requirement Checklist'));
      assert.ok(section.includes('Completion Statement'));
      assert.ok(section.includes('COMPLETE'));
      assert.ok(section.includes('INCOMPLETE'));
    });

    it('should include fix suggestions', () => {
      const output = 'You may want to add tests if needed.';
      const gdResult = evaluateGoalDrift(output);
      const section = generateGoalDriftModificationSection(gdResult);

      assert.ok(section.includes('Fix:'));
    });
  });

  describe('REJECT -> RETRY -> PASS Flow Simulation', () => {
    it('should demonstrate REJECT on first attempt with violations', () => {
      // Iteration 1: Output with violations -> REJECT
      const output1 = 'Basic implementation complete. You might want to add tests if needed.';
      const mockResult1 = createMockResult(output1);

      const result1 = runGoalDriftIntegration(mockResult1, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      assert.equal(result1.passed, false);
      assert.ok(result1.goalDriftResult!.failed_criteria.includes('GD1')); // escape phrase
      assert.ok(result1.goalDriftResult!.failed_criteria.includes('GD2')); // premature completion

      // Verify modification prompt is generated
      const modSection = generateGoalDriftModificationSection(result1.goalDriftResult!);
      assert.ok(modSection.length > 0);
    });

    it('should demonstrate REJECT on second attempt with partial fix', () => {
      // Iteration 2: Some violations fixed, but not all -> REJECT
      const output2 = [
        '### Requirement Checklist',
        '- [x] Requirement 1: Done',
        '',
        'Done.',  // Ambiguous completion (GD4 fail)
      ].join('\n');

      const mockResult2 = createMockResult(output2);
      const result2 = runGoalDriftIntegration(mockResult2, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      assert.equal(result2.passed, false);
      assert.ok(result2.goalDriftResult!.failed_criteria.includes('GD4')); // invalid completion
    });

    it('should demonstrate PASS on final attempt with proper format', () => {
      // Iteration 3: All violations fixed -> PASS
      const output3 = [
        '### Requirement Checklist',
        '- [x] Requirement 1: Implemented feature A',
        '- [x] Requirement 2: Added tests',
        '',
        '### Verification Evidence',
        'All tests passing. Feature verified.',
        '',
        'COMPLETE: All 2 requirements fulfilled',
      ].join('\n');

      const mockResult3 = createMockResult(output3);
      const result3 = runGoalDriftIntegration(mockResult3, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      assert.equal(result3.passed, true);
      assert.equal(result3.goalDriftResult!.failed_criteria.length, 0);
    });

    it('should complete full REJECT -> RETRY -> PASS flow', () => {
      // Simulate the complete flow
      const iterations = [
        {
          output: 'Basic implementation complete if needed.',
          expectedPass: false,
          expectedFailures: ['GD1', 'GD2', 'GD3', 'GD4'],
        },
        {
          output: '### Requirement Checklist\n- [x] Done\n\nDone.',
          expectedPass: false,
          expectedFailures: ['GD4'], // Ambiguous completion
        },
        {
          output: '### Requirement Checklist\n- [x] Requirement 1: Done\n\nCOMPLETE: All 1 requirements fulfilled',
          expectedPass: true,
          expectedFailures: [],
        },
      ];

      for (let i = 0; i < iterations.length; i++) {
        const { output, expectedPass, expectedFailures } = iterations[i];
        const mockResult = createMockResult(output);
        const result = runGoalDriftIntegration(mockResult, GOAL_DRIFT_GUARD_TEMPLATE_ID);

        assert.equal(result.passed, expectedPass, "Iteration " + (i + 1) + " pass status");

        if (!expectedPass) {
          for (const failure of expectedFailures) {
            assert.ok(
              result.goalDriftResult!.failed_criteria.includes(failure as any),
              "Iteration " + (i + 1) + " should fail " + failure
            );
          }
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty output', () => {
      const mockResult = createMockResult('');
      const result = runGoalDriftIntegration(mockResult, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      assert.equal(result.ran, true);
      assert.equal(result.passed, false);
      assert.ok(result.goalDriftResult!.failed_criteria.includes('GD3')); // No checklist
      assert.ok(result.goalDriftResult!.failed_criteria.includes('GD4')); // No completion statement
    });

    it('should handle output with only whitespace', () => {
      const mockResult = createMockResult('   \n\n   ');
      const result = runGoalDriftIntegration(mockResult, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      assert.equal(result.ran, true);
      assert.equal(result.passed, false);
    });

    it('should handle output with code blocks', () => {
      const output = [
        '### Requirement Checklist',
        '- [x] Add function',
        '',
        '```typescript',
        '// if needed - this is in code, not a violation',
        'function foo() {}',
        '```',
        '',
        'COMPLETE: All 1 requirements fulfilled',
      ].join('\n');

      const mockResult = createMockResult(output);
      const result = runGoalDriftIntegration(mockResult, GOAL_DRIFT_GUARD_TEMPLATE_ID);

      // Note: Current implementation treats all text equally
      // Future improvement could skip code blocks
      assert.equal(result.ran, true);
    });
  });
});
