import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  ErrorCode,
  ErrorCategory,
  getErrorCategory,
  getErrorMessage,
  isProjectConfigError,
  isLifecycleError,
  isEvidenceError,
  isLockingError,
  isClaudeIntegrationError,
} from '../../../src/errors/error-codes';

describe('Error Codes (07_ERROR_HANDLING.md)', () => {
  describe('E1xx Project and Configuration Errors', () => {
    it('E101 Missing .claude directory', () => {
      assert.equal(ErrorCode.E101_MISSING_CLAUDE_DIRECTORY, 'E101');
      assert.equal(getErrorCategory(ErrorCode.E101_MISSING_CLAUDE_DIRECTORY), ErrorCategory.PROJECT_CONFIG);
      assert.ok(getErrorMessage(ErrorCode.E101_MISSING_CLAUDE_DIRECTORY).includes('.claude'));
    });

    it('E102 Invalid project path', () => {
      assert.equal(ErrorCode.E102_INVALID_PROJECT_PATH, 'E102');
      assert.equal(getErrorCategory(ErrorCode.E102_INVALID_PROJECT_PATH), ErrorCategory.PROJECT_CONFIG);
    });

    it('E103 Configuration file missing', () => {
      assert.equal(ErrorCode.E103_CONFIGURATION_FILE_MISSING, 'E103');
      assert.equal(getErrorCategory(ErrorCode.E103_CONFIGURATION_FILE_MISSING), ErrorCategory.PROJECT_CONFIG);
    });

    it('E104 Configuration schema validation failure', () => {
      assert.equal(ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, 'E104');
      assert.equal(getErrorCategory(ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE), ErrorCategory.PROJECT_CONFIG);
    });

    it('E105 Critical configuration corruption', () => {
      assert.equal(ErrorCode.E105_CRITICAL_CONFIGURATION_CORRUPTION, 'E105');
      assert.equal(getErrorCategory(ErrorCode.E105_CRITICAL_CONFIGURATION_CORRUPTION), ErrorCategory.PROJECT_CONFIG);
    });

    it('E1xx errors prevent execution start', () => {
      const e1xxCodes = [
        ErrorCode.E101_MISSING_CLAUDE_DIRECTORY,
        ErrorCode.E102_INVALID_PROJECT_PATH,
        ErrorCode.E103_CONFIGURATION_FILE_MISSING,
        ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE,
        ErrorCode.E105_CRITICAL_CONFIGURATION_CORRUPTION,
      ];
      e1xxCodes.forEach(code => {
        assert.ok(isProjectConfigError(code), `${code} should be a project config error`);
      });
    });
  });

  describe('E2xx Execution Lifecycle Errors', () => {
    it('E201 Phase execution failure', () => {
      assert.equal(ErrorCode.E201_PHASE_EXECUTION_FAILURE, 'E201');
      assert.equal(getErrorCategory(ErrorCode.E201_PHASE_EXECUTION_FAILURE), ErrorCategory.LIFECYCLE);
    });

    it('E202 Phase skip attempt', () => {
      assert.equal(ErrorCode.E202_PHASE_SKIP_ATTEMPT, 'E202');
      assert.equal(getErrorCategory(ErrorCode.E202_PHASE_SKIP_ATTEMPT), ErrorCategory.LIFECYCLE);
    });

    it('E203 Invalid phase transition', () => {
      assert.equal(ErrorCode.E203_INVALID_PHASE_TRANSITION, 'E203');
      assert.equal(getErrorCategory(ErrorCode.E203_INVALID_PHASE_TRANSITION), ErrorCategory.LIFECYCLE);
    });

    it('E204 Lifecycle violation', () => {
      assert.equal(ErrorCode.E204_LIFECYCLE_VIOLATION, 'E204');
      assert.equal(getErrorCategory(ErrorCode.E204_LIFECYCLE_VIOLATION), ErrorCategory.LIFECYCLE);
    });

    it('E205 Task decomposition failure', () => {
      assert.equal(ErrorCode.E205_TASK_DECOMPOSITION_FAILURE, 'E205');
      assert.equal(getErrorCategory(ErrorCode.E205_TASK_DECOMPOSITION_FAILURE), ErrorCategory.LIFECYCLE);
    });

    it('E2xx errors halt lifecycle immediately', () => {
      const e2xxCodes = [
        ErrorCode.E201_PHASE_EXECUTION_FAILURE,
        ErrorCode.E202_PHASE_SKIP_ATTEMPT,
        ErrorCode.E203_INVALID_PHASE_TRANSITION,
        ErrorCode.E204_LIFECYCLE_VIOLATION,
        ErrorCode.E205_TASK_DECOMPOSITION_FAILURE,
      ];
      e2xxCodes.forEach(code => {
        assert.ok(isLifecycleError(code), `${code} should be a lifecycle error`);
      });
    });
  });

  describe('E3xx Evidence Errors', () => {
    it('E301 Evidence collection failure', () => {
      assert.equal(ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE, 'E301');
      assert.equal(getErrorCategory(ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE), ErrorCategory.EVIDENCE);
    });

    it('E302 Evidence validation failure', () => {
      assert.equal(ErrorCode.E302_EVIDENCE_VALIDATION_FAILURE, 'E302');
      assert.equal(getErrorCategory(ErrorCode.E302_EVIDENCE_VALIDATION_FAILURE), ErrorCategory.EVIDENCE);
    });

    it('E303 Missing evidence artifacts', () => {
      assert.equal(ErrorCode.E303_MISSING_EVIDENCE_ARTIFACTS, 'E303');
      assert.equal(getErrorCategory(ErrorCode.E303_MISSING_EVIDENCE_ARTIFACTS), ErrorCategory.EVIDENCE);
    });

    it('E304 Evidence integrity violation', () => {
      assert.equal(ErrorCode.E304_EVIDENCE_INTEGRITY_VIOLATION, 'E304');
      assert.equal(getErrorCategory(ErrorCode.E304_EVIDENCE_INTEGRITY_VIOLATION), ErrorCategory.EVIDENCE);
    });

    it('E305 Evidence format unknown', () => {
      assert.equal(ErrorCode.E305_EVIDENCE_FORMAT_UNKNOWN, 'E305');
      assert.equal(getErrorCategory(ErrorCode.E305_EVIDENCE_FORMAT_UNKNOWN), ErrorCategory.EVIDENCE);
    });

    it('E3xx errors result in NO_EVIDENCE status', () => {
      const e3xxCodes = [
        ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE,
        ErrorCode.E302_EVIDENCE_VALIDATION_FAILURE,
        ErrorCode.E303_MISSING_EVIDENCE_ARTIFACTS,
        ErrorCode.E304_EVIDENCE_INTEGRITY_VIOLATION,
        ErrorCode.E305_EVIDENCE_FORMAT_UNKNOWN,
      ];
      e3xxCodes.forEach(code => {
        assert.ok(isEvidenceError(code), `${code} should be an evidence error`);
      });
    });
  });

  describe('E4xx Locking and Semaphore Errors', () => {
    it('E401 Lock order violation', () => {
      assert.equal(ErrorCode.E401_LOCK_ORDER_VIOLATION, 'E401');
      assert.equal(getErrorCategory(ErrorCode.E401_LOCK_ORDER_VIOLATION), ErrorCategory.LOCKING);
    });

    it('E402 Lock acquisition failure', () => {
      assert.equal(ErrorCode.E402_LOCK_ACQUISITION_FAILURE, 'E402');
      assert.equal(getErrorCategory(ErrorCode.E402_LOCK_ACQUISITION_FAILURE), ErrorCategory.LOCKING);
    });

    it('E403 Deadlock detected', () => {
      assert.equal(ErrorCode.E403_DEADLOCK_DETECTED, 'E403');
      assert.equal(getErrorCategory(ErrorCode.E403_DEADLOCK_DETECTED), ErrorCategory.LOCKING);
    });

    it('E404 Semaphore limit exceeded', () => {
      assert.equal(ErrorCode.E404_SEMAPHORE_LIMIT_EXCEEDED, 'E404');
      assert.equal(getErrorCategory(ErrorCode.E404_SEMAPHORE_LIMIT_EXCEEDED), ErrorCategory.LOCKING);
    });

    it('E405 Resource release failure', () => {
      assert.equal(ErrorCode.E405_RESOURCE_RELEASE_FAILURE, 'E405');
      assert.equal(getErrorCategory(ErrorCode.E405_RESOURCE_RELEASE_FAILURE), ErrorCategory.LOCKING);
    });

    it('E4xx errors release all locks and stop', () => {
      const e4xxCodes = [
        ErrorCode.E401_LOCK_ORDER_VIOLATION,
        ErrorCode.E402_LOCK_ACQUISITION_FAILURE,
        ErrorCode.E403_DEADLOCK_DETECTED,
        ErrorCode.E404_SEMAPHORE_LIMIT_EXCEEDED,
        ErrorCode.E405_RESOURCE_RELEASE_FAILURE,
      ];
      e4xxCodes.forEach(code => {
        assert.ok(isLockingError(code), `${code} should be a locking error`);
      });
    });
  });

  describe('E5xx Claude Integration Errors', () => {
    it('E501 Session ID missing', () => {
      assert.equal(ErrorCode.E501_SESSION_ID_MISSING, 'E501');
      assert.equal(getErrorCategory(ErrorCode.E501_SESSION_ID_MISSING), ErrorCategory.CLAUDE_INTEGRATION);
    });

    it('E502 Session ID mismatch', () => {
      assert.equal(ErrorCode.E502_SESSION_ID_MISMATCH, 'E502');
      assert.equal(getErrorCategory(ErrorCode.E502_SESSION_ID_MISMATCH), ErrorCategory.CLAUDE_INTEGRATION);
    });

    it('E503 Executor validation failure', () => {
      assert.equal(ErrorCode.E503_EXECUTOR_VALIDATION_FAILURE, 'E503');
      assert.equal(getErrorCategory(ErrorCode.E503_EXECUTOR_VALIDATION_FAILURE), ErrorCategory.CLAUDE_INTEGRATION);
    });

    it('E504 Output interception failure', () => {
      assert.equal(ErrorCode.E504_OUTPUT_INTERCEPTION_FAILURE, 'E504');
      assert.equal(getErrorCategory(ErrorCode.E504_OUTPUT_INTERCEPTION_FAILURE), ErrorCategory.CLAUDE_INTEGRATION);
    });

    it('E505 Communication bypass detected', () => {
      assert.equal(ErrorCode.E505_COMMUNICATION_BYPASS_DETECTED, 'E505');
      assert.equal(getErrorCategory(ErrorCode.E505_COMMUNICATION_BYPASS_DETECTED), ErrorCategory.CLAUDE_INTEGRATION);
    });

    it('E5xx errors result in INVALID status', () => {
      const e5xxCodes = [
        ErrorCode.E501_SESSION_ID_MISSING,
        ErrorCode.E502_SESSION_ID_MISMATCH,
        ErrorCode.E503_EXECUTOR_VALIDATION_FAILURE,
        ErrorCode.E504_OUTPUT_INTERCEPTION_FAILURE,
        ErrorCode.E505_COMMUNICATION_BYPASS_DETECTED,
      ];
      e5xxCodes.forEach(code => {
        assert.ok(isClaudeIntegrationError(code), `${code} should be a Claude integration error`);
      });
    });
  });
});
