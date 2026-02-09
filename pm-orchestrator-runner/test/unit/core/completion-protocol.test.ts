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
 *
 * Phase 1 New Functions:
 * - generateRunId
 * - parseTestOutput
 * - extractFailingTests
 * - buildCompletionReport
 * - isStale
 * - formatCompletionReport
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  QAGateResult,
  CompletionVerdict,
  CompletionProtocol,
  StaleRunError,
  generateRunId,
  parseTestOutput,
  extractFailingTests,
  buildCompletionReport,
  isStale,
  formatCompletionReport,
  TestResults,
  FailingTest,
  CompletionReport,
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

  // ─── Phase 1: generateRunId ───

  describe('generateRunId', () => {
    it('should have correct format (YYYYMMDD-HHmmss-MMM-<7char>-<8char>)', () => {
      const runId = generateRunId('abc1234def5678', 'npm test');

      // Format: YYYYMMDD-HHmmss-MMM-<7char>-<8char>
      // Example: 20260207-143025-123-abc1234-a1b2c3d4
      const parts = runId.split('-');
      assert.strictEqual(parts.length, 5, `Expected 5 parts, got ${parts.length}: ${runId}`);
      assert.strictEqual(parts[0].length, 8, 'Date part should be 8 chars');
      assert.strictEqual(parts[1].length, 6, 'Time part should be 6 chars');
      assert.strictEqual(parts[2].length, 3, 'Millis part should be 3 chars');
      assert.strictEqual(parts[3].length, 7, 'Short SHA should be 7 chars');
      assert.strictEqual(parts[4].length, 8, 'Command hash should be 8 chars');
    });

    it('should generate same cmdHash for same command', () => {
      const runId1 = generateRunId('abc1234', 'npm test');
      const runId2 = generateRunId('abc1234', 'npm test');

      // cmdHash (last part) should be the same
      const cmdHash1 = runId1.split('-')[4];
      const cmdHash2 = runId2.split('-')[4];
      assert.strictEqual(cmdHash1, cmdHash2);
    });

    it('should generate different cmdHash for different commands', () => {
      const runId1 = generateRunId('abc1234', 'npm test');
      const runId2 = generateRunId('abc1234', 'npm run lint');

      // cmdHash (last part) should be different
      const cmdHash1 = runId1.split('-')[4];
      const cmdHash2 = runId2.split('-')[4];
      assert.notStrictEqual(cmdHash1, cmdHash2);
    });

    it('should truncate long SHA to 7 characters', () => {
      const runId = generateRunId('abc1234567890abcdef', 'npm test');
      const shortSha = runId.split('-')[3];
      assert.strictEqual(shortSha, 'abc1234');
    });

    it('should pad short SHA to 7 characters', () => {
      const runId = generateRunId('abc', 'npm test');
      const shortSha = runId.split('-')[3];
      assert.strictEqual(shortSha.length, 7);
      assert.strictEqual(shortSha.substring(0, 3), 'abc');
    });
  });

  // ─── Phase 1: parseTestOutput ───

  describe('parseTestOutput', () => {
    it('should parse Mocha output correctly', () => {
      const stdout = `
  10 passing (2s)
  2 failing
  1 pending
`;
      const result = parseTestOutput(stdout);
      assert.strictEqual(result.passing, 10);
      assert.strictEqual(result.failing, 2);
      assert.strictEqual(result.pending, 1);
    });

    it('should handle failing=0 case', () => {
      const stdout = `
  25 passing (5s)
`;
      const result = parseTestOutput(stdout);
      assert.strictEqual(result.passing, 25);
      assert.strictEqual(result.failing, 0);
      assert.strictEqual(result.pending, 0);
    });

    it('should handle empty/invalid output', () => {
      assert.deepStrictEqual(parseTestOutput(''), { passing: 0, failing: 0, pending: 0 });
      assert.deepStrictEqual(parseTestOutput(null as any), { passing: 0, failing: 0, pending: 0 });
      assert.deepStrictEqual(parseTestOutput(undefined as any), { passing: 0, failing: 0, pending: 0 });
    });

    it('should parse Jest output format', () => {
      const stdout = `
Tests: 15 passed, 3 failed, 18 total
`;
      const result = parseTestOutput(stdout);
      assert.strictEqual(result.passing, 15);
      assert.strictEqual(result.failing, 3);
    });

    it('should handle Jest skipped tests', () => {
      const stdout = `
Tests: 10 passed, 0 failed, 2 skipped, 12 total
`;
      const result = parseTestOutput(stdout);
      assert.strictEqual(result.pending, 2);
    });
  });

  // ─── Phase 1: extractFailingTests ───

  describe('extractFailingTests', () => {
    it('should extract Mocha-style failing test names', () => {
      const stdout = `
  1) MyModule should work correctly:
     AssertionError: expected true to be false

  2) Another test should pass:
     Error: timeout
`;
      const tests = extractFailingTests(stdout);
      assert.ok(tests.length >= 1);
      assert.ok(tests.some(t => t.name.includes('MyModule')));
    });

    it('should mark IN_SCOPE for regular tests', () => {
      const stdout = `
  1) unit test should work:
`;
      const tests = extractFailingTests(stdout);
      if (tests.length > 0) {
        assert.strictEqual(tests[0].scope, 'IN_SCOPE');
      }
    });

    it('should mark OUT_OF_SCOPE for integration tests', () => {
      const stdout = `
  1) integration test external API:
`;
      const tests = extractFailingTests(stdout);
      if (tests.length > 0) {
        assert.strictEqual(tests[0].scope, 'OUT_OF_SCOPE');
      }
    });

    it('should handle empty/invalid output', () => {
      assert.deepStrictEqual(extractFailingTests(''), []);
      assert.deepStrictEqual(extractFailingTests(null as any), []);
    });

    it('should extract Jest-style failing tests', () => {
      const stdout = `
  ✕ should validate input (15 ms)
  ✕ external API test should work (200 ms)
`;
      const tests = extractFailingTests(stdout);
      assert.ok(tests.length >= 1);
    });
  });

  // ─── Phase 1: buildCompletionReport ───

  describe('buildCompletionReport', () => {
    it('should return COMPLETE when failing=0 and exit_code=0', () => {
      const report = buildCompletionReport({
        runId: 'run_1',
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 0,
        stdout: '10 passing (2s)',
      });

      assert.strictEqual(report.final_status, 'COMPLETE');
      assert.strictEqual(report.test_results.passing, 10);
      assert.strictEqual(report.test_results.failing, 0);
    });

    it('should return INCOMPLETE when failing>0 (AC3)', () => {
      const report = buildCompletionReport({
        runId: 'run_1',
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 1,
        stdout: '10 passing\n2 failing',
      });

      assert.strictEqual(report.final_status, 'INCOMPLETE');
      assert.strictEqual(report.test_results.failing, 2);
    });

    it('should return INCOMPLETE when exit_code != 0', () => {
      const report = buildCompletionReport({
        runId: 'run_1',
        commitSha: 'abc1234',
        command: 'npm test',
        exitCode: 19,
        stdout: '10 passing',
      });

      assert.strictEqual(report.final_status, 'INCOMPLETE');
    });

    it('should include all required fields', () => {
      const report = buildCompletionReport({
        runId: 'run_test',
        commitSha: 'abc1234567',
        command: 'npm test',
        exitCode: 0,
        stdout: '5 passing',
      });

      assert.ok(report.run_id);
      assert.ok(report.commit_sha);
      assert.ok(report.command);
      assert.ok(typeof report.exit_code === 'number');
      assert.ok(report.test_results);
      assert.ok(Array.isArray(report.failing_details));
      assert.ok(report.final_status);
      assert.strictEqual(report.stale, false);
      assert.ok(report.timestamp);
    });
  });

  // ─── Phase 1: isStale ───

  describe('isStale', () => {
    it('should return false for same run_id', () => {
      const runId = '20260207-143025-123-abc1234-a1b2c3d4';
      assert.strictEqual(isStale(runId, runId), false);
    });

    it('should return true for different run_id (AC2)', () => {
      const oldRunId = '20260207-143025-123-abc1234-a1b2c3d4';
      const newRunId = '20260207-143030-456-abc1234-a1b2c3d4';
      assert.strictEqual(isStale(oldRunId, newRunId), true);
    });

    it('should return true for older timestamp (AC4)', () => {
      const oldRunId = '20260207-143025-123-abc1234-a1b2c3d4';
      const newRunId = '20260207-153025-123-abc1234-a1b2c3d4'; // 1 hour later
      assert.strictEqual(isStale(oldRunId, newRunId), true);
    });

    it('should return true for empty/missing run_id', () => {
      assert.strictEqual(isStale('', 'run_1'), true);
      assert.strictEqual(isStale('run_1', ''), true);
    });
  });

  // ─── Phase 1: formatCompletionReport ───

  describe('formatCompletionReport', () => {
    it('should include "ALL PASS" only when failing=0 (AC1)', () => {
      const report: CompletionReport = {
        run_id: 'run_1',
        commit_sha: 'abc1234',
        command: 'npm test',
        exit_code: 0,
        test_results: { passing: 10, failing: 0, pending: 0 },
        failing_details: [],
        final_status: 'COMPLETE',
        stale: false,
        timestamp: new Date().toISOString(),
      };

      const formatted = formatCompletionReport(report);
      assert.ok(formatted.includes('ALL PASS'));
    });

    it('should NOT include "ALL PASS" when failing>0', () => {
      const report: CompletionReport = {
        run_id: 'run_1',
        commit_sha: 'abc1234',
        command: 'npm test',
        exit_code: 1,
        test_results: { passing: 10, failing: 2, pending: 0 },
        failing_details: [],
        final_status: 'INCOMPLETE',
        stale: false,
        timestamp: new Date().toISOString(),
      };

      const formatted = formatCompletionReport(report);
      assert.ok(!formatted.includes('ALL PASS'));
      assert.ok(formatted.includes('2 FAILING'));
    });

    it('should show failing test details when present', () => {
      const report: CompletionReport = {
        run_id: 'run_1',
        commit_sha: 'abc1234',
        command: 'npm test',
        exit_code: 1,
        test_results: { passing: 10, failing: 1, pending: 0 },
        failing_details: [{ name: 'MyTest should work', scope: 'IN_SCOPE' }],
        final_status: 'INCOMPLETE',
        stale: false,
        timestamp: new Date().toISOString(),
      };

      const formatted = formatCompletionReport(report);
      assert.ok(formatted.includes('MyTest should work'));
      assert.ok(formatted.includes('Failing Tests:'));
    });

    it('should mark OUT_OF_SCOPE tests', () => {
      const report: CompletionReport = {
        run_id: 'run_1',
        commit_sha: 'abc1234',
        command: 'npm test',
        exit_code: 1,
        test_results: { passing: 10, failing: 1, pending: 0 },
        failing_details: [{ name: 'external API test', scope: 'OUT_OF_SCOPE' }],
        final_status: 'INCOMPLETE',
        stale: false,
        timestamp: new Date().toISOString(),
      };

      const formatted = formatCompletionReport(report);
      assert.ok(formatted.includes('[OUT_OF_SCOPE]'));
    });

    it('should include stale warning when stale=true', () => {
      const report: CompletionReport = {
        run_id: 'run_1',
        commit_sha: 'abc1234',
        command: 'npm test',
        exit_code: 0,
        test_results: { passing: 10, failing: 0, pending: 0 },
        failing_details: [],
        final_status: 'COMPLETE',
        stale: true,
        timestamp: new Date().toISOString(),
      };

      const formatted = formatCompletionReport(report);
      assert.ok(formatted.includes('stale'));
    });
  });
});
