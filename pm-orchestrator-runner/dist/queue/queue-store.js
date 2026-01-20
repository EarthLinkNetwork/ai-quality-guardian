"use strict";
/**
 * Queue Store - DynamoDB Local implementation
 * Per spec/20_QUEUE_STORE.md
 *
 * Provides queue operations with:
 * - Atomic QUEUED -> RUNNING transitions (conditional update)
 * - Double execution prevention
 * - Fail-closed error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueStore = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
/**
 * Queue Store
 * Manages task queue with DynamoDB Local
 */
class QueueStore {
    client;
    docClient;
    tableName;
    endpoint;
    constructor(config = {}) {
        this.endpoint = config.endpoint || 'http://localhost:8000';
        this.tableName = config.tableName || 'pm-runner-queue';
        const region = config.region || 'local';
        this.client = new client_dynamodb_1.DynamoDBClient({
            endpoint: this.endpoint,
            region: region,
            credentials: {
                accessKeyId: 'local',
                secretAccessKey: 'local',
            },
        });
        this.docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(this.client, {
            marshallOptions: {
                removeUndefinedValues: true,
            },
        });
    }
    /**
     * Get table name
     */
    getTableName() {
        return this.tableName;
    }
    /**
     * Get endpoint
     */
    getEndpoint() {
        return this.endpoint;
    }
    /**
     * Check if table exists
     */
    async tableExists() {
        try {
            await this.client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: this.tableName }));
            return true;
        }
        catch (error) {
            if (error instanceof client_dynamodb_1.ResourceNotFoundException) {
                return false;
            }
            throw error;
        }
    }
    /**
     * Create table with required GSIs
     * Per spec/20_QUEUE_STORE.md table definition
     */
    async createTable() {
        const command = new client_dynamodb_1.CreateTableCommand({
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
    async ensureTable() {
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
    async waitForTableActive(maxWaitMs = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            try {
                const result = await this.client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: this.tableName }));
                if (result.Table?.TableStatus === 'ACTIVE') {
                    return;
                }
            }
            catch {
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
    async enqueue(sessionId, taskGroupId, prompt, taskId) {
        const now = new Date().toISOString();
        const item = {
            task_id: taskId || (0, uuid_1.v4)(),
            task_group_id: taskGroupId,
            session_id: sessionId,
            status: 'QUEUED',
            prompt,
            created_at: now,
            updated_at: now,
        };
        await this.docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: item,
        }));
        return item;
    }
    /**
     * Get item by task_id
     */
    async getItem(taskId) {
        const result = await this.docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: this.tableName,
            Key: { task_id: taskId },
        }));
        return result.Item || null;
    }
    /**
     * Claim the oldest QUEUED task (atomic QUEUED -> RUNNING)
     * Per spec: Uses conditional update for double execution prevention
     *
     * @returns ClaimResult with success flag and item if claimed
     */
    async claim() {
        // Query for oldest QUEUED item using status-index
        const queryResult = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
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
        }));
        if (!queryResult.Items || queryResult.Items.length === 0) {
            return { success: false };
        }
        const item = queryResult.Items[0];
        // Atomic update: QUEUED -> RUNNING with conditional check
        try {
            const now = new Date().toISOString();
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
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
            }));
            // Update local item with new status
            item.status = 'RUNNING';
            item.updated_at = now;
            return { success: true, item };
        }
        catch (error) {
            // ConditionalCheckFailed means another process claimed it
            if (error &&
                typeof error === 'object' &&
                'name' in error &&
                error.name === 'ConditionalCheckFailedException') {
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
    async updateStatus(taskId, status, errorMessage) {
        const now = new Date().toISOString();
        const updateExpression = errorMessage
            ? 'SET #status = :status, updated_at = :now, error_message = :error'
            : 'SET #status = :status, updated_at = :now';
        const expressionAttributeValues = {
            ':status': status,
            ':now': now,
        };
        if (errorMessage) {
            expressionAttributeValues[':error'] = errorMessage;
        }
        await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { task_id: taskId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: expressionAttributeValues,
        }));
    }
    /**
     * Get items by session ID
     * Uses session-index GSI
     */
    async getBySession(sessionId) {
        const result = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            IndexName: 'session-index',
            KeyConditionExpression: 'session_id = :sid',
            ExpressionAttributeValues: {
                ':sid': sessionId,
            },
            ScanIndexForward: true, // Ascending by created_at
        }));
        return result.Items || [];
    }
    /**
     * Get items by status
     * Uses status-index GSI
     */
    async getByStatus(status) {
        const result = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
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
        }));
        return result.Items || [];
    }
    /**
     * Get items by task group ID
     * Uses task-group-index GSI
     * Per spec/19_WEB_UI.md: for listing tasks in a task group
     */
    async getByTaskGroup(taskGroupId) {
        const result = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            IndexName: 'task-group-index',
            KeyConditionExpression: 'task_group_id = :tgid',
            ExpressionAttributeValues: {
                ':tgid': taskGroupId,
            },
            ScanIndexForward: true, // Ascending by created_at
        }));
        return result.Items || [];
    }
    /**
     * Get all distinct task groups with summary
     * Per spec/19_WEB_UI.md: for task group list view
     * Note: Uses Scan - consider pagination for large datasets
     */
    async getAllTaskGroups() {
        // Scan all items and aggregate by task_group_id
        const result = await this.docClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: this.tableName,
            ProjectionExpression: 'task_group_id, created_at, updated_at',
        }));
        const items = result.Items || [];
        // Aggregate by task_group_id
        const groupMap = new Map();
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
            }
            else {
                groupMap.set(item.task_group_id, {
                    count: 1,
                    createdAt: item.created_at,
                    latestUpdatedAt: item.updated_at,
                });
            }
        }
        // Convert to array and sort by created_at (oldest first)
        const groups = [];
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
    async deleteItem(taskId) {
        await this.docClient.send(new lib_dynamodb_1.DeleteCommand({
            TableName: this.tableName,
            Key: { task_id: taskId },
        }));
    }
    /**
     * Mark stale RUNNING tasks as ERROR
     * Per spec: fail-closed - don't leave tasks in "limbo"
     *
     * @param maxAgeMs - Max age in milliseconds for RUNNING tasks
     * @returns Number of tasks marked as ERROR
     */
    async recoverStaleTasks(maxAgeMs = 5 * 60 * 1000) {
        const runningTasks = await this.getByStatus('RUNNING');
        const now = Date.now();
        let recovered = 0;
        for (const task of runningTasks) {
            const taskAge = now - new Date(task.updated_at).getTime();
            if (taskAge > maxAgeMs) {
                await this.updateStatus(task.task_id, 'ERROR', `Task stale: running for ${Math.round(taskAge / 1000)}s without completion`);
                recovered++;
            }
        }
        return recovered;
    }
    /**
     * Close the client connection
     */
    destroy() {
        this.client.destroy();
    }
}
exports.QueueStore = QueueStore;
//# sourceMappingURL=queue-store.js.map