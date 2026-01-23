/**
 * Retry Module
 *
 * Per spec 30_RETRY_AND_RECOVERY.md
 *
 * Exports:
 * - RetryManager class
 * - Retry decision functions
 * - Backoff calculation functions
 * - Escalation report generation
 * - Recovery strategy determination
 */
export { type FailureType, type TaskResult, type QualityCheckResult, type BackoffStrategy, type CauseSpecificConfig, type RetryConfig, type RetryDecision, type RetryHistory, type RetryAttempt, type EscalationReason, type FailureSummary, type DebugInfo, type EscalationReport, type RecoveryStrategy, type PartialRecovery, type RetryEventCallback, type RetryEvent, type RetryManagerConfig, DEFAULT_RETRY_CONFIG, DEFAULT_RETRY_MANAGER_CONFIG, calculateBackoff, classifyFailure, generateModificationHint, decideRetry, generateUserMessage, generateEscalationReport, determineRecoveryStrategy, RetryManager, } from './retry-manager';
//# sourceMappingURL=index.d.ts.map