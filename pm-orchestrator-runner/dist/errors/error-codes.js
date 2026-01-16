"use strict";
/**
 * Error Codes for PM Orchestrator Runner
 * Based on 07_ERROR_HANDLING.md specification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PMRunnerError = exports.ErrorCode = exports.ErrorCategory = void 0;
exports.getErrorCategory = getErrorCategory;
exports.getErrorMessage = getErrorMessage;
exports.isProjectConfigError = isProjectConfigError;
exports.isLifecycleError = isLifecycleError;
exports.isEvidenceError = isEvidenceError;
exports.isLockingError = isLockingError;
exports.isClaudeIntegrationError = isClaudeIntegrationError;
/**
 * Error Categories
 */
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["PROJECT_CONFIG"] = "PROJECT_CONFIG";
    ErrorCategory["LIFECYCLE"] = "LIFECYCLE";
    ErrorCategory["EVIDENCE"] = "EVIDENCE";
    ErrorCategory["LOCKING"] = "LOCKING";
    ErrorCategory["CLAUDE_INTEGRATION"] = "CLAUDE_INTEGRATION";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
/**
 * Error Codes
 * E1xx: Project and Configuration Errors - prevent execution start
 * E2xx: Execution Lifecycle Errors - halt lifecycle immediately
 * E3xx: Evidence Errors - result in NO_EVIDENCE status
 * E4xx: Locking and Semaphore Errors - release all locks and stop
 * E5xx: Claude Integration Errors - result in INVALID status
 */
var ErrorCode;
(function (ErrorCode) {
    // E1xx: Project and Configuration Errors
    ErrorCode["E101_MISSING_CLAUDE_DIRECTORY"] = "E101";
    ErrorCode["E101_CONFIG_FILE_NOT_FOUND"] = "E101";
    ErrorCode["E102_INVALID_PROJECT_PATH"] = "E102";
    ErrorCode["E102_PROJECT_PATH_INVALID"] = "E102";
    ErrorCode["E103_CONFIGURATION_FILE_MISSING"] = "E103";
    ErrorCode["E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE"] = "E104";
    ErrorCode["E105_CRITICAL_CONFIGURATION_CORRUPTION"] = "E105";
    // E2xx: Execution Lifecycle Errors
    ErrorCode["E201_PHASE_EXECUTION_FAILURE"] = "E201";
    ErrorCode["E201_SESSION_ID_MISSING"] = "E201";
    ErrorCode["E202_PHASE_SKIP_ATTEMPT"] = "E202";
    ErrorCode["E202_PHASE_TRANSITION_INVALID"] = "E202";
    ErrorCode["E203_INVALID_PHASE_TRANSITION"] = "E203";
    ErrorCode["E203_STATE_PERSISTENCE_FAILURE"] = "E203";
    ErrorCode["E204_LIFECYCLE_VIOLATION"] = "E204";
    ErrorCode["E205_TASK_DECOMPOSITION_FAILURE"] = "E205";
    ErrorCode["E205_SESSION_RESUME_FAILURE"] = "E205";
    ErrorCode["E206_RESOURCE_LIMIT_EXCEEDED"] = "E206";
    ErrorCode["E207_CONTINUATION_REJECTED"] = "E207";
    ErrorCode["E208_OUTPUT_VALIDATION_FAILED"] = "E208";
    // E3xx: Evidence Errors
    ErrorCode["E301_EVIDENCE_COLLECTION_FAILURE"] = "E301";
    ErrorCode["E301_EVIDENCE_MISSING"] = "E301";
    ErrorCode["E302_EVIDENCE_VALIDATION_FAILURE"] = "E302";
    ErrorCode["E302_EVIDENCE_INDEX_CORRUPTION"] = "E302";
    ErrorCode["E303_MISSING_EVIDENCE_ARTIFACTS"] = "E303";
    ErrorCode["E303_RAW_LOG_MISSING"] = "E303";
    ErrorCode["E304_EVIDENCE_INTEGRITY_VIOLATION"] = "E304";
    ErrorCode["E304_EVIDENCE_HASH_MISMATCH"] = "E304";
    ErrorCode["E305_EVIDENCE_FORMAT_UNKNOWN"] = "E305";
    // E4xx: Locking and Semaphore Errors
    ErrorCode["E401_LOCK_ORDER_VIOLATION"] = "E401";
    ErrorCode["E401_LOCK_ACQUISITION_FAILURE"] = "E401";
    ErrorCode["E401_LOCK_ACQUISITION_FAILED"] = "E401";
    ErrorCode["E402_LOCK_ACQUISITION_FAILURE"] = "E402";
    ErrorCode["E402_LOCK_RELEASE_FAILURE"] = "E402";
    ErrorCode["E403_DEADLOCK_DETECTED"] = "E403";
    ErrorCode["E404_SEMAPHORE_LIMIT_EXCEEDED"] = "E404";
    ErrorCode["E404_EXECUTOR_LIMIT_EXCEEDED"] = "E404";
    ErrorCode["E405_RESOURCE_RELEASE_FAILURE"] = "E405";
    ErrorCode["E405_LOCK_DENIED"] = "E405";
    // E5xx: Claude Integration Errors
    ErrorCode["E501_SESSION_ID_MISSING"] = "E501";
    ErrorCode["E502_SESSION_ID_MISMATCH"] = "E502";
    ErrorCode["E503_EXECUTOR_VALIDATION_FAILURE"] = "E503";
    ErrorCode["E504_OUTPUT_INTERCEPTION_FAILURE"] = "E504";
    ErrorCode["E505_COMMUNICATION_BYPASS_DETECTED"] = "E505";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
/**
 * Error messages for each error code
 */
const ERROR_MESSAGES = {
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
function getErrorCategory(code) {
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
function getErrorMessage(code) {
    const codeStr = code.toString();
    return ERROR_MESSAGES[codeStr] || `Unknown error: ${code}`;
}
/**
 * Check if the error code is a project/config error (E1xx)
 */
function isProjectConfigError(code) {
    return getErrorCategory(code) === ErrorCategory.PROJECT_CONFIG;
}
/**
 * Check if the error code is a lifecycle error (E2xx)
 */
function isLifecycleError(code) {
    return getErrorCategory(code) === ErrorCategory.LIFECYCLE;
}
/**
 * Check if the error code is an evidence error (E3xx)
 */
function isEvidenceError(code) {
    return getErrorCategory(code) === ErrorCategory.EVIDENCE;
}
/**
 * Check if the error code is a locking error (E4xx)
 */
function isLockingError(code) {
    return getErrorCategory(code) === ErrorCategory.LOCKING;
}
/**
 * Check if the error code is a Claude integration error (E5xx)
 */
function isClaudeIntegrationError(code) {
    return getErrorCategory(code) === ErrorCategory.CLAUDE_INTEGRATION;
}
/**
 * Custom error class for PM Orchestrator Runner errors
 */
class PMRunnerError extends Error {
    code;
    category;
    details;
    constructor(code, message, details) {
        super(message || getErrorMessage(code));
        this.name = 'PMRunnerError';
        this.code = code;
        this.category = getErrorCategory(code);
        this.details = details;
    }
}
exports.PMRunnerError = PMRunnerError;
//# sourceMappingURL=error-codes.js.map