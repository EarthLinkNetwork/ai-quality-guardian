/**
 * TaskTrackerService — Application-layer orchestrator for task tracking
 *
 * Wraps DAL operations with business logic for:
 * - Initialization and recovery detection
 * - Plan and task management
 * - Context updates and checkpoint creation
 * - Periodic snapshots and lifecycle management
 * - LLM-powered summary generation (Phase 3)
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 9
 */

import { v4 as uuidv4 } from "uuid";
import type { IDataAccessLayer } from "../web/dal/dal-interface";
import type {
  TaskTracker,
  TaskPlan,
  TrackedTask,
  TaskSnapshot,
  TaskSummary,
  PlannedSubtask,
  TrackedTaskStatus,
  SubtaskStatus,
  SnapshotTrigger,
} from "../web/dal/task-tracker-types";
import { SnapshotManager } from "./snapshot-manager";
import { generateRecoveryPrompt } from "./context-recovery";
import type { LLMSummarizer } from "./llm-summarizer";

/**
 * Information about potential recovery from a previous session
 */
export interface RecoveryInfo {
  hasUnfinishedWork: boolean;
  lastCheckpointAt: string | null;
  activePlan: TaskPlan | null;
  activeTaskCount: number;
  contextSummary: string | null;
  recoveryHint: string | null;
}

/**
 * Result of a recovery operation
 */
export interface RecoveryResult {
  recovered: boolean;
  plan: TaskPlan | null;
  activeTasks: TrackedTask[];
  recoveryPrompt: string;
}

export class TaskTrackerService {
  private dal: IDataAccessLayer;
  private orgId: string;
  private projectId: string;
  private cachedTracker: TaskTracker | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotManager: SnapshotManager;
  private summarizer: LLMSummarizer | null;

  constructor(
    dal: IDataAccessLayer,
    orgId: string,
    projectId: string,
    summarizer?: LLMSummarizer
  ) {
    this.dal = dal;
    this.orgId = orgId;
    this.projectId = projectId;
    this.snapshotManager = new SnapshotManager(dal, orgId, projectId);
    this.summarizer = summarizer ?? null;
  }

  // ==================== Initialization ====================

  /**
   * Initialize the service: load existing tracker or create a new one.
   */
  async initialize(): Promise<TaskTracker> {
    let tracker = await this.dal.getTaskTracker(this.projectId);
    if (!tracker) {
      const now = new Date().toISOString();
      tracker = await this.dal.upsertTaskTracker({
        PK: `ORG#${this.orgId}`,
        SK: `TRACKER#${this.projectId}`,
        projectId: this.projectId,
        orgId: this.orgId,
        currentPlan: null,
        activeTasks: [],
        completedTaskIds: [],
        lastContextSummary: null,
        lastCheckpointAt: null,
        recoveryHint: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    this.cachedTracker = tracker;
    return tracker;
  }

  // ==================== Recovery Detection ====================

  /**
   * Check if there is unfinished work from a previous session.
   * Returns null if no tracker exists.
   */
  async checkForRecovery(): Promise<RecoveryInfo | null> {
    const tracker = await this.dal.getTaskTracker(this.projectId);
    if (!tracker) {
      return null;
    }

    const activeTaskCount = tracker.activeTasks.filter(
      (t) => t.status === "RUNNING" || t.status === "QUEUED" || t.status === "BLOCKED"
    ).length;

    const hasPendingSubtasks = tracker.currentPlan?.subtasks.some(
      (s) => s.status !== "DONE" && s.status !== "SKIPPED"
    ) ?? false;

    const planIsActive = tracker.currentPlan != null &&
      tracker.currentPlan.status !== "COMPLETED" &&
      tracker.currentPlan.status !== "CANCELLED" &&
      tracker.currentPlan.status !== "FAILED";

    const hasUnfinishedWork = activeTaskCount > 0 || (planIsActive && hasPendingSubtasks);

    return {
      hasUnfinishedWork,
      lastCheckpointAt: tracker.lastCheckpointAt,
      activePlan: tracker.currentPlan,
      activeTaskCount,
      contextSummary: tracker.lastContextSummary,
      recoveryHint: tracker.recoveryHint,
    };
  }

  // ==================== Plan Management ====================

  /**
   * Create a new plan with subtasks.
   */
  async createPlan(
    prompt: string,
    subtasks: PlannedSubtask[]
  ): Promise<TaskPlan> {
    const tracker = await this.getTracker();
    const now = new Date().toISOString();

    const plan: TaskPlan = {
      planId: `plan_${uuidv4().slice(0, 8)}`,
      title: prompt,
      originalPrompt: prompt,
      subtasks,
      status: "EXECUTING",
      createdAt: now,
      updatedAt: now,
    };

    const updated = await this.dal.updateTaskTrackerPlan(
      this.projectId,
      plan,
      tracker.version
    );
    this.cachedTracker = updated;
    return plan;
  }

  /**
   * Update a subtask's status within the current plan.
   */
  async updateSubtaskStatus(
    subtaskId: string,
    status: SubtaskStatus,
    result?: string
  ): Promise<void> {
    const tracker = await this.getTracker();

    if (!tracker.currentPlan) {
      throw new Error("No active plan");
    }

    const subtask = tracker.currentPlan.subtasks.find(
      (s) => s.subtaskId === subtaskId
    );
    if (!subtask) {
      throw new Error(`Subtask '${subtaskId}' not found`);
    }

    subtask.status = status;
    if (result !== undefined) {
      subtask.result = result;
    }
    tracker.currentPlan.updatedAt = new Date().toISOString();

    const updated = await this.dal.updateTaskTrackerPlan(
      this.projectId,
      tracker.currentPlan,
      tracker.version
    );
    this.cachedTracker = updated;
  }

  /**
   * Mark the current plan as COMPLETED and create a snapshot.
   */
  async completePlan(): Promise<void> {
    const tracker = await this.getTracker();
    if (!tracker.currentPlan) {
      throw new Error("No active plan");
    }

    tracker.currentPlan.status = "COMPLETED";
    tracker.currentPlan.updatedAt = new Date().toISOString();

    const updated = await this.dal.updateTaskTrackerPlan(
      this.projectId,
      tracker.currentPlan,
      tracker.version
    );
    this.cachedTracker = updated;

    // Create a snapshot on plan completion
    await this.snapshotManager.createSnapshot(
      updated,
      "PLAN_PHASE_CHANGE",
      tracker.currentPlan.title + " completed",
      []
    );
  }

  /**
   * Cancel the current plan.
   */
  async cancelPlan(): Promise<void> {
    const tracker = await this.getTracker();
    if (!tracker.currentPlan) {
      throw new Error("No active plan");
    }

    tracker.currentPlan.status = "CANCELLED";
    tracker.currentPlan.updatedAt = new Date().toISOString();

    const updated = await this.dal.updateTaskTrackerPlan(
      this.projectId,
      tracker.currentPlan,
      tracker.version
    );
    this.cachedTracker = updated;
  }

  // ==================== Task Management ====================

  /**
   * Add a new task to active tasks.
   */
  async addTask(
    input: Omit<TrackedTask, "taskId" | "lastUpdate">
  ): Promise<TrackedTask> {
    const tracker = await this.getTracker();
    const now = new Date().toISOString();

    const task: TrackedTask = {
      taskId: `task_${uuidv4().slice(0, 8)}`,
      lastUpdate: now,
      ...input,
    };

    const tasks = [...tracker.activeTasks, task];
    const updated = await this.dal.updateTaskTrackerTasks(
      this.projectId,
      tasks,
      tracker.version
    );
    this.cachedTracker = updated;
    return task;
  }

  /**
   * Update a task's status.
   */
  async updateTaskStatus(
    taskId: string,
    status: TrackedTaskStatus
  ): Promise<void> {
    const tracker = await this.getTracker();
    const task = tracker.activeTasks.find((t) => t.taskId === taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }

    task.status = status;
    task.lastUpdate = new Date().toISOString();

    const updated = await this.dal.updateTaskTrackerTasks(
      this.projectId,
      tracker.activeTasks,
      tracker.version
    );
    this.cachedTracker = updated;
  }

  /**
   * Complete a task: mark as DONE, move to completedTaskIds,
   * create snapshot, and optionally generate an LLM summary.
   */
  async completeTask(taskId: string): Promise<TaskSummary | null> {
    const tracker = await this.getTracker();
    const taskIndex = tracker.activeTasks.findIndex(
      (t) => t.taskId === taskId
    );
    if (taskIndex === -1) {
      throw new Error(`Task '${taskId}' not found`);
    }

    const completedTask = tracker.activeTasks[taskIndex];

    // Remove from activeTasks
    const tasks = tracker.activeTasks.filter((t) => t.taskId !== taskId);

    // Add to completedTaskIds (keep last 100)
    const completedIds = [...tracker.completedTaskIds, taskId].slice(-100);

    // Update tasks
    const updated = await this.dal.updateTaskTrackerTasks(
      this.projectId,
      tasks,
      tracker.version
    );

    // Update completedTaskIds via upsert
    updated.completedTaskIds = completedIds;
    const final = await this.dal.upsertTaskTracker(updated);
    this.cachedTracker = final;

    // Create a snapshot on task completion
    await this.snapshotManager.createSnapshot(
      final,
      "TASK_COMPLETE",
      `Task ${taskId} completed`,
      []
    );

    // Generate LLM summary if summarizer is available
    let taskSummary: TaskSummary | null = null;
    if (this.summarizer) {
      try {
        const summaryResult = await this.summarizer.generateTaskSummary(
          final,
          completedTask
        );
        taskSummary = await this.dal.createTaskSummary({
          taskId,
          projectId: this.projectId,
          orgId: this.orgId,
          title: completedTask.title,
          summary: summaryResult.summary,
          keyDecisions: summaryResult.keyDecisions,
          filesChanged: summaryResult.filesChanged,
          generatedBy: this.summarizer.getModelName(),
        });
      } catch {
        // LLM summary generation is non-fatal; fail-closed
      }
    }

    return taskSummary;
  }

  // ==================== Context Management ====================

  /**
   * Update context summary and recovery hint.
   */
  async updateContext(
    contextSummary: string,
    recoveryHint: string | null
  ): Promise<void> {
    const tracker = await this.getTracker();
    const updated = await this.dal.updateTaskTrackerContext(
      this.projectId,
      contextSummary,
      recoveryHint,
      tracker.version
    );
    this.cachedTracker = updated;
  }

  /**
   * Create a checkpoint snapshot with current state.
   * If an LLM summarizer is available, generates a context summary first.
   */
  async saveCheckpoint(
    trigger: SnapshotTrigger
  ): Promise<TaskSnapshot> {
    const tracker = await this.getTracker();

    // Generate LLM context summary if summarizer is available
    let contextSummary = tracker.lastContextSummary ?? "";
    if (this.summarizer) {
      try {
        const result = await this.summarizer.generateContextSummary(tracker);
        contextSummary = result.contextSummary;

        // Update tracker with LLM-generated context
        await this.dal.updateTaskTrackerContext(
          this.projectId,
          result.contextSummary,
          result.recoveryHint,
          tracker.version
        );
      } catch {
        // LLM summary generation is non-fatal
      }
    }

    const snapshot = await this.snapshotManager.createSnapshot(
      tracker,
      trigger,
      contextSummary,
      []
    );

    // Update lastCheckpointAt
    const now = new Date().toISOString();
    tracker.lastCheckpointAt = now;
    const refreshed = await this.dal.getTaskTracker(this.projectId);
    const updatedTracker = refreshed ?? tracker;
    const updated = await this.dal.upsertTaskTracker({
      ...updatedTracker,
      lastCheckpointAt: now,
      updatedAt: now,
    });
    this.cachedTracker = updated;

    return snapshot;
  }

  // ==================== Recovery ====================

  /**
   * Recover from a previous session's state.
   */
  async recover(): Promise<RecoveryResult> {
    const tracker = await this.dal.getTaskTracker(this.projectId);
    if (!tracker) {
      return {
        recovered: false,
        plan: null,
        activeTasks: [],
        recoveryPrompt: "",
      };
    }

    const snapshot = await this.snapshotManager.getLatestSnapshot();
    const recoveryPrompt = generateRecoveryPrompt(tracker, snapshot);

    this.cachedTracker = tracker;

    return {
      recovered: true,
      plan: tracker.currentPlan,
      activeTasks: tracker.activeTasks,
      recoveryPrompt,
    };
  }

  /**
   * Reset the tracker (delete it).
   */
  async resetTracker(): Promise<void> {
    await this.dal.deleteTaskTracker(this.projectId);
    this.cachedTracker = null;
  }

  // ==================== Lifecycle ====================

  /**
   * Start periodic snapshots at the given interval.
   * Default: 300000ms (5 minutes)
   */
  startPeriodicSnapshots(intervalMs: number = 300000): void {
    this.stopPeriodicSnapshots();
    this.snapshotTimer = setInterval(async () => {
      try {
        const tracker = await this.dal.getTaskTracker(this.projectId);
        if (tracker) {
          await this.snapshotManager.createSnapshot(
            tracker,
            "PERIODIC",
            tracker.lastContextSummary ?? "",
            []
          );
        }
      } catch {
        // fail-closed: periodic snapshot failure is non-fatal
      }
    }, intervalMs);
  }

  /**
   * Stop periodic snapshots.
   */
  stopPeriodicSnapshots(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  /**
   * Shutdown: save a SESSION_END snapshot and stop periodic snapshots.
   */
  async shutdown(): Promise<void> {
    this.stopPeriodicSnapshots();
    const tracker = await this.dal.getTaskTracker(this.projectId);
    if (tracker) {
      await this.snapshotManager.createSnapshot(
        tracker,
        "SESSION_END",
        tracker.lastContextSummary ?? "",
        []
      );
    }
  }

  // ==================== Internal ====================

  /**
   * Get the current tracker, from cache or DAL.
   * Throws if tracker has not been initialized.
   */
  private async getTracker(): Promise<TaskTracker> {
    if (this.cachedTracker) {
      // Refresh from DAL to get latest version
      const fresh = await this.dal.getTaskTracker(this.projectId);
      if (fresh) {
        this.cachedTracker = fresh;
        return fresh;
      }
    }
    const tracker = await this.dal.getTaskTracker(this.projectId);
    if (!tracker) {
      throw new Error("TaskTracker not initialized. Call initialize() first.");
    }
    this.cachedTracker = tracker;
    return tracker;
  }
}
