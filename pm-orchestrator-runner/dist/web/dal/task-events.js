"use strict";
/**
 * TaskEvents Data Access Layer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTaskEvent = createTaskEvent;
exports.getTaskEvents = getTaskEvents;
exports.getRecentEvents = getRecentEvents;
exports.logTaskCreated = logTaskCreated;
exports.logTaskQueued = logTaskQueued;
exports.logTaskStarted = logTaskStarted;
exports.logTaskProgress = logTaskProgress;
exports.logTaskAwaitingResponse = logTaskAwaitingResponse;
exports.logTaskResponseReceived = logTaskResponseReceived;
exports.logTaskCompleted = logTaskCompleted;
exports.logTaskFailed = logTaskFailed;
exports.logTaskCancelled = logTaskCancelled;
exports.logTaskRetried = logTaskRetried;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_1 = require("./client");
const utils_1 = require("./utils");
/**
 * Create a task event
 */
async function createTaskEvent(orgId, taskId, eventType, data) {
    const docClient = (0, client_1.getDocClient)();
    const eventId = (0, utils_1.generateId)("evt");
    const now = (0, utils_1.nowISO)();
    // Determine log level based on event type
    const level = eventType === "ERROR" ? "error" :
        eventType === "COMPLETED" ? "info" :
            eventType === "PROGRESS" ? "debug" : "info";
    // Generate message from event type and data
    const message = data?.message ||
        data?.error ||
        data?.prompt?.toString().substring(0, 100) ||
        data?.result?.toString().substring(0, 100) ||
        `Event: ${eventType}`;
    const event = {
        PK: (0, utils_1.orgPK)(orgId),
        SK: (0, utils_1.taskEventSK)(taskId, now, eventId),
        type: eventType,
        message,
        level,
        payload: data,
        actor: "system",
        correlationId: taskId,
        createdAt: now,
    };
    await docClient.send(new lib_dynamodb_1.PutCommand({
        TableName: client_1.TABLES.TASK_EVENTS,
        Item: event,
    }));
    return event;
}
/**
 * Get events for a task
 */
async function getTaskEvents(orgId, taskId, options = {}) {
    const docClient = (0, client_1.getDocClient)();
    const limit = options.limit || 100;
    const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
        TableName: client_1.TABLES.TASK_EVENTS,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
            ":pk": (0, utils_1.orgPK)(orgId),
            ":prefix": `TASKEVT#${taskId}#`,
        },
        Limit: limit,
        ScanIndexForward: options.ascending ?? false, // Newest first by default
    }));
    return result.Items || [];
}
/**
 * Get recent events across all tasks in org
 */
async function getRecentEvents(orgId, options = {}) {
    const docClient = (0, client_1.getDocClient)();
    const limit = options.limit || 50;
    const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
        TableName: client_1.TABLES.TASK_EVENTS,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
            ":pk": (0, utils_1.orgPK)(orgId),
            ":prefix": "TASKEVT#",
        },
        Limit: limit,
        ScanIndexForward: false, // Newest first
    }));
    return result.Items || [];
}
// Helper functions to create specific event types
async function logTaskCreated(orgId, taskId, prompt) {
    return createTaskEvent(orgId, taskId, "CREATED", { prompt: prompt.substring(0, 500) });
}
async function logTaskQueued(orgId, taskId) {
    return createTaskEvent(orgId, taskId, "QUEUED");
}
async function logTaskStarted(orgId, taskId, agentId) {
    return createTaskEvent(orgId, taskId, "STARTED", { agentId });
}
async function logTaskProgress(orgId, taskId, message) {
    return createTaskEvent(orgId, taskId, "PROGRESS", { message });
}
async function logTaskAwaitingResponse(orgId, taskId, question) {
    return createTaskEvent(orgId, taskId, "AWAITING_RESPONSE", { question });
}
async function logTaskResponseReceived(orgId, taskId, response) {
    return createTaskEvent(orgId, taskId, "RESPONSE_RECEIVED", { response: response.substring(0, 500) });
}
async function logTaskCompleted(orgId, taskId, result) {
    return createTaskEvent(orgId, taskId, "COMPLETED", { result: result?.substring(0, 1000) });
}
async function logTaskFailed(orgId, taskId, error) {
    return createTaskEvent(orgId, taskId, "ERROR", { error });
}
async function logTaskCancelled(orgId, taskId) {
    return createTaskEvent(orgId, taskId, "CANCELLED");
}
async function logTaskRetried(orgId, taskId) {
    return createTaskEvent(orgId, taskId, "RETRIED");
}
//# sourceMappingURL=task-events.js.map