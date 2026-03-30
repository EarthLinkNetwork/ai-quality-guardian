/**
 * Snapshot Manager
 *
 * Manages creation and retrieval of TaskSnapshots for context recovery.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 6, 7
 */

import type { IDataAccessLayer } from "../web/dal/dal-interface";
import type {
  TaskTracker,
  TaskSnapshot,
  SnapshotTrigger,
} from "../web/dal/task-tracker-types";

/**
 * SnapshotManager handles creation and retrieval of TaskSnapshots.
 *
 * Responsibilities:
 * - Create snapshots with various triggers
 * - Retrieve latest / list snapshots
 * - Optionally capture git state
 */
export class SnapshotManager {
  private dal: IDataAccessLayer;
  private orgId: string;
  private projectId: string;

  constructor(dal: IDataAccessLayer, orgId: string, projectId: string) {
    this.dal = dal;
    this.orgId = orgId;
    this.projectId = projectId;
  }

  /**
   * Create a snapshot of the current tracker state.
   */
  async createSnapshot(
    tracker: TaskTracker,
    trigger: SnapshotTrigger,
    contextSummary: string,
    filesModified: string[],
    gitState?: TaskSnapshot["gitState"]
  ): Promise<TaskSnapshot> {
    return this.dal.createTaskSnapshot({
      projectId: this.projectId,
      orgId: this.orgId,
      trigger,
      trackerState: tracker,
      contextSummary,
      filesModified,
      gitState,
    });
  }

  /**
   * Get the most recent snapshot for this project.
   */
  async getLatestSnapshot(): Promise<TaskSnapshot | null> {
    return this.dal.getLatestTaskSnapshot(this.projectId);
  }

  /**
   * List snapshots for this project, newest first.
   */
  async listSnapshots(limit?: number): Promise<TaskSnapshot[]> {
    return this.dal.listTaskSnapshots(this.projectId, limit);
  }
}
