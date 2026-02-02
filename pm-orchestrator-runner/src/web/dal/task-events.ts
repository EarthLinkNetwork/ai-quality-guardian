/**
 * TaskEvents Data Access Layer
 */

import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getDocClient, TABLES } from "./client";
import { TaskEvent, TaskEventType, LogLevel } from "./types";
import { generateId, nowISO, orgPK, taskEventSK } from "./utils";

/**
 * Create a task event
 */
export async function createTaskEvent(
  orgId: string,
  taskId: string,
  eventType: TaskEventType,
  data?: Record<string, unknown>
): Promise<TaskEvent> {
  const docClient = getDocClient();
  const eventId = generateId("evt");
  const now = nowISO();

  // Determine log level based on event type
  const level: LogLevel = eventType === "ERROR" ? "error" :
                          eventType === "COMPLETED" ? "info" :
                          eventType === "PROGRESS" ? "debug" : "info";

  // Generate message from event type and data
  const message = data?.message as string ||
                  data?.error as string ||
                  data?.prompt?.toString().substring(0, 100) ||
                  data?.result?.toString().substring(0, 100) ||
                  `Event: ${eventType}`;

  const event: TaskEvent = {
    PK: orgPK(orgId),
    SK: taskEventSK(taskId, now, eventId),
    type: eventType,
    message,
    level,
    payload: data,
    actor: "system",
    correlationId: taskId,
    createdAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.TASK_EVENTS,
      Item: event,
    })
  );

  return event;
}

/**
 * Get events for a task
 */
export async function getTaskEvents(
  orgId: string,
  taskId: string,
  options: { limit?: number; ascending?: boolean } = {}
): Promise<TaskEvent[]> {
  const docClient = getDocClient();
  const limit = options.limit || 100;

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.TASK_EVENTS,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": orgPK(orgId),
        ":prefix": `TASKEVT#${taskId}#`,
      },
      Limit: limit,
      ScanIndexForward: options.ascending ?? false, // Newest first by default
    })
  );

  return (result.Items as TaskEvent[]) || [];
}

/**
 * Get recent events across all tasks in org
 */
export async function getRecentEvents(
  orgId: string,
  options: { limit?: number } = {}
): Promise<TaskEvent[]> {
  const docClient = getDocClient();
  const limit = options.limit || 50;

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.TASK_EVENTS,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": orgPK(orgId),
        ":prefix": "TASKEVT#",
      },
      Limit: limit,
      ScanIndexForward: false, // Newest first
    })
  );

  return (result.Items as TaskEvent[]) || [];
}

// Helper functions to create specific event types

export async function logTaskCreated(orgId: string, taskId: string, prompt: string): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "CREATED", { prompt: prompt.substring(0, 500) });
}

export async function logTaskQueued(orgId: string, taskId: string): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "QUEUED");
}

export async function logTaskStarted(orgId: string, taskId: string, agentId: string): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "STARTED", { agentId });
}

export async function logTaskProgress(
  orgId: string,
  taskId: string,
  message: string
): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "PROGRESS", { message });
}

export async function logTaskAwaitingResponse(
  orgId: string,
  taskId: string,
  question: string
): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "AWAITING_RESPONSE", { question });
}

export async function logTaskResponseReceived(
  orgId: string,
  taskId: string,
  response: string
): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "RESPONSE_RECEIVED", { response: response.substring(0, 500) });
}

export async function logTaskCompleted(
  orgId: string,
  taskId: string,
  result?: string
): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "COMPLETED", { result: result?.substring(0, 1000) });
}

export async function logTaskFailed(
  orgId: string,
  taskId: string,
  error: string
): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "ERROR", { error });
}

export async function logTaskCancelled(orgId: string, taskId: string): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "CANCELLED");
}

export async function logTaskRetried(orgId: string, taskId: string): Promise<TaskEvent> {
  return createTaskEvent(orgId, taskId, "RETRIED");
}
