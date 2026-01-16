import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  ContinuationControlManager,
  ContinuationControlError,
} from '../../../src/continuation/continuation-control-manager';
import { OverallStatus, TaskStatus } from '../../../src/models/enums';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Continuation Control Manager (04_COMPONENTS.md L156-166)', () => {
  let continuationManager: ContinuationControlManager;

  beforeEach(() => {
    continuationManager = new ContinuationControlManager();
  });

  describe('Automatic Progression Prevention (04_COMPONENTS.md L162)', () => {
    it('should block automatic continuation after partial completion', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: false,
      };

      const canContinue = continuationManager.canContinue(sessionState);

      assert.ok(!canContinue);
    });

    it('should not automatically progress to next phase', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        current_phase: 'execution',
        tasks_completed: 3,
        tasks_total: 3,
        has_explicit_approval: false,
      };

      // Phase complete but no approval
      const canProgressToNextPhase = continuationManager.canProgressPhase(sessionState);

      assert.ok(!canProgressToNextPhase);
    });

    it('should block continuation with ERROR status', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.ERROR,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: false,
      };

      const canContinue = continuationManager.canContinue(sessionState);

      assert.ok(!canContinue);
    });

    it('should block continuation with NO_EVIDENCE status', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.NO_EVIDENCE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: false,
      };

      const canContinue = continuationManager.canContinue(sessionState);

      assert.ok(!canContinue);
    });
  });

  describe('Explicit Approval Requirement (04_COMPONENTS.md L163)', () => {
    it('should require explicit approval for continuation', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: false,
      };

      assert.ok(continuationManager.requiresApproval(sessionState));
    });

    it('should allow continuation with explicit approval', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: true,
      };

      const canContinue = continuationManager.canContinue(sessionState);

      assert.ok(canContinue);
    });

    it('should record approval with timestamp', () => {
      const approval = continuationManager.recordApproval('session-001', 'user-001');

      assert.ok(approval.timestamp);
      assert.equal(approval.session_id, 'session-001');
      assert.equal(approval.approved_by, 'user-001');
    });

    it('should reject approval for non-existent session', () => {
      assert.throws(
        () => continuationManager.recordApproval('', 'user-001'),
        (err: Error) => {
          return err instanceof ContinuationControlError &&
            (err as ContinuationControlError).code === ErrorCode.E201_SESSION_ID_MISSING;
        }
      );
    });
  });

  describe('Continuation Condition Validation (04_COMPONENTS.md L164)', () => {
    it('should validate all preconditions before continuation', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: true,
        evidence_valid: true,
        no_critical_errors: true,
      };

      const validation = continuationManager.validateContinuationConditions(sessionState);

      assert.ok(validation.valid);
      assert.deepEqual(validation.failed_conditions, []);
    });

    it('should fail validation when evidence is invalid', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: true,
        evidence_valid: false,
        no_critical_errors: true,
      };

      const validation = continuationManager.validateContinuationConditions(sessionState);

      assert.ok(!validation.valid);
      assert.ok(validation.failed_conditions.includes('evidence_valid'));
    });

    it('should fail validation when critical errors exist', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: true,
        evidence_valid: true,
        no_critical_errors: false,
      };

      const validation = continuationManager.validateContinuationConditions(sessionState);

      assert.ok(!validation.valid);
      assert.ok(validation.failed_conditions.includes('no_critical_errors'));
    });

    it('should require minimum task progress', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 0,
        tasks_total: 10,
        has_explicit_approval: true,
        evidence_valid: true,
        no_critical_errors: true,
      };

      const validation = continuationManager.validateContinuationConditions(sessionState);

      // No progress means nothing to continue
      assert.ok(!validation.valid);
    });
  });

  describe('Meaningless Continuation Rejection (04_COMPONENTS.md L165)', () => {
    it('should reject continuation when all tasks are complete', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        has_explicit_approval: true,
      };

      assert.throws(
        () => continuationManager.requestContinuation(sessionState),
        (err: Error) => {
          return err instanceof ContinuationControlError &&
            (err as ContinuationControlError).code === ErrorCode.E207_CONTINUATION_REJECTED;
        }
      );
    });

    it('should reject continuation when no remaining work', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
        remaining_work: [],
        has_explicit_approval: true,
      };

      assert.throws(
        () => continuationManager.requestContinuation(sessionState),
        (err: Error) => {
          return err instanceof ContinuationControlError &&
            (err as ContinuationControlError).code === ErrorCode.E207_CONTINUATION_REJECTED;
        }
      );
    });

    it('should reject continuation when status is INVALID', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INVALID,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: true,
      };

      assert.throws(
        () => continuationManager.requestContinuation(sessionState),
        (err: Error) => {
          return err instanceof ContinuationControlError &&
            (err as ContinuationControlError).code === ErrorCode.E207_CONTINUATION_REJECTED;
        }
      );
    });

    it('should reject duplicate continuation requests', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: true,
        continuation_in_progress: true,
      };

      assert.throws(
        () => continuationManager.requestContinuation(sessionState),
        (err: Error) => {
          return err instanceof ContinuationControlError &&
            (err as ContinuationControlError).code === ErrorCode.E207_CONTINUATION_REJECTED;
        }
      );
    });
  });

  describe('Continuation Request Lifecycle', () => {
    it('should create pending continuation request', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        remaining_work: ['task-6', 'task-7'],
        has_explicit_approval: false,
      };

      const request = continuationManager.createContinuationRequest(sessionState);

      assert.equal(request.status, 'pending');
      assert.equal(request.session_id, 'session-001');
      assert.ok(request.requested_at);
    });

    it('should approve pending request', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        remaining_work: ['task-6'],
        has_explicit_approval: false,
      };

      const request = continuationManager.createContinuationRequest(sessionState);
      const approved = continuationManager.approveContinuationRequest(request.request_id);

      assert.equal(approved.status, 'approved');
      assert.ok(approved.approved_at);
    });

    it('should reject pending request', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        remaining_work: ['task-6'],
        has_explicit_approval: false,
      };

      const request = continuationManager.createContinuationRequest(sessionState);
      const rejected = continuationManager.rejectContinuationRequest(request.request_id, 'User cancelled');

      assert.equal(rejected.status, 'rejected');
      assert.equal(rejected.rejection_reason, 'User cancelled');
    });

    it('should expire old pending requests', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        remaining_work: ['task-6'],
        has_explicit_approval: false,
      };

      const request = continuationManager.createContinuationRequest(sessionState);

      // Simulate time passing
      continuationManager.setRequestTimeForTesting(request.request_id, Date.now() - 3600000); // 1 hour ago

      continuationManager.expireOldRequests(1800000); // 30 minute timeout

      const expired = continuationManager.getContinuationRequest(request.request_id);
      assert.equal(expired.status, 'expired');
    });
  });

  describe('next_action Determination (Property 10)', () => {
    it('COMPLETE status should set next_action=true', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.COMPLETE,
        tasks_completed: 10,
        tasks_total: 10,
      };

      const nextAction = continuationManager.determineNextAction(sessionState);

      assert.equal(nextAction.next_action, true);
      assert.ok(nextAction.next_action_reason.includes('complete'));
    });

    it('ERROR status should set next_action=false', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.ERROR,
        tasks_completed: 5,
        tasks_total: 10,
      };

      const nextAction = continuationManager.determineNextAction(sessionState);

      assert.equal(nextAction.next_action, false);
      assert.ok(nextAction.next_action_reason.includes('error'));
    });

    it('INVALID status should set next_action=false', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INVALID,
        tasks_completed: 5,
        tasks_total: 10,
      };

      const nextAction = continuationManager.determineNextAction(sessionState);

      assert.equal(nextAction.next_action, false);
    });

    it('NO_EVIDENCE status should set next_action=false', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.NO_EVIDENCE,
        tasks_completed: 5,
        tasks_total: 10,
      };

      const nextAction = continuationManager.determineNextAction(sessionState);

      assert.equal(nextAction.next_action, false);
    });

    it('INCOMPLETE with approval should set next_action=true', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: true,
        evidence_valid: true,
        no_critical_errors: true,
      };

      const nextAction = continuationManager.determineNextAction(sessionState);

      assert.equal(nextAction.next_action, true);
    });

    it('INCOMPLETE without approval should set next_action=false', () => {
      const sessionState = {
        session_id: 'session-001',
        overall_status: OverallStatus.INCOMPLETE,
        tasks_completed: 5,
        tasks_total: 10,
        has_explicit_approval: false,
      };

      const nextAction = continuationManager.determineNextAction(sessionState);

      assert.equal(nextAction.next_action, false);
      assert.ok(nextAction.next_action_reason.includes('approval'));
    });
  });

  describe('Incomplete Task Reasons Tracking', () => {
    it('should track reasons for incomplete tasks', () => {
      continuationManager.recordIncompleteReason('task-001', 'Resource limit exceeded');
      continuationManager.recordIncompleteReason('task-002', 'Dependency failed');

      const reasons = continuationManager.getIncompleteTaskReasons();

      assert.equal(reasons.length, 2);
      assert.ok(reasons.some(r => r.task_id === 'task-001'));
      assert.ok(reasons.some(r => r.task_id === 'task-002'));
    });

    it('should provide reasons in ExecutionResult format', () => {
      continuationManager.recordIncompleteReason('task-001', 'Timeout');

      const reasons = continuationManager.getIncompleteTaskReasons();

      assert.ok(reasons[0].task_id);
      assert.ok(reasons[0].reason);
      assert.ok(reasons[0].timestamp);
    });
  });
});
