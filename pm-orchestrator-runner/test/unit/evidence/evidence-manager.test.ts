import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  EvidenceManager,
  EvidenceManagerError,
} from '../../../src/evidence/evidence-manager';
import { Evidence } from '../../../src/models/evidence';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Evidence Manager (04_COMPONENTS.md L133-154)', () => {
  let tempDir: string;
  let evidenceManager: EvidenceManager;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-evidence-test-'));
    sessionId = 'test-session-' + Date.now();
    evidenceManager = new EvidenceManager(tempDir);
    // Initialize evidence directory for session
    evidenceManager.initializeSession(sessionId);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Evidence Collection (04_COMPONENTS.md L139)', () => {
    it('should collect evidence with all required fields', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-001',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        executor_id: 'exec-001',
        artifacts: [{ path: '/test.ts', content: 'test content' }],
        hash: 'sha256:abc123',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      const collected = evidenceManager.getEvidence(sessionId, evidence.evidence_id);
      assert.equal(collected.evidence_id, evidence.evidence_id);
    });

    it('should store evidence in evidence directory', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-002',
        timestamp: new Date().toISOString(),
        operation_type: 'test_run',
        artifacts: [],
        hash: 'sha256:def456',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);

      // Evidence should be stored in session's evidence directory
      const evidenceDir = path.join(tempDir, sessionId);
      assert.ok(fs.existsSync(evidenceDir));
    });
  });

  describe('Hash Verification (04_COMPONENTS.md L140)', () => {
    it('should verify evidence hash on retrieval', () => {
      const content = 'test content';
      const hash = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');

      const evidence: Evidence = {
        evidence_id: 'ev-003',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [{ path: '/test.ts', content }],
        hash,
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      const verified = evidenceManager.verifyEvidence(sessionId, evidence.evidence_id);
      assert.ok(verified);
    });

    it('should detect hash mismatch (E304)', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-004',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [{ path: '/test.ts', content: 'original' }],
        hash: 'sha256:' + crypto.createHash('sha256').update('different').digest('hex'),
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);

      assert.throws(
        () => evidenceManager.verifyEvidence(sessionId, evidence.evidence_id),
        (err: Error) => {
          return err instanceof EvidenceManagerError &&
            (err as EvidenceManagerError).code === ErrorCode.E304_EVIDENCE_HASH_MISMATCH;
        }
      );
    });
  });

  describe('Evidence Index Management (04_COMPONENTS.md L141)', () => {
    it('should create evidence_index.json', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-005',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      evidenceManager.finalizeSession(sessionId);

      const indexPath = path.join(tempDir, sessionId, 'evidence_index.json');
      assert.ok(fs.existsSync(indexPath));
    });

    it('should create evidence_index.sha256 (User Clarification: hashes only evidence_index.json)', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-006',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      evidenceManager.finalizeSession(sessionId);

      const sha256Path = path.join(tempDir, sessionId, 'evidence_index.sha256');
      assert.ok(fs.existsSync(sha256Path));
    });

    it('evidence_index.sha256 should contain hash of evidence_index.json only', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-007',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      evidenceManager.finalizeSession(sessionId);

      const indexPath = path.join(tempDir, sessionId, 'evidence_index.json');
      const sha256Path = path.join(tempDir, sessionId, 'evidence_index.sha256');

      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      const expectedHash = crypto.createHash('sha256').update(indexContent).digest('hex');
      const storedHash = fs.readFileSync(sha256Path, 'utf-8').trim();

      assert.equal(storedHash, expectedHash);
    });

    it('should detect evidence_index.json modification (E304)', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-008',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      evidenceManager.finalizeSession(sessionId);

      // Modify evidence_index.json after finalization
      const indexPath = path.join(tempDir, sessionId, 'evidence_index.json');
      const indexContent = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      indexContent.tampered = true;
      fs.writeFileSync(indexPath, JSON.stringify(indexContent));

      assert.throws(
        () => evidenceManager.verifySessionIntegrity(sessionId),
        (err: Error) => {
          return err instanceof EvidenceManagerError &&
            (err as EvidenceManagerError).code === ErrorCode.E304_EVIDENCE_HASH_MISMATCH;
        }
      );
    });

    it('evidence_index should list all evidence items', () => {
      const evidence1: Evidence = {
        evidence_id: 'ev-009a',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test1',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };
      const evidence2: Evidence = {
        evidence_id: 'ev-009b',
        timestamp: new Date().toISOString(),
        operation_type: 'test_run',
        artifacts: [],
        hash: 'sha256:test2',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence1);
      evidenceManager.recordEvidence(sessionId, evidence2);
      evidenceManager.finalizeSession(sessionId);

      const indexPath = path.join(tempDir, sessionId, 'evidence_index.json');
      const indexContent = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      assert.equal(indexContent.evidence_items.length, 2);
      assert.ok(indexContent.evidence_items.some((e: any) => e.evidence_id === 'ev-009a'));
      assert.ok(indexContent.evidence_items.some((e: any) => e.evidence_id === 'ev-009b'));
    });
  });

  describe('Atomic Evidence Recording (04_COMPONENTS.md L149-154)', () => {
    it('each logical operation should have exactly one evidence (Property 18)', () => {
      // Each recordEvidence call = one logical operation = one evidence
      const evidence: Evidence = {
        evidence_id: 'ev-010',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      const allEvidence = evidenceManager.listEvidence(sessionId);
      assert.equal(allEvidence.length, 1);
    });

    it('atomic_operation must be true for evidence (Property 18)', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-011',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: false, // Invalid
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      assert.throws(
        () => evidenceManager.recordEvidence(sessionId, evidence),
        (err: Error) => {
          return err instanceof EvidenceManagerError &&
            (err as EvidenceManagerError).code === ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE;
        }
      );
    });

    it('should reject evidence aggregation (Property 18)', () => {
      // Evidence aggregation is prohibited
      const aggregatedEvidence: Evidence = {
        evidence_id: 'ev-012',
        timestamp: new Date().toISOString(),
        operation_type: 'multiple_operations', // Indicates aggregation
        artifacts: [
          { path: '/file1.ts', content: 'content1' },
          { path: '/file2.ts', content: 'content2' },
        ],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
        aggregated: true, // Flag indicating aggregation
      } as Evidence & { aggregated: boolean };

      // Evidence Manager should reject aggregated evidence
      assert.throws(
        () => evidenceManager.recordEvidence(sessionId, aggregatedEvidence),
        (err: Error) => {
          return err instanceof EvidenceManagerError;
        }
      );
    });

    it('missing evidence should result in NO_EVIDENCE status', () => {
      // If no evidence is recorded for an operation, status should be NO_EVIDENCE
      const inventory = evidenceManager.getEvidenceInventory(sessionId);

      // Empty session should have zero evidence items
      assert.equal(inventory.total_evidence_items, 0);
    });
  });

  describe('Evidence Storage Structure (04_COMPONENTS.md L145-148)', () => {
    it('should store raw_logs in raw_logs directory', () => {
      const rawLogContent = 'Raw log content from executor';
      const rawLogPath = evidenceManager.storeRawLog(sessionId, 'exec-001', rawLogContent);

      assert.ok(rawLogPath.includes('raw_logs'));
      assert.ok(fs.existsSync(rawLogPath));
      assert.equal(fs.readFileSync(rawLogPath, 'utf-8'), rawLogContent);
    });

    it('should generate report.json on finalization', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-013',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      evidenceManager.finalizeSession(sessionId);

      const reportPath = path.join(tempDir, sessionId, 'report.json');
      assert.ok(fs.existsSync(reportPath));
    });
  });

  describe('Evidence Inventory (05_DATA_MODELS.md L96-101)', () => {
    it('should track total evidence items', () => {
      for (let i = 1; i <= 5; i++) {
        evidenceManager.recordEvidence(sessionId, {
          evidence_id: `ev-inv-${i}`,
          timestamp: new Date().toISOString(),
          operation_type: 'file_write',
          artifacts: [],
          hash: `sha256:test${i}`,
          raw_logs: '/path/to/raw.log',
          atomic_operation: true,
          raw_evidence_refs: [],
          integrity_validated: false,
        });
      }

      const inventory = evidenceManager.getEvidenceInventory(sessionId);
      assert.equal(inventory.total_evidence_items, 5);
    });

    it('should track missing evidence operations (Property 7)', () => {
      // Simulate operation without evidence
      evidenceManager.registerOperation(sessionId, 'op-missing-1');
      evidenceManager.registerOperation(sessionId, 'op-missing-2');

      // Only record evidence for one operation
      evidenceManager.recordEvidence(sessionId, {
        evidence_id: 'ev-has',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        operation_id: 'op-missing-1', // Associate with operation
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      } as Evidence & { operation_id: string });

      const inventory = evidenceManager.getEvidenceInventory(sessionId);
      assert.ok(inventory.missing_evidence_operations.includes('op-missing-2'));
    });

    it('should track integrity failures (Property 21)', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-integrity',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [{ path: '/test.ts', content: 'content' }],
        hash: 'sha256:wrong_hash',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);

      // Attempt to verify (will fail)
      try {
        evidenceManager.verifyEvidence(sessionId, evidence.evidence_id);
      } catch {
        // Expected to fail
      }

      const inventory = evidenceManager.getEvidenceInventory(sessionId);
      assert.ok(inventory.integrity_failures.includes(evidence.evidence_id));
    });

    it('should list raw evidence files', () => {
      evidenceManager.storeRawLog(sessionId, 'exec-001', 'log1');
      evidenceManager.storeRawLog(sessionId, 'exec-002', 'log2');

      const inventory = evidenceManager.getEvidenceInventory(sessionId);
      assert.equal(inventory.raw_evidence_files.length, 2);
    });
  });

  describe('Error Handling', () => {
    it('should throw E301 for evidence collection failure', () => {
      // Try to record evidence for non-existent session
      assert.throws(
        () => evidenceManager.recordEvidence('non-existent-session', {
          evidence_id: 'ev-error',
          timestamp: new Date().toISOString(),
          operation_type: 'file_write',
          artifacts: [],
          hash: 'sha256:test',
          raw_logs: '/path/to/raw.log',
          atomic_operation: true,
          raw_evidence_refs: [],
          integrity_validated: false,
        }),
        (err: Error) => {
          return err instanceof EvidenceManagerError &&
            (err as EvidenceManagerError).code === ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE;
        }
      );
    });

    it('should throw E302 for evidence index corruption', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-corrupt',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/path/to/raw.log',
        atomic_operation: true,
        raw_evidence_refs: [],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);
      evidenceManager.finalizeSession(sessionId);

      // Corrupt the evidence_index.json
      const indexPath = path.join(tempDir, sessionId, 'evidence_index.json');
      fs.writeFileSync(indexPath, 'invalid json {{{');

      assert.throws(
        () => evidenceManager.loadEvidenceIndex(sessionId),
        (err: Error) => {
          return err instanceof EvidenceManagerError &&
            (err as EvidenceManagerError).code === ErrorCode.E302_EVIDENCE_INDEX_CORRUPTION;
        }
      );
    });

    it('should throw E303 for raw log missing', () => {
      const evidence: Evidence = {
        evidence_id: 'ev-no-raw',
        timestamp: new Date().toISOString(),
        operation_type: 'file_write',
        artifacts: [],
        hash: 'sha256:test',
        raw_logs: '/non/existent/path.log',
        atomic_operation: true,
        raw_evidence_refs: ['/non/existent/ref.log'],
        integrity_validated: false,
      };

      evidenceManager.recordEvidence(sessionId, evidence);

      assert.throws(
        () => evidenceManager.verifyRawLogs(sessionId, evidence.evidence_id),
        (err: Error) => {
          return err instanceof EvidenceManagerError &&
            (err as EvidenceManagerError).code === ErrorCode.E303_RAW_LOG_MISSING;
        }
      );
    });
  });
});
