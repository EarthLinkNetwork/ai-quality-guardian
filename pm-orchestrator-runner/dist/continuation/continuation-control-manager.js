"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContinuationControlManager = exports.ContinuationControlError = void 0;
const enums_1 = require("../models/enums");
const error_codes_1 = require("../errors/error-codes");
/**
 * Continuation Control Manager Error
 */
class ContinuationControlError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'ContinuationControlError';
        this.code = code;
        this.details = details;
    }
}
exports.ContinuationControlError = ContinuationControlError;
/**
 * Continuation Control Manager class
 */
class ContinuationControlManager {
    requests;
    requestTimes;
    incompleteReasons;
    approvals;
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
    canContinue(sessionState) {
        // Block continuation with error statuses
        if (sessionState.overall_status === enums_1.OverallStatus.ERROR) {
            return false;
        }
        if (sessionState.overall_status === enums_1.OverallStatus.NO_EVIDENCE) {
            return false;
        }
        // Require explicit approval for INCOMPLETE status
        if (sessionState.overall_status === enums_1.OverallStatus.INCOMPLETE) {
            return sessionState.has_explicit_approval === true;
        }
        return true;
    }
    /**
     * Check if phase progression is allowed
     */
    canProgressPhase(sessionState) {
        // Even if all tasks in current phase are complete, require explicit approval
        if (!sessionState.has_explicit_approval) {
            return false;
        }
        return true;
    }
    /**
     * Check if approval is required
     */
    requiresApproval(sessionState) {
        // Approval is required for incomplete sessions
        return sessionState.overall_status === enums_1.OverallStatus.INCOMPLETE &&
            !sessionState.has_explicit_approval;
    }
    /**
     * Record an approval
     * @throws ContinuationControlError with E201 if session ID is missing
     */
    recordApproval(sessionId, approvedBy) {
        if (!sessionId || sessionId.length === 0) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E201_SESSION_ID_MISSING, 'Session ID is required for approval', { sessionId });
        }
        const approval = {
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
    validateContinuationConditions(sessionState) {
        const failedConditions = [];
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
    requestContinuation(sessionState) {
        // Reject if all tasks complete
        if (sessionState.overall_status === enums_1.OverallStatus.COMPLETE) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E207_CONTINUATION_REJECTED, 'Cannot continue: all tasks already complete', { overall_status: sessionState.overall_status });
        }
        // Reject if no remaining work
        if (sessionState.remaining_work && sessionState.remaining_work.length === 0 &&
            sessionState.tasks_completed >= sessionState.tasks_total) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E207_CONTINUATION_REJECTED, 'Cannot continue: no remaining work', { tasks_completed: sessionState.tasks_completed, tasks_total: sessionState.tasks_total });
        }
        // Reject if status is INVALID
        if (sessionState.overall_status === enums_1.OverallStatus.INVALID) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E207_CONTINUATION_REJECTED, 'Cannot continue: session status is INVALID', { overall_status: sessionState.overall_status });
        }
        // Reject duplicate continuation requests
        if (sessionState.continuation_in_progress) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E207_CONTINUATION_REJECTED, 'Cannot continue: continuation already in progress', { continuation_in_progress: true });
        }
    }
    /**
     * Create a continuation request
     */
    createContinuationRequest(sessionState) {
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();
        const request = {
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
    approveContinuationRequest(requestId) {
        const request = this.requests.get(requestId);
        if (!request) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E207_CONTINUATION_REJECTED, `Request not found: ${requestId}`, { requestId });
        }
        const approvedRequest = {
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
    rejectContinuationRequest(requestId, reason) {
        const request = this.requests.get(requestId);
        if (!request) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E207_CONTINUATION_REJECTED, `Request not found: ${requestId}`, { requestId });
        }
        const rejectedRequest = {
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
    setRequestTimeForTesting(requestId, timestamp) {
        this.requestTimes.set(requestId, timestamp);
    }
    /**
     * Expire old pending requests
     */
    expireOldRequests(timeoutMs) {
        const now = Date.now();
        for (const [requestId, request] of this.requests) {
            if (request.status === 'pending') {
                const requestTime = this.requestTimes.get(requestId);
                if (requestTime && (now - requestTime) > timeoutMs) {
                    const expiredRequest = {
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
    getContinuationRequest(requestId) {
        const request = this.requests.get(requestId);
        if (!request) {
            throw new ContinuationControlError(error_codes_1.ErrorCode.E207_CONTINUATION_REJECTED, `Request not found: ${requestId}`, { requestId });
        }
        return request;
    }
    /**
     * Determine next action based on session state
     */
    determineNextAction(sessionState) {
        // COMPLETE status: next_action=true
        if (sessionState.overall_status === enums_1.OverallStatus.COMPLETE) {
            return {
                next_action: true,
                next_action_reason: 'Session complete - ready for next task',
            };
        }
        // ERROR status: next_action=false
        if (sessionState.overall_status === enums_1.OverallStatus.ERROR) {
            return {
                next_action: false,
                next_action_reason: 'Session has error - cannot proceed',
            };
        }
        // INVALID status: next_action=false
        if (sessionState.overall_status === enums_1.OverallStatus.INVALID) {
            return {
                next_action: false,
                next_action_reason: 'Session status is invalid',
            };
        }
        // NO_EVIDENCE status: next_action=false
        if (sessionState.overall_status === enums_1.OverallStatus.NO_EVIDENCE) {
            return {
                next_action: false,
                next_action_reason: 'No evidence collected - cannot proceed',
            };
        }
        // INCOMPLETE: check for approval and conditions
        if (sessionState.overall_status === enums_1.OverallStatus.INCOMPLETE) {
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
    recordIncompleteReason(taskId, reason) {
        this.incompleteReasons.push({
            task_id: taskId,
            reason,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Get all incomplete task reasons
     */
    getIncompleteTaskReasons() {
        return [...this.incompleteReasons];
    }
}
exports.ContinuationControlManager = ContinuationControlManager;
//# sourceMappingURL=continuation-control-manager.js.map