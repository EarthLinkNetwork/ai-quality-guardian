/**
 * Queue Store - DynamoDB Local implementation (v2)
 * Per spec/20_QUEUE_STORE.md
 *
 * v2 Changes:
 * - Single fixed table: pm-runner-queue
 * - Composite key: PK=namespace, SK=task_id
 * - GSI: status-index (status + created_at)
 * - Namespace-based separation in single table
 *
 * v2.1 Changes:
 * - Added AWAITING_RESPONSE status for clarification flow
 * - Added clarification and conversation_history fields
 * - Updated status transitions for AWAITING_RESPONSE
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
  DeleteTableCommand,
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
 * Fixed table name (v2: single table for all namespaces)
 */
export const QUEUE_TABLE_NAME = 'pm-runner-queue';

/**
 * Runners table name (v2: heartbeat tracking)
 */
export const RUNNERS_TABLE_NAME = 'pm-runner-runners';

/**
 * Queue Item status
 * Per spec/20: QUEUED / RUNNING / COMPLETE / ERROR / CANCELLED
 * v2.1: Added AWAITING_RESPONSE for clarification flow
 */
export type QueueItemStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_RESPONSE' | 'COMPLETE' | 'ERROR' | 'CANCELLED';

/**
 * Valid status transitions
 * Per spec/20_QUEUE_STORE.md
 * v2.1: Added AWAITING_RESPONSE transitions
 */
export const VALID_STATUS_TRANSITIONS: Record<QueueItemStatus, QueueItemStatus[]> = {
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETE', 'ERROR', 'CANCELLED', 'AWAITING_RESPONSE'],
  AWAITING_RESPONSE: ['RUNNING', 'CANCELLED', 'ERROR'], // User response resumes to RUNNING
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
 * Conversation history entry for clarification flow
 */
export interface ConversationEntry {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Clarification request details
 */
export interface ClarificationRequest {
  /** Type of clarification needed */
  type: 'best_practice' | 'case_by_case' | 'unknown';
  /** The question being asked */
  question: string;
  /** Options provided (if any) */
  options?: string[];
  /** Context for the clarification */
  context?: string;
  /** Was this auto-resolved? */
  auto_resolved?: boolean;
  /** Resolution value (if auto-resolved) */
  resolution?: string;
  /** Reasoning for auto-resolution */
  resolution_reasoning?: string;
}

/**
 * Queue Item schema (v2.1)
 * Per spec/20_QUEUE_STORE.md
 * Extended with clarification fields
 */
export interface QueueItem {
  namespace: string;       // Partition key
  task_id: string;         // Sort key
  task_group_id: string;
  session_id: string;
  status: QueueItemStatus;
  prompt: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
  /** Clarification request when status is AWAITING_RESPONSE */
  clarification?: ClarificationRequest;
  /** Conversation history for context preservation */
  conversation_history?: ConversationEntry[];
}

/**
 * Runner status for heartbeat tracking
 */
export type RunnerStatus = 'RUNNING' | 'STOPPED';

/**
 * Runner record schema (v2)
 * Per spec/20_QUEUE_STORE.md
 */
export interface RunnerRecord {
  namespace: string;      // Partition key
  runner_id: string;      // Sort key
  last_heartbeat: string; // ISO 8601
  started_at: string;     // ISO 8601
  status: RunnerStatus;
  project_root: string;
}

/**
 * Queue Store configuration
 */
export interface QueueStoreConfig {
  /** DynamoDB endpoint (default: http://localhost:8000) */
  endpoint?: string;
  /** AWS region (default: local) */
  region?: string;
  /** Namespace for this store instance */
  namespace: string;
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
 * Namespace summary for listing
 */
export interface NamespaceSummary {
  namespace: string;
  task_count: number;
  runner_count: number;
  active_runner_count: number;
}

/**
 * Queue Store (v2)
 * Manages task queue with DynamoDB Local
 * Single table design with namespace-based separation
 */
export class QueueStore {
  private readonly client: DynamoDBClient;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly namespace: string;
  private readonly endpoint: string;

  constructor(config: QueueStoreConfig) {
    this.endpoint = config.endpoint || 'http://localhost:8000';
    this.namespace = config.namespace;
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
   * Get fixed table name (v2: always returns pm-runner-queue)
   */
  getTableName(): string {
    return QUEUE_TABLE_NAME;
  }

  /**
   * Get namespace
   */
  getNamespace(): string {
    return this.namespace;
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
        new DescribeTableCommand({ TableName: QUEUE_TABLE_NAME })
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
   * Delete queue table (for testing)
   */
  async deleteTable(): Promise<void> {
    try {
      await this.client.send(
        new DeleteTableCommand({ TableName: QUEUE_TABLE_NAME })
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // Table doesn't exist, ignore
        return;
      }
      throw error;
    }
  }

  /**
   * Create queue table with composite key (v2)
   * PK: namespace, SK: task_id
   */
  async createTable(): Promise<void> {
    const command = new CreateTableCommand({
      TableName: QUEUE_TABLE_NAME,
      KeySchema: [
        { AttributeName: 'namespace', KeyType: 'HASH' },
        { AttributeName: 'task_id', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'namespace', AttributeType: 'S' },
        { AttributeName: 'task_id', AttributeType: 'S' },
        { AttributeName: 'status', AttributeType: 'S' },
        { AttributeName: 'created_at', AttributeType: 'S' },
        { AttributeName: 'task_group_id', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
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
   * Create runners table (v2)
   * PK: namespace, SK: runner_id
   */
  async createRunnersTable(): Promise<void> {
    const command = new CreateTableCommand({
      TableName: RUNNERS_TABLE_NAME,
      KeySchema: [
        { AttributeName: 'namespace', KeyType: 'HASH' },
        { AttributeName: 'runner_id', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'namespace', AttributeType: 'S' },
        { AttributeName: 'runner_id', AttributeType: 'S' },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
      },
    });

    await this.client.send(command);
  }

  /**
   * Check if runners table exists
   */
  async runnersTableExists(): Promise<boolean> {
    try {
      await this.client.send(
        new DescribeTableCommand({ TableName: RUNNERS_TABLE_NAME })
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
   * Ensure both tables exist
   */
  async ensureTable(): Promise<void> {
    // Queue table
    const queueExists = await this.tableExists();
    if (!queueExists) {
      await this.createTable();
      await this.waitForTableActive(QUEUE_TABLE_NAME);
    }

    // Runners table
    const runnersExists = await this.runnersTableExists();
    if (!runnersExists) {
      await this.createRunnersTable();
      await this.waitForTableActive(RUNNERS_TABLE_NAME);
    }
  }

  /**
   * Wait for table to become active
   */
  private async waitForTableActive(tableName: string, maxWaitMs = 30000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const result = await this.client.send(
          new DescribeTableCommand({ TableName: tableName })
        );
        if (result.Table?.TableStatus === 'ACTIVE') {
          return;
        }
      } catch {
        // Table not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Table ${tableName} did not become active within ${maxWaitMs}ms`);
  }

  /**
   * Enqueue a new task
   * Creates item with status=QUEUED
   */
  async enqueue(
    sessionId: string,
    taskGroupId: string,
    prompt: string,
    taskId?: string
  ): Promise<QueueItem> {
    const now = new Date().toISOString();
    const item: QueueItem = {
      namespace: this.namespace,
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
        TableName: QUEUE_TABLE_NAME,
        Item: item,
      })
    );

    return item;
  }

  /**
   * Get item by task_id (v2: uses composite key)
   */
  async getItem(taskId: string, targetNamespace?: string): Promise<QueueItem | null> {
    const ns = targetNamespace ?? this.namespace;
    const result = await this.docClient.send(
      new GetCommand({
        TableName: QUEUE_TABLE_NAME,
        Key: {
          namespace: ns,
          task_id: taskId
        },
      })
    );

    return (result.Item as QueueItem) || null;
  }

  /**
   * Claim the oldest QUEUED task for this namespace
   */
  async claim(): Promise<ClaimResult> {
    const queryResult = await this.docClient.send(
      new QueryCommand({
        TableName: QUEUE_TABLE_NAME,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :queued',
        FilterExpression: '#namespace = :namespace',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#namespace': 'namespace',
        },
        ExpressionAttributeValues: {
          ':queued': 'QUEUED',
          ':namespace': this.namespace,
        },
        Limit: 10,
        ScanIndexForward: true,
      })
    );

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return { success: false };
    }

    const item = queryResult.Items[0] as QueueItem;

    try {
      const now = new Date().toISOString();
      await this.docClient.send(
        new UpdateCommand({
          TableName: QUEUE_TABLE_NAME,
          Key: { 
            namespace: this.namespace,
            task_id: item.task_id 
          },
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

      item.status = 'RUNNING';
      item.updated_at = now;

      return { success: true, item };
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        return { success: false, error: 'Task already claimed by another process' };
      }
      throw error;
    }
  }

  /**
   * Update task status
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
        TableName: QUEUE_TABLE_NAME,
        Key: { 
          namespace: this.namespace,
          task_id: taskId 
        },
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
   */
  async updateStatusWithValidation(
    taskId: string,
    newStatus: QueueItemStatus
  ): Promise<StatusUpdateResult> {
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

    if (!isValidStatusTransition(oldStatus, newStatus)) {
      return {
        success: false,
        task_id: taskId,
        old_status: oldStatus,
        error: 'Invalid status transition',
        message: `Cannot transition from ${oldStatus} to ${newStatus}`,
      };
    }

    await this.updateStatus(taskId, newStatus);

    return {
      success: true,
      task_id: taskId,
      old_status: oldStatus,
      new_status: newStatus,
    };
  }

  /**
   * Set task to AWAITING_RESPONSE with clarification details
   */
  async setAwaitingResponse(
    taskId: string,
    clarification: ClarificationRequest,
    conversationHistory?: ConversationEntry[]
  ): Promise<StatusUpdateResult> {
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

    if (!isValidStatusTransition(oldStatus, 'AWAITING_RESPONSE')) {
      return {
        success: false,
        task_id: taskId,
        old_status: oldStatus,
        error: 'Invalid status transition',
        message: `Cannot transition from ${oldStatus} to AWAITING_RESPONSE`,
      };
    }

    const now = new Date().toISOString();

    await this.docClient.send(
      new UpdateCommand({
        TableName: QUEUE_TABLE_NAME,
        Key: {
          namespace: this.namespace,
          task_id: taskId,
        },
        UpdateExpression: 'SET #status = :status, updated_at = :now, clarification = :clarification, conversation_history = :history',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'AWAITING_RESPONSE',
          ':now': now,
          ':clarification': clarification,
          ':history': conversationHistory || [],
        },
      })
    );

    return {
      success: true,
      task_id: taskId,
      old_status: oldStatus,
      new_status: 'AWAITING_RESPONSE',
    };
  }

  /**
   * Resume task from AWAITING_RESPONSE with user response
   */
  async resumeWithResponse(
    taskId: string,
    userResponse: string
  ): Promise<StatusUpdateResult> {
    const task = await this.getItem(taskId);

    if (!task) {
      return {
        success: false,
        task_id: taskId,
        error: 'Task not found',
        message: `Task not found: ${taskId}`,
      };
    }

    if (task.status !== 'AWAITING_RESPONSE') {
      return {
        success: false,
        task_id: taskId,
        old_status: task.status,
        error: 'Invalid status',
        message: `Task is not awaiting response: ${task.status}`,
      };
    }

    const now = new Date().toISOString();

    // Add user response to conversation history
    const history = task.conversation_history || [];
    history.push({
      role: 'user',
      content: userResponse,
      timestamp: now,
    });

    await this.docClient.send(
      new UpdateCommand({
        TableName: QUEUE_TABLE_NAME,
        Key: {
          namespace: this.namespace,
          task_id: taskId,
        },
        UpdateExpression: 'SET #status = :status, updated_at = :now, conversation_history = :history',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'RUNNING',
          ':now': now,
          ':history': history,
        },
      })
    );

    return {
      success: true,
      task_id: taskId,
      old_status: 'AWAITING_RESPONSE',
      new_status: 'RUNNING',
    };
  }

  /**
   * Get items by status for this namespace
   */
  async getByStatus(status: QueueItemStatus): Promise<QueueItem[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: QUEUE_TABLE_NAME,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :status',
        FilterExpression: '#namespace = :namespace',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#namespace': 'namespace',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':namespace': this.namespace,
        },
        ScanIndexForward: true,
      })
    );

    return (result.Items as QueueItem[]) || [];
  }

  /**
   * Get items by task group ID for this namespace
   */
  async getByTaskGroup(taskGroupId: string, targetNamespace?: string): Promise<QueueItem[]> {
    const ns = targetNamespace ?? this.namespace;
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: QUEUE_TABLE_NAME,
        IndexName: 'task-group-index',
        KeyConditionExpression: 'task_group_id = :tgid',
        FilterExpression: '#namespace = :namespace',
        ExpressionAttributeNames: {
          '#namespace': 'namespace',
        },
        ExpressionAttributeValues: {
          ':tgid': taskGroupId,
          ':namespace': ns,
        },
        ScanIndexForward: true,
      })
    );

    return (result.Items as QueueItem[]) || [];
  }

  /**
   * Get all items in a namespace
   */
  async getAllItems(targetNamespace?: string): Promise<QueueItem[]> {
    const ns = targetNamespace ?? this.namespace;
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: QUEUE_TABLE_NAME,
        KeyConditionExpression: '#namespace = :namespace',
        ExpressionAttributeNames: {
          '#namespace': 'namespace',
        },
        ExpressionAttributeValues: {
          ':namespace': ns,
        },
        ScanIndexForward: true,
      })
    );

    return (result.Items as QueueItem[]) || [];
  }

  /**
   * Get all distinct task groups for a namespace with summary
   */
  async getAllTaskGroups(targetNamespace?: string): Promise<TaskGroupSummary[]> {
    const items = await this.getAllItems(targetNamespace);

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
   * Get all distinct namespaces (scan entire table)
   */
  async getAllNamespaces(): Promise<NamespaceSummary[]> {
    const queueResult = await this.docClient.send(
      new ScanCommand({
        TableName: QUEUE_TABLE_NAME,
        ProjectionExpression: '#namespace',
        ExpressionAttributeNames: {
          '#namespace': 'namespace',
        },
      })
    );

    let runnersResult: { Items?: unknown[] } = { Items: [] };
    try {
      runnersResult = await this.docClient.send(
        new ScanCommand({
          TableName: RUNNERS_TABLE_NAME,
        })
      );
    } catch {
      // Runners table might not exist yet
    }

    const queueItems = (queueResult.Items || []) as { namespace: string }[];
    const runners = (runnersResult.Items || []) as RunnerRecord[];

    const taskCounts = new Map<string, number>();
    for (const item of queueItems) {
      const count = taskCounts.get(item.namespace) || 0;
      taskCounts.set(item.namespace, count + 1);
    }

    const runnerCounts = new Map<string, { total: number; active: number }>();
    const now = Date.now();
    const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

    for (const runner of runners) {
      const counts = runnerCounts.get(runner.namespace) || { total: 0, active: 0 };
      counts.total++;
      
      const lastHeartbeat = new Date(runner.last_heartbeat).getTime();
      if (now - lastHeartbeat < HEARTBEAT_TIMEOUT_MS) {
        counts.active++;
      }
      
      runnerCounts.set(runner.namespace, counts);
    }

    const allNamespaces = new Set([...taskCounts.keys(), ...runnerCounts.keys()]);

    const summaries: NamespaceSummary[] = [];
    for (const ns of allNamespaces) {
      const runnerInfo = runnerCounts.get(ns) || { total: 0, active: 0 };
      summaries.push({
        namespace: ns,
        task_count: taskCounts.get(ns) || 0,
        runner_count: runnerInfo.total,
        active_runner_count: runnerInfo.active,
      });
    }

    summaries.sort((a, b) => a.namespace.localeCompare(b.namespace));

    return summaries;
  }

  /**
   * Delete item (for testing)
   */
  async deleteItem(taskId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: QUEUE_TABLE_NAME,
        Key: { 
          namespace: this.namespace,
          task_id: taskId 
        },
      })
    );
  }

  /**
   * Mark stale RUNNING tasks as ERROR
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

  // ===============================
  // Runner Heartbeat Methods (v2)
  // ===============================

  /**
   * Register or update runner heartbeat
   */
  async updateRunnerHeartbeat(runnerId: string, projectRoot: string): Promise<void> {
    const now = new Date().toISOString();
    
    const existing = await this.getRunner(runnerId);
    
    if (existing) {
      await this.docClient.send(
        new UpdateCommand({
          TableName: RUNNERS_TABLE_NAME,
          Key: {
            namespace: this.namespace,
            runner_id: runnerId,
          },
          UpdateExpression: 'SET last_heartbeat = :now, #status = :status',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':now': now,
            ':status': 'RUNNING',
          },
        })
      );
    } else {
      const record: RunnerRecord = {
        namespace: this.namespace,
        runner_id: runnerId,
        last_heartbeat: now,
        started_at: now,
        status: 'RUNNING',
        project_root: projectRoot,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: RUNNERS_TABLE_NAME,
          Item: record,
        })
      );
    }
  }

  /**
   * Get runner by ID
   */
  async getRunner(runnerId: string): Promise<RunnerRecord | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: RUNNERS_TABLE_NAME,
        Key: {
          namespace: this.namespace,
          runner_id: runnerId,
        },
      })
    );

    return (result.Item as RunnerRecord) || null;
  }

  /**
   * Get all runners for this namespace
   */
  async getAllRunners(targetNamespace?: string): Promise<RunnerRecord[]> {
    const ns = targetNamespace ?? this.namespace;
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: RUNNERS_TABLE_NAME,
        KeyConditionExpression: '#namespace = :namespace',
        ExpressionAttributeNames: {
          '#namespace': 'namespace',
        },
        ExpressionAttributeValues: {
          ':namespace': ns,
        },
      })
    );

    return (result.Items as RunnerRecord[]) || [];
  }

  /**
   * Get runners with their alive status
   */
  async getRunnersWithStatus(heartbeatTimeoutMs: number = 2 * 60 * 1000, targetNamespace?: string): Promise<Array<RunnerRecord & { isAlive: boolean }>> {
    const runners = await this.getAllRunners(targetNamespace);
    const now = Date.now();

    return runners.map(runner => ({
      ...runner,
      isAlive: now - new Date(runner.last_heartbeat).getTime() < heartbeatTimeoutMs,
    }));
  }

  /**
   * Mark runner as stopped
   */
  async markRunnerStopped(runnerId: string): Promise<void> {
    await this.docClient.send(
      new UpdateCommand({
        TableName: RUNNERS_TABLE_NAME,
        Key: {
          namespace: this.namespace,
          runner_id: runnerId,
        },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'STOPPED',
        },
      })
    );
  }

  /**
   * Delete runner record
   */
  async deleteRunner(runnerId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: RUNNERS_TABLE_NAME,
        Key: {
          namespace: this.namespace,
          runner_id: runnerId,
        },
      })
    );
  }

  /**
   * Close the client connection
   */
  destroy(): void {
    this.client.destroy();
  }
}
