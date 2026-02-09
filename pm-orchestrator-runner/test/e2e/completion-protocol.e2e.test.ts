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
 *
 * Phase 1 Additional E2E Tests:
 * - Full roundtrip: generateRunId -> buildCompletionReport -> formatCompletionReport
 * - Stale detection with isStale
 * - Report formatting verification
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  QAGateResult,
  CompletionProtocol,
  StaleRunError,
  generateRunId,
  buildCompletionReport,
  formatCompletionReport,
  isStale,
  parseTestOutput,
  CompletionReport,
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

  // ─── Phase 1 E2E: Full roundtrip ───

  describe('Phase 1 E2E: Full roundtrip', () => {
    it('should complete full workflow: generateRunId -> buildCompletionReport -> formatCompletionReport', () => {
      const commitSha = 'abc123def';
      const command = 'npm test';

      // Step 1: Generate run_id
      const runId = generateRunId(commitSha, command);
      assert.ok(runId, 'run_id should be generated');
      assert.ok(runId.includes('abc123d'), 'run_id should contain short SHA');

      // Step 2: Build completion report
      const stdout = '10 passing (2s)\n0 failing';
      const report = buildCompletionReport({
        runId,
        commitSha,
        command,
        exitCode: 0,
        stdout,
      });

      assert.strictEqual(report.run_id, runId);
      assert.strictEqual(report.final_status, 'COMPLETE');
      assert.strictEqual(report.test_results.passing, 10);

      // Step 3: Format report
      const formatted = formatCompletionReport(report);
      assert.ok(formatted.includes('ALL PASS'), 'Should show ALL PASS for complete report');
      assert.ok(formatted.includes(runId), 'Should include run_id');
      assert.ok(formatted.includes(commitSha), 'Should include commit SHA');
    });

    it('should include all required fields in formatted output', () => {
      const runId = generateRunId('abc1234', 'npm test');
      const report = buildCompletionReport({
        runId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 0,
        stdout: '5 passing',
      });

      const formatted = formatCompletionReport(report);

      // Check all required sections
      assert.ok(formatted.includes('COMPLETION REPORT'));
      assert.ok(formatted.includes('Run ID:'));
      assert.ok(formatted.includes('Commit:'));
      assert.ok(formatted.includes('Command:'));
      assert.ok(formatted.includes('TEST RESULTS'));
      assert.ok(formatted.includes('Passing:'));
      assert.ok(formatted.includes('Failing:'));
      assert.ok(formatted.includes('FINAL STATUS'));
    });
  });

  // ─── Phase 1 E2E: failing>0 blocks COMPLETE (AC3) ───

  describe('Phase 1 E2E: failing>0 blocks COMPLETE (AC3)', () => {
    it('should return INCOMPLETE when Mocha output has failing tests', () => {
      const runId = generateRunId('abc1234', 'npm test');
      const stdout = `
  Completion Protocol
    ✓ should work
    1) should not fail

  1 passing (500ms)
  1 failing

  1) Completion Protocol
       should not fail:
     AssertionError: expected true to be false
`;

      const report = buildCompletionReport({
        runId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 1,
        stdout,
      });

      assert.strictEqual(report.final_status, 'INCOMPLETE');
      assert.strictEqual(report.test_results.failing, 1);
      assert.strictEqual(report.exit_code, 1);
    });

    it('should format INCOMPLETE report correctly', () => {
      const runId = generateRunId('abc1234', 'npm test');
      const report = buildCompletionReport({
        runId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 1,
        stdout: '10 passing\n3 failing',
      });

      const formatted = formatCompletionReport(report);

      assert.ok(!formatted.includes('ALL PASS'), 'Should NOT show ALL PASS');
      assert.ok(formatted.includes('3 FAILING'), 'Should show failing count');
      assert.ok(formatted.includes('INCOMPLETE'), 'Should show INCOMPLETE status');
    });
  });

  // ─── Phase 1 E2E: "ALL PASS" only when failing=0 (AC1) ───

  describe('Phase 1 E2E: "ALL PASS" only when failing=0 (AC1)', () => {
    it('should include "ALL PASS" when failing=0', () => {
      const runId = generateRunId('abc1234', 'npm test');
      const report = buildCompletionReport({
        runId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 0,
        stdout: '100 passing',
      });

      const formatted = formatCompletionReport(report);
      assert.ok(formatted.includes('ALL PASS'));
    });

    it('should NOT include "ALL PASS" when failing>0', () => {
      const runId = generateRunId('abc1234', 'npm test');
      const report = buildCompletionReport({
        runId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 1,
        stdout: '100 passing\n1 failing',
      });

      const formatted = formatCompletionReport(report);
      assert.ok(!formatted.includes('ALL PASS'));
    });
  });

  // ─── Phase 1 E2E: Stale detection (AC2, AC4) ───

  describe('Phase 1 E2E: Stale detection (AC2, AC4)', () => {
    it('should detect stale run_id using isStale', () => {
      // Generate two run_ids with slight time difference
      const oldRunId = '20260207-100000-000-abc1234-12345678';
      const newRunId = '20260207-100001-000-abc1234-12345678';

      assert.strictEqual(isStale(oldRunId, newRunId), true);
      assert.strictEqual(isStale(newRunId, newRunId), false);
    });

    it('should detect stale when comparing reports from different runs', () => {
      const oldRunId = generateRunId('abc1234', 'npm test');

      // Simulate time passing
      const laterRunId = generateRunId('def5678', 'npm test');

      // Old report should be stale compared to new
      const report1 = buildCompletionReport({
        runId: oldRunId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 0,
        stdout: '10 passing',
      });

      const report2 = buildCompletionReport({
        runId: laterRunId,
        commitSha: 'def5678',
        command: 'npm test',
        exitCode: 0,
        stdout: '10 passing',
      });

      // If run_ids are different, report1 is stale relative to report2
      assert.strictEqual(isStale(report1.run_id, report2.run_id), true);
    });
  });

  // ─── Phase 1 E2E: Exit code handling ───

  describe('Phase 1 E2E: Exit code handling', () => {
    it('should handle exit code 19 (common timeout/error code) as INCOMPLETE', () => {
      const runId = generateRunId('abc1234', 'npm test');
      const report = buildCompletionReport({
        runId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 19,
        stdout: '',
      });

      assert.strictEqual(report.final_status, 'INCOMPLETE');
      assert.strictEqual(report.exit_code, 19);
    });

    it('should handle exit code 0 with failing tests as INCOMPLETE', () => {
      // Some test runners exit 0 even with failures
      const runId = generateRunId('abc1234', 'npm test');
      const report = buildCompletionReport({
        runId,
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 0,
        stdout: '10 passing\n1 failing',
      });

      // Should still be INCOMPLETE because failing > 0
      assert.strictEqual(report.final_status, 'INCOMPLETE');
    });
  });
});
