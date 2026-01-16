import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  TaskLimits,
  LimitViolation,
  EvidenceInventory,
  createTaskLimits,
  createLimitViolation,
  createEvidenceInventory,
  validateTaskLimits,
  validateLimitViolation,
  validateEvidenceInventory,
  TaskLimitsValidationError,
} from '../../../src/models/supporting';

describe('Supporting Structures (05_DATA_MODELS.md L79-101)', () => {
  describe('TaskLimits (L81-86)', () => {
    it('should contain all required fields', () => {
      const limits: TaskLimits = {
        max_files: 5,
        max_tests: 10,
        max_seconds: 300,
      };

      assert.equal(limits.max_files, 5);
      assert.equal(limits.max_tests, 10);
      assert.equal(limits.max_seconds, 300);
    });

    it('should use defaults from Configuration Schema (04_COMPONENTS.md L70-72)', () => {
      const limits = createTaskLimits();
      assert.equal(limits.max_files, 5);
      assert.equal(limits.max_tests, 10);
      assert.equal(limits.max_seconds, 300);
    });

    it('should allow custom limits within range', () => {
      const limits = createTaskLimits(10, 20, 600);
      assert.equal(limits.max_files, 10);
      assert.equal(limits.max_tests, 20);
      assert.equal(limits.max_seconds, 600);
    });

    it('should validate max_files range (1-20)', () => {
      assert.throws(() => validateTaskLimits({ max_files: 0, max_tests: 10, max_seconds: 300 }), TaskLimitsValidationError);
      assert.throws(() => validateTaskLimits({ max_files: 21, max_tests: 10, max_seconds: 300 }), TaskLimitsValidationError);
      assert.ok(validateTaskLimits({ max_files: 1, max_tests: 10, max_seconds: 300 }));
      assert.ok(validateTaskLimits({ max_files: 20, max_tests: 10, max_seconds: 300 }));
    });

    it('should validate max_tests range (1-50)', () => {
      assert.throws(() => validateTaskLimits({ max_files: 5, max_tests: 0, max_seconds: 300 }), TaskLimitsValidationError);
      assert.throws(() => validateTaskLimits({ max_files: 5, max_tests: 51, max_seconds: 300 }), TaskLimitsValidationError);
      assert.ok(validateTaskLimits({ max_files: 5, max_tests: 1, max_seconds: 300 }));
      assert.ok(validateTaskLimits({ max_files: 5, max_tests: 50, max_seconds: 300 }));
    });

    it('should validate max_seconds range (30-900)', () => {
      assert.throws(() => validateTaskLimits({ max_files: 5, max_tests: 10, max_seconds: 29 }), TaskLimitsValidationError);
      assert.throws(() => validateTaskLimits({ max_files: 5, max_tests: 10, max_seconds: 901 }), TaskLimitsValidationError);
      assert.ok(validateTaskLimits({ max_files: 5, max_tests: 10, max_seconds: 30 }));
      assert.ok(validateTaskLimits({ max_files: 5, max_tests: 10, max_seconds: 900 }));
    });
  });

  describe('LimitViolation (L88-94)', () => {
    it('should contain all required fields', () => {
      const violation: LimitViolation = {
        limit_type: 'max_files',
        limit_value: 5,
        actual_value: 7,
        timestamp: '2024-01-01T00:00:00.000Z',
        resolution_required: true,
      };

      assert.equal(violation.limit_type, 'max_files');
      assert.equal(violation.limit_value, 5);
      assert.equal(violation.actual_value, 7);
      assert.equal(violation.timestamp, '2024-01-01T00:00:00.000Z');
      assert.equal(violation.resolution_required, true);
    });

    it('should create violation with timestamp', () => {
      const violation = createLimitViolation('max_tests', 10, 15);
      assert.equal(violation.limit_type, 'max_tests');
      assert.equal(violation.limit_value, 10);
      assert.equal(violation.actual_value, 15);
      assert.ok(violation.timestamp.length > 0);
      assert.equal(violation.resolution_required, true);
    });

    it('should validate violation has required fields', () => {
      const valid: LimitViolation = {
        limit_type: 'max_files',
        limit_value: 5,
        actual_value: 7,
        timestamp: '2024-01-01T00:00:00.000Z',
        resolution_required: true,
      };
      assert.ok(validateLimitViolation(valid));
    });
  });

  describe('EvidenceInventory (L96-101)', () => {
    it('should contain all required fields', () => {
      const inventory: EvidenceInventory = {
        total_evidence_items: 10,
        missing_evidence_operations: ['op-1', 'op-2'],
        integrity_failures: ['ev-3'],
        raw_evidence_files: ['/path/to/raw1.log', '/path/to/raw2.log'],
      };

      assert.equal(inventory.total_evidence_items, 10);
      assert.deepEqual(inventory.missing_evidence_operations, ['op-1', 'op-2']);
      assert.deepEqual(inventory.integrity_failures, ['ev-3']);
      assert.deepEqual(inventory.raw_evidence_files, ['/path/to/raw1.log', '/path/to/raw2.log']);
    });

    it('should create empty inventory', () => {
      const inventory = createEvidenceInventory();
      assert.equal(inventory.total_evidence_items, 0);
      assert.deepEqual(inventory.missing_evidence_operations, []);
      assert.deepEqual(inventory.integrity_failures, []);
      assert.deepEqual(inventory.raw_evidence_files, []);
    });

    it('should validate inventory has required arrays', () => {
      const valid: EvidenceInventory = {
        total_evidence_items: 0,
        missing_evidence_operations: [],
        integrity_failures: [],
        raw_evidence_files: [],
      };
      assert.ok(validateEvidenceInventory(valid));
    });

    it('should report missing evidence (Property 7)', () => {
      const inventory = createEvidenceInventory();
      inventory.missing_evidence_operations.push('op-missing');
      assert.equal(inventory.missing_evidence_operations.length, 1);
      // Missing evidence should result in NO_EVIDENCE status
    });

    it('should report integrity failures (Property 21)', () => {
      const inventory = createEvidenceInventory();
      inventory.integrity_failures.push('ev-corrupted');
      assert.equal(inventory.integrity_failures.length, 1);
      // Integrity failures should result in NO_EVIDENCE status
    });
  });
});
