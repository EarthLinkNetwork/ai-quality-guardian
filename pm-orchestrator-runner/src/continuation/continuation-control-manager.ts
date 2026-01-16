/**
 * Continuation Control Manager
 * Based on 04_COMPONENTS.md L156-166
 *
 * Responsible for:
 * - Automatic progression prevention
 * - Explicit approval requirement
 * - Continuation condition validation
 * - Meaningless continuation rejection
 * - next_action determination
 */

import { OverallStatus } from '../models/enums';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';

/**
 * Continuation Control Manager Error
 */
export class ContinuationControlError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'ContinuationControlError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Session state interface for continuation checks
 */
interface SessionState {
  session_id: string;
  overall_status: OverallStatus;
  tasks_completed: number;
  tasks_total: number;
  has_explicit_approval?: boolean;
  evidence_valid?: boolean;
  no_critical_errors?: boolean;
  current_phase?: string;
  remaining_work?: string[];
  continuation_in_progress?: boolean;
}

/**
 * Approval record interface
 */
interface ApprovalRecord {
  session_id: string;
  approved_by: string;
  timestamp: string;
}

/**
 * Validation result interface
 */
interface ValidationResult {
  valid: boolean;
  failed_conditions: string[];
}

/**
 * Continuation request interface
 */
interface ContinuationRequest {
  request_id: string;
  session_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_at: string;
  approved_at?: string;
  rejection_reason?: string;
}

/**
 * Next action determination interface
 */
interface NextAction {
  next_action: boolean;
  next_action_reason: string;
}

/**
 * Incomplete task reason interface
 */
interface IncompleteTaskReason {
  task_id: string;
  reason: string;
  timestamp: string;
}

/**
 * Continuation Control Manager class
 */
export class ContinuationControlManager {
  private requests: Map<string, ContinuationRequest>;
  private requestTimes: Map<string, number>;
  private incompleteReasons: IncompleteTaskReason[];
  private approvals: Map<string, ApprovalRecord>;

  /**
   * Create a new ContinuationControlManager
   */
  constructor() {
    this.requests = new Map();
    this.requestTimes = new Map();
    this.incompleteReasons = [];
    this.approvals = new Map();
  }

  /**
   * Check if continuation is allowed based on session state
   */
  canContinue(sessionState: SessionState): boolean {
    // Block continuation with error statuses
    if (sessionState.overall_status === OverallStatus.ERROR) {
      return false;
    }

    if (sessionState.overall_status === OverallStatus.NO_EVIDENCE) {
      return false;
    }

    // Require explicit approval for INCOMPLETE status
    if (sessionState.overall_status === OverallStatus.INCOMPLETE) {
      return sessionState.has_explicit_approval === true;
    }

    return true;
  }

  /**
   * Check if phase progression is allowed
   */
  canProgressPhase(sessionState: SessionState): boolean {
    // Even if all tasks in current phase are complete, require explicit approval
    if (!sessionState.has_explicit_approval) {
      return false;
    }

    return true;
  }

  /**
   * Check if approval is required
   */
  requiresApproval(sessionState: SessionState): boolean {
    // Approval is required for incomplete sessions
    return sessionState.overall_status === OverallStatus.INCOMPLETE &&
           !sessionState.has_explicit_approval;
  }

  /**
   * Record an approval
   * @throws ContinuationControlError with E201 if session ID is missing
   */
  recordApproval(sessionId: string, approvedBy: string): ApprovalRecord {
    if (!sessionId || sessionId.length === 0) {
      throw new ContinuationControlError(
        ErrorCode.E201_SESSION_ID_MISSING,
        'Session ID is required for approval',
        { sessionId }
      );
    }

    const approval: ApprovalRecord = {
      session_id: sessionId,
      approved_by: approvedBy,
      timestamp: new Date().toISOString(),
    };

    this.approvals.set(sessionId, approval);

    return approval;
  }

  /**
   * Validate all continuation conditions
   */
  validateContinuationConditions(sessionState: SessionState): ValidationResult {
    const failedConditions: string[] = [];

    // Check for minimum task progress
    if (sessionState.tasks_completed === 0) {
      failedConditions.push('minimum_progress');
    }

    // Check evidence validity
    if (sessionState.evidence_valid === false) {
      failedConditions.push('evidence_valid');
    }

    // Check for critical errors
    if (sessionState.no_critical_errors === false) {
      failedConditions.push('no_critical_errors');
    }

    return {
      valid: failedConditions.length === 0,
      failed_conditions: failedConditions,
    };
  }

  /**
   * Request continuation
   * @throws ContinuationControlError with E207 if continuation is meaningless
   */
  requestContinuation(sessionState: SessionState): void {
    // Reject if all tasks complete
    if (sessionState.overall_status === OverallStatus.COMPLETE) {
      throw new ContinuationControlError(
        ErrorCode.E207_CONTINUATION_REJECTED,
        'Cannot continue: all tasks already complete',
        { overall_status: sessionState.overall_status }
      );
    }

    // Reject if no remaining work
    if (sessionState.remaining_work && sessionState.remaining_work.length === 0 &&
        sessionState.tasks_completed >= sessionState.tasks_total) {
      throw new ContinuationControlError(
        ErrorCode.E207_CONTINUATION_REJECTED,
        'Cannot continue: no remaining work',
        { tasks_completed: sessionState.tasks_completed, tasks_total: sessionState.tasks_total }
      );
    }

    // Reject if status is INVALID
    if (sessionState.overall_status === OverallStatus.INVALID) {
      throw new ContinuationControlError(
        ErrorCode.E207_CONTINUATION_REJECTED,
        'Cannot continue: session status is INVALID',
        { overall_status: sessionState.overall_status }
      );
    }

    // Reject duplicate continuation requests
    if (sessionState.continuation_in_progress) {
      throw new ContinuationControlError(
        ErrorCode.E207_CONTINUATION_REJECTED,
        'Cannot continue: continuation already in progress',
        { continuation_in_progress: true }
      );
    }
  }

  /**
   * Create a continuation request
   */
  createContinuationRequest(sessionState: SessionState): ContinuationRequest {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const request: ContinuationRequest = {
      request_id: requestId,
      session_id: sessionState.session_id,
      status: 'pending',
      requested_at: new Date(now).toISOString(),
    };

    this.requests.set(requestId, request);
    this.requestTimes.set(requestId, now);

    return request;
  }

  /**
   * Approve a continuation request
   */
  approveContinuationRequest(requestId: string): ContinuationRequest {
    const request = this.requests.get(requestId);

    if (!request) {
      throw new ContinuationControlError(
        ErrorCode.E207_CONTINUATION_REJECTED,
        `Request not found: ${requestId}`,
        { requestId }
      );
    }

    const approvedRequest: ContinuationRequest = {
      ...request,
      status: 'approved',
      approved_at: new Date().toISOString(),
    };

    this.requests.set(requestId, approvedRequest);

    return approvedRequest;
  }

  /**
   * Reject a continuation request
   */
  rejectContinuationRequest(requestId: string, reason: string): ContinuationRequest {
    const request = this.requests.get(requestId);

    if (!request) {
      throw new ContinuationControlError(
        ErrorCode.E207_CONTINUATION_REJECTED,
        `Request not found: ${requestId}`,
        { requestId }
      );
    }

    const rejectedRequest: ContinuationRequest = {
      ...request,
      status: 'rejected',
      rejection_reason: reason,
    };

    this.requests.set(requestId, rejectedRequest);

    return rejectedRequest;
  }

  /**
   * Set request time for testing purposes
   */
  setRequestTimeForTesting(requestId: string, timestamp: number): void {
    this.requestTimes.set(requestId, timestamp);
  }

  /**
   * Expire old pending requests
   */
  expireOldRequests(timeoutMs: number): void {
    const now = Date.now();

    for (const [requestId, request] of this.requests) {
      if (request.status === 'pending') {
        const requestTime = this.requestTimes.get(requestId);
        if (requestTime && (now - requestTime) > timeoutMs) {
          const expiredRequest: ContinuationRequest = {
            ...request,
            status: 'expired',
          };
          this.requests.set(requestId, expiredRequest);
        }
      }
    }
  }

  /**
   * Get a continuation request by ID
   */
  getContinuationRequest(requestId: string): ContinuationRequest {
    const request = this.requests.get(requestId);

    if (!request) {
      throw new ContinuationControlError(
        ErrorCode.E207_CONTINUATION_REJECTED,
        `Request not found: ${requestId}`,
        { requestId }
      );
    }

    return request;
  }

  /**
   * Determine next action based on session state
   */
  determineNextAction(sessionState: SessionState): NextAction {
    // COMPLETE status: next_action=true
    if (sessionState.overall_status === OverallStatus.COMPLETE) {
      return {
        next_action: true,
        next_action_reason: 'Session complete - ready for next task',
      };
    }

    // ERROR status: next_action=false
    if (sessionState.overall_status === OverallStatus.ERROR) {
      return {
        next_action: false,
        next_action_reason: 'Session has error - cannot proceed',
      };
    }

    // INVALID status: next_action=false
    if (sessionState.overall_status === OverallStatus.INVALID) {
      return {
        next_action: false,
        next_action_reason: 'Session status is invalid',
      };
    }

    // NO_EVIDENCE status: next_action=false
    if (sessionState.overall_status === OverallStatus.NO_EVIDENCE) {
      return {
        next_action: false,
        next_action_reason: 'No evidence collected - cannot proceed',
      };
    }

    // INCOMPLETE: check for approval and conditions
    if (sessionState.overall_status === OverallStatus.INCOMPLETE) {
      if (!sessionState.has_explicit_approval) {
        return {
          next_action: false,
          next_action_reason: 'Explicit approval required for continuation',
        };
      }

      // With approval and valid conditions
      const validation = this.validateContinuationConditions(sessionState);
      if (validation.valid) {
        return {
          next_action: true,
          next_action_reason: 'Continuation approved - ready to proceed',
        };
      }

      return {
        next_action: false,
        next_action_reason: `Conditions not met: ${validation.failed_conditions.join(', ')}`,
      };
    }

    // Default: false
    return {
      next_action: false,
      next_action_reason: 'Unknown status',
    };
  }

  /**
   * Record a reason for incomplete task
   */
  recordIncompleteReason(taskId: string, reason: string): void {
    this.incompleteReasons.push({
      task_id: taskId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all incomplete task reasons
   */
  getIncompleteTaskReasons(): IncompleteTaskReason[] {
    return [...this.incompleteReasons];
  }
}
