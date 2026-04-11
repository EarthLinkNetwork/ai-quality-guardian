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
import { getAwsCredentials, getAwsRegion } from '../config/aws-config';

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
export type QueueItemStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_RESPONSE' | 'WAITING_CHILDREN' | 'COMPLETE' | 'ERROR' | 'CANCELLED';

/**
 * Valid status transitions
 * Per spec/20_QUEUE_STORE.md
 * v2.1: Added AWAITING_RESPONSE transitions
 * v2.2: Added WAITING_CHILDREN for parent tasks waiting on subtask completion
 */
export const VALID_STATUS_TRANSITIONS: Record<QueueItemStatus, QueueItemStatus[]> = {
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETE', 'ERROR', 'CANCELLED', 'AWAITING_RESPONSE', 'WAITING_CHILDREN'],
  AWAITING_RESPONSE: ['QUEUED', 'RUNNING', 'CANCELLED', 'ERROR', 'COMPLETE'], // User response re-queues, or rejudge/manual -> COMPLETE
  WAITING_CHILDREN: ['COMPLETE', 'ERROR', 'AWAITING_RESPONSE', 'CANCELLED'], // Parent waiting for subtasks — resolves when children finish
  COMPLETE: [], // Terminal state
  ERROR: ['AWAITING_RESPONSE', 'QUEUED', 'COMPLETE'], // Allow recovery: user can continue, retry, or rejudge to COMPLETE
  CANCELLED: ['AWAITING_RESPONSE', 'QUEUED'], // Allow recovery: user can continue or retry
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
 * Progress event emitted during task execution
 * Used for restart detection and live progress visibility
 */
export interface ProgressEvent {
  type: 'heartbeat' | 'tool_progress' | 'log_chunk';
  timestamp: string;
  data?: unknown;
}

/**
 * Task type for execution handling
 * - READ_INFO: Information requests, no file changes expected
 * - REPORT: Report/summary generation, no file changes expected
 * - LIGHT_EDIT: Small changes, bug fixes (low risk)
 * - IMPLEMENTATION: File creation/modification tasks
 * - REVIEW_RESPONSE: Code review responses
 * - CONFIG_CI_CHANGE: Configuration and CI/CD changes
 * - DANGEROUS_OP: Destructive operations (only type that can be BLOCKED)
 *
 * AC D: Guard Responsibility - Only DANGEROUS_OP can be BLOCKED
 */
export type TaskTypeValue =
  | 'READ_INFO'
  | 'REPORT'
  | 'LIGHT_EDIT'
  | 'IMPLEMENTATION'
  | 'REVIEW_RESPONSE'
  | 'CONFIG_CI_CHANGE'
  | 'DANGEROUS_OP';

/**
 * Queue Item schema (v2.2)
 * Per spec/20_QUEUE_STORE.md
 * Extended with clarification fields and task_type
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
  /** Task type for execution handling (READ_INFO/IMPLEMENTATION/REPORT) */
  task_type?: TaskTypeValue;
  /** Clarification request when status is AWAITING_RESPONSE */
  clarification?: ClarificationRequest;
  /** Conversation history for context preservation */
  conversation_history?: ConversationEntry[];
  /** Task output/response for READ_INFO/REPORT tasks */
  output?: string;
  /** Progress events emitted by executor (for restart detection) */
  events?: ProgressEvent[];
  /** Failure classification category (QUOTE_ERROR, PATH_NOT_FOUND, etc.) */
  failure_category?: string;
  /** Failure summary (1-line description) */
  failure_summary?: string;
  /** Suggested next actions for the user */
  failure_next_actions?: Array<{
    label: string;
    actionType: string;
    target?: string;
  }>;
  /** Command preview (the final command that was or will be executed) */
  command_preview?: string;
  /** Project working directory (absolute path). When set, executor uses this as cwd instead of runner's own directory. */
  project_path?: string;
  /** Parent task ID when this is a subtask created by task decomposition */
  parent_task_id?: string;
  /** User-requested pipeline: append a Test subtask after this task completes */
  add_test?: boolean;
  /** User-requested pipeline: append a Review subtask after this task completes */
  add_review?: boolean;
  /** Project alias at creation time (for display in process monitor / subtasks) */
  project_alias?: string;
}

/**
 * Extra options for enqueue() — optional fields that don't fit in positional args.
 */
export interface EnqueueOptions {
  /** User-requested pipeline: create Test subtask after parent completes */
  addTest?: boolean;
  /** User-requested pipeline: create Review subtask after parent completes */
  addReview?: boolean;
  /** Project alias for display */
  projectAlias?: string;
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
  /** DynamoDB endpoint (default: AWS DynamoDB; set for local override) */
  endpoint?: string;
  /** AWS region (default: from aws-config) */
  region?: string;
  /** Namespace for this store instance */
  namespace: string;
  /** Use local DynamoDB mode (localhost:8000 with dummy credentials) */
  localDynamodb?: boolean;
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
/** Task group lifecycle status */
export type TaskGroupStatus = 'active' | 'complete' | 'archived';

export interface TaskGroupSummary {
  task_group_id: string;
  task_count: number;
  created_at: string;
  latest_updated_at: string;
  /** Status breakdown counts */
  status_counts?: {
    QUEUED: number;
    RUNNING: number;
    AWAITING_RESPONSE: number;
    COMPLETE: number;
    ERROR: number;
    CANCELLED: number;
  };
  /** Latest task status in this group */
  latest_status?: QueueItemStatus;
  /** Preview of the first task's prompt (for display instead of raw group ID) */
  first_prompt?: string;
  /** Derived group status: active (has running/queued/awaiting tasks), complete (all done), or archived (user-set) */
  group_status?: TaskGroupStatus;
}

/**
 * Derive task group status from status counts
 * Always returns 'active' — group lifecycle (complete/archived) is controlled by the user, not auto-derived.
 */
export function deriveTaskGroupStatus(_statusCounts: Record<string, number>): TaskGroupStatus {
  return 'active';
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
 * Queue Store Interface
 * Common interface for QueueStore and InMemoryQueueStore
 */
export interface IQueueStore {
  getNamespace(): string;
  getEndpoint(): string;
  getTableName(): string;
  tableExists(): Promise<boolean>;
  createTable(): Promise<void>;
  createRunnersTable(): Promise<void>;
  runnersTableExists(): Promise<boolean>;
  ensureTable(): Promise<void>;
  deleteTable(): Promise<void>;
  enqueue(sessionId: string, taskGroupId: string, prompt: string, taskId?: string, taskType?: TaskTypeValue, projectPath?: string, parentTaskId?: string, options?: EnqueueOptions): Promise<QueueItem>;
  getItem(taskId: string, targetNamespace?: string): Promise<QueueItem | null>;
  claim(): Promise<ClaimResult>;
  updateStatus(taskId: string, status: QueueItemStatus, errorMessage?: string, output?: string): Promise<void>;
  appendEvent(taskId: string, event: ProgressEvent): Promise<boolean>;
  updateStatusWithValidation(taskId: string, newStatus: QueueItemStatus): Promise<StatusUpdateResult>;
  setAwaitingResponse(taskId: string, clarification: ClarificationRequest, conversationHistory?: ConversationEntry[], output?: string): Promise<StatusUpdateResult>;
  resumeWithResponse(taskId: string, userResponse: string): Promise<StatusUpdateResult>;
  getByStatus(status: QueueItemStatus): Promise<QueueItem[]>;
  getByTaskGroup(taskGroupId: string, targetNamespace?: string): Promise<QueueItem[]>;
  getAllItems(targetNamespace?: string): Promise<QueueItem[]>;
  /** Lightweight version of getAllItems that excludes large fields (output, conversation_history, events) */
  getAllItemsSummary(targetNamespace?: string): Promise<QueueItem[]>;
  getAllTaskGroups(targetNamespace?: string): Promise<TaskGroupSummary[]>;
  getAllNamespaces(): Promise<NamespaceSummary[]>;
  deleteItem(taskId: string): Promise<void>;
  /** Delete all tasks in a task group. Returns count of deleted items. */
  deleteTaskGroup(taskGroupId: string, targetNamespace?: string): Promise<number>;
  recoverStaleTasks(maxAgeMs?: number): Promise<number>;
  updateRunnerHeartbeat(runnerId: string, projectRoot: string): Promise<void>;
  getRunner(runnerId: string): Promise<RunnerRecord | null>;
  getAllRunners(targetNamespace?: string): Promise<RunnerRecord[]>;
  getRunnersWithStatus(heartbeatTimeoutMs?: number, targetNamespace?: string): Promise<Array<RunnerRecord & { isAlive: boolean }>>;
  markRunnerStopped(runnerId: string): Promise<void>;
  deleteRunner(runnerId: string): Promise<void>;
  setFailureInfo(taskId: string, failureInfo: {
    failure_category: string;
    failure_summary: string;
    failure_next_actions: Array<{ label: string; actionType: string; target?: string }>;
    command_preview?: string;
  }): Promise<void>;
  /** Set or clear archived status on a task group */
  setTaskGroupArchived(taskGroupId: string, archived: boolean, targetNamespace?: string): Promise<boolean>;
  /** Set group status override (active/complete/archived). null clears the override and returns to derived status. */
  setTaskGroupStatus(taskGroupId: string, status: TaskGroupStatus | null, targetNamespace?: string): Promise<boolean>;
  destroy(): void;
}

/**
 * Queue Store (v2)
 * Manages task queue with DynamoDB Local
 * Single table design with namespace-based separation
 */
export class QueueStore implements IQueueStore {
  private readonly client: DynamoDBClient;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly namespace: string;
  private readonly endpoint: string;
  private readonly archivedGroups: Set<string> = new Set();
  private readonly groupStatusOverrides: Map<string, TaskGroupStatus> = new Map();

  constructor(config: QueueStoreConfig) {
    this.namespace = config.namespace;

    if (config.localDynamodb) {
      // Local DynamoDB mode: localhost:8000 with dummy credentials
      this.endpoint = config.endpoint || 'http://localhost:8000';
      const region = config.region || 'local';
      this.client = new DynamoDBClient({
        endpoint: this.endpoint,
        region: region,
        credentials: {
          accessKeyId: 'local',
          secretAccessKey: 'local',
        },
      });
    } else {
      // AWS DynamoDB mode: Berry profile credentials + us-east-1
      const region = config.region || getAwsRegion();
      const credentials = getAwsCredentials();
      this.endpoint = config.endpoint || `https://dynamodb.${region}.amazonaws.com`;

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
        },
        {
          IndexName: 'task-group-index',
          KeySchema: [
            { AttributeName: 'task_group_id', KeyType: 'HASH' },
            { AttributeName: 'created_at', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
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
      BillingMode: 'PAY_PER_REQUEST',
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
   * @param sessionId - Session identifier
   * @param taskGroupId - Task group identifier
   * @param prompt - Task prompt
   * @param taskId - Optional task ID (auto-generated if not provided)
   * @param taskType - Optional task type (READ_INFO/IMPLEMENTATION/REPORT)
   */
  async enqueue(
    sessionId: string,
    taskGroupId: string,
    prompt: string,
    taskId?: string,
    taskType?: TaskTypeValue,
    projectPath?: string,
    parentTaskId?: string,
    options?: EnqueueOptions
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
      task_type: taskType,
      ...(projectPath ? { project_path: projectPath } : {}),
      ...(parentTaskId ? { parent_task_id: parentTaskId } : {}),
      ...(options?.addTest ? { add_test: true } : {}),
      ...(options?.addReview ? { add_review: true } : {}),
      ...(options?.projectAlias ? { project_alias: options.projectAlias } : {}),
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
    errorMessage?: string,
    output?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    let updateExpression = 'SET #status = :status, updated_at = :now';
    const expressionAttributeValues: Record<string, string> = {
      ':status': status,
      ':now': now,
    };

    if (errorMessage) {
      updateExpression += ', error_message = :error';
      expressionAttributeValues[':error'] = errorMessage;
    }

    if (output) {
      updateExpression += ', #output = :output';
      expressionAttributeValues[':output'] = output;
    }

    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
    };
    if (output) {
      expressionAttributeNames['#output'] = 'output';
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: QUEUE_TABLE_NAME,
        Key: { 
          namespace: this.namespace,
          task_id: taskId 
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
  }

  /**
   * Append a progress event to a task (best-effort)
   */
  async appendEvent(taskId: string, event: ProgressEvent): Promise<boolean> {
    const timestamp = event.timestamp || new Date().toISOString();
    const newEvent: ProgressEvent = { ...event, timestamp };

    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: QUEUE_TABLE_NAME,
          Key: {
            namespace: this.namespace,
            task_id: taskId,
          },
          UpdateExpression: 'SET updated_at = :now, #events = list_append(if_not_exists(#events, :empty), :event)',
          ExpressionAttributeNames: {
            '#events': 'events',
          },
          ExpressionAttributeValues: {
            ':now': timestamp,
            ':empty': [],
            ':event': [newEvent],
          },
          ConditionExpression: 'attribute_exists(task_id)',
        })
      );
      return true;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        return false;
      }
      throw error;
    }
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
    conversationHistory?: ConversationEntry[],
    output?: string
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

    const updateExpression = output
      ? 'SET #status = :status, updated_at = :now, clarification = :clarification, conversation_history = :history, #output = :output'
      : 'SET #status = :status, updated_at = :now, clarification = :clarification, conversation_history = :history';

    const expressionValues: Record<string, unknown> = {
      ':status': 'AWAITING_RESPONSE',
      ':now': now,
      ':clarification': clarification,
      ':history': conversationHistory || [],
    };

    if (output) {
      expressionValues[':output'] = output;
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: QUEUE_TABLE_NAME,
        Key: {
          namespace: this.namespace,
          task_id: taskId,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#status': 'status',
          '#output': 'output',
        },
        ExpressionAttributeValues: expressionValues,
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
          ':status': 'QUEUED',
          ':now': now,
          ':history': history,
        },
      })
    );

    return {
      success: true,
      task_id: taskId,
      old_status: 'AWAITING_RESPONSE',
      new_status: 'QUEUED',
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
   * Get all items in a namespace with only lightweight fields (excludes output, conversation_history, events).
   * Used by getAllTaskGroups to avoid fetching large payloads from DynamoDB.
   */
  async getAllItemsSummary(targetNamespace?: string): Promise<QueueItem[]> {
    const ns = targetNamespace ?? this.namespace;
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: QUEUE_TABLE_NAME,
        KeyConditionExpression: '#namespace = :namespace',
        ProjectionExpression: '#ns, task_id, task_group_id, #st, created_at, updated_at, session_id, task_type, parent_task_id, prompt',
        ExpressionAttributeNames: {
          '#namespace': 'namespace',
          '#ns': 'namespace',
          '#st': 'status',
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
    const items = await this.getAllItemsSummary(targetNamespace);

    const groupMap = new Map<string, {
      count: number;
      createdAt: string;
      latestUpdatedAt: string;
      statusCounts: Record<QueueItemStatus, number>;
      latestStatus: QueueItemStatus;
      latestStatusTime: string;
      firstPrompt: string;
    }>();

    for (const item of items) {
      const existing = groupMap.get(item.task_group_id);
      if (existing) {
        existing.count++;
        if (item.created_at < existing.createdAt) {
          existing.createdAt = item.created_at;
          existing.firstPrompt = item.prompt?.substring(0, 120) || '';
        }
        if (item.updated_at > existing.latestUpdatedAt) {
          existing.latestUpdatedAt = item.updated_at;
        }
        existing.statusCounts[item.status] = (existing.statusCounts[item.status] || 0) + 1;
        if (item.updated_at > existing.latestStatusTime) {
          existing.latestStatus = item.status;
          existing.latestStatusTime = item.updated_at;
        }
      } else {
        const statusCounts = { QUEUED: 0, RUNNING: 0, AWAITING_RESPONSE: 0, WAITING_CHILDREN: 0, COMPLETE: 0, ERROR: 0, CANCELLED: 0 } as Record<QueueItemStatus, number>;
        statusCounts[item.status] = 1;
        groupMap.set(item.task_group_id, {
          count: 1,
          createdAt: item.created_at,
          latestUpdatedAt: item.updated_at,
          statusCounts,
          latestStatus: item.status,
          latestStatusTime: item.updated_at,
          firstPrompt: item.prompt?.substring(0, 120) || '',
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
        status_counts: data.statusCounts,
        latest_status: data.latestStatus,
        group_status: this.groupStatusOverrides.get(taskGroupId) || (this.archivedGroups.has(taskGroupId) ? 'archived' : deriveTaskGroupStatus(data.statusCounts)),
        first_prompt: data.firstPrompt,
      });
    }

    groups.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return groups;
  }

  /**
   * Set or clear archived status on a task group
   */
  async setTaskGroupArchived(taskGroupId: string, archived: boolean, _targetNamespace?: string): Promise<boolean> {
    const items = await this.getByTaskGroup(taskGroupId, _targetNamespace);
    if (items.length === 0) {
      return false;
    }
    if (archived) {
      this.archivedGroups.add(taskGroupId);
      this.groupStatusOverrides.set(taskGroupId, 'archived');
    } else {
      this.archivedGroups.delete(taskGroupId);
      this.groupStatusOverrides.delete(taskGroupId);
    }
    return true;
  }

  /**
   * Set group status override. null clears the override and returns to derived status.
   */
  async setTaskGroupStatus(taskGroupId: string, status: TaskGroupStatus | null, _targetNamespace?: string): Promise<boolean> {
    const items = await this.getByTaskGroup(taskGroupId, _targetNamespace);
    if (items.length === 0) {
      return false;
    }
    if (status === null) {
      this.groupStatusOverrides.delete(taskGroupId);
      this.archivedGroups.delete(taskGroupId);
    } else {
      this.groupStatusOverrides.set(taskGroupId, status);
      if (status === 'archived') {
        this.archivedGroups.add(taskGroupId);
      } else {
        this.archivedGroups.delete(taskGroupId);
      }
    }
    return true;
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
   * Set failure classification info on a task
   */
  async setFailureInfo(taskId: string, failureInfo: {
    failure_category: string;
    failure_summary: string;
    failure_next_actions: Array<{ label: string; actionType: string; target?: string }>;
    command_preview?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    let updateExpression = 'SET updated_at = :now, failure_category = :cat, failure_summary = :summary, failure_next_actions = :actions';
    const expressionValues: Record<string, unknown> = {
      ':now': now,
      ':cat': failureInfo.failure_category,
      ':summary': failureInfo.failure_summary,
      ':actions': failureInfo.failure_next_actions,
    };

    if (failureInfo.command_preview) {
      updateExpression += ', command_preview = :preview';
      expressionValues[':preview'] = failureInfo.command_preview;
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: QUEUE_TABLE_NAME,
        Key: {
          namespace: this.namespace,
          task_id: taskId,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
      })
    );
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
   * Delete all tasks in a task group. Returns count of deleted items.
   */
  async deleteTaskGroup(taskGroupId: string, targetNamespace?: string): Promise<number> {
    const items = await this.getByTaskGroup(taskGroupId, targetNamespace);
    const ns = targetNamespace ?? this.namespace;
    let count = 0;
    for (const item of items) {
      await this.docClient.send(
        new DeleteCommand({
          TableName: QUEUE_TABLE_NAME,
          Key: { namespace: ns, task_id: item.task_id },
        })
      );
      count++;
    }
    this.archivedGroups.delete(taskGroupId);
    this.groupStatusOverrides.delete(taskGroupId);
    return count;
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
