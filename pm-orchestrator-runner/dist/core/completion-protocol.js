"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionProtocol = exports.StaleRunError = void 0;
exports.generateRunId = generateRunId;
exports.parseTestOutput = parseTestOutput;
exports.extractFailingTests = extractFailingTests;
exports.buildCompletionReport = buildCompletionReport;
exports.isStale = isStale;
exports.formatCompletionReport = formatCompletionReport;
const crypto = __importStar(require("crypto"));
// ─── Errors ───
/**
 * Thrown when a stale run_id is detected in QA gate results.
 * This prevents using old run outputs as completion evidence.
 */
class StaleRunError extends Error {
    expected_run_id;
    actual_run_ids;
    constructor(message, expected, actual) {
        super(message);
        this.name = 'StaleRunError';
        this.expected_run_id = expected;
        this.actual_run_ids = actual || [];
    }
}
exports.StaleRunError = StaleRunError;
// ─── Utility Functions ───
/**
 * Generate a run_id with format: YYYYMMDD-HHmmss-MMM-<shortsha>-<cmdHash>
 *
 * @param commitSha - Git commit SHA (7+ characters)
 * @param command - Command that was executed
 * @returns Formatted run_id string
 */
function generateRunId(commitSha, command) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    const datePart = `${year}${month}${day}`;
    const timePart = `${hours}${minutes}${seconds}`;
    // Short SHA (first 7 characters)
    const shortSha = commitSha.substring(0, 7).padEnd(7, '0');
    // Command hash (first 8 characters of SHA256)
    const cmdHash = crypto.createHash('sha256').update(command).digest('hex').substring(0, 8);
    return `${datePart}-${timePart}-${millis}-${shortSha}-${cmdHash}`;
}
/**
 * Parse test output (Mocha/Jest format) to extract passing/failing/pending counts
 *
 * @param stdout - Test output string
 * @returns Parsed TestResults
 */
function parseTestOutput(stdout) {
    const result = {
        passing: 0,
        failing: 0,
        pending: 0,
    };
    if (!stdout || typeof stdout !== 'string') {
        return result;
    }
    // Mocha format: "N passing", "N failing", "N pending"
    // Jest format: "Tests: N passed, N failed, N total"
    // Try Mocha format first
    const passingMatch = stdout.match(/(\d+)\s+passing/i);
    const failingMatch = stdout.match(/(\d+)\s+failing/i);
    const pendingMatch = stdout.match(/(\d+)\s+pending/i);
    if (passingMatch) {
        result.passing = parseInt(passingMatch[1], 10);
    }
    if (failingMatch) {
        result.failing = parseInt(failingMatch[1], 10);
    }
    if (pendingMatch) {
        result.pending = parseInt(pendingMatch[1], 10);
    }
    // Try Jest format if Mocha didn't match
    if (!passingMatch && !failingMatch) {
        const jestMatch = stdout.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/i);
        if (jestMatch) {
            result.passing = parseInt(jestMatch[1], 10);
            result.failing = parseInt(jestMatch[2], 10);
        }
        // Jest skipped
        const jestSkipMatch = stdout.match(/(\d+)\s+skipped/i);
        if (jestSkipMatch) {
            result.pending = parseInt(jestSkipMatch[1], 10);
        }
    }
    return result;
}
/**
 * Extract failing test names from test output
 *
 * @param stdout - Test output string
 * @returns Array of FailingTest objects
 */
function extractFailingTests(stdout) {
    const failingTests = [];
    if (!stdout || typeof stdout !== 'string') {
        return failingTests;
    }
    // Common patterns for failing test names:
    // 1) Mocha: "1) test name:" or "1) Suite name test name:"
    // 2) Jest: "FAIL src/file.test.ts" followed by test names
    // Pattern 1: Numbered failing tests (Mocha style)
    const mochaPattern = /^\s*\d+\)\s+(.+?)(?::|$)/gm;
    let match;
    while ((match = mochaPattern.exec(stdout)) !== null) {
        const testName = match[1].trim();
        if (testName && !testName.includes('Error:') && !testName.includes('AssertionError')) {
            // Determine scope - tests with "external" or "integration" in name are OUT_OF_SCOPE
            const scope = /external|integration|e2e|third[- ]?party/i.test(testName)
                ? 'OUT_OF_SCOPE'
                : 'IN_SCOPE';
            failingTests.push({ name: testName, scope });
        }
    }
    // Pattern 2: Jest failing test lines
    const jestPattern = /\s+(?:x|✕|✗)\s+(.+?)(?:\s+\(\d+\s*ms\))?$/gm;
    while ((match = jestPattern.exec(stdout)) !== null) {
        const testName = match[1].trim();
        if (testName) {
            const scope = /external|integration|e2e|third[- ]?party/i.test(testName)
                ? 'OUT_OF_SCOPE'
                : 'IN_SCOPE';
            failingTests.push({ name: testName, scope });
        }
    }
    return failingTests;
}
/**
 * Build a CompletionReport from test run results
 *
 * @param opts - Options containing run data
 * @returns CompletionReport
 */
function buildCompletionReport(opts) {
    const testResults = parseTestOutput(opts.stdout);
    const failingDetails = extractFailingTests(opts.stdout);
    // Completion judgment logic:
    // - exit_code === 0 && test_results.failing === 0 → COMPLETE
    // - Otherwise → INCOMPLETE
    // - OUT_OF_SCOPE failing still results in INCOMPLETE (explicit in spec)
    const isComplete = opts.exitCode === 0 && testResults.failing === 0;
    return {
        run_id: opts.runId,
        commit_sha: opts.commitSha,
        command: opts.command,
        exit_code: opts.exitCode,
        test_results: testResults,
        failing_details: failingDetails,
        final_status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
        stale: false,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Check if a report's run_id is stale compared to the latest run_id
 *
 * @param reportRunId - The run_id from the report being checked
 * @param latestRunId - The current/latest run_id
 * @returns true if the report is stale (old)
 */
function isStale(reportRunId, latestRunId) {
    if (!reportRunId || !latestRunId) {
        return true; // Missing run_id is considered stale
    }
    if (reportRunId === latestRunId) {
        return false; // Same run_id = not stale
    }
    // Different run_id = stale
    // Additional check: compare timestamps embedded in run_id format
    // Format: YYYYMMDD-HHmmss-MMM-<shortsha>-<cmdHash>
    const reportTimestamp = reportRunId.substring(0, 18); // YYYYMMDD-HHmmss-MMM
    const latestTimestamp = latestRunId.substring(0, 18);
    // If report timestamp is older than latest, it's stale
    if (reportTimestamp < latestTimestamp) {
        return true;
    }
    // If timestamps are equal but run_ids differ (different commit/command), it's stale
    return reportRunId !== latestRunId;
}
/**
 * Format a CompletionReport as human-readable text output
 *
 * @param report - The CompletionReport to format
 * @returns Formatted text string
 */
function formatCompletionReport(report) {
    const lines = [];
    lines.push('='.repeat(60));
    lines.push('COMPLETION REPORT');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Run ID:     ${report.run_id}`);
    lines.push(`Commit:     ${report.commit_sha}`);
    lines.push(`Command:    ${report.command}`);
    lines.push(`Timestamp:  ${report.timestamp}`);
    lines.push(`Exit Code:  ${report.exit_code}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('TEST RESULTS');
    lines.push('-'.repeat(60));
    lines.push(`  Passing:  ${report.test_results.passing}`);
    lines.push(`  Failing:  ${report.test_results.failing}`);
    lines.push(`  Pending:  ${report.test_results.pending}`);
    lines.push('');
    // AC1: "ALL PASS" only when failing=0
    if (report.test_results.failing === 0 && report.final_status === 'COMPLETE') {
        lines.push('>>> ALL PASS <<<');
    }
    else if (report.test_results.failing > 0) {
        lines.push(`>>> ${report.test_results.failing} FAILING <<<`);
        if (report.failing_details.length > 0) {
            lines.push('');
            lines.push('Failing Tests:');
            for (const test of report.failing_details) {
                const scopeMarker = test.scope === 'OUT_OF_SCOPE' ? '[OUT_OF_SCOPE] ' : '';
                lines.push(`  - ${scopeMarker}${test.name}`);
            }
        }
    }
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('FINAL STATUS');
    lines.push('-'.repeat(60));
    lines.push(`  Status: ${report.final_status}`);
    if (report.stale) {
        lines.push('  WARNING: This report uses stale run data');
    }
    lines.push('');
    lines.push('='.repeat(60));
    return lines.join('\n');
}
// ─── Completion Protocol Class ───
/**
 * Completion Protocol - the single authority for task completion judgment.
 *
 * Usage:
 *   const protocol = new CompletionProtocol();
 *   protocol.setCurrentRunId('run_5');     // optional: enforce run_id
 *   const verdict = protocol.judge(gates); // returns CompletionVerdict
 */
class CompletionProtocol {
    currentRunId;
    /**
     * Set the current run ID. When set, all QA gate results must match
     * this run_id, otherwise a StaleRunError is thrown.
     */
    setCurrentRunId(runId) {
        this.currentRunId = runId;
    }
    /**
     * Clear the current run ID. When cleared, run_id consistency is
     * still checked across gates (AC4) but not against a known current run.
     */
    clearCurrentRunId() {
        this.currentRunId = undefined;
    }
    /**
     * Judge a set of QA gate results and produce a CompletionVerdict.
     *
     * @param gates - Array of QAGateResult from all QA gates
     * @returns CompletionVerdict with final_status
     * @throws StaleRunError if run_id mismatch detected (AC2, AC4)
     */
    judge(gates) {
        const judgedAt = new Date().toISOString();
        // ─── Empty gates → NO_EVIDENCE ───
        if (gates.length === 0) {
            return {
                final_status: 'NO_EVIDENCE',
                all_pass: false,
                failing_total: 0,
                skipped_total: 0,
                failing_gates: [],
                gate_summary: [],
                run_id: '',
                judged_at: judgedAt,
                stale_results: false,
            };
        }
        // ─── AC4: Check run_id consistency across all gates ───
        const runIds = new Set(gates.map(g => g.run_id));
        if (runIds.size > 1) {
            throw new StaleRunError(`Mixed run_ids detected: ${Array.from(runIds).join(', ')}. All gates must have the same run_id.`, this.currentRunId, Array.from(runIds));
        }
        const gateRunId = gates[0].run_id;
        // ─── AC2: Check against current run_id if set ───
        if (this.currentRunId !== undefined) {
            if (!gateRunId || gateRunId !== this.currentRunId) {
                throw new StaleRunError(`Stale run_id detected: expected '${this.currentRunId}', got '${gateRunId}'`, this.currentRunId, [gateRunId]);
            }
        }
        // ─── Compute totals ───
        let failingTotal = 0;
        let passingTotal = 0;
        let skippedTotal = 0;
        const failingGates = [];
        const gateSummary = [];
        for (const gate of gates) {
            const failing = gate.failing;
            const passing = gate.passing;
            const skipped = gate.skipped;
            // Negative values are treated as failures (edge case guard)
            const isGatePassing = failing === 0 && passing >= 0 && failing >= 0;
            failingTotal += Math.max(0, failing);
            passingTotal += Math.max(0, passing);
            skippedTotal += Math.max(0, skipped);
            if (!isGatePassing || failing < 0) {
                failingGates.push(gate.gate_name);
                // Count negative failing as 1 failure
                if (failing < 0) {
                    failingTotal += 1; // Additional penalty for negative
                }
            }
            gateSummary.push({
                gate_name: gate.gate_name,
                passed: isGatePassing && failing >= 0,
                passing: Math.max(0, passing),
                failing: Math.max(0, failing),
                skipped: Math.max(0, skipped),
            });
        }
        // ─── AC1 + AC3: Determine final_status ───
        let finalStatus;
        let allPass = false;
        if (failingTotal > 0 || failingGates.length > 0) {
            // AC3: failing > 0 => NEVER COMPLETE
            finalStatus = 'FAILING';
            allPass = false;
        }
        else if (passingTotal > 0) {
            // AC1: ALL PASS only when failing=0 AND at least one passing
            finalStatus = 'COMPLETE';
            allPass = true;
        }
        else {
            // No passing, no failing = no evidence
            finalStatus = 'NO_EVIDENCE';
            allPass = false;
        }
        return {
            final_status: finalStatus,
            all_pass: allPass,
            failing_total: failingTotal,
            skipped_total: skippedTotal,
            failing_gates: failingGates,
            gate_summary: gateSummary,
            run_id: gateRunId,
            judged_at: judgedAt,
            stale_results: false,
        };
    }
}
exports.CompletionProtocol = CompletionProtocol;
//# sourceMappingURL=completion-protocol.js.map