"use strict";
/**
 * Run Model
 * Per spec 05_DATA_MODELS.md L69-104
 *
 * Run は一連のタスク実行単位を表す。1つのスレッド内に複数の Run が存在できる。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRunId = generateRunId;
exports.resetRunCounter = resetRunCounter;
exports.createRun = createRun;
exports.completeRun = completeRun;
exports.failRun = failRun;
exports.cancelRun = cancelRun;
exports.validateRun = validateRun;
exports.isRunning = isRunning;
exports.isCompleted = isCompleted;
exports.isFailed = isFailed;
exports.isCancelled = isCancelled;
exports.isTerminal = isTerminal;
exports.getRunDuration = getRunDuration;
const enums_1 = require("./enums");
/**
 * Run counter for generating unique IDs
 */
let runCounter = 0;
/**
 * Generate a unique run ID
 * Format: run_<連番>
 */
function generateRunId() {
    runCounter++;
    return `run_${runCounter}`;
}
/**
 * Reset run counter (for testing)
 */
function resetRunCounter() {
    runCounter = 0;
}
/**
 * Create a new Run
 */
function createRun(threadId, sessionId, trigger) {
    return {
        run_id: generateRunId(),
        thread_id: threadId,
        session_id: sessionId,
        started_at: new Date().toISOString(),
        completed_at: null,
        status: enums_1.RunStatus.RUNNING,
        trigger,
    };
}
/**
 * Complete a Run successfully
 */
function completeRun(run) {
    return {
        ...run,
        completed_at: new Date().toISOString(),
        status: enums_1.RunStatus.COMPLETED,
    };
}
/**
 * Fail a Run
 */
function failRun(run) {
    return {
        ...run,
        completed_at: new Date().toISOString(),
        status: enums_1.RunStatus.FAILED,
    };
}
/**
 * Cancel a Run
 */
function cancelRun(run) {
    return {
        ...run,
        completed_at: new Date().toISOString(),
        status: enums_1.RunStatus.CANCELLED,
    };
}
/**
 * Validate a Run object
 */
function validateRun(run) {
    if (typeof run !== 'object' || run === null) {
        return false;
    }
    const r = run;
    // Required fields
    if (typeof r.run_id !== 'string' || !r.run_id.startsWith('run_')) {
        return false;
    }
    if (typeof r.thread_id !== 'string' || r.thread_id.length === 0) {
        return false;
    }
    if (typeof r.session_id !== 'string' || r.session_id.length === 0) {
        return false;
    }
    if (typeof r.started_at !== 'string') {
        return false;
    }
    if (r.completed_at !== null && typeof r.completed_at !== 'string') {
        return false;
    }
    if (!Object.values(enums_1.RunStatus).includes(r.status)) {
        return false;
    }
    if (!Object.values(enums_1.RunTrigger).includes(r.trigger)) {
        return false;
    }
    return true;
}
/**
 * Check if a run is currently running
 */
function isRunning(run) {
    return run.status === enums_1.RunStatus.RUNNING;
}
/**
 * Check if a run has completed (either successfully or with failure)
 */
function isCompleted(run) {
    return run.status === enums_1.RunStatus.COMPLETED;
}
/**
 * Check if a run has failed
 */
function isFailed(run) {
    return run.status === enums_1.RunStatus.FAILED;
}
/**
 * Check if a run was cancelled
 */
function isCancelled(run) {
    return run.status === enums_1.RunStatus.CANCELLED;
}
/**
 * Check if a run is in a terminal state (completed, failed, or cancelled)
 */
function isTerminal(run) {
    return (run.status === enums_1.RunStatus.COMPLETED ||
        run.status === enums_1.RunStatus.FAILED ||
        run.status === enums_1.RunStatus.CANCELLED);
}
/**
 * Get duration of a run in milliseconds
 * Returns null if run is still in progress
 */
function getRunDuration(run) {
    if (run.completed_at === null) {
        return null;
    }
    const start = new Date(run.started_at).getTime();
    const end = new Date(run.completed_at).getTime();
    return end - start;
}
//# sourceMappingURL=run.js.map