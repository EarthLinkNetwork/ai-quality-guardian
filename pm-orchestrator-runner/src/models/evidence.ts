/**
 * Evidence Model
 * Based on 05_DATA_MODELS.md L39-52
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

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
export class EvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceValidationError';
  }
}

/**
 * Calculate SHA256 hash from artifacts
 */
function calculateHash(artifacts: Artifact[]): string {
  const hash = createHash('sha256');

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
export function createEvidence(
  operationType: string,
  artifacts: Artifact[],
  executorId?: string,
  rawLogs?: string
): Evidence {
  return {
    evidence_id: `evidence-${uuidv4()}`,
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
export function validateEvidence(evidence: Evidence): boolean {
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
export function addArtifact(evidence: Evidence, artifact: Artifact): Evidence {
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
export function markIntegrityValidated(evidence: Evidence): Evidence {
  return {
    ...evidence,
    integrity_validated: true,
  };
}

/**
 * Add raw evidence reference
 */
export function addRawEvidenceRef(evidence: Evidence, ref: string): Evidence {
  return {
    ...evidence,
    raw_evidence_refs: [...evidence.raw_evidence_refs, ref],
  };
}

/**
 * Verify evidence hash matches artifacts
 */
export function verifyEvidenceHash(evidence: Evidence): boolean {
  const expectedHash = calculateHash(evidence.artifacts);
  return evidence.hash === expectedHash;
}
