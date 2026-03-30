/**
 * Task Tracker Types
 *
 * Type definitions for TaskTracker, TaskSnapshot, and TaskSummary entities.
 * Part of the Single-Table DynamoDB design in pm-project-indexes.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md
 */

// ==================== TaskTracker ====================

/**
 * Plan status for TaskPlan
 */
export type TaskTrackerPlanStatus =
  | "PLANNING"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/**
 * Subtask status within a plan
 */
export type SubtaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "DONE"
  | "SKIPPED"
  | "FAILED";

/**
 * Task status for tracked tasks
 */
export type TrackedTaskStatus =
  | "QUEUED"
  | "RUNNING"
  | "BLOCKED"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

/**
 * Snapshot trigger reasons
 */
export type SnapshotTrigger =
  | "PERIODIC"
  | "TASK_COMPLETE"
  | "PLAN_PHASE_CHANGE"
  | "CONTEXT_LIMIT_WARNING"
  | "USER_REQUESTED"
  | "SESSION_END";

/**
 * A planned subtask within a TaskPlan
 */
export interface PlannedSubtask {
  subtaskId: string;
  description: string;
  status: SubtaskStatus;
  order: number;
  dependencies: string[];
  assignedRunId?: string;
  result?: string;
  error?: string;
}

/**
 * A task plan with subtasks
 */
export interface TaskPlan {
  planId: string;
  title: string;
  originalPrompt: string;
  subtasks: PlannedSubtask[];
  status: TaskTrackerPlanStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * An individual tracked task
 */
export interface TrackedTask {
  taskId: string;
  title: string;
  status: TrackedTaskStatus;
  priority: number;
  planId?: string;
  subtaskId?: string;
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  lastUpdate: string;
  contextSnippet?: string;
}

/**
 * TaskTracker entity — main project-level task management state
 *
 * DynamoDB Keys: PK=ORG#<orgId>, SK=TRACKER#<projectId>
 */
export interface TaskTracker {
  PK: string;
  SK: string;
  projectId: string;
  orgId: string;
  currentPlan: TaskPlan | null;
  activeTasks: TrackedTask[];
  completedTaskIds: string[];
  lastContextSummary: string | null;
  lastCheckpointAt: string | null;
  recoveryHint: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

// ==================== TaskSnapshot ====================

/**
 * TaskSnapshot entity — checkpoint of tracker state
 *
 * DynamoDB Keys: PK=ORG#<orgId>, SK=TSNAP#<projectId>#<snapshotId>
 */
export interface TaskSnapshot {
  PK: string;
  SK: string;
  snapshotId: string;
  projectId: string;
  orgId: string;
  trigger: SnapshotTrigger;
  trackerState: TaskTracker;
  contextSummary: string;
  filesModified: string[];
  gitState?: {
    branch: string;
    commitHash: string;
    uncommittedChanges: number;
  };
  createdAt: string;
  ttl: number;
}

// ==================== TaskSummary ====================

/**
 * TaskSummary entity — LLM-generated summary of a completed task
 *
 * DynamoDB Keys: PK=ORG#<orgId>, SK=TSUM#<projectId>#<taskId>
 */
export interface TaskSummary {
  PK: string;
  SK: string;
  taskId: string;
  projectId: string;
  orgId: string;
  title: string;
  summary: string;
  keyDecisions: string[];
  filesChanged: string[];
  testResults?: {
    total: number;
    passed: number;
    failed: number;
  };
  generatedBy: string;
  generatedAt: string;
  createdAt: string;
  ttl: number;
}

// ==================== Input Types ====================

/**
 * Input for creating a TaskSnapshot
 */
export interface CreateTaskSnapshotInput {
  projectId: string;
  orgId: string;
  trigger: SnapshotTrigger;
  trackerState: TaskTracker;
  contextSummary: string;
  filesModified: string[];
  gitState?: TaskSnapshot["gitState"];
}

/**
 * Input for creating a TaskSummary
 */
export interface CreateTaskSummaryInput {
  taskId: string;
  projectId: string;
  orgId: string;
  title: string;
  summary: string;
  keyDecisions: string[];
  filesChanged: string[];
  testResults?: TaskSummary["testResults"];
  generatedBy: string;
}

// ==================== Optimistic Lock Error ====================

/**
 * Error thrown when optimistic lock version check fails
 */
export class OptimisticLockError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion?: number
  ) {
    super(
      `Optimistic lock failed: expected version ${expectedVersion}` +
        (actualVersion !== undefined ? `, got ${actualVersion}` : "")
    );
    this.name = "OptimisticLockError";
  }
}
