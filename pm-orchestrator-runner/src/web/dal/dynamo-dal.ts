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
import { NoDynamoDALWithConversations, NoDynamoConfig } from "./no-dynamo";
import * as projectIndexDAL from "./project-index-dal";

/**
 * DynamoDAL - Hybrid DynamoDB + local file implementation
 *
 * ProjectIndex operations use real DynamoDB via project-index-dal.ts.
 * All other operations delegate to the file-based NoDynamo implementation
 * until they are migrated to DynamoDB.
 */
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
   * Ensure DynamoDB table exists, create if needed, migrate local data
   */
  private async ensureTable(): Promise<boolean> {
    if (this.tableEnsured) return this.dynamoAvailable;
    this.tableEnsured = true;

    try {
      // Test if table exists by doing a small query
      await projectIndexDAL.listProjectIndexes(this.orgId, { limit: 1 });
      this.dynamoAvailable = true;

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
          await this.migrateLocalData();
          return true;
        } catch {
          console.warn("[DynamoDAL] Failed to create table, falling back to local files");
          this.dynamoAvailable = false;
          return false;
        }
      }
      console.warn("[DynamoDAL] DynamoDB unavailable, falling back to local files:", (err as Error).message);
      this.dynamoAvailable = false;
      return false;
    }
  }

  /**
   * Create the DynamoDB project-indexes table
   */
  private async createTable(): Promise<void> {
    const { CreateTableCommand } = await import("@aws-sdk/client-dynamodb");
    const { getDocClient, TABLES } = await import("./client");
    const client = (getDocClient() as any).__client || getDocClient();

    // Need the raw DynamoDB client for CreateTable
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
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
    const { DescribeTableCommand } = await import("@aws-sdk/client-dynamodb");
    for (let i = 0; i < 30; i++) {
      const desc = await rawClient.send(new DescribeTableCommand({ TableName: TABLES.PROJECT_INDEXES }));
      if (desc.Table?.TableStatus === "ACTIVE") break;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  /**
   * Migrate local file-based projects to DynamoDB
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
          await projectIndexDAL.createProjectIndex({
            orgId: project.orgId || this.orgId,
            projectPath: project.projectPath,
            alias: project.alias,
            description: project.description,
            notes: project.notes,
            tags: project.tags,
          });
        } catch {
          // Ignore duplicates
        }
      }
      console.log(`[DynamoDAL] Migration complete`);
    } catch {
      // Non-fatal: migration is best-effort
    }
  }

  // ==================== Project Index (DynamoDB with fallback) ====================

  async createProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex> {
    if (await this.ensureTable()) {
      try { return await projectIndexDAL.createProjectIndex(input); } catch {}
    }
    return this.fallback.createProjectIndex(input);
  }

  async getProjectIndex(projectId: string): Promise<ProjectIndex | null> {
    if (await this.ensureTable()) {
      try { return await projectIndexDAL.getProjectIndex(this.orgId, projectId); } catch {}
    }
    return this.fallback.getProjectIndex(projectId);
  }

  async getProjectIndexByPath(projectPath: string): Promise<ProjectIndex | null> {
    if (await this.ensureTable()) {
      try { return await projectIndexDAL.getProjectIndexByPath(this.orgId, projectPath); } catch {}
    }
    return this.fallback.getProjectIndexByPath(projectPath);
  }

  async listProjectIndexes(options?: ListProjectIndexOptions): Promise<PaginatedResult<ProjectIndex>> {
    if (await this.ensureTable()) {
      try { return await projectIndexDAL.listProjectIndexes(this.orgId, options); } catch {}
    }
    return this.fallback.listProjectIndexes(options);
  }

  async updateProjectIndex(projectId: string, updates: UpdateProjectIndexInput): Promise<ProjectIndex | null> {
    if (await this.ensureTable()) {
      try { return await projectIndexDAL.updateProjectIndex(this.orgId, projectId, updates); } catch {}
    }
    return this.fallback.updateProjectIndex(projectId, updates);
  }

  async archiveProject(projectId: string): Promise<ProjectIndex | null> {
    if (await this.ensureTable()) {
      try { return await projectIndexDAL.archiveProject(this.orgId, projectId); } catch {}
    }
    return this.fallback.archiveProject(projectId);
  }

  async unarchiveProject(projectId: string): Promise<ProjectIndex | null> {
    if (await this.ensureTable()) {
      try { return await projectIndexDAL.unarchiveProject(this.orgId, projectId); } catch {}
    }
    return this.fallback.unarchiveProject(projectId);
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

  // ==================== Utility ====================

  async clearAll(): Promise<void> {
    return this.fallback.clearAll();
  }

  async getStats(): Promise<{
    projects: number;
    sessions: number;
    runs: number;
    events: number;
    packets: number;
    plans: number;
  }> {
    // TODO: For projects count, query DynamoDB instead of fallback
    return this.fallback.getStats();
  }
}
