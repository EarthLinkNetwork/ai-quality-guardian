"use strict";
/**
 * Evidence Model
 * Based on 05_DATA_MODELS.md L39-52
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceValidationError = void 0;
exports.createEvidence = createEvidence;
exports.validateEvidence = validateEvidence;
exports.addArtifact = addArtifact;
exports.markIntegrityValidated = markIntegrityValidated;
exports.addRawEvidenceRef = addRawEvidenceRef;
exports.verifyEvidenceHash = verifyEvidenceHash;
const uuid_1 = require("uuid");
const crypto_1 = require("crypto");
/**
 * Evidence validation error
 */
class EvidenceValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EvidenceValidationError';
    }
}
exports.EvidenceValidationError = EvidenceValidationError;
/**
 * Calculate SHA256 hash from artifacts
 */
function calculateHash(artifacts) {
    const hash = (0, crypto_1.createHash)('sha256');
    for (const artifact of artifacts) {
        hash.update(artifact.path);
        if (artifact.content) {
            hash.update(artifact.content);
        }
    }
    // If no artifacts, hash empty string
    if (artifacts.length === 0) {
        hash.update('');
    }
    return `sha256:${hash.digest('hex')}`;
}
/**
 * Create a new evidence record
 */
function createEvidence(operationType, artifacts, executorId, rawLogs) {
    return {
        evidence_id: `evidence-${(0, uuid_1.v4)()}`,
        timestamp: new Date().toISOString(),
        operation_type: operationType,
        executor_id: executorId,
        artifacts,
        hash: calculateHash(artifacts),
        raw_logs: rawLogs || '',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
    };
}
/**
 * Validate an evidence object
 * @throws EvidenceValidationError if validation fails
 */
function validateEvidence(evidence) {
    if (!evidence.evidence_id || evidence.evidence_id.length === 0) {
        throw new EvidenceValidationError('evidence_id is required');
    }
    if (!evidence.timestamp || evidence.timestamp.length === 0) {
        throw new EvidenceValidationError('timestamp is required');
    }
    // Validate timestamp format
    const timestamp = new Date(evidence.timestamp);
    if (isNaN(timestamp.getTime())) {
        throw new EvidenceValidationError('timestamp must be a valid ISO 8601 timestamp');
    }
    if (!evidence.operation_type || evidence.operation_type.length === 0) {
        throw new EvidenceValidationError('operation_type is required');
    }
    if (!Array.isArray(evidence.artifacts)) {
        throw new EvidenceValidationError('artifacts must be an array');
    }
    if (!evidence.hash || evidence.hash.length === 0) {
        throw new EvidenceValidationError('hash is required');
    }
    if (!evidence.hash.startsWith('sha256:')) {
        throw new EvidenceValidationError('hash must start with sha256:');
    }
    if (!Array.isArray(evidence.raw_evidence_refs)) {
        throw new EvidenceValidationError('raw_evidence_refs must be an array');
    }
    if (typeof evidence.atomic_operation !== 'boolean') {
        throw new EvidenceValidationError('atomic_operation must be a boolean');
    }
    if (typeof evidence.integrity_validated !== 'boolean') {
        throw new EvidenceValidationError('integrity_validated must be a boolean');
    }
    return true;
}
/**
 * Add artifact to evidence
 */
function addArtifact(evidence, artifact) {
    const newArtifacts = [...evidence.artifacts, artifact];
    return {
        ...evidence,
        artifacts: newArtifacts,
        hash: calculateHash(newArtifacts),
    };
}
/**
 * Mark evidence as integrity validated
 */
function markIntegrityValidated(evidence) {
    return {
        ...evidence,
        integrity_validated: true,
    };
}
/**
 * Add raw evidence reference
 */
function addRawEvidenceRef(evidence, ref) {
    return {
        ...evidence,
        raw_evidence_refs: [...evidence.raw_evidence_refs, ref],
    };
}
/**
 * Verify evidence hash matches artifacts
 */
function verifyEvidenceHash(evidence) {
    const expectedHash = calculateHash(evidence.artifacts);
    return evidence.hash === expectedHash;
}
//# sourceMappingURL=evidence.js.map