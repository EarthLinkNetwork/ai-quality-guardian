"use strict";
/**
 * ExecutionResult Model
 * Based on 05_DATA_MODELS.md L65-78
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionResultValidationError = void 0;
exports.createExecutionResult = createExecutionResult;
exports.validateExecutionResult = validateExecutionResult;
exports.addViolation = addViolation;
exports.addIncompleteTaskReason = addIncompleteTaskReason;
exports.updateEvidenceInventory = updateEvidenceInventory;
exports.markSpeculativeLanguageDetected = markSpeculativeLanguageDetected;
exports.approveNextAction = approveNextAction;
const enums_1 = require("./enums");
/**
 * ExecutionResult validation error
 */
class ExecutionResultValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ExecutionResultValidationError';
    }
}
exports.ExecutionResultValidationError = ExecutionResultValidationError;
/**
 * Determine if next action is allowed based on status
 */
function determineNextAction(status) {
    switch (status) {
        case enums_1.OverallStatus.COMPLETE:
            return true;
        case enums_1.OverallStatus.INCOMPLETE:
            // Requires explicit continuation approval
            return false;
        case enums_1.OverallStatus.ERROR:
        case enums_1.OverallStatus.INVALID:
        case enums_1.OverallStatus.NO_EVIDENCE:
            return false;
        default:
            return false;
    }
}
/**
 * Generate next action reason based on status
 */
function generateNextActionReason(status, tasks) {
    switch (status) {
        case enums_1.OverallStatus.COMPLETE:
            return 'All tasks completed successfully';
        case enums_1.OverallStatus.INCOMPLETE:
            return 'Session incomplete - continuation approval required';
        case enums_1.OverallStatus.ERROR:
            return 'Session terminated due to error';
        case enums_1.OverallStatus.INVALID:
            return 'Session invalid - critical validation failure';
        case enums_1.OverallStatus.NO_EVIDENCE:
            return 'Session incomplete - missing required evidence';
        default:
            return 'Unknown status';
    }
}
/**
 * Create a new execution result
 */
function createExecutionResult(sessionId, status, tasks) {
    return {
        overall_status: status,
        tasks,
        evidence_summary: {
            total: tasks.reduce((sum, t) => sum + t.evidence_refs.length, 0),
            collected: tasks.reduce((sum, t) => sum + t.evidence_refs.length, 0),
        },
        next_action: determineNextAction(status),
        next_action_reason: generateNextActionReason(status, tasks),
        violations: [],
        session_id: sessionId,
        incomplete_task_reasons: [],
        evidence_inventory: {
            total_evidence_items: 0,
            missing_evidence_operations: [],
            integrity_failures: [],
            raw_evidence_files: [],
        },
        speculative_language_detected: false,
    };
}
/**
 * Validate an execution result object
 * @throws ExecutionResultValidationError if validation fails
 */
function validateExecutionResult(result) {
    if (!result.session_id || result.session_id.length === 0) {
        throw new ExecutionResultValidationError('session_id is required');
    }
    if (result.overall_status === undefined) {
        throw new ExecutionResultValidationError('overall_status is required');
    }
    if (!Array.isArray(result.tasks)) {
        throw new ExecutionResultValidationError('tasks must be an array');
    }
    if (!result.evidence_summary) {
        throw new ExecutionResultValidationError('evidence_summary is required');
    }
    if (result.next_action === undefined) {
        throw new ExecutionResultValidationError('next_action is required');
    }
    if (!result.next_action_reason || result.next_action_reason.length === 0) {
        throw new ExecutionResultValidationError('next_action_reason is required');
    }
    if (!Array.isArray(result.violations)) {
        throw new ExecutionResultValidationError('violations must be an array');
    }
    if (!Array.isArray(result.incomplete_task_reasons)) {
        throw new ExecutionResultValidationError('incomplete_task_reasons must be an array');
    }
    if (!result.evidence_inventory) {
        throw new ExecutionResultValidationError('evidence_inventory is required');
    }
    if (result.speculative_language_detected === undefined) {
        throw new ExecutionResultValidationError('speculative_language_detected is required');
    }
    // Property 8: Speculative language detection prevents COMPLETE status
    if (result.speculative_language_detected && result.overall_status === enums_1.OverallStatus.COMPLETE) {
        throw new ExecutionResultValidationError('Cannot have COMPLETE status when speculative_language_detected is true');
    }
    return true;
}
/**
 * Add violation to execution result
 */
function addViolation(result, type, message, taskId) {
    const violation = {
        type,
        message,
        timestamp: new Date().toISOString(),
        task_id: taskId,
    };
    return {
        ...result,
        violations: [...result.violations, violation],
    };
}
/**
 * Add incomplete task reason
 */
function addIncompleteTaskReason(result, taskId, reason) {
    return {
        ...result,
        incomplete_task_reasons: [
            ...result.incomplete_task_reasons,
            { task_id: taskId, reason },
        ],
    };
}
/**
 * Update evidence inventory
 */
function updateEvidenceInventory(result, inventory) {
    return {
        ...result,
        evidence_inventory: {
            ...result.evidence_inventory,
            ...inventory,
        },
    };
}
/**
 * Mark speculative language detected
 */
function markSpeculativeLanguageDetected(result) {
    return {
        ...result,
        speculative_language_detected: true,
        // Downgrade status if it was COMPLETE
        overall_status: result.overall_status === enums_1.OverallStatus.COMPLETE
            ? enums_1.OverallStatus.INVALID
            : result.overall_status,
        next_action: false,
        next_action_reason: 'Speculative language detected - validation required',
    };
}
/**
 * Update next action with explicit approval
 */
function approveNextAction(result, reason) {
    // Only allow approval for INCOMPLETE status
    if (result.overall_status !== enums_1.OverallStatus.INCOMPLETE) {
        return result;
    }
    return {
        ...result,
        next_action: true,
        next_action_reason: reason,
    };
}
//# sourceMappingURL=execution-result.js.map