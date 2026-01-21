/**
 * Queue Store - DynamoDB Local implementation
 * Per spec/20_QUEUE_STORE.md
 *
 * Provides queue operations with:
 * - Atomic QUEUED -> RUNNING transitions (conditional update)
 * - Double execution prevention
 * - Fail-closed error handling
 */

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
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Queue Item status
 * Per spec/20: QUEUED / RUNNING / COMPLETE / ERROR / CANCELLED
 */
export type QueueItemStatus = 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'ERROR' | 'CANCELLED';

/**
 * Valid status transitions
 * Per spec/20_QUEUE_STORE.md
 */
export const VALID_STATUS_TRANSITIONS: Record<QueueItemStatus, QueueItemStatus[]> = {
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETE', 'ERROR', 'CANCELLED'],
  COMPLETE: [], // Terminal state
  ERROR: [], // Terminal state
  CANCELLED: [], // Terminal state
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  fromStatus: QueueItemStatus,
  toStatus: QueueItemStatus
): boolean {
  return VALID_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * Queue Item schema
 * Per spec/20_QUEUE_STORE.md
 */
export interface QueueItem {
  task_id: string;
  task_group_id: string;
  session_id: string;
  status: QueueItemStatus;
  prompt: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
}

/**
 * Queue Store configuration
 */
export interface QueueStoreConfig {
  /** DynamoDB endpoint (default: http://localhost:8000) */
  endpoint?: string;
  /** Table name (default: pm-runner-queue) */
  tableName?: string;
  /** AWS region (default: local) */
  region?: string;
}

/**
 * Claim result
 */
export interface ClaimResult {
  success: boolean;
  item?: QueueItem;
  error?: string;
}

/**
 * Status update result
 * Per spec/19_WEB_UI.md: PATCH /api/tasks/:task_id/status response
 */
export interface StatusUpdateResult {
  success: boolean;
  task_id: string;
  old_status?: QueueItemStatus;
  new_status?: QueueItemStatus;
  error?: string;
  message?: string;
}

/**
 * Task Group summary for listing
 * Per spec/19_WEB_UI.md: task group list view
 */
export interface TaskGroupSummary {
  task_group_id: string;
  task_count: number;
  created_at: string;
  latest_updated_at: string;
}

/**
 * Queue Store
 * Manages task queue with DynamoDB Local
 */
export class QueueStore {
  private readonly client: DynamoDBClient;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly endpoint: string;

  constructor(config: QueueStoreConfig = {}) {
    this.endpoint = config.endpoint || 'http://localhost:8000';
    this.tableName = config.tableName || 'pm-runner-queue';
    const region = config.region || 'local';

    this.client = new DynamoDBClient({
      endpoint: this.endpoint,
      region: region,
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    });

    this.docClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  /**
   * Get table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Get endpoint
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  /**
   * Check if table exists
   */
  async tableExists(): Promise<boolean> {
    try {
      await this.client.send(
        new DescribeTableCommand({ TableName: this.tableName })
      );
      return true;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create table with required GSIs
   * Per spec/20_QUEUE_STORE.md table definition
   */
  async createTable(): Promise<void> {
    const command = new CreateTableCommand({
      TableName: this.tableName,
      KeySchema: [{ AttributeName: 'task_id', KeyType: 'HASH' }],
      AttributeDefinitions: [
        { AttributeName: 'task_id', AttributeType: 'S' },
        { AttributeName: 'session_id', AttributeType: 'S' },
        { AttributeName: 'status', AttributeType: 'S' },
        { AttributeName: 'created_at', AttributeType: 'S' },
        { AttributeName: 'task_group_id', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'session-index',
          KeySchema: [
            { AttributeName: 'session_id', KeyType: 'HASH' },
            { AttributeName: 'created_at', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
        {
          IndexName: 'status-index',
          KeySchema: [
            { AttributeName: 'status', KeyType: 'HASH' },
            { AttributeName: 'created_at', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
        {
          IndexName: 'task-group-index',
          KeySchema: [
            { AttributeName: 'task_group_id', KeyType: 'HASH' },
            { AttributeName: 'created_at', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
      },
    });

    await this.client.send(command);
  }

  /**
   * Ensure table exists, create if not
   */
  async ensureTable(): Promise<void> {
    const exists = await this.tableExists();
    if (!exists) {
      await this.createTable();
      // Wait for table to be active
      await this.waitForTableActive();
    }
  }

  /**
   * Wait for table to become active
   */
  private async waitForTableActive(maxWaitMs = 30000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const result = await this.client.send(
          new DescribeTableCommand({ TableName: this.tableName })
        );
        if (result.Table?.TableStatus === 'ACTIVE') {
          return;
        }
      } catch {
        // Table not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Table ${this.tableName} did not become active within ${maxWaitMs}ms`);
  }

  /**
   * Enqueue a new task
   * Creates item with status=QUEUED
   *
   * @param sessionId - Session ID
   * @param taskGroupId - Task Group ID
   * @param prompt - User prompt
   * @param taskId - Optional task ID (generates if not provided)
   * @returns Created queue item
   */
  async enqueue(
    sessionId: string,
    taskGroupId: string,
    prompt: string,
    taskId?: string
  ): Promise<QueueItem> {
    const now = new Date().toISOString();
    const item: QueueItem = {
      task_id: taskId || uuidv4(),
      task_group_id: taskGroupId,
      session_id: sessionId,
      status: 'QUEUED',
      prompt,
      created_at: now,
      updated_at: now,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );

    return item;
  }

  /**
   * Get item by task_id
   */
  async getItem(taskId: string): Promise<QueueItem | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { task_id: taskId },
      })
    );

    return (result.Item as QueueItem) || null;
  }

  /**
   * Claim the oldest QUEUED task (atomic QUEUED -> RUNNING)
   * Per spec: Uses conditional update for double execution prevention
   *
   * @returns ClaimResult with success flag and item if claimed
   */
  async claim(): Promise<ClaimResult> {
    // Query for oldest QUEUED item using status-index
    const queryResult = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :queued',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':queued': 'QUEUED',
        },
        Limit: 1,
        ScanIndexForward: true, // Ascending by created_at (oldest first)
      })
    );

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return { success: false };
    }

    const item = queryResult.Items[0] as QueueItem;

    // Atomic update: QUEUED -> RUNNING with conditional check
    try {
      const now = new Date().toISOString();
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { task_id: item.task_id },
          UpdateExpression: 'SET #status = :running, updated_at = :now',
          ConditionExpression: '#status = :queued',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':running': 'RUNNING',
            ':queued': 'QUEUED',
            ':now': now,
          },
        })
      );

      // Update local item with new status
      item.status = 'RUNNING';
      item.updated_at = now;

      return { success: true, item };
    } catch (error: unknown) {
      // ConditionalCheckFailed means another process claimed it
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        return { success: false, error: 'Task already claimed by another process' };
      }
      // Fail-closed: re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Update task status
   * Per spec: RUNNING -> COMPLETE or RUNNING -> ERROR
   *
   * @param taskId - Task ID
   * @param status - New status
   * @param errorMessage - Optional error message (for ERROR status)
   */
  async updateStatus(
    taskId: string,
    status: QueueItemStatus,
    errorMessage?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const updateExpression = errorMessage
      ? 'SET #status = :status, updated_at = :now, error_message = :error'
      : 'SET #status = :status, updated_at = :now';

    const expressionAttributeValues: Record<string, string> = {
      ':status': status,
      ':now': now,
    };

    if (errorMessage) {
      expressionAttributeValues[':error'] = errorMessage;
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { task_id: taskId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
  }

  /**
   * Update task status with validation
   * Per spec/19_WEB_UI.md: PATCH /api/tasks/:task_id/status
   *
   * @param taskId - Task ID
   * @param newStatus - Target status
   * @returns StatusUpdateResult with success/error info
   */
  async updateStatusWithValidation(
    taskId: string,
    newStatus: QueueItemStatus
  ): Promise<StatusUpdateResult> {
    // First, get current task
    const task = await this.getItem(taskId);

    if (!task) {
      return {
        success: false,
        task_id: taskId,
        error: 'Task not found',
        message: `Task not found: ${taskId}`,
      };
    }

    const oldStatus = task.status;

    // Check if transition is valid
    if (!isValidStatusTransition(oldStatus, newStatus)) {
      return {
        success: false,
        task_id: taskId,
        old_status: oldStatus,
        error: 'Invalid status transition',
        message: `Cannot transition from ${oldStatus} to ${newStatus}`,
      };
    }

    // Update status
    await this.updateStatus(taskId, newStatus);

    return {
      success: true,
      task_id: taskId,
      old_status: oldStatus,
      new_status: newStatus,
    };
  }

  /**
   * Get items by session ID
   * Uses session-index GSI
   */
  async getBySession(sessionId: string): Promise<QueueItem[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'session-index',
        KeyConditionExpression: 'session_id = :sid',
        ExpressionAttributeValues: {
          ':sid': sessionId,
        },
        ScanIndexForward: true, // Ascending by created_at
      })
    );

    return (result.Items as QueueItem[]) || [];
  }

  /**
   * Get items by status
   * Uses status-index GSI
   */
  async getByStatus(status: QueueItemStatus): Promise<QueueItem[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
        },
        ScanIndexForward: true, // Ascending by created_at
      })
    );

    return (result.Items as QueueItem[]) || [];
  }

  /**
   * Get items by task group ID
   * Uses task-group-index GSI
   * Per spec/19_WEB_UI.md: for listing tasks in a task group
   */
  async getByTaskGroup(taskGroupId: string): Promise<QueueItem[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'task-group-index',
        KeyConditionExpression: 'task_group_id = :tgid',
        ExpressionAttributeValues: {
          ':tgid': taskGroupId,
        },
        ScanIndexForward: true, // Ascending by created_at
      })
    );

    return (result.Items as QueueItem[]) || [];
  }

  /**
   * Get all distinct task groups with summary
   * Per spec/19_WEB_UI.md: for task group list view
   * Note: Uses Scan - consider pagination for large datasets
   */
  async getAllTaskGroups(): Promise<TaskGroupSummary[]> {
    // Scan all items and aggregate by task_group_id
    const result = await this.docClient.send(
      new ScanCommand({
        TableName: this.tableName,
        ProjectionExpression: 'task_group_id, created_at, updated_at',
      })
    );

    const items = (result.Items as Pick<QueueItem, 'task_group_id' | 'created_at' | 'updated_at'>[]) || [];

    // Aggregate by task_group_id
    const groupMap = new Map<string, { count: number; createdAt: string; latestUpdatedAt: string }>();

    for (const item of items) {
      const existing = groupMap.get(item.task_group_id);
      if (existing) {
        existing.count++;
        if (item.created_at < existing.createdAt) {
          existing.createdAt = item.created_at;
        }
        if (item.updated_at > existing.latestUpdatedAt) {
          existing.latestUpdatedAt = item.updated_at;
        }
      } else {
        groupMap.set(item.task_group_id, {
          count: 1,
          createdAt: item.created_at,
          latestUpdatedAt: item.updated_at,
        });
      }
    }

    // Convert to array and sort by created_at (oldest first)
    const groups: TaskGroupSummary[] = [];
    for (const [taskGroupId, data] of groupMap) {
      groups.push({
        task_group_id: taskGroupId,
        task_count: data.count,
        created_at: data.createdAt,
        latest_updated_at: data.latestUpdatedAt,
      });
    }

    groups.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return groups;
  }

  /**
   * Delete item (for testing)
   */
  async deleteItem(taskId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { task_id: taskId },
      })
    );
  }

  /**
   * Mark stale RUNNING tasks as ERROR
   * Per spec: fail-closed - don't leave tasks in "limbo"
   *
   * @param maxAgeMs - Max age in milliseconds for RUNNING tasks
   * @returns Number of tasks marked as ERROR
   */
  async recoverStaleTasks(maxAgeMs: number = 5 * 60 * 1000): Promise<number> {
    const runningTasks = await this.getByStatus('RUNNING');
    const now = Date.now();
    let recovered = 0;

    for (const task of runningTasks) {
      const taskAge = now - new Date(task.updated_at).getTime();
      if (taskAge > maxAgeMs) {
        await this.updateStatus(
          task.task_id,
          'ERROR',
          `Task stale: running for ${Math.round(taskAge / 1000)}s without completion`
        );
        recovered++;
      }
    }

    return recovered;
  }

  /**
   * Close the client connection
   */
  destroy(): void {
    this.client.destroy();
  }
}
