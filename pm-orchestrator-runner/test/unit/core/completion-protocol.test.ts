/**
 * Completion Protocol Tests
 *
 * Verifies the Completion Protocol module that determines
 * final_status from QA gate results with strict rules:
 *
 * AC1: "ALL PASS" only when failing=0
 * AC2: Stale run_id detection (old outputs cannot be used as evidence)
 * AC3: failing>0 => never COMPLETE
 * AC4: No mixing of old and new run results
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  QAGateResult,
  CompletionVerdict,
  CompletionProtocol,
  StaleRunError,
} from '../../../src/core/completion-protocol';

describe('Completion Protocol', () => {
  let protocol: CompletionProtocol;

  beforeEach(() => {
    protocol = new CompletionProtocol();
  });

  // ─── AC1: "ALL PASS" only when failing=0 ───

  describe('AC1: ALL PASS requires failing=0', () => {
    it('should return COMPLETE when all gates pass (failing=0)', () => {
      const gate: QAGateResult = {
        run_id: 'run_1',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'unit-tests',
      };

      const verdict = protocol.judge([gate]);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.all_pass, true);
      assert.strictEqual(verdict.failing_total, 0);
    });

    it('should return COMPLETE with multiple gates all passing', () => {
      const gates: QAGateResult[] = [
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 10, failing: 0, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 5, failing: 0, skipped: 0, gate_name: 'typecheck' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 20, failing: 0, skipped: 0, gate_name: 'unit-tests' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 3, failing: 0, skipped: 0, gate_name: 'build' },
      ];

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.all_pass, true);
      assert.strictEqual(verdict.failing_total, 0);
    });

    it('should NOT return COMPLETE when failing=1 even with many passing', () => {
      const gate: QAGateResult = {
        run_id: 'run_1',
        timestamp: new Date().toISOString(),
        passing: 99,
        failing: 1,
        skipped: 0,
        gate_name: 'unit-tests',
      };

      const verdict = protocol.judge([gate]);

      assert.notStrictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.all_pass, false);
    });

    it('should handle zero tests as NO_EVIDENCE (no passing either)', () => {
      const gate: QAGateResult = {
        run_id: 'run_1',
        timestamp: new Date().toISOString(),
        passing: 0,
        failing: 0,
        skipped: 0,
        gate_name: 'unit-tests',
      };

      const verdict = protocol.judge([gate]);

      assert.strictEqual(verdict.final_status, 'NO_EVIDENCE');
      assert.strictEqual(verdict.all_pass, false);
    });

    it('should return NO_EVIDENCE when gate list is empty', () => {
      const verdict = protocol.judge([]);

      assert.strictEqual(verdict.final_status, 'NO_EVIDENCE');
      assert.strictEqual(verdict.all_pass, false);
    });
  });

  // ─── AC2: Stale run_id detection ───

  describe('AC2: Stale run_id detection', () => {
    it('should accept results from the current run_id', () => {
      protocol.setCurrentRunId('run_5');

      const gate: QAGateResult = {
        run_id: 'run_5',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'unit-tests',
      };

      const verdict = protocol.judge([gate]);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.stale_results, false);
    });

    it('should reject results from an old run_id as stale', () => {
      protocol.setCurrentRunId('run_5');

      const gate: QAGateResult = {
        run_id: 'run_3',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'unit-tests',
      };

      assert.throws(
        () => protocol.judge([gate]),
        (err: Error) => err instanceof StaleRunError,
      );
    });

    it('should reject when currentRunId is set and result has no run_id', () => {
      protocol.setCurrentRunId('run_5');

      const gate: QAGateResult = {
        run_id: '',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'unit-tests',
      };

      assert.throws(
        () => protocol.judge([gate]),
        (err: Error) => err instanceof StaleRunError,
      );
    });

    it('should allow judgment without run_id enforcement when not set', () => {
      // No setCurrentRunId called - run_id checking is not enforced
      const gate: QAGateResult = {
        run_id: 'run_3',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'unit-tests',
      };

      const verdict = protocol.judge([gate]);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
    });
  });

  // ─── AC3: failing>0 => never COMPLETE ───

  describe('AC3: failing>0 => never COMPLETE', () => {
    it('should return FAILING when one gate has failures', () => {
      const gates: QAGateResult[] = [
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 10, failing: 0, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 18, failing: 2, skipped: 0, gate_name: 'unit-tests' },
      ];

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'FAILING');
      assert.strictEqual(verdict.all_pass, false);
      assert.strictEqual(verdict.failing_total, 2);
    });

    it('should return FAILING even if only 1 test fails across all gates', () => {
      const gates: QAGateResult[] = [
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 100, failing: 0, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 50, failing: 0, skipped: 0, gate_name: 'typecheck' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 200, failing: 1, skipped: 0, gate_name: 'unit-tests' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 10, failing: 0, skipped: 0, gate_name: 'build' },
      ];

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'FAILING');
      assert.strictEqual(verdict.failing_total, 1);
      assert.deepStrictEqual(verdict.failing_gates, ['unit-tests']);
    });

    it('should accumulate failures across multiple gates', () => {
      const gates: QAGateResult[] = [
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 10, failing: 3, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 18, failing: 2, skipped: 0, gate_name: 'unit-tests' },
      ];

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'FAILING');
      assert.strictEqual(verdict.failing_total, 5);
      assert.deepStrictEqual(verdict.failing_gates, ['lint', 'unit-tests']);
    });

    it('should never return COMPLETE when any failing > 0 (brute check)', () => {
      // Try many combinations - never COMPLETE
      for (let f = 1; f <= 50; f++) {
        const gate: QAGateResult = {
          run_id: 'run_1',
          timestamp: new Date().toISOString(),
          passing: 1000,
          failing: f,
          skipped: 0,
          gate_name: 'test',
        };

        const verdict = protocol.judge([gate]);
        assert.notStrictEqual(
          verdict.final_status,
          'COMPLETE',
          `COMPLETE should never be returned when failing=${f}`,
        );
      }
    });
  });

  // ─── AC4: No mixing old and new run results ───

  describe('AC4: No mixing old and new run results', () => {
    it('should reject when gates have different run_ids', () => {
      protocol.setCurrentRunId('run_5');

      const gates: QAGateResult[] = [
        { run_id: 'run_5', timestamp: new Date().toISOString(), passing: 10, failing: 0, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_4', timestamp: new Date().toISOString(), passing: 5, failing: 0, skipped: 0, gate_name: 'typecheck' },
      ];

      assert.throws(
        () => protocol.judge(gates),
        (err: Error) => err instanceof StaleRunError,
      );
    });

    it('should reject mixed run_ids even without currentRunId set', () => {
      // No setCurrentRunId - but results have inconsistent run_ids
      const gates: QAGateResult[] = [
        { run_id: 'run_5', timestamp: new Date().toISOString(), passing: 10, failing: 0, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_3', timestamp: new Date().toISOString(), passing: 5, failing: 0, skipped: 0, gate_name: 'typecheck' },
      ];

      assert.throws(
        () => protocol.judge(gates),
        (err: Error) => err instanceof StaleRunError,
      );
    });

    it('should accept consistent run_ids across all gates', () => {
      protocol.setCurrentRunId('run_7');

      const gates: QAGateResult[] = [
        { run_id: 'run_7', timestamp: new Date().toISOString(), passing: 10, failing: 0, skipped: 0, gate_name: 'lint' },
        { run_id: 'run_7', timestamp: new Date().toISOString(), passing: 5, failing: 0, skipped: 0, gate_name: 'typecheck' },
        { run_id: 'run_7', timestamp: new Date().toISOString(), passing: 20, failing: 0, skipped: 0, gate_name: 'unit-tests' },
      ];

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.stale_results, false);
    });
  });

  // ─── Verdict structure ───

  describe('Verdict structure', () => {
    it('should include gate_summary for each gate', () => {
      const gates: QAGateResult[] = [
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 10, failing: 0, skipped: 2, gate_name: 'lint' },
        { run_id: 'run_1', timestamp: new Date().toISOString(), passing: 20, failing: 1, skipped: 0, gate_name: 'unit-tests' },
      ];

      const verdict = protocol.judge(gates);

      assert.strictEqual(verdict.gate_summary.length, 2);
      assert.strictEqual(verdict.gate_summary[0].gate_name, 'lint');
      assert.strictEqual(verdict.gate_summary[0].passed, true);
      assert.strictEqual(verdict.gate_summary[1].gate_name, 'unit-tests');
      assert.strictEqual(verdict.gate_summary[1].passed, false);
    });

    it('should include run_id in verdict', () => {
      const gate: QAGateResult = {
        run_id: 'run_42',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'lint',
      };

      const verdict = protocol.judge([gate]);

      assert.strictEqual(verdict.run_id, 'run_42');
    });

    it('should include timestamp in verdict', () => {
      const gate: QAGateResult = {
        run_id: 'run_1',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'lint',
      };

      const verdict = protocol.judge([gate]);

      assert.ok(verdict.judged_at);
      // Verify it's a valid ISO timestamp
      assert.ok(!isNaN(Date.parse(verdict.judged_at)));
    });

    it('should include skipped count in verdict', () => {
      const gate: QAGateResult = {
        run_id: 'run_1',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 3,
        gate_name: 'lint',
      };

      const verdict = protocol.judge([gate]);

      assert.strictEqual(verdict.skipped_total, 3);
    });
  });

  // ─── Edge cases ───

  describe('Edge cases', () => {
    it('should handle very large passing counts with zero failures', () => {
      const gate: QAGateResult = {
        run_id: 'run_1',
        timestamp: new Date().toISOString(),
        passing: 999999,
        failing: 0,
        skipped: 0,
        gate_name: 'mega-test',
      };

      const verdict = protocol.judge([gate]);

      assert.strictEqual(verdict.final_status, 'COMPLETE');
      assert.strictEqual(verdict.all_pass, true);
    });

    it('should handle negative values by treating them as failures', () => {
      const gate: QAGateResult = {
        run_id: 'run_1',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: -1,
        skipped: 0,
        gate_name: 'lint',
      };

      // Negative failing should be treated as invalid, not COMPLETE
      const verdict = protocol.judge([gate]);
      assert.notStrictEqual(verdict.final_status, 'COMPLETE');
    });

    it('should allow setCurrentRunId to be updated', () => {
      protocol.setCurrentRunId('run_1');
      protocol.setCurrentRunId('run_2');

      const gate: QAGateResult = {
        run_id: 'run_2',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'lint',
      };

      const verdict = protocol.judge([gate]);
      assert.strictEqual(verdict.final_status, 'COMPLETE');
    });

    it('should reset currentRunId with clearCurrentRunId', () => {
      protocol.setCurrentRunId('run_1');
      protocol.clearCurrentRunId();

      const gate: QAGateResult = {
        run_id: 'run_99',
        timestamp: new Date().toISOString(),
        passing: 10,
        failing: 0,
        skipped: 0,
        gate_name: 'lint',
      };

      // Should not throw - no run_id enforcement
      const verdict = protocol.judge([gate]);
      assert.strictEqual(verdict.final_status, 'COMPLETE');
    });
  });
});
