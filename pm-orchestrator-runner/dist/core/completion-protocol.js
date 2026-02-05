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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionProtocol = exports.StaleRunError = void 0;
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
// ─── Completion Protocol ───
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