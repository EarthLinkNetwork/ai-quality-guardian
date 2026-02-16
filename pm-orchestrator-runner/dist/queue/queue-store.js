"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueStore = exports.VALID_STATUS_TRANSITIONS = exports.RUNNERS_TABLE_NAME = exports.QUEUE_TABLE_NAME = void 0;
exports.isValidStatusTransition = isValidStatusTransition;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
/**
 * Fixed table name (v2: single table for all namespaces)
 */
exports.QUEUE_TABLE_NAME = 'pm-runner-queue';
/**
 * Runners table name (v2: heartbeat tracking)
 */
exports.RUNNERS_TABLE_NAME = 'pm-runner-runners';
/**
 * Valid status transitions
 * Per spec/20_QUEUE_STORE.md
 * v2.1: Added AWAITING_RESPONSE transitions
 */
exports.VALID_STATUS_TRANSITIONS = {
    QUEUED: ['RUNNING', 'CANCELLED'],
    RUNNING: ['COMPLETE', 'ERROR', 'CANCELLED', 'AWAITING_RESPONSE'],
    AWAITING_RESPONSE: ['QUEUED', 'RUNNING', 'CANCELLED', 'ERROR'], // User response re-queues for executor pickup
    COMPLETE: [], // Terminal state
    ERROR: [], // Terminal state
    CANCELLED: [], // Terminal state
};
/**
 * Check if a status transition is valid
 */
function isValidStatusTransition(fromStatus, toStatus) {
    return exports.VALID_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}
/**
 * Queue Store (v2)
 * Manages task queue with DynamoDB Local
 * Single table design with namespace-based separation
 */
class QueueStore {
    client;
    docClient;
    namespace;
    endpoint;
    constructor(config) {
        this.endpoint = config.endpoint || 'http://localhost:8000';
        this.namespace = config.namespace;
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
     * Get fixed table name (v2: always returns pm-runner-queue)
     */
    getTableName() {
        return exports.QUEUE_TABLE_NAME;
    }
    /**
     * Get namespace
     */
    getNamespace() {
        return this.namespace;
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
            await this.client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: exports.QUEUE_TABLE_NAME }));
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
     * Delete queue table (for testing)
     */
    async deleteTable() {
        try {
            await this.client.send(new client_dynamodb_1.DeleteTableCommand({ TableName: exports.QUEUE_TABLE_NAME }));
        }
        catch (error) {
            if (error instanceof client_dynamodb_1.ResourceNotFoundException) {
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
    async createTable() {
        const command = new client_dynamodb_1.CreateTableCommand({
            TableName: exports.QUEUE_TABLE_NAME,
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
    async createRunnersTable() {
        const command = new client_dynamodb_1.CreateTableCommand({
            TableName: exports.RUNNERS_TABLE_NAME,
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
    async runnersTableExists() {
        try {
            await this.client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: exports.RUNNERS_TABLE_NAME }));
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
     * Ensure both tables exist
     */
    async ensureTable() {
        // Queue table
        const queueExists = await this.tableExists();
        if (!queueExists) {
            await this.createTable();
            await this.waitForTableActive(exports.QUEUE_TABLE_NAME);
        }
        // Runners table
        const runnersExists = await this.runnersTableExists();
        if (!runnersExists) {
            await this.createRunnersTable();
            await this.waitForTableActive(exports.RUNNERS_TABLE_NAME);
        }
    }
    /**
     * Wait for table to become active
     */
    async waitForTableActive(tableName, maxWaitMs = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            try {
                const result = await this.client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName }));
                if (result.Table?.TableStatus === 'ACTIVE') {
                    return;
                }
            }
            catch {
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
    async enqueue(sessionId, taskGroupId, prompt, taskId, taskType) {
        const now = new Date().toISOString();
        const item = {
            namespace: this.namespace,
            task_id: taskId || (0, uuid_1.v4)(),
            task_group_id: taskGroupId,
            session_id: sessionId,
            status: 'QUEUED',
            prompt,
            created_at: now,
            updated_at: now,
            task_type: taskType,
        };
        await this.docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: exports.QUEUE_TABLE_NAME,
            Item: item,
        }));
        return item;
    }
    /**
     * Get item by task_id (v2: uses composite key)
     */
    async getItem(taskId, targetNamespace) {
        const ns = targetNamespace ?? this.namespace;
        const result = await this.docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: exports.QUEUE_TABLE_NAME,
            Key: {
                namespace: ns,
                task_id: taskId
            },
        }));
        return result.Item || null;
    }
    /**
     * Claim the oldest QUEUED task for this namespace
     */
    async claim() {
        const queryResult = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: exports.QUEUE_TABLE_NAME,
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
        }));
        if (!queryResult.Items || queryResult.Items.length === 0) {
            return { success: false };
        }
        const item = queryResult.Items[0];
        try {
            const now = new Date().toISOString();
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: exports.QUEUE_TABLE_NAME,
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
            }));
            item.status = 'RUNNING';
            item.updated_at = now;
            return { success: true, item };
        }
        catch (error) {
            if (error &&
                typeof error === 'object' &&
                'name' in error &&
                error.name === 'ConditionalCheckFailedException') {
                return { success: false, error: 'Task already claimed by another process' };
            }
            throw error;
        }
    }
    /**
     * Update task status
     */
    async updateStatus(taskId, status, errorMessage, output) {
        const now = new Date().toISOString();
        let updateExpression = 'SET #status = :status, updated_at = :now';
        const expressionAttributeValues = {
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
        const expressionAttributeNames = {
            '#status': 'status',
        };
        if (output) {
            expressionAttributeNames['#output'] = 'output';
        }
        await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: exports.QUEUE_TABLE_NAME,
            Key: {
                namespace: this.namespace,
                task_id: taskId
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        }));
    }
    /**
     * Append a progress event to a task (best-effort)
     */
    async appendEvent(taskId, event) {
        const timestamp = event.timestamp || new Date().toISOString();
        const newEvent = { ...event, timestamp };
        try {
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: exports.QUEUE_TABLE_NAME,
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
            }));
            return true;
        }
        catch (error) {
            if (error &&
                typeof error === 'object' &&
                'name' in error &&
                error.name === 'ConditionalCheckFailedException') {
                return false;
            }
            throw error;
        }
    }
    /**
     * Update task status with validation
     */
    async updateStatusWithValidation(taskId, newStatus) {
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
    async setAwaitingResponse(taskId, clarification, conversationHistory, output) {
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
            ? 'SET #status = :status, updated_at = :now, clarification = :clarification, conversation_history = :history, output = :output'
            : 'SET #status = :status, updated_at = :now, clarification = :clarification, conversation_history = :history';
        const expressionValues = {
            ':status': 'AWAITING_RESPONSE',
            ':now': now,
            ':clarification': clarification,
            ':history': conversationHistory || [],
        };
        if (output) {
            expressionValues[':output'] = output;
        }
        await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: exports.QUEUE_TABLE_NAME,
            Key: {
                namespace: this.namespace,
                task_id: taskId,
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: expressionValues,
        }));
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
    async resumeWithResponse(taskId, userResponse) {
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
        await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: exports.QUEUE_TABLE_NAME,
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
        }));
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
    async getByStatus(status) {
        const result = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: exports.QUEUE_TABLE_NAME,
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
        }));
        return result.Items || [];
    }
    /**
     * Get items by task group ID for this namespace
     */
    async getByTaskGroup(taskGroupId, targetNamespace) {
        const ns = targetNamespace ?? this.namespace;
        const result = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: exports.QUEUE_TABLE_NAME,
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
        }));
        return result.Items || [];
    }
    /**
     * Get all items in a namespace
     */
    async getAllItems(targetNamespace) {
        const ns = targetNamespace ?? this.namespace;
        const result = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: exports.QUEUE_TABLE_NAME,
            KeyConditionExpression: '#namespace = :namespace',
            ExpressionAttributeNames: {
                '#namespace': 'namespace',
            },
            ExpressionAttributeValues: {
                ':namespace': ns,
            },
            ScanIndexForward: true,
        }));
        return result.Items || [];
    }
    /**
     * Get all distinct task groups for a namespace with summary
     */
    async getAllTaskGroups(targetNamespace) {
        const items = await this.getAllItems(targetNamespace);
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
     * Get all distinct namespaces (scan entire table)
     */
    async getAllNamespaces() {
        const queueResult = await this.docClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: exports.QUEUE_TABLE_NAME,
            ProjectionExpression: '#namespace',
            ExpressionAttributeNames: {
                '#namespace': 'namespace',
            },
        }));
        let runnersResult = { Items: [] };
        try {
            runnersResult = await this.docClient.send(new lib_dynamodb_1.ScanCommand({
                TableName: exports.RUNNERS_TABLE_NAME,
            }));
        }
        catch {
            // Runners table might not exist yet
        }
        const queueItems = (queueResult.Items || []);
        const runners = (runnersResult.Items || []);
        const taskCounts = new Map();
        for (const item of queueItems) {
            const count = taskCounts.get(item.namespace) || 0;
            taskCounts.set(item.namespace, count + 1);
        }
        const runnerCounts = new Map();
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
        const summaries = [];
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
    async deleteItem(taskId) {
        await this.docClient.send(new lib_dynamodb_1.DeleteCommand({
            TableName: exports.QUEUE_TABLE_NAME,
            Key: {
                namespace: this.namespace,
                task_id: taskId
            },
        }));
    }
    /**
     * Mark stale RUNNING tasks as ERROR
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
    // ===============================
    // Runner Heartbeat Methods (v2)
    // ===============================
    /**
     * Register or update runner heartbeat
     */
    async updateRunnerHeartbeat(runnerId, projectRoot) {
        const now = new Date().toISOString();
        const existing = await this.getRunner(runnerId);
        if (existing) {
            await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: exports.RUNNERS_TABLE_NAME,
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
            }));
        }
        else {
            const record = {
                namespace: this.namespace,
                runner_id: runnerId,
                last_heartbeat: now,
                started_at: now,
                status: 'RUNNING',
                project_root: projectRoot,
            };
            await this.docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: exports.RUNNERS_TABLE_NAME,
                Item: record,
            }));
        }
    }
    /**
     * Get runner by ID
     */
    async getRunner(runnerId) {
        const result = await this.docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: exports.RUNNERS_TABLE_NAME,
            Key: {
                namespace: this.namespace,
                runner_id: runnerId,
            },
        }));
        return result.Item || null;
    }
    /**
     * Get all runners for this namespace
     */
    async getAllRunners(targetNamespace) {
        const ns = targetNamespace ?? this.namespace;
        const result = await this.docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: exports.RUNNERS_TABLE_NAME,
            KeyConditionExpression: '#namespace = :namespace',
            ExpressionAttributeNames: {
                '#namespace': 'namespace',
            },
            ExpressionAttributeValues: {
                ':namespace': ns,
            },
        }));
        return result.Items || [];
    }
    /**
     * Get runners with their alive status
     */
    async getRunnersWithStatus(heartbeatTimeoutMs = 2 * 60 * 1000, targetNamespace) {
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
    async markRunnerStopped(runnerId) {
        await this.docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: exports.RUNNERS_TABLE_NAME,
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
        }));
    }
    /**
     * Delete runner record
     */
    async deleteRunner(runnerId) {
        await this.docClient.send(new lib_dynamodb_1.DeleteCommand({
            TableName: exports.RUNNERS_TABLE_NAME,
            Key: {
                namespace: this.namespace,
                runner_id: runnerId,
            },
        }));
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