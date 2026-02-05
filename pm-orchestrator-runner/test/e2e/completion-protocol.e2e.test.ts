/**
 * Completion Protocol E2E Tests
 *
 * End-to-end tests that verify the Completion Protocol
 * in a realistic scenario: multiple QA gates from a full
 * lint -> typecheck -> test -> build pipeline.
 *
 * These tests simulate the real workflow where:
 * 1. A task run produces QA gate results
 * 2. The Completion Protocol judges the results
 * 3. The final_status controls whether the task is marked complete
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  QAGateResult,
  CompletionProtocol,
  StaleRunError,
} from '../../src/core/completion-protocol';

/**
 * Helper: Create a realistic set of QA gate results for a full pipeline.
 */
function createFullPipeline(
  runId: string,
  overrides?: {
    lintFailing?: number;
    typecheckFailing?: number;
    testFailing?: number;
    buildFailing?: number;
  },
): QAGateResult[] {
  const now = new Date().toISOString();
  const o = overrides || {};
  return [
    { run_id: runId, timestamp: now, passing: 0, failing: o.lintFailing ?? 0, skipped: 0, gate_name: 'lint' },
    { run_id: runId, timestamp: now, passing: 0, failing: o.typecheckFailing ?? 0, skipped: 0, gate_name: 'typecheck' },
    { run_id: runId, timestamp: now, passing: 150, failing: o.testFailing ?? 0, skipped: 3, gate_name: 'unit-tests' },
    { run_id: runId, timestamp: now, passing: 1, failing: o.buildFailing ?? 0, skipped: 0, gate_name: 'build' },
  ];
}

describe('Completion Protocol E2E', () => {
  let protocol: CompletionProtocol;

  beforeEach(() => {
    protocol = new CompletionProtocol();
  });

  // ─── Scenario 1: Clean pipeline (all pass) ───

  describe('Scenario 1: Clean pipeline', () => {
    it('should return COMPLETE for a full green pipeline', () => {
      protocol.setCurrentRunId('run_10');
      const gates = createFullPipeline('run_10');

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.all_pass, true);
      assert.strictEqual(verdict.failing_total, 0);
      assert.strictEqual(verdict.failing_gates.length, 0);
      assert.strictEqual(verdict.gate_summary.length, 4);
      assert.strictEqual(verdict.stale_results, false);
      assert.strictEqual(verdict.run_id, 'run_10');
    });
  });

  // ─── Scenario 2: One test failure ───

  describe('Scenario 2: One test failure blocks completion', () => {
    it('should return FAILING when unit tests have 1 failure', () => {
      protocol.setCurrentRunId('run_11');
      const gates = createFullPipeline('run_11', { testFailing: 1 });

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'FAILING');
      assert.strictEqual(verdict.all_pass, false);
      assert.strictEqual(verdict.failing_total, 1);
      assert.deepStrictEqual(verdict.failing_gates, ['unit-tests']);
    });
  });

  // ─── Scenario 3: Lint failure blocks completion ───

  describe('Scenario 3: Lint failure blocks completion', () => {
    it('should return FAILING when lint has failures', () => {
      protocol.setCurrentRunId('run_12');
      const gates = createFullPipeline('run_12', { lintFailing: 5 });

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'FAILING');
      assert.strictEqual(verdict.failing_total, 5);
      assert.deepStrictEqual(verdict.failing_gates, ['lint']);
    });
  });

  // ─── Scenario 4: Stale run results from previous execution ───

  describe('Scenario 4: Stale run results rejected', () => {
    it('should reject results from a previous run', () => {
      protocol.setCurrentRunId('run_15');

      // Results from an older run
      const staleGates = createFullPipeline('run_10');

      assert.throws(
        () => protocol.judge(staleGates),
        (err: Error) => {
          assert.ok(err instanceof StaleRunError);
          assert.ok(err.message.includes('run_10'));
          return true;
        },
      );
    });

    it('should accept results from the current run after rejecting stale', () => {
      protocol.setCurrentRunId('run_15');

      // Stale results should be rejected
      const staleGates = createFullPipeline('run_10');
      assert.throws(() => protocol.judge(staleGates));

      // Current results should be accepted
      const currentGates = createFullPipeline('run_15');
      const verdict = protocol.judge(currentGates);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
    });
  });

  // ─── Scenario 5: Mixed run_ids in a single judgment ───

  describe('Scenario 5: Mixed run_ids detected', () => {
    it('should reject when lint is from run_5 but tests are from run_4', () => {
      protocol.setCurrentRunId('run_5');
      const now = new Date().toISOString();

      const mixedGates: QAGateResult[] = [
        { run_id: 'run_5', timestamp: now, passing: 0, failing: 0, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_5', timestamp: now, passing: 0, failing: 0, skipped: 0, gate_name: 'typecheck' },
        { run_id: 'run_4', timestamp: now, passing: 150, failing: 0, skipped: 0, gate_name: 'unit-tests' },
        { run_id: 'run_5', timestamp: now, passing: 1, failing: 0, skipped: 0, gate_name: 'build' },
      ];

      assert.throws(
        () => protocol.judge(mixedGates),
        (err: Error) => err instanceof StaleRunError,
      );
    });
  });

  // ─── Scenario 6: Run progression (fix failures then re-run) ───

  describe('Scenario 6: Run progression - fix and re-run', () => {
    it('should transition from FAILING to COMPLETE after fixing', () => {
      // Run 1: Has failures
      protocol.setCurrentRunId('run_20');
      const failingGates = createFullPipeline('run_20', { testFailing: 3 });
      const verdict1 = protocol.judge(failingGates);
      assert.strictEqual(verdict1.final_status, 'FAILING');

      // Run 2: Failures fixed
      protocol.setCurrentRunId('run_21');
      const passingGates = createFullPipeline('run_21');
      const verdict2 = protocol.judge(passingGates);
      assert.strictEqual(verdict2.final_status, 'COMPLETE');

      // Verify run_1 results can no longer be used
      assert.throws(
        () => protocol.judge(failingGates),
        (err: Error) => err instanceof StaleRunError,
      );
    });
  });

  // ─── Scenario 7: Multiple failures across all gates ───

  describe('Scenario 7: Multiple failures across all gates', () => {
    it('should report all failing gates', () => {
      protocol.setCurrentRunId('run_30');
      const gates = createFullPipeline('run_30', {
        lintFailing: 2,
        typecheckFailing: 1,
        testFailing: 5,
        buildFailing: 1,
      });

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'FAILING');
      assert.strictEqual(verdict.failing_total, 9);
      assert.deepStrictEqual(
        verdict.failing_gates.sort(),
        ['build', 'lint', 'typecheck', 'unit-tests'],
      );
    });
  });

  // ─── Scenario 8: Skipped tests do not affect completion ───

  describe('Scenario 8: Skipped tests do not affect completion', () => {
    it('should return COMPLETE even with many skipped tests', () => {
      protocol.setCurrentRunId('run_40');
      const now = new Date().toISOString();
      const gates: QAGateResult[] = [
        { run_id: 'run_40', timestamp: now, passing: 10, failing: 0, skipped: 50, gate_name: 'unit-tests' },
      ];

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.skipped_total, 50);
    });
  });
});
