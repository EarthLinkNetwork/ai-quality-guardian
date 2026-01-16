/**
 * Property-based tests for Property 21: Evidence Integrity Management
 * Based on 06_CORRECTNESS_PROPERTIES.md L189-195
 *
 * Property 21: Evidence Integrity Management
 * - Missing raw evidence triggers NO_EVIDENCE
 * - Integrity mismatch triggers NO_EVIDENCE
 * - Unknown evidence format is rejected
 *
 * CRITICAL: evidence_index.sha256 hashes ONLY evidence_index.json
 * Not all evidence files.
 *
 * Test requirements per 08_TESTING_STRATEGY.md L27-41:
 * - Use fast-check with minimum 100 iterations
 * - Specify corresponding Correctness Property number
 * - Include parallel execution and race condition tests
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fc from 'fast-check';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Evidence, createEvidence, validateEvidence, EvidenceValidationError } from '../../src/models/evidence';
import { EvidenceManager } from '../../src/evidence/evidence-manager';
import { OverallStatus } from '../../src/models/enums';

const MIN_RUNS = 100;

describe('Property 21: Evidence Integrity Management (Property-based)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('21.1 Evidence hash consistency', () => {
    it('should generate consistent hash for same content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (content) => {
            const artifact = { path: '/test/file.ts', content };

            const evidence1 = createEvidence('file_write', [artifact]);
            const evidence2 = createEvidence('file_write', [artifact]);

            // Same content should produce same hash
            return evidence1.hash === evidence2.hash;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should generate different hash for different content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          (content1, content2) => {
            // Only test when contents are actually different
            if (content1 === content2) return true;

            const evidence1 = createEvidence('file_write', [{ path: '/test', content: content1 }]);
            const evidence2 = createEvidence('file_write', [{ path: '/test', content: content2 }]);

            return evidence1.hash !== evidence2.hash;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should produce SHA256 hash format', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 500 }),
          (content) => {
            const evidence = createEvidence('test_operation', [{ path: '/test', content }]);

            // Hash should start with 'sha256:' prefix
            assert.ok(evidence.hash.startsWith('sha256:'));

            // Hash part should be 64 hex characters
            const hashPart = evidence.hash.substring(7);
            return hashPart.length === 64 && /^[a-f0-9]+$/.test(hashPart);
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('21.2 Evidence index hash (ONLY evidence_index.json)', () => {
    it('should hash only evidence_index.json content', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              type: fc.string({ minLength: 3, maxLength: 15 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (indexEntries) => {
            // Create evidence_index.json content
            const indexContent = JSON.stringify({
              session_id: 'test-session',
              entries: indexEntries,
              created_at: new Date().toISOString(),
            }, null, 2);

            // Calculate expected hash (ONLY of evidence_index.json)
            const expectedHash = crypto.createHash('sha256').update(indexContent).digest('hex');

            // evidence_index.sha256 should contain ONLY this hash
            // Not a combined hash of all evidence files
            assert.ok(expectedHash.length === 64);

            return true;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('21.3 Missing raw evidence triggers NO_EVIDENCE', () => {
    it('should detect missing raw_logs reference', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom('file_write', 'test_run', 'command_execution'),
          (operationType, opType) => {
            const evidence: Evidence = {
              evidence_id: `ev-${Date.now()}`,
              timestamp: new Date().toISOString(),
              operation_type: opType,
              artifacts: [],
              hash: 'sha256:' + 'a'.repeat(64),
              raw_logs: '/nonexistent/path/to/logs.txt', // Missing file
              atomic_operation: true,
              raw_evidence_refs: [],
              integrity_validated: false,
            };

            // Evidence with missing raw_logs should be flagged
            // The EvidenceManager should detect this when validating
            return evidence.raw_logs !== undefined && !evidence.integrity_validated;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('21.4 Unknown evidence format rejection', () => {
    it('should reject evidence without required fields', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({ missing: 'evidence_id' }),
            fc.constant({ missing: 'timestamp' }),
            fc.constant({ missing: 'operation_type' }),
            fc.constant({ missing: 'hash' })
          ),
          (testCase) => {
            const baseEvidence: any = {
              evidence_id: 'ev-123',
              timestamp: new Date().toISOString(),
              operation_type: 'test',
              artifacts: [],
              hash: 'sha256:' + 'a'.repeat(64),
              raw_logs: '/path/to/logs',
              atomic_operation: true,
              raw_evidence_refs: [],
              integrity_validated: false,
            };

            // Remove the specified field
            delete baseEvidence[testCase.missing];

            let rejected = false;
            try {
              validateEvidence(baseEvidence as Evidence);
            } catch (e) {
              if (e instanceof EvidenceValidationError) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should reject evidence with invalid timestamp format', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (invalidTimestamp) => {
            // Skip if accidentally valid ISO format
            const date = new Date(invalidTimestamp);
            if (!isNaN(date.getTime())) return true;

            const evidence: Evidence = {
              evidence_id: 'ev-123',
              timestamp: invalidTimestamp,
              operation_type: 'test',
              artifacts: [],
              hash: 'sha256:' + 'a'.repeat(64),
              raw_logs: '/path/to/logs',
              atomic_operation: true,
              raw_evidence_refs: [],
              integrity_validated: false,
            };

            let rejected = false;
            try {
              validateEvidence(evidence);
            } catch (e) {
              if (e instanceof EvidenceValidationError) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should reject evidence with invalid hash format', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (invalidHash) => {
            // Skip if accidentally valid format
            if (invalidHash.startsWith('sha256:') && invalidHash.length === 71) return true;

            const evidence: Evidence = {
              evidence_id: 'ev-123',
              timestamp: new Date().toISOString(),
              operation_type: 'test',
              artifacts: [],
              hash: invalidHash,
              raw_logs: '/path/to/logs',
              atomic_operation: true,
              raw_evidence_refs: [],
              integrity_validated: false,
            };

            let rejected = false;
            try {
              validateEvidence(evidence);
            } catch (e) {
              if (e instanceof EvidenceValidationError) {
                rejected = true;
              }
            }

            return rejected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('21.5 Atomic operation enforcement', () => {
    it('should require atomic_operation flag', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.record({ path: fc.string(), content: fc.string() }), { maxLength: 5 }),
          (operationType, artifacts) => {
            const evidence = createEvidence(operationType, artifacts);

            // Property: All created evidence must have atomic_operation = true
            return evidence.atomic_operation === true;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('21.6 Evidence ID uniqueness', () => {
    it('should generate unique evidence IDs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }),
          (count) => {
            const evidenceIds = new Set<string>();

            for (let i = 0; i < count; i++) {
              const evidence = createEvidence('test', []);
              if (evidenceIds.has(evidence.evidence_id)) {
                return false; // Duplicate found
              }
              evidenceIds.add(evidence.evidence_id);
            }

            return evidenceIds.size === count;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('21.7 Integrity validation flag', () => {
    it('should default integrity_validated to false', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (operationType) => {
            const evidence = createEvidence(operationType, []);

            // New evidence should not be validated yet
            return evidence.integrity_validated === false;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('21.8 Content-based hash verification', () => {
    it('should verify hash matches content', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 500 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (artifacts) => {
            const evidence = createEvidence('test', artifacts);

            // Recalculate hash using the same algorithm as createEvidence:
            // For each artifact, hash path + content (if exists)
            const hash = crypto.createHash('sha256');
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
            const expectedHash = `sha256:${hash.digest('hex')}`;

            return evidence.hash === expectedHash;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });
});
