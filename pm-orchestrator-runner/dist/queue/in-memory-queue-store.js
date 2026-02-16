"use strict";
/**
 * In-Memory Queue Store
 * Provides a non-persistent queue store for NO_DYNAMODB mode
 *
 * When PM_WEB_NO_DYNAMODB=1 or --no-dynamodb flag is set,
 * this store is used instead of DynamoDB-based QueueStore.
 *
 * Features:
 * - Same interface as QueueStore
 * - No external dependencies (no DynamoDB Local required)
 * - Data is lost on server restart (by design)
 * - Suitable for development/testing without Docker
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryQueueStore = void 0;
const uuid_1 = require("uuid");
const queue_store_1 = require("./queue-store");
/**
 * In-Memory Queue Store
 * Drop-in replacement for QueueStore when DynamoDB is not available
 */
class InMemoryQueueStore {
    namespace;
    tasks = new Map();
    runners = new Map();
    constructor(config) {
        this.namespace = config.namespace;
    }
    /**
     * Get namespace
     */
    getNamespace() {
        return this.namespace;
    }
    /**
     * Get endpoint (returns placeholder for in-memory)
     */
    getEndpoint() {
        return 'in-memory';
    }
    /**
     * Get table name (returns placeholder for in-memory)
     */
    getTableName() {
        return 'in-memory-queue';
    }
    /**
     * Table always "exists" for in-memory store
     */
    async tableExists() {
        return true;
    }
    /**
     * No-op for in-memory store
     */
    async createTable() {
        // No-op
    }
    /**
     * No-op for in-memory store
     */
    async createRunnersTable() {
        // No-op
    }
    /**
     * Table always "exists" for in-memory store
     */
    async runnersTableExists() {
        return true;
    }
    /**
     * No-op for in-memory store
     */
    async ensureTable() {
        // No-op - tables are always ready
    }
    /**
     * Clear all data (for testing)
     */
    async deleteTable() {
        this.tasks.clear();
        this.runners.clear();
    }
    /**
     * Enqueue a new task
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
        this.tasks.set(this.getTaskKey(item.task_id), item);
        return item;
    }
    /**
     * Get task key for internal map
     */
    getTaskKey(taskId, ns) {
        return `${ns ?? this.namespace}:${taskId}`;
    }
    /**
     * Get item by task_id
     */
    async getItem(taskId, targetNamespace) {
        const key = this.getTaskKey(taskId, targetNamespace);
        return this.tasks.get(key) || null;
    }
    /**
     * Claim the oldest QUEUED task
     */
    async claim() {
        // Find oldest QUEUED task in this namespace
        let oldest = null;
        for (const item of this.tasks.values()) {
            if (item.namespace === this.namespace && item.status === 'QUEUED') {
                if (!oldest || item.created_at < oldest.created_at) {
                    oldest = item;
                }
            }
        }
        if (!oldest) {
            return { success: false };
        }
        // Atomic update (in-memory is single-threaded, so this is safe)
        const now = new Date().toISOString();
        oldest.status = 'RUNNING';
        oldest.updated_at = now;
        return { success: true, item: oldest };
    }
    /**
     * Update task status
     */
    async updateStatus(taskId, status, errorMessage, output) {
        const key = this.getTaskKey(taskId);
        const item = this.tasks.get(key);
        if (item) {
            item.status = status;
            item.updated_at = new Date().toISOString();
            if (errorMessage) {
                item.error_message = errorMessage;
            }
            if (output) {
                item.output = output;
            }
        }
    }
    /**
     * Append a progress event to a task (in-memory)
     */
    async appendEvent(taskId, event) {
        const key = this.getTaskKey(taskId);
        const item = this.tasks.get(key);
        if (!item) {
            return false;
        }
        const timestamp = event.timestamp || new Date().toISOString();
        const newEvent = { ...event, timestamp };
        const events = [...(item.events || []), newEvent];
        const maxEvents = 1000;
        item.events = events.length > maxEvents ? events.slice(-maxEvents) : events;
        item.updated_at = timestamp;
        this.tasks.set(key, item);
        return true;
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
        if (!(0, queue_store_1.isValidStatusTransition)(oldStatus, newStatus)) {
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
        if (!(0, queue_store_1.isValidStatusTransition)(oldStatus, 'AWAITING_RESPONSE')) {
            return {
                success: false,
                task_id: taskId,
                old_status: oldStatus,
                error: 'Invalid status transition',
                message: `Cannot transition from ${oldStatus} to AWAITING_RESPONSE`,
            };
        }
        const now = new Date().toISOString();
        task.status = 'AWAITING_RESPONSE';
        task.updated_at = now;
        task.clarification = clarification;
        task.conversation_history = conversationHistory || [];
        if (output) {
            task.output = output;
        }
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
        task.status = 'QUEUED';
        task.updated_at = now;
        task.conversation_history = history;
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
        const items = [];
        for (const item of this.tasks.values()) {
            if (item.namespace === this.namespace && item.status === status) {
                items.push(item);
            }
        }
        // Sort by created_at
        items.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return items;
    }
    /**
     * Get items by task group ID
     */
    async getByTaskGroup(taskGroupId, targetNamespace) {
        const ns = targetNamespace ?? this.namespace;
        const items = [];
        for (const item of this.tasks.values()) {
            if (item.namespace === ns && item.task_group_id === taskGroupId) {
                items.push(item);
            }
        }
        // Sort by created_at
        items.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return items;
    }
    /**
     * Get all items in a namespace
     */
    async getAllItems(targetNamespace) {
        const ns = targetNamespace ?? this.namespace;
        const items = [];
        for (const item of this.tasks.values()) {
            if (item.namespace === ns) {
                items.push(item);
            }
        }
        // Sort by created_at
        items.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return items;
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
     * Get all distinct namespaces
     */
    async getAllNamespaces() {
        const taskCounts = new Map();
        const runnerCounts = new Map();
        // Count tasks
        for (const item of this.tasks.values()) {
            const count = taskCounts.get(item.namespace) || 0;
            taskCounts.set(item.namespace, count + 1);
        }
        // Count runners
        const now = Date.now();
        const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;
        for (const runner of this.runners.values()) {
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
     * Delete item
     */
    async deleteItem(taskId) {
        const key = this.getTaskKey(taskId);
        this.tasks.delete(key);
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
    // Runner Heartbeat Methods
    // ===============================
    /**
     * Get runner key for internal map
     */
    getRunnerKey(runnerId, ns) {
        return `${ns ?? this.namespace}:${runnerId}`;
    }
    /**
     * Register or update runner heartbeat
     */
    async updateRunnerHeartbeat(runnerId, projectRoot) {
        const now = new Date().toISOString();
        const key = this.getRunnerKey(runnerId);
        const existing = this.runners.get(key);
        if (existing) {
            existing.last_heartbeat = now;
            existing.status = 'RUNNING';
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
            this.runners.set(key, record);
        }
    }
    /**
     * Get runner by ID
     */
    async getRunner(runnerId) {
        const key = this.getRunnerKey(runnerId);
        return this.runners.get(key) || null;
    }
    /**
     * Get all runners for this namespace
     */
    async getAllRunners(targetNamespace) {
        const ns = targetNamespace ?? this.namespace;
        const runners = [];
        for (const runner of this.runners.values()) {
            if (runner.namespace === ns) {
                runners.push(runner);
            }
        }
        return runners;
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
        const key = this.getRunnerKey(runnerId);
        const runner = this.runners.get(key);
        if (runner) {
            runner.status = 'STOPPED';
        }
    }
    /**
     * Delete runner record
     */
    async deleteRunner(runnerId) {
        const key = this.getRunnerKey(runnerId);
        this.runners.delete(key);
    }
    /**
     * Close (no-op for in-memory store)
     */
    destroy() {
        // No-op
    }
}
exports.InMemoryQueueStore = InMemoryQueueStore;
//# sourceMappingURL=in-memory-queue-store.js.map