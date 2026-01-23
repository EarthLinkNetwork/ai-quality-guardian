/**
 * Retry Manager Module
 *
 * Per spec 30_RETRY_AND_RECOVERY.md
 *
 * Provides:
 * - Retry decision logic (RETRY | ESCALATE | PASS)
 * - Backoff calculation (fixed, linear, exponential with jitter)
 * - Cause-specific retry handling
 * - ESCALATE flow and reporting
 * - Recovery mechanisms for partial failures
 *
 * Fail-Closed Principle: When in doubt, ESCALATE to human.
 */
import type { ConversationTracer } from '../trace/conversation-tracer';
/**
 * Failure types that can occur during task execution
 */
export type FailureType = 'INCOMPLETE' | 'QUALITY_FAILURE' | 'TIMEOUT' | 'TRANSIENT_ERROR' | 'RATE_LIMIT' | 'FATAL_ERROR' | 'ESCALATE_REQUIRED';
/**
 * Backoff strategy for retries
 */
export interface BackoffStrategy {
    /** Backoff type */
    type: 'fixed' | 'linear' | 'exponential';
    /** Initial delay in milliseconds */
    initial_delay_ms: number;
    /** Maximum delay in milliseconds */
    max_delay_ms: number;
    /** Multiplier for exponential backoff */
    multiplier?: number;
    /** Jitter factor (0-1) for random variation */
    jitter?: number;
}
/**
 * Cause-specific retry configuration
 */
export interface CauseSpecificConfig {
    /** Failure type this config applies to */
    failure_type: FailureType;
    /** Override max retries for this failure type */
    max_retries?: number;
    /** Override backoff strategy for this failure type */
    backoff?: BackoffStrategy;
    /** Additional modification hint for this failure type */
    modification_hint?: string;
}
/**
 * Retry configuration
 */
export interface RetryConfig {
    /** Maximum retry count (default) */
    max_retries: number;
    /** Default backoff strategy */
    backoff: BackoffStrategy;
    /** Failure types that are retryable */
    retryable_failures: FailureType[];
    /** Cause-specific overrides */
    cause_specific: CauseSpecificConfig[];
}
/**
 * Retry decision result
 */
export interface RetryDecision {
    /** Decision: RETRY, ESCALATE, or PASS */
    decision: 'RETRY' | 'ESCALATE' | 'PASS';
    /** Failure type (for RETRY/ESCALATE) */
    failure_type?: FailureType;
    /** Current retry count */
    current_retry_count: number;
    /** Maximum retries allowed */
    max_retries: number;
    /** Delay before retry in ms (for RETRY) */
    delay_ms?: number;
    /** Modification hint for the LLM (for RETRY) */
    modification_hint?: string;
    /** Reason for ESCALATE */
    escalate_reason?: string;
    /** Decision reasoning (for logging/tracing) */
    reasoning: string;
}
/**
 * Retry history for a task
 */
export interface RetryHistory {
    /** Task ID */
    task_id: string;
    /** Subtask ID (if applicable) */
    subtask_id?: string;
    /** Current retry count */
    retry_count: number;
    /** History of previous attempts */
    attempts: RetryAttempt[];
}
/**
 * Single retry attempt record
 */
export interface RetryAttempt {
    /** Attempt number (0-indexed) */
    attempt_number: number;
    /** Timestamp of attempt */
    timestamp: string;
    /** Failure type (if failed) */
    failure_type?: FailureType;
    /** Result status */
    status: 'PASS' | 'FAIL';
    /** Error message (if failed) */
    error_message?: string;
    /** Duration in ms */
    duration_ms: number;
}
/**
 * ESCALATE reason types
 */
export interface EscalationReason {
    type: 'MAX_RETRIES' | 'FATAL_ERROR' | 'HUMAN_JUDGMENT' | 'RESOURCE_EXHAUSTED';
    description: string;
}
/**
 * Failure summary for escalation
 */
export interface FailureSummary {
    total_attempts: number;
    failure_types: FailureType[];
    last_failure: {
        type: FailureType;
        message: string;
        timestamp: string;
    };
}
/**
 * Debug info for escalation
 */
export interface DebugInfo {
    retry_history: RetryAttempt[];
    trace_file: string;
    relevant_logs: string[];
}
/**
 * ESCALATE report
 */
export interface EscalationReport {
    /** Task ID */
    task_id: string;
    /** Subtask ID (if applicable) */
    subtask_id?: string;
    /** Escalation timestamp */
    escalated_at: string;
    /** Escalation reason */
    reason: EscalationReason;
    /** Failure summary */
    failure_summary: FailureSummary;
    /** User-facing message */
    user_message: string;
    /** Debug information */
    debug_info: DebugInfo;
    /** Recommended actions */
    recommended_actions: string[];
}
/**
 * Task result (input to retry decision)
 */
export interface TaskResult {
    /** Result status */
    status: 'PASS' | 'FAIL' | 'TIMEOUT' | 'ERROR';
    /** Output content */
    output?: string;
    /** Error message */
    error?: string;
    /** Execution duration in ms */
    duration_ms?: number;
    /** Quality check results (Q1-Q6) */
    quality_results?: QualityCheckResult[];
    /** Detected issues */
    detected_issues?: string[];
}
/**
 * Quality check result
 */
export interface QualityCheckResult {
    criterion: string;
    passed: boolean;
    details?: string;
}
/**
 * Recovery strategy for partial failures
 */
export type RecoveryStrategy = 'RETRY_FAILED_ONLY' | 'ROLLBACK_AND_RETRY' | 'PARTIAL_COMMIT' | 'ESCALATE';
/**
 * Partial recovery info
 */
export interface PartialRecovery {
    task_id: string;
    succeeded_subtasks: string[];
    failed_subtasks: string[];
    strategy: RecoveryStrategy;
    recovered_state?: {
        completed_subtasks: string[];
        pending_subtasks: string[];
    };
}
/**
 * Retry event callback for external monitoring
 */
export type RetryEventCallback = (event: RetryEvent) => void;
/**
 * Retry events for ConversationTracer
 */
export type RetryEvent = {
    type: 'RETRY_DECISION';
    decision: RetryDecision;
    task_id: string;
    subtask_id?: string;
} | {
    type: 'RETRY_START';
    task_id: string;
    subtask_id?: string;
    retry_count: number;
    modification_hint?: string;
} | {
    type: 'RETRY_SUCCESS';
    task_id: string;
    subtask_id?: string;
    retry_count: number;
    total_attempts: number;
} | {
    type: 'ESCALATE_DECISION';
    report: EscalationReport;
} | {
    type: 'ESCALATE_EXECUTED';
    task_id: string;
    user_message: string;
    recommended_actions: string[];
} | {
    type: 'RECOVERY_START';
    task_id: string;
    strategy: RecoveryStrategy;
    failed_subtasks: string[];
} | {
    type: 'RECOVERY_COMPLETE';
    task_id: string;
    strategy: RecoveryStrategy;
    final_status: string;
};
/**
 * Default retry configuration per spec
 */
export declare const DEFAULT_RETRY_CONFIG: RetryConfig;
/**
 * Calculate backoff delay for a retry attempt
 */
export declare function calculateBackoff(strategy: BackoffStrategy, retryCount: number): number;
/**
 * Classify a task result into a failure type
 */
export declare function classifyFailure(result: TaskResult): FailureType;
/**
 * Generate modification hint for a failure
 */
export declare function generateModificationHint(failureType: FailureType, result: TaskResult, causeConfig?: CauseSpecificConfig): string;
/**
 * Decide whether to retry a failed task
 */
export declare function decideRetry(result: TaskResult, config: RetryConfig, history: RetryHistory): RetryDecision;
/**
 * Generate user-facing message for escalation
 */
export declare function generateUserMessage(report: EscalationReport): string;
/**
 * Generate escalation report
 */
export declare function generateEscalationReport(task_id: string, subtask_id: string | undefined, reason: EscalationReason, history: RetryHistory, traceFile: string): EscalationReport;
/**
 * Determine recovery strategy for partial failures
 */
export declare function determineRecoveryStrategy(failedSubtasks: string[], succeededSubtasks: string[], dependencies: Map<string, string[]>): RecoveryStrategy;
/**
 * Configuration for RetryManager
 */
export interface RetryManagerConfig {
    /** Base retry configuration */
    retryConfig: RetryConfig;
    /** Enable snapshot-based recovery */
    enableSnapshots: boolean;
    /** Snapshot retention in hours */
    snapshotRetentionHours: number;
    /** Enable partial commit */
    partialCommitEnabled: boolean;
    /** Trace file directory */
    traceDir: string;
}
/**
 * Default RetryManager configuration
 */
export declare const DEFAULT_RETRY_MANAGER_CONFIG: RetryManagerConfig;
/**
 * RetryManager - Manages retry logic and recovery
 */
export declare class RetryManager {
    private config;
    private historyMap;
    private eventCallback?;
    private conversationTracer?;
    constructor(config?: Partial<RetryManagerConfig>, eventCallback?: RetryEventCallback, conversationTracer?: ConversationTracer);
    /**
     * Emit an event to callback and tracer
     */
    private emitEvent;
    /**
     * Get or create retry history for a task
     */
    private getHistory;
    /**
     * Record an attempt in history
     */
    recordAttempt(taskId: string, subtaskId: string | undefined, status: 'PASS' | 'FAIL', failureType?: FailureType, errorMessage?: string, durationMs?: number): void;
    /**
     * Decide whether to retry a task
     */
    decide(taskId: string, subtaskId: string | undefined, result: TaskResult): RetryDecision;
    /**
     * Signal that a retry is starting
     */
    startRetry(taskId: string, subtaskId: string | undefined, modificationHint?: string): void;
    /**
     * Signal that a retry succeeded
     */
    retrySucceeded(taskId: string, subtaskId: string | undefined): void;
    /**
     * Generate and emit an escalation
     */
    escalate(taskId: string, subtaskId: string | undefined, reason: EscalationReason): EscalationReport;
    /**
     * Start a recovery process
     */
    startRecovery(taskId: string, failedSubtasks: string[], succeededSubtasks: string[], dependencies: Map<string, string[]>): PartialRecovery;
    /**
     * Complete a recovery process
     */
    completeRecovery(taskId: string, strategy: RecoveryStrategy, finalStatus: string): void;
    /**
     * Reset history for a task
     */
    resetHistory(taskId: string, subtaskId?: string): void;
    /**
     * Get current retry count for a task
     */
    getRetryCount(taskId: string, subtaskId?: string): number;
    /**
     * Check if max retries have been reached
     */
    isMaxRetriesReached(taskId: string, subtaskId?: string, failureType?: FailureType): boolean;
    /**
     * Get the delay for the next retry
     */
    getNextRetryDelay(taskId: string, subtaskId?: string, failureType?: FailureType): number;
    /**
     * Get configuration
     */
    getConfig(): RetryManagerConfig;
}
//# sourceMappingURL=retry-manager.d.ts.map