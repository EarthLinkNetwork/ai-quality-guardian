/**
 * Evidence Manager
 * Based on 04_COMPONENTS.md L133-154
 *
 * Responsible for:
 * - Evidence collection and storage
 * - Hash verification
 * - Evidence index management
 * - Atomic evidence recording
 * - Evidence inventory tracking
 */
import { Evidence } from '../models/evidence';
import { EvidenceInventory } from '../models/supporting';
import { ErrorCode } from '../errors/error-codes';
/**
 * Evidence Manager Error
 */
export declare class EvidenceManagerError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Evidence Index structure
 */
interface EvidenceIndex {
    session_id: string;
    created_at: string;
    finalized_at?: string;
    evidence_items: Array<{
        evidence_id: string;
        operation_type: string;
        timestamp: string;
        hash: string;
    }>;
    total_items: number;
}
/**
 * Evidence Manager class
 */
export declare class EvidenceManager {
    private readonly baseDir;
    private readonly sessions;
    /**
     * Create a new EvidenceManager
     * @param baseDir Base directory for evidence storage
     */
    constructor(baseDir: string);
    /**
     * Initialize evidence directory for a session
     */
    initializeSession(sessionId: string): void;
    /**
     * Record evidence for a session
     * @throws EvidenceManagerError with E301 if session not found or validation fails
     */
    recordEvidence(sessionId: string, evidence: Evidence & {
        aggregated?: boolean;
        operation_id?: string;
    }): void;
    /**
     * Get evidence by ID
     * @throws EvidenceManagerError if evidence not found
     */
    getEvidence(sessionId: string, evidenceId: string): Evidence;
    /**
     * List all evidence for a session
     */
    listEvidence(sessionId: string): Evidence[];
    /**
     * Verify evidence hash
     * @throws EvidenceManagerError with E304 on hash mismatch
     */
    verifyEvidence(sessionId: string, evidenceId: string): boolean;
    /**
     * Get content for hash calculation
     */
    private getEvidenceContent;
    /**
     * Finalize session - create evidence_index.json and evidence_index.sha256
     */
    finalizeSession(sessionId: string): void;
    /**
     * Verify session integrity (check evidence_index.json hash)
     * @throws EvidenceManagerError with E304 if tampered
     */
    verifySessionIntegrity(sessionId: string): boolean;
    /**
     * Load evidence index from disk
     * @throws EvidenceManagerError with E302 if corrupted
     */
    loadEvidenceIndex(sessionId: string): EvidenceIndex;
    /**
     * Store raw log for an executor
     */
    storeRawLog(sessionId: string, executorId: string, content: string): string;
    /**
     * Verify raw logs exist
     * @throws EvidenceManagerError with E303 if raw log missing
     */
    verifyRawLogs(sessionId: string, evidenceId: string): boolean;
    /**
     * Register an operation for evidence tracking
     */
    registerOperation(sessionId: string, operationId: string): void;
    /**
     * Get evidence inventory for a session
     */
    getEvidenceInventory(sessionId: string): EvidenceInventory;
}
export {};
//# sourceMappingURL=evidence-manager.d.ts.map