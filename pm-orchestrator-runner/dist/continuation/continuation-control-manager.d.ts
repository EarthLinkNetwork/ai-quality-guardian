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
import { ErrorCode } from '../errors/error-codes';
/**
 * Continuation Control Manager Error
 */
export declare class ContinuationControlError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
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
export declare class ContinuationControlManager {
    private requests;
    private requestTimes;
    private incompleteReasons;
    private approvals;
    /**
     * Create a new ContinuationControlManager
     */
    constructor();
    /**
     * Check if continuation is allowed based on session state
     */
    canContinue(sessionState: SessionState): boolean;
    /**
     * Check if phase progression is allowed
     */
    canProgressPhase(sessionState: SessionState): boolean;
    /**
     * Check if approval is required
     */
    requiresApproval(sessionState: SessionState): boolean;
    /**
     * Record an approval
     * @throws ContinuationControlError with E201 if session ID is missing
     */
    recordApproval(sessionId: string, approvedBy: string): ApprovalRecord;
    /**
     * Validate all continuation conditions
     */
    validateContinuationConditions(sessionState: SessionState): ValidationResult;
    /**
     * Request continuation
     * @throws ContinuationControlError with E207 if continuation is meaningless
     */
    requestContinuation(sessionState: SessionState): void;
    /**
     * Create a continuation request
     */
    createContinuationRequest(sessionState: SessionState): ContinuationRequest;
    /**
     * Approve a continuation request
     */
    approveContinuationRequest(requestId: string): ContinuationRequest;
    /**
     * Reject a continuation request
     */
    rejectContinuationRequest(requestId: string, reason: string): ContinuationRequest;
    /**
     * Set request time for testing purposes
     */
    setRequestTimeForTesting(requestId: string, timestamp: number): void;
    /**
     * Expire old pending requests
     */
    expireOldRequests(timeoutMs: number): void;
    /**
     * Get a continuation request by ID
     */
    getContinuationRequest(requestId: string): ContinuationRequest;
    /**
     * Determine next action based on session state
     */
    determineNextAction(sessionState: SessionState): NextAction;
    /**
     * Record a reason for incomplete task
     */
    recordIncompleteReason(taskId: string, reason: string): void;
    /**
     * Get all incomplete task reasons
     */
    getIncompleteTaskReasons(): IncompleteTaskReason[];
}
export {};
//# sourceMappingURL=continuation-control-manager.d.ts.map