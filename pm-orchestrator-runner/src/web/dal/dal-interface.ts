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

  // ==================== Utility ====================

  clearAll(): Promise<void>;
  getStats(): Promise<{
    projects: number;
    sessions: number;
    runs: number;
    events: number;
    packets: number;
    plans: number;
  }>;
}
