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

import { detectRestartState, TaskState } from './supervisor';
import { IQueueStore, QueueItem, QueueItemStatus } from '../queue/queue-store';
import { RestartAction, RestartState } from './types';

// =============================================================================
// Restart Handler
// =============================================================================

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
export class RestartHandler {
  private readonly options: Required<RestartHandlerOptions>;

  constructor(options: RestartHandlerOptions) {
    this.options = {
      staleThresholdMs: options.staleThresholdMs ?? 30000,
      queueStore: options.queueStore,
    };
  }

  /**
   * Check all tasks for restart scenarios
   */
  async checkAllTasks(): Promise<RestartCheckResult> {
    const result: RestartCheckResult = {
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
      const restartState = detectRestartState(taskState, this.options.staleThresholdMs);

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
  async handleTask(taskId: string): Promise<RestartState> {
    const task = await this.options.queueStore.getItem(taskId);
    if (!task) {
      return {
        action: 'none',
        reason: 'Task not found',
        taskId,
      };
    }

    const taskState = this.mapQueueItemToTaskState(task);
    const restartState = detectRestartState(taskState, this.options.staleThresholdMs);

    // Apply the action
    await this.applyRestartAction(task, restartState);

    return restartState;
  }

  /**
   * Apply restart action to a task
   */
  private async applyRestartAction(task: QueueItem, restartState: RestartState): Promise<void> {
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
        await this.options.queueStore.updateStatus(
          task.task_id,
          'ERROR',
          `Stale task detected: ${restartState.reason}. Needs re-queue.`
        );
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
  async recoverStaleTasks(): Promise<number> {
    const checkResult = await this.checkAllTasks();
    return checkResult.rollbackTasks.length;
  }

  /**
   * Map QueueItem to TaskState for detectRestartState
   */
  private mapQueueItemToTaskState(item: QueueItem): TaskState {
    return {
      taskId: item.task_id,
      status: item.status,
      lastProgressTimestamp: item.updated_at,
      // For now, assume no complete artifacts unless we have output
      hasCompleteArtifacts: !!item.output && item.output.length > 0,
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

export { RestartAction, RestartState };
