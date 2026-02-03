/**
 * DynamoDB Client Stub
 * Placeholder for DynamoDB client implementation
 */

import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export interface DynamoDBClientConfig {
  region?: string;
  endpoint?: string;
}

export function createDynamoDBClient(_config?: DynamoDBClientConfig): any {
  return {};
}

export const dynamoDBClient = createDynamoDBClient();

export function getDocClient(): DynamoDBDocumentClient {
  return {} as DynamoDBDocumentClient;
}

export const TABLES = {
  PROJECT_INDEXES: 'pm-project-indexes',
  TASK_EVENTS: 'pm-task-events',
  SESSIONS: 'pm-sessions',
  TASKS: 'pm-tasks',
};
