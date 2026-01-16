/**
 * Error Codes for PM Orchestrator Runner
 * Based on 07_ERROR_HANDLING.md specification
 */

/**
 * Error Categories
 */
export enum ErrorCategory {
  PROJECT_CONFIG = 'PROJECT_CONFIG',
  LIFECYCLE = 'LIFECYCLE',
  EVIDENCE = 'EVIDENCE',
  LOCKING = 'LOCKING',
  CLAUDE_INTEGRATION = 'CLAUDE_INTEGRATION',
}

/**
 * Error Codes
 * E1xx: Project and Configuration Errors - prevent execution start
 * E2xx: Execution Lifecycle Errors - halt lifecycle immediately
 * E3xx: Evidence Errors - result in NO_EVIDENCE status
 * E4xx: Locking and Semaphore Errors - release all locks and stop
 * E5xx: Claude Integration Errors - result in INVALID status
 */
export enum ErrorCode {
  // E1xx: Project and Configuration Errors
  E101_MISSING_CLAUDE_DIRECTORY = 'E101',
  E101_CONFIG_FILE_NOT_FOUND = 'E101',
  E102_INVALID_PROJECT_PATH = 'E102',
  E102_PROJECT_PATH_INVALID = 'E102',
  E103_CONFIGURATION_FILE_MISSING = 'E103',
  E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE = 'E104',
  E105_CRITICAL_CONFIGURATION_CORRUPTION = 'E105',

  // E2xx: Execution Lifecycle Errors
  E201_PHASE_EXECUTION_FAILURE = 'E201',
  E201_SESSION_ID_MISSING = 'E201',
  E202_PHASE_SKIP_ATTEMPT = 'E202',
  E202_PHASE_TRANSITION_INVALID = 'E202',
  E203_INVALID_PHASE_TRANSITION = 'E203',
  E203_STATE_PERSISTENCE_FAILURE = 'E203',
  E204_LIFECYCLE_VIOLATION = 'E204',
  E205_TASK_DECOMPOSITION_FAILURE = 'E205',
  E205_SESSION_RESUME_FAILURE = 'E205',
  E206_RESOURCE_LIMIT_EXCEEDED = 'E206',
  E207_CONTINUATION_REJECTED = 'E207',
  E208_OUTPUT_VALIDATION_FAILED = 'E208',

  // E3xx: Evidence Errors
  E301_EVIDENCE_COLLECTION_FAILURE = 'E301',
  E301_EVIDENCE_MISSING = 'E301',
  E302_EVIDENCE_VALIDATION_FAILURE = 'E302',
  E302_EVIDENCE_INDEX_CORRUPTION = 'E302',
  E303_MISSING_EVIDENCE_ARTIFACTS = 'E303',
  E303_RAW_LOG_MISSING = 'E303',
  E304_EVIDENCE_INTEGRITY_VIOLATION = 'E304',
  E304_EVIDENCE_HASH_MISMATCH = 'E304',
  E305_EVIDENCE_FORMAT_UNKNOWN = 'E305',

  // E4xx: Locking and Semaphore Errors
  E401_LOCK_ORDER_VIOLATION = 'E401',
  E401_LOCK_ACQUISITION_FAILURE = 'E401',
  E401_LOCK_ACQUISITION_FAILED = 'E401',
  E402_LOCK_ACQUISITION_FAILURE = 'E402',
  E402_LOCK_RELEASE_FAILURE = 'E402',
  E403_DEADLOCK_DETECTED = 'E403',
  E404_SEMAPHORE_LIMIT_EXCEEDED = 'E404',
  E404_EXECUTOR_LIMIT_EXCEEDED = 'E404',
  E405_RESOURCE_RELEASE_FAILURE = 'E405',
  E405_LOCK_DENIED = 'E405',

  // E5xx: Claude Integration Errors
  E501_SESSION_ID_MISSING = 'E501',
  E502_SESSION_ID_MISMATCH = 'E502',
  E503_EXECUTOR_VALIDATION_FAILURE = 'E503',
  E504_OUTPUT_INTERCEPTION_FAILURE = 'E504',
  E505_COMMUNICATION_BYPASS_DETECTED = 'E505',
}

/**
 * Error messages for each error code
 */
const ERROR_MESSAGES: Record<string, string> = {
  // E1xx
  E101: 'Missing .claude directory in project path',
  E102: 'Invalid project path specified',
  E103: 'Configuration file is missing',
  E104: 'Configuration schema validation failed',
  E105: 'Critical configuration corruption detected',

  // E2xx
  E201: 'Phase execution failure',
  E202: 'Attempt to skip a required phase',
  E203: 'Invalid phase transition detected',
  E204: 'Lifecycle violation occurred',
  E205: 'Task decomposition failure',
  E206: 'Resource limit exceeded',
  E207: 'Continuation request rejected',
  E208: 'Output validation failed',

  // E3xx
  E301: 'Evidence collection failure',
  E302: 'Evidence validation failure',
  E303: 'Missing evidence artifacts',
  E304: 'Evidence integrity violation - hash mismatch detected',
  E305: 'Unknown evidence format',

  // E4xx
  E401: 'Lock order violation detected',
  E402: 'Failed to acquire lock',
  E403: 'Deadlock detected',
  E404: 'Semaphore limit exceeded',
  E405: 'Resource release failure - auto-release not permitted',

  // E5xx
  E501: 'Session ID is missing',
  E502: 'Session ID mismatch',
  E503: 'Executor validation failure',
  E504: 'Output interception failure',
  E505: 'Communication bypass detected',
};

/**
 * Get the error category for an error code
 */
export function getErrorCategory(code: ErrorCode): ErrorCategory {
  const codeStr = code.toString();
  if (codeStr.startsWith('E1')) {
    return ErrorCategory.PROJECT_CONFIG;
  }
  if (codeStr.startsWith('E2')) {
    return ErrorCategory.LIFECYCLE;
  }
  if (codeStr.startsWith('E3')) {
    return ErrorCategory.EVIDENCE;
  }
  if (codeStr.startsWith('E4')) {
    return ErrorCategory.LOCKING;
  }
  if (codeStr.startsWith('E5')) {
    return ErrorCategory.CLAUDE_INTEGRATION;
  }
  throw new Error(`Unknown error code: ${code}`);
}

/**
 * Get the error message for an error code
 */
export function getErrorMessage(code: ErrorCode): string {
  const codeStr = code.toString();
  return ERROR_MESSAGES[codeStr] || `Unknown error: ${code}`;
}

/**
 * Check if the error code is a project/config error (E1xx)
 */
export function isProjectConfigError(code: ErrorCode): boolean {
  return getErrorCategory(code) === ErrorCategory.PROJECT_CONFIG;
}

/**
 * Check if the error code is a lifecycle error (E2xx)
 */
export function isLifecycleError(code: ErrorCode): boolean {
  return getErrorCategory(code) === ErrorCategory.LIFECYCLE;
}

/**
 * Check if the error code is an evidence error (E3xx)
 */
export function isEvidenceError(code: ErrorCode): boolean {
  return getErrorCategory(code) === ErrorCategory.EVIDENCE;
}

/**
 * Check if the error code is a locking error (E4xx)
 */
export function isLockingError(code: ErrorCode): boolean {
  return getErrorCategory(code) === ErrorCategory.LOCKING;
}

/**
 * Check if the error code is a Claude integration error (E5xx)
 */
export function isClaudeIntegrationError(code: ErrorCode): boolean {
  return getErrorCategory(code) === ErrorCategory.CLAUDE_INTEGRATION;
}

/**
 * Custom error class for PM Orchestrator Runner errors
 */
export class PMRunnerError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'PMRunnerError';
    this.code = code;
    this.category = getErrorCategory(code);
    this.details = details;
  }
}
