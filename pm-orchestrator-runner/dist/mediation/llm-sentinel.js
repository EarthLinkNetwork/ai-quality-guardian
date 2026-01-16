"use strict";
/**
 * LLM Sentinel - File-based Evidence Verification
 *
 * Sentinel that verifies LLM execution evidence before allowing
 * COMPLETE status to be reported.
 *
 * ARCHITECTURAL RULES:
 * - COMPLETE status requires verified evidence files
 * - Sentinel checks evidence integrity (hash verification)
 * - Sentinel checks evidence completeness (at least one success)
 * - Fail-closed: Any verification failure = cannot assert COMPLETE
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMSentinel = void 0;
exports.createSentinel = createSentinel;
exports.verifyLLMEvidence = verifyLLMEvidence;
const llm_evidence_manager_1 = require("./llm-evidence-manager");
/**
 * LLM Sentinel for evidence verification
 *
 * Fail-closed behavior:
 * - No evidence = FAIL
 * - Evidence integrity failure = FAIL
 * - All calls failed = FAIL
 * - At least one successful call with valid evidence = PASS
 */
class LLMSentinel {
    evidenceManager;
    constructor(evidenceDir) {
        this.evidenceManager = new llm_evidence_manager_1.LLMEvidenceManager(evidenceDir);
    }
    /**
     * Create sentinel from existing evidence manager
     */
    static fromEvidenceManager(manager) {
        const sentinel = Object.create(LLMSentinel.prototype);
        sentinel.evidenceManager = manager;
        return sentinel;
    }
    /**
     * Verify all evidence and determine if COMPLETE can be asserted
     *
     * This is the main entry point for the fail-closed check.
     */
    verify() {
        const timestamp = new Date().toISOString();
        const evidenceDir = this.evidenceManager.getEvidenceDir();
        // Get all evidence
        const allEvidence = this.evidenceManager.listEvidence();
        // No evidence = fail-closed
        if (allEvidence.length === 0) {
            return {
                passed: false,
                timestamp,
                evidence_dir: evidenceDir,
                evidence_count: 0,
                successful_calls: 0,
                failed_calls: 0,
                integrity_checks: [],
                integrity_passed: true, // No files to check
                can_assert_complete: false,
                failure_reason: 'No LLM evidence found (fail-closed)',
            };
        }
        // Check integrity of each evidence file
        const integrityChecks = allEvidence.map(evidence => this.checkIntegrity(evidence));
        const integrityPassed = integrityChecks.every(check => check.passed);
        // Get statistics
        const stats = this.evidenceManager.getStats();
        // Determine if COMPLETE can be asserted
        // Requires: at least one successful call + all integrity checks passed
        const canAssertComplete = stats.successful_calls > 0 && integrityPassed;
        // Determine failure reason if any
        let failureReason;
        if (!integrityPassed) {
            const failedCallIds = integrityChecks
                .filter(c => !c.passed)
                .map(c => c.call_id)
                .join(', ');
            failureReason = 'Evidence integrity check failed for: ' + failedCallIds;
        }
        else if (stats.successful_calls === 0) {
            failureReason = 'No successful LLM calls found (all calls failed)';
        }
        return {
            passed: canAssertComplete,
            timestamp,
            evidence_dir: evidenceDir,
            evidence_count: allEvidence.length,
            successful_calls: stats.successful_calls,
            failed_calls: stats.failed_calls,
            integrity_checks: integrityChecks,
            integrity_passed: integrityPassed,
            can_assert_complete: canAssertComplete,
            failure_reason: failureReason,
        };
    }
    /**
     * Quick check if COMPLETE can be asserted
     *
     * This is a lightweight check that doesn't do full integrity verification.
     */
    canAssertComplete() {
        return this.evidenceManager.canAssertComplete();
    }
    /**
     * Full verification with integrity checks
     */
    fullVerification() {
        return this.verify();
    }
    /**
     * Check integrity of a single evidence file
     */
    checkIntegrity(evidence) {
        const fileExists = this.evidenceManager.hasEvidence(evidence.call_id);
        const hashValid = fileExists && this.evidenceManager.verifyIntegrity(evidence.call_id);
        return {
            call_id: evidence.call_id,
            file_exists: fileExists,
            hash_valid: hashValid,
            passed: fileExists && hashValid,
        };
    }
    /**
     * Get evidence statistics
     */
    getStats() {
        return this.evidenceManager.getStats();
    }
    /**
     * Get detailed evidence list
     */
    getEvidenceDetails() {
        return this.evidenceManager.listEvidence();
    }
    /**
     * Generate verification report for logging
     */
    generateReport() {
        const result = this.verify();
        const lines = [
            '========================================',
            'LLM Sentinel Verification Report',
            '========================================',
            'Timestamp: ' + result.timestamp,
            'Evidence Directory: ' + result.evidence_dir,
            'Evidence Count: ' + result.evidence_count,
            'Successful Calls: ' + result.successful_calls,
            'Failed Calls: ' + result.failed_calls,
            'Integrity Passed: ' + result.integrity_passed,
            'Can Assert COMPLETE: ' + result.can_assert_complete,
            'Overall Result: ' + (result.passed ? 'PASS' : 'FAIL'),
        ];
        if (result.failure_reason) {
            lines.push('Failure Reason: ' + result.failure_reason);
        }
        if (result.integrity_checks.length > 0) {
            lines.push('');
            lines.push('Integrity Check Details:');
            for (const check of result.integrity_checks) {
                const status = check.passed ? 'PASS' : 'FAIL';
                lines.push('  - ' + check.call_id + ': ' + status + ' (file=' + check.file_exists + ', hash=' + check.hash_valid + ')');
            }
        }
        lines.push('========================================');
        return lines.join('\n');
    }
}
exports.LLMSentinel = LLMSentinel;
/**
 * Create sentinel for evidence directory
 */
function createSentinel(evidenceDir) {
    return new LLMSentinel(evidenceDir);
}
/**
 * Verify evidence and return whether COMPLETE can be asserted
 *
 * Convenience function for fail-closed check.
 */
function verifyLLMEvidence(evidenceDir) {
    const sentinel = new LLMSentinel(evidenceDir);
    return sentinel.verify();
}
//# sourceMappingURL=llm-sentinel.js.map