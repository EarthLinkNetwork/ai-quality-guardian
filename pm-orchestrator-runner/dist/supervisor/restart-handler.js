"use strict";
/**
 * Supervisor Restart Handler
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-6
 *
 * Handles restart resilience:
 * - RUNNING + stale → rollback_replay
 * - AWAITING_RESPONSE → continue
 * - COMPLETE/ERROR → none
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestartHandler = void 0;
const supervisor_1 = require("./supervisor");
/**
 * RestartHandler
 *
 * Checks and handles restart scenarios for tasks.
 * Per SUP-6: Ensures proper state recovery after crashes/restarts.
 */
class RestartHandler {
    options;
    constructor(options) {
        this.options = {
            staleThresholdMs: options.staleThresholdMs ?? 30000,
            queueStore: options.queueStore,
        };
    }
    /**
     * Check all tasks for restart scenarios
     */
    async checkAllTasks() {
        const result = {
            totalChecked: 0,
            needsAction: [],
            staleTasks: [],
            continueTasks: [],
            rollbackTasks: [],
        };
        // Get all non-terminal tasks
        const runningTasks = await this.options.queueStore.getByStatus('RUNNING');
        const awaitingTasks = await this.options.queueStore.getByStatus('AWAITING_RESPONSE');
        const allTasks = [...runningTasks, ...awaitingTasks];
        result.totalChecked = allTasks.length;
        for (const task of allTasks) {
            const taskState = this.mapQueueItemToTaskState(task);
            const restartState = (0, supervisor_1.detectRestartState)(taskState, this.options.staleThresholdMs);
            if (restartState.action !== 'none') {
                result.needsAction.push(restartState);
                switch (restartState.action) {
                    case 'continue':
                        result.continueTasks.push(task.task_id);
                        break;
                    case 'resume':
                        result.continueTasks.push(task.task_id);
                        break;
                    case 'rollback_replay':
                        result.rollbackTasks.push(task.task_id);
                        result.staleTasks.push(task.task_id);
                        break;
                }
            }
        }
        return result;
    }
    /**
     * Handle a single task for restart
     */
    async handleTask(taskId) {
        const task = await this.options.queueStore.getItem(taskId);
        if (!task) {
            return {
                action: 'none',
                reason: 'Task not found',
                taskId,
            };
        }
        const taskState = this.mapQueueItemToTaskState(task);
        const restartState = (0, supervisor_1.detectRestartState)(taskState, this.options.staleThresholdMs);
        // Apply the action
        await this.applyRestartAction(task, restartState);
        return restartState;
    }
    /**
     * Apply restart action to a task
     */
    async applyRestartAction(task, restartState) {
        switch (restartState.action) {
            case 'continue':
                // Task is AWAITING_RESPONSE, no action needed - can continue when user responds
                break;
            case 'resume':
                // Task has complete artifacts, can be resumed
                // No state change needed - executor will pick up from last checkpoint
                break;
            case 'rollback_replay':
                // Task is stale without complete artifacts - mark as ERROR for re-queue
                await this.options.queueStore.updateStatus(task.task_id, 'ERROR', `Stale task detected: ${restartState.reason}. Needs re-queue.`);
                break;
            case 'none':
                // No action needed
                break;
        }
    }
    /**
     * Recover all stale tasks
     * Returns number of tasks that were rolled back
     */
    async recoverStaleTasks() {
        const checkResult = await this.checkAllTasks();
        return checkResult.rollbackTasks.length;
    }
    /**
     * Map QueueItem to TaskState for detectRestartState
     */
    mapQueueItemToTaskState(item) {
        return {
            taskId: item.task_id,
            status: item.status,
            lastProgressTimestamp: item.updated_at,
            // For now, assume no complete artifacts unless we have output
            hasCompleteArtifacts: !!item.output && item.output.length > 0,
        };
    }
}
exports.RestartHandler = RestartHandler;
//# sourceMappingURL=restart-handler.js.map