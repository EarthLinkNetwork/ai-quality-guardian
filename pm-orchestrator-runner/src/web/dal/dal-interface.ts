/**
 * DAL Interface - Unified data access layer interface
 *
 * Covers ALL methods currently used by routes via NoDynamoDAL and NoDynamoDALWithConversations.
 * Both file-based (NoDynamo) and DynamoDB implementations must implement this interface.
 */

import {
  ProjectIndex,
  CreateProjectIndexInput,
  UpdateProjectIndexInput,
  ListProjectIndexOptions,
  PaginatedResult,
  Session,
  CreateSessionInput,
  ActivityEvent,
  CreateActivityEventInput,
  ListActivityEventsOptions,
  TaskEventType,
  LogLevel,
  ConversationMessage,
  CreateConversationMessageInput,
  UpdateConversationMessageInput,
  Plan,
  CreatePlanInput,
  UpdatePlanInput,
  PluginDefinition,
} from "./types";
import type { NoDynamoRun, NoDynamoEvent, InspectionPacket } from "./no-dynamo";
import type {
  TaskTracker,
  TaskPlan,
  TrackedTask,
  TaskSnapshot,
  TaskSummary,
  CreateTaskSnapshotInput,
  CreateTaskSummaryInput,
} from "./task-tracker-types";
import type {
  PRReviewState,
  PRReviewComment,
  PRReviewCycle,
  PRReviewStatus,
  CommentJudgment,
  CreatePRReviewStateInput,
  UpdatePRReviewStateInput,
} from "./pr-review-types";

/**
 * IDataAccessLayer - Complete interface for all data access operations
 *
 * Covers:
 * - ProjectIndex CRUD (dashboard.ts, selfhost.ts, devconsole.ts, session-logs.ts)
 * - Session CRUD (dashboard.ts, chat.ts, session-logs.ts)
 * - Run CRUD (dashboard.ts, chat.ts, inspection.ts)
 * - Events (dashboard.ts, inspection.ts)
 * - ActivityEvents (dashboard.ts, server.ts)
 * - InspectionPackets (inspection.ts)
 * - Plans (dashboard.ts)
 * - Conversations (chat.ts, selfhost.ts, devconsole.ts)
 * - Plugins (devconsole.ts)
 * - TaskTracker (task tracker persistence)
 * - PRReview (PR review automation)
 */
export interface IDataAccessLayer {
  // ==================== Project Index ====================

  createProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex>;
  getProjectIndex(projectId: string): Promise<ProjectIndex | null>;
  getProjectIndexByPath(projectPath: string): Promise<ProjectIndex | null>;
  listProjectIndexes(options?: ListProjectIndexOptions): Promise<PaginatedResult<ProjectIndex>>;
  updateProjectIndex(projectId: string, updates: UpdateProjectIndexInput): Promise<ProjectIndex | null>;
  archiveProject(projectId: string): Promise<ProjectIndex | null>;
  unarchiveProject(projectId: string): Promise<ProjectIndex | null>;
  getOrCreateProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex>;

  // ==================== Sessions ====================

  createSession(input: CreateSessionInput): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  listSessions(projectId?: string): Promise<Session[]>;
  updateSession(sessionId: string, updates: Partial<Session>): Promise<Session | null>;
  endSession(sessionId: string): Promise<Session | null>;

  // ==================== Runs ====================

  createRun(input: {
    sessionId: string;
    projectId?: string;
    threadId?: string;
    taskRunId: string;
    prompt?: string;
  }): Promise<NoDynamoRun>;
  getRun(runId: string): Promise<NoDynamoRun | null>;
  listRuns(sessionId?: string): Promise<NoDynamoRun[]>;
  findRunByTaskRunId(taskRunId: string): Promise<NoDynamoRun | null>;
  updateRun(runId: string, updates: Partial<NoDynamoRun>): Promise<NoDynamoRun | null>;

  // ==================== Events ====================

  recordEvent(input: {
    runId: string;
    sessionId?: string;
    projectId?: string;
    type: TaskEventType;
    message: string;
    level?: LogLevel;
    payload?: Record<string, unknown>;
    actor?: string;
    correlationId?: string;
  }): Promise<NoDynamoEvent>;
  listEvents(runId?: string): Promise<NoDynamoEvent[]>;

  // ==================== Activity Events ====================

  createActivityEvent(input: CreateActivityEventInput): Promise<ActivityEvent>;
  listActivityEvents(options?: ListActivityEventsOptions): Promise<PaginatedResult<ActivityEvent>>;

  // ==================== Inspection Packets ====================

  generateInspectionPacket(input: {
    runId: string;
    generatedBy: string;
    includeAllLogs?: boolean;
  }): Promise<InspectionPacket>;
  getInspectionPacket(packetId: string): Promise<InspectionPacket | null>;
  listInspectionPackets(runId?: string): Promise<InspectionPacket[]>;
  formatPacketAsMarkdown(packet: InspectionPacket): string;
  formatPacketForClipboard(packet: InspectionPacket): string;

  // ==================== Plans ====================

  createPlan(input: CreatePlanInput): Promise<Plan>;
  getPlan(planId: string): Promise<Plan | null>;
  updatePlan(planId: string, updates: UpdatePlanInput): Promise<Plan | null>;
  listPlans(projectId?: string): Promise<Plan[]>;
  getLatestPlanForProject(projectId: string): Promise<Plan | null>;

  // ==================== Conversations ====================

  createConversationMessage(input: CreateConversationMessageInput): Promise<ConversationMessage>;
  listConversationMessages(projectId: string, limit?: number): Promise<ConversationMessage[]>;
  getConversationMessage(projectId: string, messageId: string): Promise<ConversationMessage | null>;
  updateConversationMessage(
    projectId: string,
    messageId: string,
    updates: UpdateConversationMessageInput
  ): Promise<ConversationMessage | null>;
  getAwaitingResponseMessage(projectId: string): Promise<ConversationMessage | null>;
  clearConversationHistory(projectId: string): Promise<void>;

  // ==================== Plugins ====================

  createPlugin(plugin: PluginDefinition): Promise<PluginDefinition>;
  getPlugin(pluginId: string): Promise<PluginDefinition | null>;
  listPlugins(): Promise<PluginDefinition[]>;
  updatePlugin(pluginId: string, updates: Partial<PluginDefinition>): Promise<PluginDefinition | null>;
  deletePlugin(pluginId: string): Promise<boolean>;

  // ==================== Task Tracker ====================

  getTaskTracker(projectId: string): Promise<TaskTracker | null>;
  upsertTaskTracker(tracker: TaskTracker): Promise<TaskTracker>;
  updateTaskTrackerPlan(
    projectId: string,
    plan: TaskPlan,
    expectedVersion: number
  ): Promise<TaskTracker>;
  updateTaskTrackerTasks(
    projectId: string,
    tasks: TrackedTask[],
    expectedVersion: number
  ): Promise<TaskTracker>;
  updateTaskTrackerContext(
    projectId: string,
    contextSummary: string,
    recoveryHint: string | null,
    expectedVersion: number
  ): Promise<TaskTracker>;
  deleteTaskTracker(projectId: string): Promise<void>;

  // ==================== Task Snapshots ====================

  createTaskSnapshot(input: CreateTaskSnapshotInput): Promise<TaskSnapshot>;
  getLatestTaskSnapshot(projectId: string): Promise<TaskSnapshot | null>;
  listTaskSnapshots(projectId: string, limit?: number): Promise<TaskSnapshot[]>;

  // ==================== Task Summaries ====================

  createTaskSummary(input: CreateTaskSummaryInput): Promise<TaskSummary>;
  getTaskSummary(projectId: string, taskId: string): Promise<TaskSummary | null>;
  listTaskSummaries(projectId: string): Promise<TaskSummary[]>;

  // ==================== PR Review State ====================

  createPRReviewState(input: CreatePRReviewStateInput): Promise<PRReviewState>;
  getPRReviewState(projectId: string, prNumber: number): Promise<PRReviewState | null>;
  updatePRReviewState(
    projectId: string,
    prNumber: number,
    updates: UpdatePRReviewStateInput & { version: number }
  ): Promise<PRReviewState>;
  listPRReviewStates(
    projectId: string,
    options?: { status?: PRReviewStatus; limit?: number }
  ): Promise<PRReviewState[]>;
  deletePRReviewState(projectId: string, prNumber: number): Promise<void>;

  // ==================== PR Review Comments ====================

  batchCreatePRReviewComments(comments: PRReviewComment[]): Promise<void>;
  getPRReviewComment(
    projectId: string,
    prNumber: number,
    commentId: string
  ): Promise<PRReviewComment | null>;
  listPRReviewComments(
    projectId: string,
    prNumber: number,
    filter?: { judgment?: CommentJudgment; fixApplied?: boolean; cycle?: number }
  ): Promise<PRReviewComment[]>;
  updatePRReviewComment(
    projectId: string,
    prNumber: number,
    commentId: string,
    updates: Partial<
      Pick<
        PRReviewComment,
        | "judgment"
        | "judgmentReason"
        | "fixApplied"
        | "fixCommitHash"
        | "fixDescription"
        | "userOverride"
      >
    >
  ): Promise<PRReviewComment>;

  // ==================== PR Review Cycles ====================

  createPRReviewCycle(input: PRReviewCycle): Promise<PRReviewCycle>;
  getPRReviewCycle(
    projectId: string,
    prNumber: number,
    cycleNumber: number
  ): Promise<PRReviewCycle | null>;
  listPRReviewCycles(projectId: string, prNumber: number): Promise<PRReviewCycle[]>;
  updatePRReviewCycle(
    projectId: string,
    prNumber: number,
    cycleNumber: number,
    updates: Partial<PRReviewCycle>
  ): Promise<PRReviewCycle>;

  // ==================== Utility ====================

  clearAll(): Promise<void>;
  getStats(orgId?: string): Promise<{
    projects: number;
    sessions: number;
    runs: number;
    events: number;
    packets: number;
    plans: number;
  }>;
}
