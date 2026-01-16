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
import { LLMEvidenceManager, LLMEvidence, EvidenceStats } from './llm-evidence-manager';
/**
 * Sentinel verification result
 */
export interface SentinelVerificationResult {
    /** Overall verification passed */
    passed: boolean;
    /** Timestamp of verification */
    timestamp: string;
    /** Evidence directory checked */
    evidence_dir: string;
    /** Number of evidence files found */
    evidence_count: number;
    /** Number of successful calls */
    successful_calls: number;
    /** Number of failed calls */
    failed_calls: number;
    /** Integrity check results */
    integrity_checks: IntegrityCheckResult[];
    /** Overall integrity passed */
    integrity_passed: boolean;
    /** Can assert COMPLETE status */
    can_assert_complete: boolean;
    /** Reason if verification failed */
    failure_reason?: string;
}
/**
 * Individual evidence integrity check result
 */
export interface IntegrityCheckResult {
    call_id: string;
    file_exists: boolean;
    hash_valid: boolean;
    passed: boolean;
}
/**
 * LLM Sentinel for evidence verification
 *
 * Fail-closed behavior:
 * - No evidence = FAIL
 * - Evidence integrity failure = FAIL
 * - All calls failed = FAIL
 * - At least one successful call with valid evidence = PASS
 */
export declare class LLMSentinel {
    private readonly evidenceManager;
    constructor(evidenceDir: string);
    /**
     * Create sentinel from existing evidence manager
     */
    static fromEvidenceManager(manager: LLMEvidenceManager): LLMSentinel;
    /**
     * Verify all evidence and determine if COMPLETE can be asserted
     *
     * This is the main entry point for the fail-closed check.
     */
    verify(): SentinelVerificationResult;
    /**
     * Quick check if COMPLETE can be asserted
     *
     * This is a lightweight check that doesn't do full integrity verification.
     */
    canAssertComplete(): boolean;
    /**
     * Full verification with integrity checks
     */
    fullVerification(): SentinelVerificationResult;
    /**
     * Check integrity of a single evidence file
     */
    private checkIntegrity;
    /**
     * Get evidence statistics
     */
    getStats(): EvidenceStats;
    /**
     * Get detailed evidence list
     */
    getEvidenceDetails(): LLMEvidence[];
    /**
     * Generate verification report for logging
     */
    generateReport(): string;
}
/**
 * Create sentinel for evidence directory
 */
export declare function createSentinel(evidenceDir: string): LLMSentinel;
/**
 * Verify evidence and return whether COMPLETE can be asserted
 *
 * Convenience function for fail-closed check.
 */
export declare function verifyLLMEvidence(evidenceDir: string): SentinelVerificationResult;
//# sourceMappingURL=llm-sentinel.d.ts.map