/**
 * Completion Protocol
 *
 * Determines the final_status of a task run based on QA gate results.
 * Implements strict rules to prevent false-positive completion:
 *
 * AC1: "ALL PASS" (COMPLETE) only when failing=0 across all gates
 * AC2: Stale run_id detection - old run outputs cannot be used as evidence
 * AC3: failing>0 => final_status is NEVER "COMPLETE"
 * AC4: No mixing of old and new run results (consistent run_id)
 *
 * This module is the single authority for completion judgment.
 * External callers submit QAGateResult[] and receive a CompletionVerdict.
 */
/**
 * Result from a single QA gate (lint, typecheck, unit-tests, build, etc.)
 */
export interface QAGateResult {
    /** Run ID that produced this result */
    run_id: string;
    /** ISO 8601 timestamp when the gate was executed */
    timestamp: string;
    /** Number of passing checks */
    passing: number;
    /** Number of failing checks */
    failing: number;
    /** Number of skipped checks */
    skipped: number;
    /** Name of the gate (e.g., 'lint', 'typecheck', 'unit-tests', 'build') */
    gate_name: string;
}
/**
 * Summary of a single gate's result within the verdict
 */
export interface GateSummary {
    gate_name: string;
    passed: boolean;
    passing: number;
    failing: number;
    skipped: number;
}
/**
 * Final verdict produced by the Completion Protocol
 */
export interface CompletionVerdict {
    /** Final status: COMPLETE | FAILING | NO_EVIDENCE */
    final_status: 'COMPLETE' | 'FAILING' | 'NO_EVIDENCE';
    /** True only when failing_total === 0 and there is at least one passing test */
    all_pass: boolean;
    /** Total failing count across all gates */
    failing_total: number;
    /** Total skipped count across all gates */
    skipped_total: number;
    /** Names of gates that have failing > 0 */
    failing_gates: string[];
    /** Per-gate summary */
    gate_summary: GateSummary[];
    /** Run ID used for this verdict */
    run_id: string;
    /** ISO 8601 timestamp when the verdict was produced */
    judged_at: string;
    /** True if any stale results were detected (should not happen - throws instead) */
    stale_results: boolean;
}
/**
 * Parsed test output results
 */
export interface TestResults {
    passing: number;
    failing: number;
    pending: number;
}
/**
 * Details of a failing test
 */
export interface FailingTest {
    name: string;
    scope: 'IN_SCOPE' | 'OUT_OF_SCOPE';
}
/**
 * Completion Report generated from a test run
 */
export interface CompletionReport {
    run_id: string;
    commit_sha: string;
    command: string;
    exit_code: number;
    test_results: TestResults;
    failing_details: FailingTest[];
    final_status: 'COMPLETE' | 'INCOMPLETE';
    stale: boolean;
    timestamp: string;
}
/**
 * Thrown when a stale run_id is detected in QA gate results.
 * This prevents using old run outputs as completion evidence.
 */
export declare class StaleRunError extends Error {
    readonly expected_run_id: string | undefined;
    readonly actual_run_ids: string[];
    constructor(message: string, expected?: string, actual?: string[]);
}
/**
 * Generate a run_id with format: YYYYMMDD-HHmmss-MMM-<shortsha>-<cmdHash>
 *
 * @param commitSha - Git commit SHA (7+ characters)
 * @param command - Command that was executed
 * @returns Formatted run_id string
 */
export declare function generateRunId(commitSha: string, command: string): string;
/**
 * Parse test output (Mocha/Jest format) to extract passing/failing/pending counts
 *
 * @param stdout - Test output string
 * @returns Parsed TestResults
 */
export declare function parseTestOutput(stdout: string): TestResults;
/**
 * Extract failing test names from test output
 *
 * @param stdout - Test output string
 * @returns Array of FailingTest objects
 */
export declare function extractFailingTests(stdout: string): FailingTest[];
/**
 * Build a CompletionReport from test run results
 *
 * @param opts - Options containing run data
 * @returns CompletionReport
 */
export declare function buildCompletionReport(opts: {
    runId: string;
    commitSha: string;
    command: string;
    exitCode: number;
    stdout: string;
}): CompletionReport;
/**
 * Check if a report's run_id is stale compared to the latest run_id
 *
 * @param reportRunId - The run_id from the report being checked
 * @param latestRunId - The current/latest run_id
 * @returns true if the report is stale (old)
 */
export declare function isStale(reportRunId: string, latestRunId: string): boolean;
/**
 * Format a CompletionReport as human-readable text output
 *
 * @param report - The CompletionReport to format
 * @returns Formatted text string
 */
export declare function formatCompletionReport(report: CompletionReport): string;
/**
 * Completion Protocol - the single authority for task completion judgment.
 *
 * Usage:
 *   const protocol = new CompletionProtocol();
 *   protocol.setCurrentRunId('run_5');     // optional: enforce run_id
 *   const verdict = protocol.judge(gates); // returns CompletionVerdict
 */
export declare class CompletionProtocol {
    private currentRunId;
    /**
     * Set the current run ID. When set, all QA gate results must match
     * this run_id, otherwise a StaleRunError is thrown.
     */
    setCurrentRunId(runId: string): void;
    /**
     * Clear the current run ID. When cleared, run_id consistency is
     * still checked across gates (AC4) but not against a known current run.
     */
    clearCurrentRunId(): void;
    /**
     * Judge a set of QA gate results and produce a CompletionVerdict.
     *
     * @param gates - Array of QAGateResult from all QA gates
     * @returns CompletionVerdict with final_status
     * @throws StaleRunError if run_id mismatch detected (AC2, AC4)
     */
    judge(gates: QAGateResult[]): CompletionVerdict;
}
//# sourceMappingURL=completion-protocol.d.ts.map