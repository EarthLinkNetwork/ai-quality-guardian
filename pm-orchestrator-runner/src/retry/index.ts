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

export {
  // Types - Failure and Result
  type FailureType,
  type TaskResult,
  type QualityCheckResult,

  // Types - Backoff and Config
  type BackoffStrategy,
  type CauseSpecificConfig,
  type RetryConfig,

  // Types - Retry Decision
  type RetryDecision,
  type RetryHistory,
  type RetryAttempt,

  // Types - Escalation
  type EscalationReason,
  type FailureSummary,
  type DebugInfo,
  type EscalationReport,

  // Types - Recovery
  type RecoveryStrategy,
  type PartialRecovery,

  // Types - Events
  type RetryEventCallback,
  type RetryEvent,

  // Types - Manager Config
  type RetryManagerConfig,

  // Constants
  DEFAULT_RETRY_CONFIG,
  DEFAULT_RETRY_MANAGER_CONFIG,

  // Functions
  calculateBackoff,
  classifyFailure,
  generateModificationHint,
  decideRetry,
  generateUserMessage,
  generateEscalationReport,
  determineRecoveryStrategy,

  // Class
  RetryManager,
} from './retry-manager';
