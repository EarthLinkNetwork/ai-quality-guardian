"use strict";
/**
 * Project Index Data Access Layer
 *
 * Manages project index entities for dashboard functionality.
 * Provides status derivation logic with priority: needs_response > error > running > idle
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveLifecycleState = deriveLifecycleState;
exports.deriveProjectStatus = deriveProjectStatus;
exports.createProjectIndex = createProjectIndex;
exports.getProjectIndex = getProjectIndex;
exports.getProjectIndexByPath = getProjectIndexByPath;
exports.listProjectIndexes = listProjectIndexes;
exports.updateProjectIndex = updateProjectIndex;
exports.toggleFavorite = toggleFavorite;
exports.archiveProject = archiveProject;
exports.unarchiveProject = unarchiveProject;
exports.deleteProjectIndex = deleteProjectIndex;
exports.getOrCreateProjectIndex = getOrCreateProjectIndex;
exports.incrementSessionCount = incrementSessionCount;
exports.updateProjectLastSeen = updateProjectLastSeen;
exports.updateProjectTaskStats = updateProjectTaskStats;
const crypto_1 = require("crypto");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_1 = require("./client");
const utils_1 = require("./utils");
/**
 * Default idle threshold in days for lifecycle state
 */
const DEFAULT_IDLE_THRESHOLD_DAYS = 7;
/**
 * Determine lifecycle state from project index
 * Uses lastActivityAt (meaningful work), NOT lastSeenAt (UI interaction)
 */
function deriveLifecycleState(project, idleThresholdDays = DEFAULT_IDLE_THRESHOLD_DAYS) {
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
function deriveProjectStatus(tasks) {
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
function generateProjectId(projectPath) {
    const hash = (0, crypto_1.createHash)("sha256").update(projectPath).digest("hex").substring(0, 12);
    return `pidx_${hash}`;
}
/**
 * Create a new project index
 */
async function createProjectIndex(input) {
    const docClient = (0, client_1.getDocClient)();
    const projectId = generateProjectId(input.projectPath);
    const now = (0, utils_1.nowISO)();
    const projectIndex = {
        PK: (0, utils_1.orgPK)(input.orgId),
        SK: (0, utils_1.projectIndexSK)(projectId),
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
    await docClient.send(new lib_dynamodb_1.PutCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Item: projectIndex,
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    }));
    return projectIndex;
}
/**
 * Get project index by ID
 */
async function getProjectIndex(orgId, projectId) {
    const docClient = (0, client_1.getDocClient)();
    const result = await docClient.send(new lib_dynamodb_1.GetCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
    }));
    return result.Item || null;
}
/**
 * Get project index by path using GSI
 */
async function getProjectIndexByPath(orgId, projectPath) {
    const docClient = (0, client_1.getDocClient)();
    const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        IndexName: "projectPath-index",
        KeyConditionExpression: "orgId = :orgId AND projectPath = :projectPath",
        ExpressionAttributeValues: {
            ":orgId": orgId,
            ":projectPath": projectPath,
        },
        Limit: 1,
    }));
    return result.Items?.[0] || null;
}
/**
 * List project indexes with filtering and sorting
 */
async function listProjectIndexes(orgId, options = {}) {
    const docClient = (0, client_1.getDocClient)();
    const limit = options.limit || 50;
    // Build filter expression
    const filterExpressions = [];
    const expressionAttributeValues = {
        ":pk": (0, utils_1.orgPK)(orgId),
        ":prefix": "PIDX#",
    };
    const expressionAttributeNames = {};
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
        const tagConditions = [];
        options.tags.forEach((tag, index) => {
            const tagKey = `:tag${index}`;
            tagConditions.push(`contains(tags, ${tagKey})`);
            expressionAttributeValues[tagKey] = tag;
        });
        filterExpressions.push(`(${tagConditions.join(" OR ")})`);
    }
    const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(" AND ") : undefined,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ExclusiveStartKey: (0, utils_1.decodeCursor)(options.cursor),
        ScanIndexForward: false,
    }));
    let items = result.Items || [];
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
        if (a.favorite && !b.favorite)
            return -1;
        if (!a.favorite && b.favorite)
            return 1;
        // Then by updatedAt descending
        return b.updatedAt.localeCompare(a.updatedAt);
    });
    return {
        items,
        nextCursor: (0, utils_1.encodeCursor)(result.LastEvaluatedKey),
    };
}
/**
 * Update project index
 */
async function updateProjectIndex(orgId, projectId, updates) {
    const docClient = (0, client_1.getDocClient)();
    const updateExpressions = ["updatedAt = :now"];
    const expressionAttributeValues = { ":now": (0, utils_1.nowISO)() };
    const expressionAttributeNames = {};
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
    const result = await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
    }));
    return result.Attributes;
}
/**
 * Toggle favorite status
 */
async function toggleFavorite(orgId, projectId) {
    const docClient = (0, client_1.getDocClient)();
    // Get current state
    const current = await getProjectIndex(orgId, projectId);
    if (!current) {
        throw new Error(`Project index not found: ${projectId}`);
    }
    const newFavorite = !current.favorite;
    const result = await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
        UpdateExpression: "SET favorite = :favorite, updatedAt = :now",
        ExpressionAttributeValues: {
            ":favorite": newFavorite,
            ":now": (0, utils_1.nowISO)(),
        },
        ReturnValues: "ALL_NEW",
    }));
    return result.Attributes;
}
/**
 * Archive project
 */
async function archiveProject(orgId, projectId) {
    const docClient = (0, client_1.getDocClient)();
    const now = (0, utils_1.nowISO)();
    const result = await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
        UpdateExpression: "SET archived = :archived, archivedAt = :archivedAt, updatedAt = :now",
        ExpressionAttributeValues: {
            ":archived": true,
            ":archivedAt": now,
            ":now": now,
        },
        ReturnValues: "ALL_NEW",
    }));
    return result.Attributes;
}
/**
 * Unarchive project
 */
async function unarchiveProject(orgId, projectId) {
    const docClient = (0, client_1.getDocClient)();
    const result = await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
        UpdateExpression: "SET archived = :archived, updatedAt = :now REMOVE archivedAt",
        ExpressionAttributeValues: {
            ":archived": false,
            ":now": (0, utils_1.nowISO)(),
        },
        ReturnValues: "ALL_NEW",
    }));
    return result.Attributes;
}
/**
 * Delete project index
 */
async function deleteProjectIndex(orgId, projectId) {
    const docClient = (0, client_1.getDocClient)();
    await docClient.send(new lib_dynamodb_1.DeleteCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
    }));
}
/**
 * Get or create project index for a path
 */
async function getOrCreateProjectIndex(input) {
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
async function incrementSessionCount(orgId, projectId) {
    const docClient = (0, client_1.getDocClient)();
    const result = await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
        UpdateExpression: "SET sessionCount = if_not_exists(sessionCount, :zero) + :inc, lastActivityAt = :now, updatedAt = :now",
        ExpressionAttributeValues: {
            ":zero": 0,
            ":inc": 1,
            ":now": (0, utils_1.nowISO)(),
        },
        ReturnValues: "ALL_NEW",
    }));
    return result.Attributes;
}
/**
 * Update lastSeenAt when user views project in UI
 * Note: This does NOT affect lifecycle state (which uses lastActivityAt)
 */
async function updateProjectLastSeen(orgId, projectId) {
    const docClient = (0, client_1.getDocClient)();
    const now = (0, utils_1.nowISO)();
    const result = await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
        UpdateExpression: "SET lastSeenAt = :lastSeenAt, updatedAt = :now",
        ExpressionAttributeValues: {
            ":lastSeenAt": now,
            ":now": now,
        },
        ReturnValues: "ALL_NEW",
    }));
    return result.Attributes;
}
/**
 * Update task stats for a project
 */
async function updateProjectTaskStats(orgId, projectId, taskStats, status) {
    const docClient = (0, client_1.getDocClient)();
    const result = await docClient.send(new lib_dynamodb_1.UpdateCommand({
        TableName: client_1.TABLES.PROJECT_INDEXES,
        Key: {
            PK: (0, utils_1.orgPK)(orgId),
            SK: (0, utils_1.projectIndexSK)(projectId),
        },
        UpdateExpression: "SET taskStats = :taskStats, #status = :status, lastActivityAt = :now, updatedAt = :now",
        ExpressionAttributeNames: {
            "#status": "status",
        },
        ExpressionAttributeValues: {
            ":taskStats": taskStats,
            ":status": status,
            ":now": (0, utils_1.nowISO)(),
        },
        ReturnValues: "ALL_NEW",
    }));
    return result.Attributes;
}
//# sourceMappingURL=project-index-dal.js.map