/**
 * Evidence Model
 * Based on 05_DATA_MODELS.md L39-52
 */
/**
 * Artifact data structure
 */
export interface Artifact {
    path: string;
    content?: string;
    type?: string;
    size?: number;
}
/**
 * Evidence data structure
 */
export interface Evidence {
    evidence_id: string;
    timestamp: string;
    operation_type: string;
    executor_id?: string;
    artifacts: Artifact[];
    hash: string;
    raw_logs: string;
    atomic_operation: boolean;
    raw_evidence_refs: string[];
    integrity_validated: boolean;
}
/**
 * Evidence validation error
 */
export declare class EvidenceValidationError extends Error {
    constructor(message: string);
}
/**
 * Create a new evidence record
 */
export declare function createEvidence(operationType: string, artifacts: Artifact[], executorId?: string, rawLogs?: string): Evidence;
/**
 * Validate an evidence object
 * @throws EvidenceValidationError if validation fails
 */
export declare function validateEvidence(evidence: Evidence): boolean;
/**
 * Add artifact to evidence
 */
export declare function addArtifact(evidence: Evidence, artifact: Artifact): Evidence;
/**
 * Mark evidence as integrity validated
 */
export declare function markIntegrityValidated(evidence: Evidence): Evidence;
/**
 * Add raw evidence reference
 */
export declare function addRawEvidenceRef(evidence: Evidence, ref: string): Evidence;
/**
 * Verify evidence hash matches artifacts
 */
export declare function verifyEvidenceHash(evidence: Evidence): boolean;
//# sourceMappingURL=evidence.d.ts.map