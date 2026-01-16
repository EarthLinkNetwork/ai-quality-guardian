import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  ExecutionResult,
  createExecutionResult,
  validateExecutionResult,
  ExecutionResultValidationError,
} from '../../../src/models/execution-result';
import { OverallStatus } from '../../../src/models/enums';

describe('ExecutionResult (05_DATA_MODELS.md L65-78)', () => {
  describe('ExecutionResult structure', () => {
    it('should contain all required fields', () => {
      const result: ExecutionResult = {
        overall_status: OverallStatus.COMPLETE,
        tasks: [],
        evidence_summary: { total: 0, collected: 0 },
        next_action: true,
        next_action_reason: 'All tasks completed successfully',
        violations: [],
        session_id: 'session-001',
        incomplete_task_reasons: [],
        evidence_inventory: {
          total_evidence_items: 0,
          missing_evidence_operations: [],
          integrity_failures: [],
          raw_evidence_files: [],
        },
        speculative_language_detected: false,
      };

      assert.equal(result.overall_status, OverallStatus.COMPLETE);
      assert.deepEqual(result.tasks, []);
      assert.deepEqual(result.evidence_summary, { total: 0, collected: 0 });
      assert.equal(result.next_action, true);
      assert.equal(result.next_action_reason, 'All tasks completed successfully');
      assert.deepEqual(result.violations, []);
      assert.equal(result.session_id, 'session-001');
      assert.deepEqual(result.incomplete_task_reasons, []);
      assert.deepEqual(result.evidence_inventory, {
        total_evidence_items: 0,
        missing_evidence_operations: [],
        integrity_failures: [],
        raw_evidence_files: [],
      });
      assert.equal(result.speculative_language_detected, false);
    });
  });

  describe('OverallStatus values (05_DATA_MODELS.md L104)', () => {
    it('should support COMPLETE', () => {
      const result = createExecutionResult('session-001', OverallStatus.COMPLETE, []);
      assert.equal(result.overall_status, OverallStatus.COMPLETE);
    });

    it('should support INCOMPLETE', () => {
      const result = createExecutionResult('session-001', OverallStatus.INCOMPLETE, []);
      assert.equal(result.overall_status, OverallStatus.INCOMPLETE);
    });

    it('should support ERROR', () => {
      const result = createExecutionResult('session-001', OverallStatus.ERROR, []);
      assert.equal(result.overall_status, OverallStatus.ERROR);
    });

    it('should support INVALID', () => {
      const result = createExecutionResult('session-001', OverallStatus.INVALID, []);
      assert.equal(result.overall_status, OverallStatus.INVALID);
    });

    it('should support NO_EVIDENCE', () => {
      const result = createExecutionResult('session-001', OverallStatus.NO_EVIDENCE, []);
      assert.equal(result.overall_status, OverallStatus.NO_EVIDENCE);
    });
  });

  describe('validateExecutionResult', () => {
    it('should accept valid result', () => {
      const result: ExecutionResult = {
        overall_status: OverallStatus.COMPLETE,
        tasks: [],
        evidence_summary: { total: 0, collected: 0 },
        next_action: false,
        next_action_reason: 'Session complete',
        violations: [],
        session_id: 'session-001',
        incomplete_task_reasons: [],
        evidence_inventory: {
          total_evidence_items: 0,
          missing_evidence_operations: [],
          integrity_failures: [],
          raw_evidence_files: [],
        },
        speculative_language_detected: false,
      };
      assert.ok(validateExecutionResult(result));
    });

    it('should reject result without session_id', () => {
      const result = {
        overall_status: OverallStatus.COMPLETE,
        tasks: [],
        evidence_summary: { total: 0, collected: 0 },
        next_action: false,
        next_action_reason: 'Session complete',
        violations: [],
        incomplete_task_reasons: [],
        evidence_inventory: {
          total_evidence_items: 0,
          missing_evidence_operations: [],
          integrity_failures: [],
          raw_evidence_files: [],
        },
        speculative_language_detected: false,
      } as unknown as ExecutionResult;
      assert.throws(() => validateExecutionResult(result), ExecutionResultValidationError);
    });

    it('should reject result without next_action_reason', () => {
      const result = {
        overall_status: OverallStatus.COMPLETE,
        tasks: [],
        evidence_summary: { total: 0, collected: 0 },
        next_action: false,
        violations: [],
        session_id: 'session-001',
        incomplete_task_reasons: [],
        evidence_inventory: {
          total_evidence_items: 0,
          missing_evidence_operations: [],
          integrity_failures: [],
          raw_evidence_files: [],
        },
        speculative_language_detected: false,
      } as unknown as ExecutionResult;
      assert.throws(() => validateExecutionResult(result), ExecutionResultValidationError);
    });
  });

  describe('next_action determination (Property 10)', () => {
    it('COMPLETE status should allow next_action', () => {
      const result = createExecutionResult('session-001', OverallStatus.COMPLETE, []);
      assert.equal(result.next_action, true);
    });

    it('ERROR status should not allow next_action', () => {
      const result = createExecutionResult('session-001', OverallStatus.ERROR, []);
      assert.equal(result.next_action, false);
    });

    it('INVALID status should not allow next_action', () => {
      const result = createExecutionResult('session-001', OverallStatus.INVALID, []);
      assert.equal(result.next_action, false);
    });

    it('NO_EVIDENCE status should not allow next_action', () => {
      const result = createExecutionResult('session-001', OverallStatus.NO_EVIDENCE, []);
      assert.equal(result.next_action, false);
    });

    it('INCOMPLETE status with continuation_approved may allow next_action', () => {
      // This depends on explicit continuation approval
      const result = createExecutionResult('session-001', OverallStatus.INCOMPLETE, []);
      // Default is false until explicit approval
      assert.equal(result.next_action, false);
    });
  });

  describe('speculative_language_detected (Property 8)', () => {
    it('should default to false', () => {
      const result = createExecutionResult('session-001', OverallStatus.COMPLETE, []);
      assert.equal(result.speculative_language_detected, false);
    });

    it('should prevent COMPLETE status when true', () => {
      // If speculative language is detected, status cannot be COMPLETE
      const result: ExecutionResult = {
        overall_status: OverallStatus.COMPLETE,
        tasks: [],
        evidence_summary: { total: 0, collected: 0 },
        next_action: false,
        next_action_reason: 'Test',
        violations: [],
        session_id: 'session-001',
        incomplete_task_reasons: [],
        evidence_inventory: {
          total_evidence_items: 0,
          missing_evidence_operations: [],
          integrity_failures: [],
          raw_evidence_files: [],
        },
        speculative_language_detected: true,
      };
      assert.throws(() => validateExecutionResult(result), ExecutionResultValidationError);
    });
  });
});
