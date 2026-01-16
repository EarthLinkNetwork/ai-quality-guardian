"use strict";
/**
 * Task Model
 * Based on 05_DATA_MODELS.md L23-37
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskValidationError = void 0;
exports.createTask = createTask;
exports.validateTask = validateTask;
exports.updateTaskStatus = updateTaskStatus;
exports.assignExecutor = assignExecutor;
exports.addEvidenceRef = addEvidenceRef;
exports.addModifiedFile = addModifiedFile;
exports.addTestRun = addTestRun;
exports.approveDecomposition = approveDecomposition;
const uuid_1 = require("uuid");
const enums_1 = require("./enums");
/**
 * Task validation error
 */
class TaskValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskValidationError';
    }
}
exports.TaskValidationError = TaskValidationError;
/**
 * Default granularity limits
 */
const DEFAULT_GRANULARITY_LIMITS = {
    max_files: 5,
    max_tests: 10,
    max_seconds: 300,
};
/**
 * Maximum allowed limits
 */
const MAX_LIMITS = {
    max_files: 20,
    max_tests: 50,
    max_seconds: 3600,
};
/**
 * Create a new task
 */
function createTask(description, requirements, granularityLimits) {
    return {
        task_id: `task-${(0, uuid_1.v4)()}`,
        description,
        requirements,
        status: enums_1.TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: {
            ...DEFAULT_GRANULARITY_LIMITS,
            ...granularityLimits,
        },
        decomposition_approved_by_runner: false,
    };
}
/**
 * Validate a task object
 * @throws TaskValidationError if validation fails
 */
function validateTask(task) {
    if (!task.task_id || task.task_id.length === 0) {
        throw new TaskValidationError('task_id is required');
    }
    if (!task.description || task.description.length === 0) {
        throw new TaskValidationError('description is required');
    }
    if (!Array.isArray(task.requirements)) {
        throw new TaskValidationError('requirements must be an array');
    }
    if (task.status === undefined) {
        throw new TaskValidationError('status is required');
    }
    if (!Array.isArray(task.evidence_refs)) {
        throw new TaskValidationError('evidence_refs must be an array');
    }
    if (!Array.isArray(task.files_modified)) {
        throw new TaskValidationError('files_modified must be an array');
    }
    if (!Array.isArray(task.tests_run)) {
        throw new TaskValidationError('tests_run must be an array');
    }
    // Validate granularity limits
    if (!task.granularity_limits) {
        throw new TaskValidationError('granularity_limits is required');
    }
    if (task.granularity_limits.max_files <= 0) {
        throw new TaskValidationError('max_files must be greater than 0');
    }
    if (task.granularity_limits.max_files > MAX_LIMITS.max_files) {
        throw new TaskValidationError(`max_files cannot exceed ${MAX_LIMITS.max_files}`);
    }
    if (task.granularity_limits.max_tests <= 0) {
        throw new TaskValidationError('max_tests must be greater than 0');
    }
    if (task.granularity_limits.max_tests > MAX_LIMITS.max_tests) {
        throw new TaskValidationError(`max_tests cannot exceed ${MAX_LIMITS.max_tests}`);
    }
    if (task.granularity_limits.max_seconds <= 0) {
        throw new TaskValidationError('max_seconds must be greater than 0');
    }
    if (task.granularity_limits.max_seconds > MAX_LIMITS.max_seconds) {
        throw new TaskValidationError(`max_seconds cannot exceed ${MAX_LIMITS.max_seconds}`);
    }
    return true;
}
/**
 * Update task status
 */
function updateTaskStatus(task, newStatus) {
    return {
        ...task,
        status: newStatus,
        completed_at: newStatus === enums_1.TaskStatus.COMPLETE ? new Date().toISOString() : task.completed_at,
    };
}
/**
 * Assign executor to task
 */
function assignExecutor(task, executorId) {
    return {
        ...task,
        assigned_executor: executorId,
        started_at: new Date().toISOString(),
    };
}
/**
 * Add evidence reference to task
 */
function addEvidenceRef(task, evidenceRef) {
    return {
        ...task,
        evidence_refs: [...task.evidence_refs, evidenceRef],
    };
}
/**
 * Add modified file to task
 */
function addModifiedFile(task, filePath) {
    return {
        ...task,
        files_modified: [...task.files_modified, filePath],
    };
}
/**
 * Add test run to task
 */
function addTestRun(task, testId) {
    return {
        ...task,
        tests_run: [...task.tests_run, testId],
    };
}
/**
 * Mark task decomposition as approved
 */
function approveDecomposition(task) {
    return {
        ...task,
        decomposition_approved_by_runner: true,
    };
}
//# sourceMappingURL=task.js.map