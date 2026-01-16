"use strict";
/**
 * Supporting Structures
 * Based on 05_DATA_MODELS.md L79-101
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceInventoryValidationError = exports.LimitViolationValidationError = exports.TaskLimitsValidationError = void 0;
exports.createTaskLimits = createTaskLimits;
exports.validateTaskLimits = validateTaskLimits;
exports.createLimitViolation = createLimitViolation;
exports.validateLimitViolation = validateLimitViolation;
exports.createEvidenceInventory = createEvidenceInventory;
exports.validateEvidenceInventory = validateEvidenceInventory;
exports.addMissingEvidenceOperation = addMissingEvidenceOperation;
exports.addIntegrityFailure = addIntegrityFailure;
exports.addRawEvidenceFile = addRawEvidenceFile;
exports.incrementEvidenceCount = incrementEvidenceCount;
exports.hasInventoryIssues = hasInventoryIssues;
/**
 * Task limits range constraints (from 04_COMPONENTS.md L70-72)
 */
const LIMITS_RANGE = {
    max_files: { min: 1, max: 20 },
    max_tests: { min: 1, max: 50 },
    max_seconds: { min: 30, max: 900 },
};
/**
 * Default task limits
 */
const DEFAULT_LIMITS = {
    max_files: 5,
    max_tests: 10,
    max_seconds: 300,
};
/**
 * TaskLimits validation error
 */
class TaskLimitsValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskLimitsValidationError';
    }
}
exports.TaskLimitsValidationError = TaskLimitsValidationError;
/**
 * LimitViolation validation error
 */
class LimitViolationValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LimitViolationValidationError';
    }
}
exports.LimitViolationValidationError = LimitViolationValidationError;
/**
 * EvidenceInventory validation error
 */
class EvidenceInventoryValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EvidenceInventoryValidationError';
    }
}
exports.EvidenceInventoryValidationError = EvidenceInventoryValidationError;
/**
 * Create task limits with defaults
 */
function createTaskLimits(maxFiles = DEFAULT_LIMITS.max_files, maxTests = DEFAULT_LIMITS.max_tests, maxSeconds = DEFAULT_LIMITS.max_seconds) {
    return {
        max_files: maxFiles,
        max_tests: maxTests,
        max_seconds: maxSeconds,
    };
}
/**
 * Validate task limits
 * @throws TaskLimitsValidationError if validation fails
 */
function validateTaskLimits(limits) {
    if (limits.max_files < LIMITS_RANGE.max_files.min ||
        limits.max_files > LIMITS_RANGE.max_files.max) {
        throw new TaskLimitsValidationError(`max_files must be between ${LIMITS_RANGE.max_files.min} and ${LIMITS_RANGE.max_files.max}`);
    }
    if (limits.max_tests < LIMITS_RANGE.max_tests.min ||
        limits.max_tests > LIMITS_RANGE.max_tests.max) {
        throw new TaskLimitsValidationError(`max_tests must be between ${LIMITS_RANGE.max_tests.min} and ${LIMITS_RANGE.max_tests.max}`);
    }
    if (limits.max_seconds < LIMITS_RANGE.max_seconds.min ||
        limits.max_seconds > LIMITS_RANGE.max_seconds.max) {
        throw new TaskLimitsValidationError(`max_seconds must be between ${LIMITS_RANGE.max_seconds.min} and ${LIMITS_RANGE.max_seconds.max}`);
    }
    return true;
}
/**
 * Create limit violation
 */
function createLimitViolation(limitType, limitValue, actualValue) {
    return {
        limit_type: limitType,
        limit_value: limitValue,
        actual_value: actualValue,
        timestamp: new Date().toISOString(),
        resolution_required: true,
    };
}
/**
 * Validate limit violation
 * @throws LimitViolationValidationError if validation fails
 */
function validateLimitViolation(violation) {
    if (!violation.limit_type || violation.limit_type.length === 0) {
        throw new LimitViolationValidationError('limit_type is required');
    }
    if (violation.limit_value === undefined) {
        throw new LimitViolationValidationError('limit_value is required');
    }
    if (violation.actual_value === undefined) {
        throw new LimitViolationValidationError('actual_value is required');
    }
    if (!violation.timestamp || violation.timestamp.length === 0) {
        throw new LimitViolationValidationError('timestamp is required');
    }
    const timestamp = new Date(violation.timestamp);
    if (isNaN(timestamp.getTime())) {
        throw new LimitViolationValidationError('timestamp must be a valid ISO 8601 timestamp');
    }
    if (violation.resolution_required === undefined) {
        throw new LimitViolationValidationError('resolution_required is required');
    }
    return true;
}
/**
 * Create empty evidence inventory
 */
function createEvidenceInventory() {
    return {
        total_evidence_items: 0,
        missing_evidence_operations: [],
        integrity_failures: [],
        raw_evidence_files: [],
    };
}
/**
 * Validate evidence inventory
 * @throws EvidenceInventoryValidationError if validation fails
 */
function validateEvidenceInventory(inventory) {
    if (inventory.total_evidence_items === undefined) {
        throw new EvidenceInventoryValidationError('total_evidence_items is required');
    }
    if (inventory.total_evidence_items < 0) {
        throw new EvidenceInventoryValidationError('total_evidence_items must be non-negative');
    }
    if (!Array.isArray(inventory.missing_evidence_operations)) {
        throw new EvidenceInventoryValidationError('missing_evidence_operations must be an array');
    }
    if (!Array.isArray(inventory.integrity_failures)) {
        throw new EvidenceInventoryValidationError('integrity_failures must be an array');
    }
    if (!Array.isArray(inventory.raw_evidence_files)) {
        throw new EvidenceInventoryValidationError('raw_evidence_files must be an array');
    }
    return true;
}
/**
 * Add missing evidence operation
 */
function addMissingEvidenceOperation(inventory, operationId) {
    return {
        ...inventory,
        missing_evidence_operations: [...inventory.missing_evidence_operations, operationId],
    };
}
/**
 * Add integrity failure
 */
function addIntegrityFailure(inventory, evidenceId) {
    return {
        ...inventory,
        integrity_failures: [...inventory.integrity_failures, evidenceId],
    };
}
/**
 * Add raw evidence file
 */
function addRawEvidenceFile(inventory, filePath) {
    return {
        ...inventory,
        raw_evidence_files: [...inventory.raw_evidence_files, filePath],
    };
}
/**
 * Increment evidence item count
 */
function incrementEvidenceCount(inventory, count = 1) {
    return {
        ...inventory,
        total_evidence_items: inventory.total_evidence_items + count,
    };
}
/**
 * Check if inventory has issues (missing evidence or integrity failures)
 */
function hasInventoryIssues(inventory) {
    return (inventory.missing_evidence_operations.length > 0 ||
        inventory.integrity_failures.length > 0);
}
//# sourceMappingURL=supporting.js.map