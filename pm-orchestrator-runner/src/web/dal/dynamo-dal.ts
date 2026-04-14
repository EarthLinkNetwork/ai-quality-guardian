/**
 * DynamoDB DAL - DynamoDB-backed data access layer
 *
 * Implements IDataAccessLayer using DynamoDB for ProjectIndex operations
 * (via project-index-dal.ts) and delegates other operations to NoDynamo
 * as a fallback until those are migrated to DynamoDB.
 */

import type { IDataAccessLayer } from "./dal-interface";
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
  PRReviewState,
  PRReviewComment,
  PRReviewCycle,
  PRReviewStatus,
  CommentJudgment,
  CreatePRReviewStateInput,
  UpdatePRReviewStateInput,
} from "./pr-review-types";
import { NoDynamoDALWithConversations, NoDynamoConfig } from "./no-dynamo";
import * as projectIndexDAL from "./project-index-dal";

/**
 * DynamoDAL - Hybrid DynamoDB + local file implementation
 *
 * ProjectIndex operations use real DynamoDB via project-index-dal.ts.
 * All other operations delegate to the file-based NoDynamo implementation
 * until they are migrated to DynamoDB.
 */
/** Transient DynamoDB errors that should allow retry on next call */
const TRANSIENT_ERRORS = new Set([
  "TimeoutError",
  "NetworkingError",
  "ThrottlingException",
  "ProvisionedThroughputExceededException",
  "RequestLimitExceeded",
  "InternalServerError",
  "ServiceUnavailable",
]);

function isTransientError(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name != null && TRANSIENT_ERRORS.has(name);
}

export class DynamoDAL implements IDataAccessLayer {
  private readonly fallback: NoDynamoDALWithConversations;
  private readonly orgId: string;
  private dynamoAvailable: boolean = true;
  private tableEnsured: boolean = false;

  constructor(config: NoDynamoConfig) {
    this.orgId = config.orgId || "default";
    this.fallback = new NoDynamoDALWithConversations(config);
  }

  /**
   * Ensure DynamoDB table exists, create if needed, migrate local data.
   * On transient failures, the check is retried on next call.
   */
  private async ensureTable(): Promise<boolean> {
    if (this.tableEnsured) return this.dynamoAvailable;

    try {
      // Test if table exists by doing a small query
      await projectIndexDAL.listProjectIndexes(this.orgId, { limit: 1 });
      this.dynamoAvailable = true;
      this.tableEnsured = true;

      // Migrate local data to DynamoDB if DynamoDB is empty
      await this.migrateLocalData();
      return true;
    } catch (err: unknown) {
      const errorName = (err as { name?: string })?.name;
      if (errorName === "ResourceNotFoundException") {
        console.log("[DynamoDAL] Table not found, creating pm-project-indexes...");
        try {
          await this.createTable();
          this.dynamoAvailable = true;
          this.tableEnsured = true;
          await this.migrateLocalData();
          return true;
        } catch (createErr) {
          console.warn("[DynamoDAL] Failed to create table, falling back to local files:", (createErr as Error).message);
          this.dynamoAvailable = false;
          this.tableEnsured = true; // Permanent failure
          return false;
        }
      }
      if (isTransientError(err)) {
        // Don't set tableEnsured — retry on next call
        console.warn("[DynamoDAL] Transient DynamoDB error, will retry:", (err as Error).message);
        return false;
      }
      console.warn("[DynamoDAL] DynamoDB unavailable, falling back to local files:", (err as Error).message);
      this.dynamoAvailable = false;
      this.tableEnsured = true; // Permanent failure
      return false;
    }
  }

  /**
   * Create the DynamoDB project-indexes table
   */
  private async createTable(): Promise<void> {
    const { CreateTableCommand, DescribeTableCommand, DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { TABLES } = await import("./client");
    const { getAwsCredentials, getAwsRegion } = await import("../../config/aws-config");
    const rawClient = new DynamoDBClient({
      region: getAwsRegion(),
      credentials: getAwsCredentials(),
    });

    await rawClient.send(new CreateTableCommand({
      TableName: TABLES.PROJECT_INDEXES,
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "projectPath", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "projectPath-index",
          KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "projectPath", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }));
    console.log("[DynamoDAL] Table pm-project-indexes created");

    // Wait for table to be active
    for (let i = 0; i < 30; i++) {
      const desc = await rawClient.send(new DescribeTableCommand({ TableName: TABLES.PROJECT_INDEXES }));
      if (desc.Table?.TableStatus === "ACTIVE") break;
      await new Promise(r => setTimeout(r, 1000));
    }
    rawClient.destroy();
  }

  /**
   * Migrate local file-based projects to DynamoDB, preserving all metadata fields
   */
  private async migrateLocalData(): Promise<void> {
    try {
      const dynamoResult = await projectIndexDAL.listProjectIndexes(this.orgId, { limit: 1 });
      if (dynamoResult.items.length > 0) return; // DynamoDB already has data

      const localResult = await this.fallback.listProjectIndexes({ includeArchived: true });
      if (localResult.items.length === 0) return; // No local data to migrate

      console.log(`[DynamoDAL] Migrating ${localResult.items.length} projects from local files to DynamoDB...`);
      for (const project of localResult.items) {
        try {
          const created = await projectIndexDAL.createProjectIndex({
            orgId: project.orgId || this.orgId,
            projectPath: project.projectPath,
            alias: project.alias,
            description: project.description,
            notes: project.notes,
            tags: project.tags,
          });
          // Preserve additional metadata fields not covered by createProjectIndex
          const metadataUpdates: Partial<Record<string, unknown>> = {};
          const src = project as unknown as Record<string, unknown>;
          const extraFields = [
            "favorite", "archived", "projectStatus", "bootstrapPrompt",
            "projectType", "inputTemplateId", "outputTemplateId",
            "aiModel", "aiProvider",
          ];
          for (const field of extraFields) {
            if (src[field] != null) metadataUpdates[field] = src[field];
          }
          if (Object.keys(metadataUpdates).length > 0) {
            await projectIndexDAL.updateProjectIndex(
              this.orgId, created.projectId, metadataUpdates as UpdateProjectIndexInput,
            );
          }
        } catch (err) {
          console.warn(`[DynamoDAL] Failed to migrate project ${project.projectId}:`, (err as Error).message);
        }
      }
      console.log(`[DynamoDAL] Migration complete`);
    } catch (err) {
      console.warn("[DynamoDAL] Migration failed (non-fatal):", (err as Error).message);
    }
  }

  // ==================== Project Index (DynamoDB with fallback) ====================

  private async dynamoProjectOp<T>(op: () => Promise<T>, fallbackOp: () => Promise<T>): Promise<T> {
    if (await this.ensureTable()) {
      try {
        return await op();
      } catch (err) {
        if (isTransientError(err)) {
          console.warn("[DynamoDAL] Transient error in project operation, falling back:", (err as Error).message);
        } else {
          console.error("[DynamoDAL] DynamoDB project operation failed:", (err as Error).message);
        }
      }
    }
    return fallbackOp();
  }

  async createProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex> {
    return this.dynamoProjectOp(
      () => projectIndexDAL.createProjectIndex(input),
      () => this.fallback.createProjectIndex(input),
    );
  }

  async getProjectIndex(projectId: string): Promise<ProjectIndex | null> {
    // Try DynamoDB first, then fallback. If DynamoDB returns null (orgId mismatch),
    // also check fallback since the project may exist with a different orgId.
    if (await this.ensureTable()) {
      try {
        const result = await projectIndexDAL.getProjectIndex(this.orgId, projectId);
        if (result) return result;
      } catch (err) {
        if (!isTransientError(err)) {
          console.error("[DynamoDAL] getProjectIndex failed:", (err as Error).message);
        }
      }
    }
    return this.fallback.getProjectIndex(projectId);
  }

  async getProjectIndexByPath(projectPath: string): Promise<ProjectIndex | null> {
    if (await this.ensureTable()) {
      try {
        const result = await projectIndexDAL.getProjectIndexByPath(this.orgId, projectPath);
        if (result) return result;
      } catch (err) {
        if (!isTransientError(err)) {
          console.error("[DynamoDAL] getProjectIndexByPath failed:", (err as Error).message);
        }
      }
    }
    return this.fallback.getProjectIndexByPath(projectPath);
  }

  async listProjectIndexes(options?: ListProjectIndexOptions): Promise<PaginatedResult<ProjectIndex>> {
    // Use request-level orgId if provided, otherwise use DAL-level orgId
    const effectiveOrgId = options?.orgId || this.orgId;
    return this.dynamoProjectOp(
      () => projectIndexDAL.listProjectIndexes(effectiveOrgId, options),
      () => this.fallback.listProjectIndexes(options),
    );
  }

  async updateProjectIndex(projectId: string, updates: UpdateProjectIndexInput): Promise<ProjectIndex | null> {
    return this.dynamoProjectOp(
      () => projectIndexDAL.updateProjectIndex(this.orgId, projectId, updates),
      () => this.fallback.updateProjectIndex(projectId, updates),
    );
  }

  async archiveProject(projectId: string): Promise<ProjectIndex | null> {
    return this.dynamoProjectOp(
      () => projectIndexDAL.archiveProject(this.orgId, projectId),
      () => this.fallback.archiveProject(projectId),
    );
  }

  async unarchiveProject(projectId: string): Promise<ProjectIndex | null> {
    return this.dynamoProjectOp(
      () => projectIndexDAL.unarchiveProject(this.orgId, projectId),
      () => this.fallback.unarchiveProject(projectId),
    );
  }

  async getOrCreateProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex> {
    const existing = await this.getProjectIndexByPath(input.projectPath);
    if (existing) {
      return existing;
    }
    return this.createProjectIndex(input);
  }

  // ==================== Sessions (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB sessions table

  async createSession(input: CreateSessionInput): Promise<Session> {
    return this.fallback.createSession(input);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.fallback.getSession(sessionId);
  }

  async listSessions(projectId?: string): Promise<Session[]> {
    return this.fallback.listSessions(projectId);
  }

  async updateSession(sessionId: string, updates: Partial<Session>): Promise<Session | null> {
    return this.fallback.updateSession(sessionId, updates);
  }

  async endSession(sessionId: string): Promise<Session | null> {
    return this.fallback.endSession(sessionId);
  }

  // ==================== Runs (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB tasks table

  async createRun(input: {
    sessionId: string;
    projectId?: string;
    threadId?: string;
    taskRunId: string;
    prompt?: string;
  }): Promise<NoDynamoRun> {
    return this.fallback.createRun(input);
  }

  async getRun(runId: string): Promise<NoDynamoRun | null> {
    return this.fallback.getRun(runId);
  }

  async listRuns(sessionId?: string): Promise<NoDynamoRun[]> {
    return this.fallback.listRuns(sessionId);
  }

  async findRunByTaskRunId(taskRunId: string): Promise<NoDynamoRun | null> {
    return this.fallback.findRunByTaskRunId(taskRunId);
  }

  async updateRun(runId: string, updates: Partial<NoDynamoRun>): Promise<NoDynamoRun | null> {
    return this.fallback.updateRun(runId, updates);
  }

  // ==================== Events (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB task-events table

  async recordEvent(input: {
    runId: string;
    sessionId?: string;
    projectId?: string;
    type: TaskEventType;
    message: string;
    level?: LogLevel;
    payload?: Record<string, unknown>;
    actor?: string;
    correlationId?: string;
  }): Promise<NoDynamoEvent> {
    return this.fallback.recordEvent(input);
  }

  async listEvents(runId?: string): Promise<NoDynamoEvent[]> {
    return this.fallback.listEvents(runId);
  }

  // ==================== Activity Events (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB

  async createActivityEvent(input: CreateActivityEventInput): Promise<ActivityEvent> {
    return this.fallback.createActivityEvent(input);
  }

  async listActivityEvents(options?: ListActivityEventsOptions): Promise<PaginatedResult<ActivityEvent>> {
    return this.fallback.listActivityEvents(options);
  }

  // ==================== Inspection Packets (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB or S3

  async generateInspectionPacket(input: {
    runId: string;
    generatedBy: string;
    includeAllLogs?: boolean;
  }): Promise<InspectionPacket> {
    return this.fallback.generateInspectionPacket(input);
  }

  async getInspectionPacket(packetId: string): Promise<InspectionPacket | null> {
    return this.fallback.getInspectionPacket(packetId);
  }

  async listInspectionPackets(runId?: string): Promise<InspectionPacket[]> {
    return this.fallback.listInspectionPackets(runId);
  }

  formatPacketAsMarkdown(packet: InspectionPacket): string {
    return this.fallback.formatPacketAsMarkdown(packet);
  }

  formatPacketForClipboard(packet: InspectionPacket): string {
    return this.fallback.formatPacketForClipboard(packet);
  }

  // ==================== Plans (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    return this.fallback.createPlan(input);
  }

  async getPlan(planId: string): Promise<Plan | null> {
    return this.fallback.getPlan(planId);
  }

  async updatePlan(planId: string, updates: UpdatePlanInput): Promise<Plan | null> {
    return this.fallback.updatePlan(planId, updates);
  }

  async listPlans(projectId?: string): Promise<Plan[]> {
    return this.fallback.listPlans(projectId);
  }

  async getLatestPlanForProject(projectId: string): Promise<Plan | null> {
    return this.fallback.getLatestPlanForProject(projectId);
  }

  // ==================== Conversations (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB

  async createConversationMessage(input: CreateConversationMessageInput): Promise<ConversationMessage> {
    return this.fallback.createConversationMessage(input);
  }

  async listConversationMessages(projectId: string, limit?: number): Promise<ConversationMessage[]> {
    return this.fallback.listConversationMessages(projectId, limit);
  }

  async getConversationMessage(projectId: string, messageId: string): Promise<ConversationMessage | null> {
    return this.fallback.getConversationMessage(projectId, messageId);
  }

  async updateConversationMessage(
    projectId: string,
    messageId: string,
    updates: UpdateConversationMessageInput
  ): Promise<ConversationMessage | null> {
    return this.fallback.updateConversationMessage(projectId, messageId, updates);
  }

  async getAwaitingResponseMessage(projectId: string): Promise<ConversationMessage | null> {
    return this.fallback.getAwaitingResponseMessage(projectId);
  }

  async clearConversationHistory(projectId: string): Promise<void> {
    return this.fallback.clearConversationHistory(projectId);
  }

  // ==================== Plugins (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB

  async createPlugin(plugin: PluginDefinition): Promise<PluginDefinition> {
    return this.fallback.createPlugin(plugin);
  }

  async getPlugin(pluginId: string): Promise<PluginDefinition | null> {
    return this.fallback.getPlugin(pluginId);
  }

  async listPlugins(): Promise<PluginDefinition[]> {
    return this.fallback.listPlugins();
  }

  async updatePlugin(pluginId: string, updates: Partial<PluginDefinition>): Promise<PluginDefinition | null> {
    return this.fallback.updatePlugin(pluginId, updates);
  }

  async deletePlugin(pluginId: string): Promise<boolean> {
    return this.fallback.deletePlugin(pluginId);
  }


  // ==================== PR Review State (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB

  async createPRReviewState(input: CreatePRReviewStateInput): Promise<PRReviewState> {
    return this.fallback.createPRReviewState(input);
  }

  async getPRReviewState(projectId: string, prNumber: number): Promise<PRReviewState | null> {
    return this.fallback.getPRReviewState(projectId, prNumber);
  }

  async updatePRReviewState(
    projectId: string,
    prNumber: number,
    updates: UpdatePRReviewStateInput & { version: number }
  ): Promise<PRReviewState> {
    return this.fallback.updatePRReviewState(projectId, prNumber, updates);
  }

  async listPRReviewStates(
    projectId: string,
    options?: { status?: PRReviewStatus; limit?: number }
  ): Promise<PRReviewState[]> {
    return this.fallback.listPRReviewStates(projectId, options);
  }

  async deletePRReviewState(projectId: string, prNumber: number): Promise<void> {
    return this.fallback.deletePRReviewState(projectId, prNumber);
  }

  // ==================== PR Review Comments (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB

  async batchCreatePRReviewComments(comments: PRReviewComment[]): Promise<void> {
    return this.fallback.batchCreatePRReviewComments(comments);
  }

  async getPRReviewComment(
    projectId: string,
    prNumber: number,
    commentId: string
  ): Promise<PRReviewComment | null> {
    return this.fallback.getPRReviewComment(projectId, prNumber, commentId);
  }

  async listPRReviewComments(
    projectId: string,
    prNumber: number,
    filter?: { judgment?: CommentJudgment; fixApplied?: boolean; cycle?: number }
  ): Promise<PRReviewComment[]> {
    return this.fallback.listPRReviewComments(projectId, prNumber, filter);
  }

  async updatePRReviewComment(
    projectId: string,
    prNumber: number,
    commentId: string,
    updates: Partial<Pick<PRReviewComment,
      "judgment" | "judgmentReason" | "fixApplied" | "fixCommitHash" | "fixDescription" | "userOverride"
    >>
  ): Promise<PRReviewComment> {
    return this.fallback.updatePRReviewComment(projectId, prNumber, commentId, updates);
  }

  // ==================== PR Review Cycles (fallback to NoDynamo) ====================
  // TODO: Migrate to DynamoDB

  async createPRReviewCycle(input: PRReviewCycle): Promise<PRReviewCycle> {
    return this.fallback.createPRReviewCycle(input);
  }

  async getPRReviewCycle(
    projectId: string,
    prNumber: number,
    cycleNumber: number
  ): Promise<PRReviewCycle | null> {
    return this.fallback.getPRReviewCycle(projectId, prNumber, cycleNumber);
  }

  async listPRReviewCycles(projectId: string, prNumber: number): Promise<PRReviewCycle[]> {
    return this.fallback.listPRReviewCycles(projectId, prNumber);
  }

  async updatePRReviewCycle(
    projectId: string,
    prNumber: number,
    cycleNumber: number,
    updates: Partial<PRReviewCycle>
  ): Promise<PRReviewCycle> {
    return this.fallback.updatePRReviewCycle(projectId, prNumber, cycleNumber, updates);
  }

  // ==================== Utility ====================

  async clearAll(): Promise<void> {
    return this.fallback.clearAll();
  }

  async getStats(orgId?: string): Promise<{
    projects: number;
    sessions: number;
    runs: number;
    events: number;
    packets: number;
    plans: number;
  }> {
    const effectiveOrgId = orgId || this.orgId;
    const fileStats = await this.fallback.getStats(effectiveOrgId);
    // Override projects count from DynamoDB (source of truth)
    if (await this.ensureTable()) {
      try {
        const result = await projectIndexDAL.listProjectIndexes(effectiveOrgId, { limit: 200 });
        fileStats.projects = result.items.length;
      } catch { /* fallback to file count */ }
    }
    return fileStats;
  }
}
