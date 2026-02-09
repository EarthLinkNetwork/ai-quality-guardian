"use strict";
/**
 * Restart Detection Utility
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-RESUME-1, AC-RESUME-2:
 * - Detects when executor process has terminated
 * - Supports "Resume = Replay" principle
 * - Default is rollback → replay for safety
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectRestartCondition = detectRestartCondition;
exports.shouldShowResumeUI = shouldShowResumeUI;
exports.getResumeOptions = getResumeOptions;
exports.addProgressEvent = addProgressEvent;
exports.createHeartbeatEvent = createHeartbeatEvent;
exports.createToolProgressEvent = createToolProgressEvent;
exports.createLogChunkEvent = createLogChunkEvent;
const DEFAULT_CONFIG = {
    staleThresholdMs: 30000,
    allowSoftResume: true,
};
/**
 * Detects if a task's executor process has likely terminated
 *
 * Per AC-RESUME-1: After Web UI restart, execution processes are assumed terminated
 * Per AC-RESUME-2: Default is rollback → replay when restart detected
 *
 * @param task - The persisted task to check
 * @param config - Optional configuration
 * @returns Detection result with recommended action
 */
function detectRestartCondition(task, config = {}) {
    const { staleThresholdMs, allowSoftResume } = { ...DEFAULT_CONFIG, ...config };
    // Only check RUNNING tasks
    if (task.status !== 'RUNNING') {
        return {
            isStale: false,
            reason: 'none',
            elapsedMs: 0,
            recommendedAction: 'none',
        };
    }
    const events = task.events || [];
    const lastEvent = events[events.length - 1];
    // Calculate elapsed time since last progress
    const lastProgressTime = lastEvent?.timestamp || task.updated_at;
    const elapsed = Date.now() - new Date(lastProgressTime).getTime();
    // Check if task is stale
    if (elapsed > staleThresholdMs) {
        // Determine recommended action
        const hasCompleteArtifacts = checkArtifactsComplete(task, events);
        const recommendedAction = (allowSoftResume && hasCompleteArtifacts)
            ? 'soft_resume'
            : 'rollback_replay';
        return {
            isStale: true,
            reason: events.length === 0 ? 'no_events' : 'timeout',
            elapsedMs: elapsed,
            lastEventTimestamp: lastEvent?.timestamp,
            recommendedAction,
        };
    }
    return {
        isStale: false,
        reason: 'none',
        elapsedMs: elapsed,
        lastEventTimestamp: lastEvent?.timestamp,
        recommendedAction: 'none',
    };
}
/**
 * Checks if a task is a candidate for AWAITING_RESPONSE status
 * Based on stale detection + user needs to respond
 *
 * @param task - The task to check
 * @param config - Optional configuration
 * @returns true if task should show Resume UI
 */
function shouldShowResumeUI(task, config = {}) {
    // AWAITING_RESPONSE always shows Resume UI
    if (task.status === 'AWAITING_RESPONSE') {
        return true;
    }
    // Check for stale RUNNING tasks
    const detection = detectRestartCondition(task, config);
    return detection.isStale;
}
/**
 * Determines available resume options for a task
 *
 * Per AC-RESUME-3: Task detail shows Resume/Rollback options
 *
 * @param task - The task to check
 * @param config - Optional configuration
 * @returns Available resume options
 */
function getResumeOptions(task, config = {}) {
    const detection = detectRestartCondition(task, config);
    if (!detection.isStale && task.status !== 'AWAITING_RESPONSE') {
        return {
            canResume: false,
            canRollbackReplay: false,
            canSoftResume: false,
            defaultAction: 'none',
        };
    }
    const hasCompleteArtifacts = checkArtifactsComplete(task, task.events || []);
    return {
        canResume: true,
        canRollbackReplay: true,
        canSoftResume: hasCompleteArtifacts && config.allowSoftResume !== false,
        defaultAction: detection.recommendedAction,
    };
}
/**
 * Checks if task artifacts are complete enough for soft resume
 *
 * Per AC-RESUME-2: Soft resume allowed only when artifacts are saved:
 * - Applied patches
 * - Step log
 * - Test failure summary
 *
 * @param task - The task to check
 * @param events - Progress events
 * @returns true if artifacts are complete
 */
function checkArtifactsComplete(task, events) {
    // Check for required artifact events
    const hasStepLog = events.some(e => e.type === 'log_chunk' ||
        (e.type === 'tool_progress' && e.data));
    // Check if task has output (partial work saved)
    const hasOutput = !!task.output && task.output.trim() !== '';
    // For now, require both step log and output for soft resume
    return hasStepLog && hasOutput;
}
/**
 * Adds a progress event to a task
 *
 * @param task - The task to update
 * @param event - The event to add (without timestamp)
 * @returns Updated task with new event
 */
function addProgressEvent(task, event) {
    const newEvent = {
        ...event,
        timestamp: new Date().toISOString(),
    };
    return {
        ...task,
        events: [...(task.events || []), newEvent],
        updated_at: newEvent.timestamp,
    };
}
/**
 * Creates a heartbeat event
 */
function createHeartbeatEvent() {
    return { type: 'heartbeat' };
}
/**
 * Creates a tool progress event
 */
function createToolProgressEvent(data) {
    return { type: 'tool_progress', data };
}
/**
 * Creates a log chunk event
 */
function createLogChunkEvent(data) {
    return { type: 'log_chunk', data };
}
//# sourceMappingURL=restart-detector.js.map