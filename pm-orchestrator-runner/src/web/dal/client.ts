/**
 * DynamoDB Client - Real implementation using AWS SDK
 *
 * Uses the centralized AWS config (Berry profile for local, IAM Role for Lambda).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getAwsCredentials, getAwsRegion } from "../../config/aws-config";

export interface DynamoDBClientConfig {
  region?: string;
  endpoint?: string;
  /** Use DynamoDB Local (localhost:8000) with dummy credentials */
  localDynamodb?: boolean;
}

let docClient: DynamoDBDocumentClient | null = null;
let currentConfig: DynamoDBClientConfig | undefined;

/**
 * Create a DynamoDB DocumentClient
 */
export function createDocClient(config?: DynamoDBClientConfig): DynamoDBDocumentClient {
  if (config?.localDynamodb) {
    const client = new DynamoDBClient({
      endpoint: config.endpoint || "http://localhost:8000",
      region: config.region || "local",
      credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
      },
    });
    return DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  // AWS DynamoDB mode: Berry profile credentials + region
  const region = config?.region || getAwsRegion();
  const credentials = getAwsCredentials();

  const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = { region };
  if (config?.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }
  if (credentials) {
    clientConfig.credentials = credentials;
  }

  const client = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

/**
 * Initialize the global DynamoDB DocumentClient
 */
export function initDocClient(config?: DynamoDBClientConfig): DynamoDBDocumentClient {
  currentConfig = config;
  docClient = createDocClient(config);
  return docClient;
}

/**
 * Get the global DynamoDB DocumentClient (lazy-initializes if needed)
 */
export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = createDocClient(currentConfig);
  }
  return docClient;
}

/**
 * Reset the global client (for testing)
 */
export function resetDocClient(): void {
  docClient = null;
  currentConfig = undefined;
}

export const TABLES = {
  PROJECT_INDEXES: "pm-project-indexes",
  TASK_EVENTS: "pm-task-events",
  SESSIONS: "pm-sessions",
  TASKS: "pm-tasks",
};
