/**
 * API Key Manager
 *
 * Manages API keys for multi-user authentication.
 * Keys are stored in DynamoDB table `pm-runner-api-keys`.
 * Key format: pmr_ + 32-char random hex
 */

import * as crypto from 'crypto';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { getAwsCredentials, getAwsRegion } from '../config/aws-config';

const API_KEYS_TABLE_NAME = 'pm-runner-api-keys';
const API_KEY_PREFIX = 'pmr_';

export interface ApiKey {
  /** API key string (pmr_xxxxxxxxxxxx) */
  key: string;
  /** User identifier (e.g. "masa", "dev2") */
  userId: string;
  /** Device name (e.g. "macbook-pro", "iphone") */
  deviceName: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last used timestamp */
  lastUsedAt: string;
  /** Whether key is active */
  isActive: boolean;
}

export interface ApiKeyManagerConfig {
  /** Use local DynamoDB (localhost:8000) */
  localDynamodb?: boolean;
  /** Override endpoint */
  endpoint?: string;
  /** Override region */
  region?: string;
}

export class ApiKeyManager {
  private readonly client: DynamoDBClient;
  private readonly docClient: DynamoDBDocumentClient;

  constructor(config: ApiKeyManagerConfig = {}) {
    if (config.localDynamodb) {
      const endpoint = config.endpoint || 'http://localhost:8000';
      this.client = new DynamoDBClient({
        endpoint,
        region: config.region || 'local',
        credentials: {
          accessKeyId: 'local',
          secretAccessKey: 'local',
        },
      });
    } else {
      const region = config.region || getAwsRegion();
      const credentials = getAwsCredentials();
      const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = { region };
      if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
      }
      if (credentials) {
        clientConfig.credentials = credentials;
      }
      this.client = new DynamoDBClient(clientConfig);
    }

    this.docClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  /**
   * Ensure the API keys table exists
   */
  async ensureTable(): Promise<void> {
    try {
      await this.client.send(
        new DescribeTableCommand({ TableName: API_KEYS_TABLE_NAME })
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        await this.createTable();
        // Wait for table to become active
        const startTime = Date.now();
        while (Date.now() - startTime < 30000) {
          try {
            const result = await this.client.send(
              new DescribeTableCommand({ TableName: API_KEYS_TABLE_NAME })
            );
            if (result.Table?.TableStatus === 'ACTIVE') return;
          } catch {
            // Not ready yet
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        throw error;
      }
    }
  }

  private async createTable(): Promise<void> {
    await this.client.send(
      new CreateTableCommand({
        TableName: API_KEYS_TABLE_NAME,
        KeySchema: [
          { AttributeName: 'key', KeyType: 'HASH' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'key', AttributeType: 'S' },
          { AttributeName: 'userId', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'userId-index',
            KeySchema: [
              { AttributeName: 'userId', KeyType: 'HASH' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      })
    );
  }

  /**
   * Generate a new API key
   */
  async generateApiKey(userId: string, deviceName: string): Promise<ApiKey> {
    const key = API_KEY_PREFIX + crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();

    const apiKey: ApiKey = {
      key,
      userId,
      deviceName,
      createdAt: now,
      lastUsedAt: now,
      isActive: true,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: API_KEYS_TABLE_NAME,
        Item: apiKey,
      })
    );

    return apiKey;
  }

  /**
   * Validate an API key and return its data
   * Returns null if key is invalid or inactive
   * Updates lastUsedAt on successful validation
   */
  async validateApiKey(key: string): Promise<ApiKey | null> {
    if (!key.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    const result = await this.docClient.send(
      new GetCommand({
        TableName: API_KEYS_TABLE_NAME,
        Key: { key },
      })
    );

    const apiKey = result.Item as ApiKey | undefined;
    if (!apiKey || !apiKey.isActive) {
      return null;
    }

    // Update lastUsedAt (fire-and-forget)
    this.docClient.send(
      new UpdateCommand({
        TableName: API_KEYS_TABLE_NAME,
        Key: { key },
        UpdateExpression: 'SET lastUsedAt = :now',
        ExpressionAttributeValues: {
          ':now': new Date().toISOString(),
        },
      })
    ).catch(() => {});

    return apiKey;
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(key: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: API_KEYS_TABLE_NAME,
        Key: { key },
        UpdateExpression: 'SET isActive = :inactive',
        ExpressionAttributeValues: {
          ':inactive': false,
        },
      })
    );
  }

  /**
   * List all API keys for a user
   */
  async listApiKeys(userId: string): Promise<ApiKey[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: API_KEYS_TABLE_NAME,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      })
    );

    return (result.Items as ApiKey[]) || [];
  }

  /**
   * Destroy the client connection
   */
  destroy(): void {
    this.client.destroy();
  }
}

/**
 * Global API key manager instance
 */
let globalApiKeyManager: ApiKeyManager | null = null;

export function initApiKeyManager(config?: ApiKeyManagerConfig): ApiKeyManager {
  globalApiKeyManager = new ApiKeyManager(config);
  return globalApiKeyManager;
}

export function getApiKeyManager(): ApiKeyManager {
  if (!globalApiKeyManager) {
    throw new Error('ApiKeyManager not initialized. Call initApiKeyManager() first.');
  }
  return globalApiKeyManager;
}
