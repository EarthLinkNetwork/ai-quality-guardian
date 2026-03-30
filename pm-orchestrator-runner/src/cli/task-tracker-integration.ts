/**
 * Task Tracker CLI Integration
 *
 * Thin integration layer between the CLI lifecycle and TaskTrackerService.
 * Keeps cli/index.ts changes minimal by encapsulating init/shutdown logic here.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 10
 */

import { TaskTrackerService } from "../task-tracker/task-tracker-service";
import type { RecoveryInfo } from "../task-tracker/task-tracker-service";
import type { IDataAccessLayer } from "../web/dal/dal-interface";
import type { TaskTracker } from "../web/dal/task-tracker-types";

/**
 * Result of task tracker initialization
 */
export interface TaskTrackerInitResult {
  service: TaskTrackerService;
  tracker: TaskTracker;
  recoveryInfo: RecoveryInfo | null;
}

/**
 * Initialize TaskTrackerService, load or create tracker, and check for recovery.
 *
 * @param dal - Data access layer instance
 * @param orgId - Organization ID (derived from namespace)
 * @param projectId - Project ID (derived from projectPath)
 * @returns Initialized service, tracker state, and recovery info
 */
export async function initializeTaskTracker(
  dal: IDataAccessLayer,
  orgId: string,
  projectId: string
): Promise<TaskTrackerInitResult> {
  const service = new TaskTrackerService(dal, orgId, projectId);
  const tracker = await service.initialize();
  const recoveryInfo = await service.checkForRecovery();

  if (recoveryInfo?.hasUnfinishedWork) {
    console.log("[TaskTracker] Unfinished work detected from previous session");
    if (recoveryInfo.activePlan) {
      console.log(`[TaskTracker]   Plan: ${recoveryInfo.activePlan.title}`);
    }
    console.log(
      `[TaskTracker]   Active tasks: ${recoveryInfo.activeTaskCount}`
    );
    if (recoveryInfo.recoveryHint) {
      console.log(`[TaskTracker]   Hint: ${recoveryInfo.recoveryHint}`);
    }
    console.log(
      "[TaskTracker]   Use Web UI /task-tracker or API /api/tracker/:projectId/recover to resume"
    );
  }

  return { service, tracker, recoveryInfo };
}

/**
 * Gracefully shutdown TaskTrackerService (saves SESSION_END snapshot).
 *
 * @param service - TaskTrackerService instance, or null if not initialized
 */
export async function shutdownTaskTracker(
  service: TaskTrackerService | null
): Promise<void> {
  if (!service) return;
  try {
    await service.shutdown();
    console.log("[TaskTracker] Shutdown snapshot saved");
  } catch (error) {
    console.warn(
      "[TaskTracker] Shutdown snapshot failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}
