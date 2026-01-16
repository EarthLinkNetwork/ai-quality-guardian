/**
 * Error Codes for PM Orchestrator Runner
 * Based on 07_ERROR_HANDLING.md specification
 */
/**
 * Error Categories
 */
export declare enum ErrorCategory {
    PROJECT_CONFIG = "PROJECT_CONFIG",
    LIFECYCLE = "LIFECYCLE",
    EVIDENCE = "EVIDENCE",
    LOCKING = "LOCKING",
    CLAUDE_INTEGRATION = "CLAUDE_INTEGRATION"
}
/**
 * Error Codes
 * E1xx: Project and Configuration Errors - prevent execution start
 * E2xx: Execution Lifecycle Errors - halt lifecycle immediately
 * E3xx: Evidence Errors - result in NO_EVIDENCE status
 * E4xx: Locking and Semaphore Errors - release all locks and stop
 * E5xx: Claude Integration Errors - result in INVALID status
 */
export declare enum ErrorCode {
    E101_MISSING_CLAUDE_DIRECTORY = "E101",
    E101_CONFIG_FILE_NOT_FOUND = "E101",
    E102_INVALID_PROJECT_PATH = "E102",
    E102_PROJECT_PATH_INVALID = "E102",
    E103_CONFIGURATION_FILE_MISSING = "E103",
    E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE = "E104",
    E105_CRITICAL_CONFIGURATION_CORRUPTION = "E105",
    E201_PHASE_EXECUTION_FAILURE = "E201",
    E201_SESSION_ID_MISSING = "E201",
    E202_PHASE_SKIP_ATTEMPT = "E202",
    E202_PHASE_TRANSITION_INVALID = "E202",
    E203_INVALID_PHASE_TRANSITION = "E203",
    E203_STATE_PERSISTENCE_FAILURE = "E203",
    E204_LIFECYCLE_VIOLATION = "E204",
    E205_TASK_DECOMPOSITION_FAILURE = "E205",
    E205_SESSION_RESUME_FAILURE = "E205",
    E206_RESOURCE_LIMIT_EXCEEDED = "E206",
    E207_CONTINUATION_REJECTED = "E207",
    E208_OUTPUT_VALIDATION_FAILED = "E208",
    E301_EVIDENCE_COLLECTION_FAILURE = "E301",
    E301_EVIDENCE_MISSING = "E301",
    E302_EVIDENCE_VALIDATION_FAILURE = "E302",
    E302_EVIDENCE_INDEX_CORRUPTION = "E302",
    E303_MISSING_EVIDENCE_ARTIFACTS = "E303",
    E303_RAW_LOG_MISSING = "E303",
    E304_EVIDENCE_INTEGRITY_VIOLATION = "E304",
    E304_EVIDENCE_HASH_MISMATCH = "E304",
    E305_EVIDENCE_FORMAT_UNKNOWN = "E305",
    E401_LOCK_ORDER_VIOLATION = "E401",
    E401_LOCK_ACQUISITION_FAILURE = "E401",
    E401_LOCK_ACQUISITION_FAILED = "E401",
    E402_LOCK_ACQUISITION_FAILURE = "E402",
    E402_LOCK_RELEASE_FAILURE = "E402",
    E403_DEADLOCK_DETECTED = "E403",
    E404_SEMAPHORE_LIMIT_EXCEEDED = "E404",
    E404_EXECUTOR_LIMIT_EXCEEDED = "E404",
    E405_RESOURCE_RELEASE_FAILURE = "E405",
    E405_LOCK_DENIED = "E405",
    E501_SESSION_ID_MISSING = "E501",
    E502_SESSION_ID_MISMATCH = "E502",
    E503_EXECUTOR_VALIDATION_FAILURE = "E503",
    E504_OUTPUT_INTERCEPTION_FAILURE = "E504",
    E505_COMMUNICATION_BYPASS_DETECTED = "E505"
}
/**
 * Get the error category for an error code
 */
export declare function getErrorCategory(code: ErrorCode): ErrorCategory;
/**
 * Get the error message for an error code
 */
export declare function getErrorMessage(code: ErrorCode): string;
/**
 * Check if the error code is a project/config error (E1xx)
 */
export declare function isProjectConfigError(code: ErrorCode): boolean;
/**
 * Check if the error code is a lifecycle error (E2xx)
 */
export declare function isLifecycleError(code: ErrorCode): boolean;
/**
 * Check if the error code is an evidence error (E3xx)
 */
export declare function isEvidenceError(code: ErrorCode): boolean;
/**
 * Check if the error code is a locking error (E4xx)
 */
export declare function isLockingError(code: ErrorCode): boolean;
/**
 * Check if the error code is a Claude integration error (E5xx)
 */
export declare function isClaudeIntegrationError(code: ErrorCode): boolean;
/**
 * Custom error class for PM Orchestrator Runner errors
 */
export declare class PMRunnerError extends Error {
    readonly code: ErrorCode;
    readonly category: ErrorCategory;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
//# sourceMappingURL=error-codes.d.ts.map