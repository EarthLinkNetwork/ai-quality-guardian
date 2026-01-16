/**
 * LLM Evidence Manager
 *
 * Tracks and verifies evidence of real LLM API calls.
 * This is the fail-closed mechanism that ensures:
 * 1. Every LLM call generates a proof file
 * 2. COMPLETE status can only be asserted with evidence
 * 3. Evidence files are tamper-resistant (hash verification)
 *
 * ARCHITECTURAL RULES:
 * - No evidence file = LLM call did not happen
 * - Evidence must exist BEFORE asserting COMPLETE
 * - Failed calls are also recorded (to prove attempt)
 */
/**
 * LLM Evidence structure
 * Records proof of a real LLM API call
 */
export interface LLMEvidence {
    /** Unique identifier for this call */
    call_id: string;
    /** LLM provider (openai, anthropic) */
    provider: string;
    /** Model used */
    model: string;
    /** Hash of the request payload */
    request_hash: string;
    /** Hash of the response (null if failed) */
    response_hash: string | null;
    /** ISO timestamp of the call */
    timestamp: string;
    /** Duration in milliseconds */
    duration_ms: number;
    /** Whether the call succeeded */
    success: boolean;
    /** Error message if failed */
    error?: string;
}
/**
 * Evidence statistics
 */
export interface EvidenceStats {
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
}
/**
 * LLM Evidence Manager
 *
 * Manages evidence files for LLM API calls.
 * Uses file-based storage for durability and auditability.
 */
export declare class LLMEvidenceManager {
    private readonly evidenceDir;
    private readonly evidenceMap;
    constructor(baseDir: string);
    /**
     * Load existing evidence files from disk
     */
    private loadExistingEvidence;
    /**
     * Record evidence for an LLM call
     * @returns Path to the evidence file
     */
    recordEvidence(evidence: LLMEvidence): string;
    /**
     * Check if evidence exists for a call
     */
    hasEvidence(callId: string): boolean;
    /**
     * Get evidence by call ID
     */
    getEvidence(callId: string): LLMEvidence | null;
    /**
     * List all evidence
     */
    listEvidence(): LLMEvidence[];
    /**
     * Get evidence statistics
     */
    getStats(): EvidenceStats;
    /**
     * Check if we can assert COMPLETE status
     * Requires at least one successful LLM call with evidence
     */
    canAssertComplete(): boolean;
    /**
     * Verify integrity of an evidence file
     * Detects tampering by comparing stored hash with recalculated hash
     */
    verifyIntegrity(callId: string): boolean;
    /**
     * Get evidence directory path
     */
    getEvidenceDir(): string;
}
/**
 * Create hash for request payload
 */
export declare function hashRequest(messages: Array<{
    role: string;
    content: string;
}>): string;
/**
 * Create hash for response content
 */
export declare function hashResponse(content: string): string;
//# sourceMappingURL=llm-evidence-manager.d.ts.map