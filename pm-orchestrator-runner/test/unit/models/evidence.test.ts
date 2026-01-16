import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  Evidence,
  createEvidence,
  validateEvidence,
  EvidenceValidationError,
} from '../../../src/models/evidence';

describe('Evidence (05_DATA_MODELS.md L39-52)', () => {
  describe('Evidence structure', () => {
    it('should contain all required fields', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-001',
        timestamp: '2024-01-01T00:00:00.000Z',
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:abc123',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: true,
      };

      assert.equal(evidence.evidence_id, 'ev-001');
      assert.equal(evidence.timestamp, '2024-01-01T00:00:00.000Z');
      assert.equal(evidence.operation_type, 'file_write');
      assert.equal(evidence.executor_id, undefined);
      assert.deepEqual(evidence.artifacts, []);
      assert.equal(evidence.hash, 'sha256:abc123');
      assert.equal(evidence.raw_logs, '/path/to/raw.log');
      assert.equal(evidence.atomic_operation, true);
      assert.deepEqual(evidence.raw_evidence_refs, []);
      assert.equal(evidence.integrity_validated, true);
    });

    it('should allow optional executor_id', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-002',
        timestamp: '2024-01-01T00:00:00.000Z',
        operation_type: 'test_run',
        executor_id: 'executor-1',
        artifacts: [],
        hash: 'sha256:def456',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      assert.equal(evidence.executor_id, 'executor-1');
    });
  });

  describe('createEvidence', () => {
    it('should create evidence with generated ID and timestamp', () => {
      const evidence = createEvidence('file_write', []);
      assert.ok(evidence.evidence_id.length > 0);
      assert.ok(evidence.timestamp.length > 0);
      assert.equal(evidence.operation_type, 'file_write');
      assert.equal(evidence.atomic_operation, true);
      assert.equal(evidence.integrity_validated, false);
    });

    it('should generate unique evidence IDs', () => {
      const ev1 = createEvidence('op1', []);
      const ev2 = createEvidence('op2', []);
      assert.notEqual(ev1.evidence_id, ev2.evidence_id);
    });

    it('should calculate hash from content', () => {
      const evidence = createEvidence('file_write', [{ path: '/test.ts', content: 'test' }]);
      assert.ok(evidence.hash.startsWith('sha256:'));
      assert.ok(evidence.hash.length > 10);
    });
  });

  describe('validateEvidence', () => {
    it('should accept valid evidence', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-001',
        timestamp: '2024-01-01T00:00:00.000Z',
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:abc123',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: true,
      };
      assert.ok(validateEvidence(evidence));
    });

    it('should reject evidence without evidence_id', () => {
      const evidence = {
        timestamp: '2024-01-01T00:00:00.000Z',
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:abc123',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: true,
      } as unknown as Evidence;
      assert.throws(() => validateEvidence(evidence), EvidenceValidationError);
    });

    it('should reject evidence with invalid timestamp', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-001',
        timestamp: 'invalid-timestamp',
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:abc123',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: true,
      };
      assert.throws(() => validateEvidence(evidence), EvidenceValidationError);
    });

    it('should reject evidence without operation_type', () => {
      const evidence = {
        evidence_id: 'ev-001',
        timestamp: '2024-01-01T00:00:00.000Z',
        artifacts: [],
        hash: 'sha256:abc123',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: true,
      } as unknown as Evidence;
      assert.throws(() => validateEvidence(evidence), EvidenceValidationError);
    });

    it('should reject evidence without hash', () => {
      const evidence = {
        evidence_id: 'ev-001',
        timestamp: '2024-01-01T00:00:00.000Z',
        operation_type: 'file_write',
        artifacts: [],
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: true,
      } as unknown as Evidence;
      assert.throws(() => validateEvidence(evidence), EvidenceValidationError);
    });
  });

  describe('Atomic Evidence Recording (Property 18)', () => {
    it('atomic_operation must be true for valid evidence', () => {
      const evidence = createEvidence('file_write', []);
      assert.equal(evidence.atomic_operation, true);
    });
  });
});
