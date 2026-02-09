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
import { IQueueStore } from '../queue/queue-store';
import { RestartAction, RestartState } from './types';
export interface RestartHandlerOptions {
    /** Stale threshold in milliseconds (default: 30000) */
    staleThresholdMs?: number;
    /** Queue store to use for task operations */
    queueStore: IQueueStore;
}
export interface RestartCheckResult {
    /** Total tasks checked */
    totalChecked: number;
    /** Tasks that need action */
    needsAction: RestartState[];
    /** Tasks that are stale */
    staleTasks: string[];
    /** Tasks that can continue */
    continueTasks: string[];
    /** Tasks that need rollback */
    rollbackTasks: string[];
}
/**
 * RestartHandler
 *
 * Checks and handles restart scenarios for tasks.
 * Per SUP-6: Ensures proper state recovery after crashes/restarts.
 */
export declare class RestartHandler {
    private readonly options;
    constructor(options: RestartHandlerOptions);
    /**
     * Check all tasks for restart scenarios
     */
    checkAllTasks(): Promise<RestartCheckResult>;
    /**
     * Handle a single task for restart
     */
    handleTask(taskId: string): Promise<RestartState>;
    /**
     * Apply restart action to a task
     */
    private applyRestartAction;
    /**
     * Recover all stale tasks
     * Returns number of tasks that were rolled back
     */
    recoverStaleTasks(): Promise<number>;
    /**
     * Map QueueItem to TaskState for detectRestartState
     */
    private mapQueueItemToTaskState;
}
export { RestartAction, RestartState };
//# sourceMappingURL=restart-handler.d.ts.map