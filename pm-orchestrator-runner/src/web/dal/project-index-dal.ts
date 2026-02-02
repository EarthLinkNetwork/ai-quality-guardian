/**
 * Project Index Data Access Layer
 *
 * Manages project index entities for dashboard functionality.
 * Provides status derivation logic with priority: needs_response > error > running > idle
 */

import { createHash } from "crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDocClient, TABLES } from "./client";
import {
  ProjectIndex,
  ProjectIndexStatus,
  ProjectLifecycleState,
  CreateProjectIndexInput,
  UpdateProjectIndexInput,
  ListProjectIndexOptions,
  PaginatedResult,
  Task,
  TaskState,
} from "./types";
import {
  nowISO,
  orgPK,
  projectIndexSK,
  encodeCursor,
  decodeCursor,
} from "./utils";

/**
 * Default idle threshold in days for lifecycle state
 */
const DEFAULT_IDLE_THRESHOLD_DAYS = 7;

/**
 * Determine lifecycle state from project index
 * Uses lastActivityAt (meaningful work), NOT lastSeenAt (UI interaction)
 */
export function deriveLifecycleState(
  project: ProjectIndex,
  idleThresholdDays: number = DEFAULT_IDLE_THRESHOLD_DAYS
): ProjectLifecycleState {
  // Archived takes precedence
  if (project.archived) {
    return "ARCHIVED";
  }

  // Check if project has recent meaningful work
  const lastWork = new Date(project.lastActivityAt);
  const now = new Date();
  const daysSinceWork = (now.getTime() - lastWork.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceWork > idleThresholdDays) {
    return "IDLE";
  }

  return "ACTIVE";
}

/**
 * Derive project status from tasks
 * Priority: needs_response > error > running > idle
 */
export function deriveProjectStatus(tasks: Task[]): ProjectIndexStatus {
  if (tasks.length === 0) {
    return "idle";
  }

  let hasError = false;
  let hasRunning = false;

  for (const task of tasks) {
    // Check for AWAITING_RESPONSE first (highest priority)
    if (task.state === "AWAITING_RESPONSE") {
      return "needs_response";
    }
    if (task.state === "ERROR") {
      hasError = true;
    }
    if (task.state === "RUNNING" || task.state === "QUEUED") {
      hasRunning = true;
    }
  }

  // Second priority: error
  if (hasError) {
    return "error";
  }

  // Third priority: running
  if (hasRunning) {
    return "running";
  }

  // Default: idle (all complete/cancelled)
  return "idle";
}

/**
 * Generate projectId from projectPath using SHA256 hash
 */
function generateProjectId(projectPath: string): string {
  const hash = createHash("sha256").update(projectPath).digest("hex").substring(0, 12);
  return `pidx_${hash}`;
}

/**
 * Create a new project index
 */
export async function createProjectIndex(
  input: CreateProjectIndexInput
): Promise<ProjectIndex> {
  const docClient = getDocClient();
  const projectId = generateProjectId(input.projectPath);
  const now = nowISO();

  const projectIndex: ProjectIndex = {
    PK: orgPK(input.orgId),
    SK: projectIndexSK(projectId),
    projectId,
    orgId: input.orgId,
    projectPath: input.projectPath,
    alias: input.alias,
    tags: input.tags || [],
    favorite: false,
    archived: false,
    status: "idle",
    lastActivityAt: now,
    sessionCount: 0,
    taskStats: {
      total: 0,
      completed: 0,
      failed: 0,
      running: 0,
      awaiting: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Item: projectIndex,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );

  return projectIndex;
}

/**
 * Get project index by ID
 */
export async function getProjectIndex(
  orgId: string,
  projectId: string
): Promise<ProjectIndex | null> {
  const docClient = getDocClient();

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
    })
  );

  return (result.Item as ProjectIndex) || null;
}

/**
 * Get project index by path using GSI
 */
export async function getProjectIndexByPath(
  orgId: string,
  projectPath: string
): Promise<ProjectIndex | null> {
  const docClient = getDocClient();

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.PROJECT_INDEXES,
      IndexName: "projectPath-index",
      KeyConditionExpression: "orgId = :orgId AND projectPath = :projectPath",
      ExpressionAttributeValues: {
        ":orgId": orgId,
        ":projectPath": projectPath,
      },
      Limit: 1,
    })
  );

  return (result.Items?.[0] as ProjectIndex) || null;
}

/**
 * List project indexes with filtering and sorting
 */
export async function listProjectIndexes(
  orgId: string,
  options: ListProjectIndexOptions = {}
): Promise<PaginatedResult<ProjectIndex>> {
  const docClient = getDocClient();
  const limit = options.limit || 50;

  // Build filter expression
  const filterExpressions: string[] = [];
  const expressionAttributeValues: Record<string, unknown> = {
    ":pk": orgPK(orgId),
    ":prefix": "PIDX#",
  };
  const expressionAttributeNames: Record<string, string> = {};

  // Hide archived by default
  if (!options.includeArchived) {
    filterExpressions.push("archived = :archivedFalse");
    expressionAttributeValues[":archivedFalse"] = false;
  }

  // Filter by status
  if (options.status) {
    filterExpressions.push("#status = :status");
    expressionAttributeNames["#status"] = "status";
    expressionAttributeValues[":status"] = options.status;
  }

  // Filter by favorite
  if (options.favoriteOnly) {
    filterExpressions.push("favorite = :favoriteTrue");
    expressionAttributeValues[":favoriteTrue"] = true;
  }

  // Filter by tags (contains any of the specified tags)
  if (options.tags && options.tags.length > 0) {
    const tagConditions: string[] = [];
    options.tags.forEach((tag, index) => {
      const tagKey = `:tag${index}`;
      tagConditions.push(`contains(tags, ${tagKey})`);
      expressionAttributeValues[tagKey] = tag;
    });
    filterExpressions.push(`(${tagConditions.join(" OR ")})`);
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.PROJECT_INDEXES,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(" AND ") : undefined,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit,
      ExclusiveStartKey: decodeCursor(options.cursor),
      ScanIndexForward: false,
    })
  );

  let items = (result.Items as ProjectIndex[]) || [];

  // Filter by lifecycle state (computed dynamically)
  if (options.lifecycle) {
    items = items.filter((item) => {
      const state = deriveLifecycleState(item);
      return state === options.lifecycle;
    });
  }

  // Sort: favorites first, then by updatedAt descending
  items = items.sort((a, b) => {
    // Favorites first
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    // Then by updatedAt descending
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return {
    items,
    nextCursor: encodeCursor(result.LastEvaluatedKey),
  };
}

/**
 * Update project index
 */
export async function updateProjectIndex(
  orgId: string,
  projectId: string,
  updates: UpdateProjectIndexInput
): Promise<ProjectIndex> {
  const docClient = getDocClient();

  const updateExpressions: string[] = ["updatedAt = :now"];
  const expressionAttributeValues: Record<string, unknown> = { ":now": nowISO() };
  const expressionAttributeNames: Record<string, string> = {};

  if (updates.alias !== undefined) {
    updateExpressions.push("#alias = :alias");
    expressionAttributeNames["#alias"] = "alias";
    expressionAttributeValues[":alias"] = updates.alias;
  }

  if (updates.tags !== undefined) {
    updateExpressions.push("tags = :tags");
    expressionAttributeValues[":tags"] = updates.tags;
  }

  if (updates.favorite !== undefined) {
    updateExpressions.push("favorite = :favorite");
    expressionAttributeValues[":favorite"] = updates.favorite;
  }

  if (updates.status !== undefined) {
    updateExpressions.push("#status = :status");
    expressionAttributeNames["#status"] = "status";
    expressionAttributeValues[":status"] = updates.status;
  }

  if (updates.lastActivityAt !== undefined) {
    updateExpressions.push("lastActivityAt = :lastActivityAt");
    expressionAttributeValues[":lastActivityAt"] = updates.lastActivityAt;
  }

  if (updates.lastSeenAt !== undefined) {
    updateExpressions.push("lastSeenAt = :lastSeenAt");
    expressionAttributeValues[":lastSeenAt"] = updates.lastSeenAt;
  }

  if (updates.sessionCount !== undefined) {
    updateExpressions.push("sessionCount = :sessionCount");
    expressionAttributeValues[":sessionCount"] = updates.sessionCount;
  }

  if (updates.taskStats !== undefined) {
    updateExpressions.push("taskStats = :taskStats");
    expressionAttributeValues[":taskStats"] = updates.taskStats;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes as ProjectIndex;
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(
  orgId: string,
  projectId: string
): Promise<ProjectIndex> {
  const docClient = getDocClient();

  // Get current state
  const current = await getProjectIndex(orgId, projectId);
  if (!current) {
    throw new Error(`Project index not found: ${projectId}`);
  }

  const newFavorite = !current.favorite;

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
      UpdateExpression: "SET favorite = :favorite, updatedAt = :now",
      ExpressionAttributeValues: {
        ":favorite": newFavorite,
        ":now": nowISO(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes as ProjectIndex;
}

/**
 * Archive project
 */
export async function archiveProject(
  orgId: string,
  projectId: string
): Promise<ProjectIndex> {
  const docClient = getDocClient();
  const now = nowISO();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
      UpdateExpression: "SET archived = :archived, archivedAt = :archivedAt, updatedAt = :now",
      ExpressionAttributeValues: {
        ":archived": true,
        ":archivedAt": now,
        ":now": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes as ProjectIndex;
}

/**
 * Unarchive project
 */
export async function unarchiveProject(
  orgId: string,
  projectId: string
): Promise<ProjectIndex> {
  const docClient = getDocClient();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
      UpdateExpression: "SET archived = :archived, updatedAt = :now REMOVE archivedAt",
      ExpressionAttributeValues: {
        ":archived": false,
        ":now": nowISO(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes as ProjectIndex;
}

/**
 * Delete project index
 */
export async function deleteProjectIndex(
  orgId: string,
  projectId: string
): Promise<void> {
  const docClient = getDocClient();

  await docClient.send(
    new DeleteCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
    })
  );
}

/**
 * Get or create project index for a path
 */
export async function getOrCreateProjectIndex(
  input: CreateProjectIndexInput
): Promise<ProjectIndex> {
  // Try to find existing
  const existing = await getProjectIndexByPath(input.orgId, input.projectPath);
  if (existing) {
    return existing;
  }

  // Create new
  return createProjectIndex(input);
}

/**
 * Increment session count for a project
 */
export async function incrementSessionCount(
  orgId: string,
  projectId: string
): Promise<ProjectIndex> {
  const docClient = getDocClient();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
      UpdateExpression: "SET sessionCount = if_not_exists(sessionCount, :zero) + :inc, lastActivityAt = :now, updatedAt = :now",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":inc": 1,
        ":now": nowISO(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes as ProjectIndex;
}

/**
 * Update lastSeenAt when user views project in UI
 * Note: This does NOT affect lifecycle state (which uses lastActivityAt)
 */
export async function updateProjectLastSeen(
  orgId: string,
  projectId: string
): Promise<ProjectIndex> {
  const docClient = getDocClient();
  const now = nowISO();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
      UpdateExpression: "SET lastSeenAt = :lastSeenAt, updatedAt = :now",
      ExpressionAttributeValues: {
        ":lastSeenAt": now,
        ":now": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes as ProjectIndex;
}

/**
 * Update task stats for a project
 */
export async function updateProjectTaskStats(
  orgId: string,
  projectId: string,
  taskStats: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    awaiting: number;
  },
  status: ProjectIndexStatus
): Promise<ProjectIndex> {
  const docClient = getDocClient();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PROJECT_INDEXES,
      Key: {
        PK: orgPK(orgId),
        SK: projectIndexSK(projectId),
      },
      UpdateExpression: "SET taskStats = :taskStats, #status = :status, lastActivityAt = :now, updatedAt = :now",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":taskStats": taskStats,
        ":status": status,
        ":now": nowISO(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes as ProjectIndex;
}
