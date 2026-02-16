"use strict";
/**
 * File-based Queue Store
 * Provides a persistent queue store that saves to JSON files in stateDir
 *
 * Features:
 * - Same interface as QueueStore and InMemoryQueueStore
 * - Persists data to {stateDir}/queue/tasks.json and runners.json
 * - Data survives server restarts
 * - No external dependencies (no DynamoDB required)
 * - Suitable for development and single-instance production
 *
 * Usage:
 *   const store = new FileQueueStore({ namespace: 'my-ns', stateDir: '/path/to/state' });
 *   await store.ensureTable(); // Creates directory and loads existing data
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileQueueStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const queue_store_1 = require("./queue-store");
/**
 * File-based Queue Store
 * Drop-in replacement for QueueStore with file persistence
 */
class FileQueueStore {
    namespace;
    stateDir;
    queueDir;
    tasksFile;
    runnersFile;
    tasks = new Map();
    runners = new Map();
    initialized = false;
    constructor(config) {
        this.namespace = config.namespace;
        this.stateDir = config.stateDir;
        this.queueDir = path.join(this.stateDir, 'queue');
        this.tasksFile = path.join(this.queueDir, 'tasks.json');
        this.runnersFile = path.join(this.queueDir, 'runners.json');
    }
    /**
     * Get namespace
     */
    getNamespace() {
        return this.namespace;
    }
    /**
     * Get endpoint (returns file path for file-based store)
     */
    getEndpoint() {
        return `file:${this.queueDir}`;
    }
    /**
     * Get table name (returns file-queue for file-based store)
     */
    getTableName() {
        return 'file-queue';
    }
    /**
     * Get store type identifier
     */
    getStoreType() {
        return 'file';
    }
    /**
     * Table always "exists" after ensureTable is called
     */
    async tableExists() {
        return this.initialized && fs.existsSync(this.queueDir);
    }
    /**
     * Create queue directory and initialize files
     */
    async createTable() {
        if (!fs.existsSync(this.queueDir)) {
            fs.mkdirSync(this.queueDir, { recursive: true });
        }
        await this.loadData();
        this.initialized = true;
    }
    /**
     * No-op for file store (runners stored in same directory)
     */
    async createRunnersTable() {
        // No-op - runners are stored alongside tasks
    }
    /**
     * Table always "exists" after ensureTable
     */
    async runnersTableExists() {
        return this.initialized;
    }
    /**
     * Ensure queue directory and files are ready
     */
    async ensureTable() {
        await this.createTable();
    }
    /**
     * Clear all data and delete files
     */
    async deleteTable() {
        this.tasks.clear();
        this.runners.clear();
        try {
            if (fs.existsSync(this.tasksFile)) {
                fs.unlinkSync(this.tasksFile);
            }
            if (fs.existsSync(this.runnersFile)) {
                fs.unlinkSync(this.runnersFile);
            }
        }
        catch (error) {
            // Ignore deletion errors
        }
    }
    /**
     * Load data from files
     */
    async loadData() {
        // Load tasks
        if (fs.existsSync(this.tasksFile)) {
            try {
                const content = fs.readFileSync(this.tasksFile, 'utf-8');
                const data = JSON.parse(content);
                // Only load tasks for our namespace
                for (const [key, item] of Object.entries(data.tasks)) {
                    if (item.namespace === this.namespace) {
                        this.tasks.set(key, item);
                    }
                }
            }
            catch (error) {
                console.warn(`[FileQueueStore] Warning: Could not load tasks from ${this.tasksFile}:`, error);
            }
        }
        // Load runners
        if (fs.existsSync(this.runnersFile)) {
            try {
                const content = fs.readFileSync(this.runnersFile, 'utf-8');
                const runners = JSON.parse(content);
                // Only load runners for our namespace
                for (const [key, runner] of Object.entries(runners)) {
                    if (runner.namespace === this.namespace) {
                        this.runners.set(key, runner);
                    }
                }
            }
            catch (error) {
                console.warn(`[FileQueueStore] Warning: Could not load runners from ${this.runnersFile}:`, error);
            }
        }
    }
    /**
     * Save tasks to file
     */
    saveTasks() {
        const data = {
            version: 1,
            namespace: this.namespace,
            tasks: Object.fromEntries(this.tasks),
            runners: {},
            lastModified: new Date().toISOString(),
        };
        // Merge with existing data from other namespaces
        if (fs.existsSync(this.tasksFile)) {
            try {
                const content = fs.readFileSync(this.tasksFile, 'utf-8');
                const existing = JSON.parse(content);
                // Keep tasks from other namespaces
                for (const [key, item] of Object.entries(existing.tasks)) {
                    if (item.namespace !== this.namespace) {
                        data.tasks[key] = item;
                    }
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        fs.writeFileSync(this.tasksFile, JSON.stringify(data, null, 2), 'utf-8');
    }
    /**
     * Save runners to file
     */
    saveRunners() {
        const runners = Object.fromEntries(this.runners);
        // Merge with existing data from other namespaces
        if (fs.existsSync(this.runnersFile)) {
            try {
                const content = fs.readFileSync(this.runnersFile, 'utf-8');
                const existing = JSON.parse(content);
                // Keep runners from other namespaces
                for (const [key, runner] of Object.entries(existing)) {
                    if (runner.namespace !== this.namespace) {
                        runners[key] = runner;
                    }
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        fs.writeFileSync(this.runnersFile, JSON.stringify(runners, null, 2), 'utf-8');
    }
    /**
     * Enqueue a new task
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
        this.saveTasks();
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
        const now = new Date().toISOString();
        oldest.status = 'RUNNING';
        oldest.updated_at = now;
        this.saveTasks();
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
            this.saveTasks();
        }
    }
    /**
     * Append a progress event to a task (file store)
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
        this.saveTasks();
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
        this.saveTasks();
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
        const history = task.conversation_history || [];
        history.push({
            role: 'user',
            content: userResponse,
            timestamp: now,
        });
        task.status = 'QUEUED';
        task.updated_at = now;
        task.conversation_history = history;
        this.saveTasks();
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
        for (const item of this.tasks.values()) {
            const count = taskCounts.get(item.namespace) || 0;
            taskCounts.set(item.namespace, count + 1);
        }
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
        this.saveTasks();
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
    getRunnerKey(runnerId, ns) {
        return `${ns ?? this.namespace}:${runnerId}`;
    }
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
        this.saveRunners();
    }
    async getRunner(runnerId) {
        const key = this.getRunnerKey(runnerId);
        return this.runners.get(key) || null;
    }
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
    async getRunnersWithStatus(heartbeatTimeoutMs = 2 * 60 * 1000, targetNamespace) {
        const runners = await this.getAllRunners(targetNamespace);
        const now = Date.now();
        return runners.map(runner => ({
            ...runner,
            isAlive: now - new Date(runner.last_heartbeat).getTime() < heartbeatTimeoutMs,
        }));
    }
    async markRunnerStopped(runnerId) {
        const key = this.getRunnerKey(runnerId);
        const runner = this.runners.get(key);
        if (runner) {
            runner.status = 'STOPPED';
            this.saveRunners();
        }
    }
    async deleteRunner(runnerId) {
        const key = this.getRunnerKey(runnerId);
        this.runners.delete(key);
        this.saveRunners();
    }
    /**
     * Close (no-op for file store)
     */
    destroy() {
        // No-op
    }
}
exports.FileQueueStore = FileQueueStore;
//# sourceMappingURL=file-queue-store.js.map