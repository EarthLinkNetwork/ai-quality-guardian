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

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  QueueItem,
  QueueItemStatus,
  ClaimResult,
  StatusUpdateResult,
  TaskGroupSummary,
  NamespaceSummary,
  RunnerRecord,
  ClarificationRequest,
  ConversationEntry,
  isValidStatusTransition,
  IQueueStore,
  TaskTypeValue,
} from './queue-store';

/**
 * File Queue Store configuration
 */
export interface FileQueueStoreConfig {
  /** Namespace for this store instance */
  namespace: string;
  /** State directory for persistence */
  stateDir: string;
}

/**
 * Persisted data structure
 */
interface PersistedData {
  version: number;
  namespace: string;
  tasks: Record<string, QueueItem>;
  runners: Record<string, RunnerRecord>;
  lastModified: string;
}

/**
 * File-based Queue Store
 * Drop-in replacement for QueueStore with file persistence
 */
export class FileQueueStore implements IQueueStore {
  private readonly namespace: string;
  private readonly stateDir: string;
  private readonly queueDir: string;
  private readonly tasksFile: string;
  private readonly runnersFile: string;

  private tasks: Map<string, QueueItem> = new Map();
  private runners: Map<string, RunnerRecord> = new Map();
  private initialized: boolean = false;

  constructor(config: FileQueueStoreConfig) {
    this.namespace = config.namespace;
    this.stateDir = config.stateDir;
    this.queueDir = path.join(this.stateDir, 'queue');
    this.tasksFile = path.join(this.queueDir, 'tasks.json');
    this.runnersFile = path.join(this.queueDir, 'runners.json');
  }

  /**
   * Get namespace
   */
  getNamespace(): string {
    return this.namespace;
  }

  /**
   * Get endpoint (returns file path for file-based store)
   */
  getEndpoint(): string {
    return `file:${this.queueDir}`;
  }

  /**
   * Get table name (returns file-queue for file-based store)
   */
  getTableName(): string {
    return 'file-queue';
  }

  /**
   * Get store type identifier
   */
  getStoreType(): string {
    return 'file';
  }

  /**
   * Table always "exists" after ensureTable is called
   */
  async tableExists(): Promise<boolean> {
    return this.initialized && fs.existsSync(this.queueDir);
  }

  /**
   * Create queue directory and initialize files
   */
  async createTable(): Promise<void> {
    if (!fs.existsSync(this.queueDir)) {
      fs.mkdirSync(this.queueDir, { recursive: true });
    }
    await this.loadData();
    this.initialized = true;
  }

  /**
   * No-op for file store (runners stored in same directory)
   */
  async createRunnersTable(): Promise<void> {
    // No-op - runners are stored alongside tasks
  }

  /**
   * Table always "exists" after ensureTable
   */
  async runnersTableExists(): Promise<boolean> {
    return this.initialized;
  }

  /**
   * Ensure queue directory and files are ready
   */
  async ensureTable(): Promise<void> {
    await this.createTable();
  }

  /**
   * Clear all data and delete files
   */
  async deleteTable(): Promise<void> {
    this.tasks.clear();
    this.runners.clear();

    try {
      if (fs.existsSync(this.tasksFile)) {
        fs.unlinkSync(this.tasksFile);
      }
      if (fs.existsSync(this.runnersFile)) {
        fs.unlinkSync(this.runnersFile);
      }
    } catch (error) {
      // Ignore deletion errors
    }
  }

  /**
   * Load data from files
   */
  private async loadData(): Promise<void> {
    // Load tasks
    if (fs.existsSync(this.tasksFile)) {
      try {
        const content = fs.readFileSync(this.tasksFile, 'utf-8');
        const data: PersistedData = JSON.parse(content);

        // Only load tasks for our namespace
        for (const [key, item] of Object.entries(data.tasks)) {
          if (item.namespace === this.namespace) {
            this.tasks.set(key, item);
          }
        }
      } catch (error) {
        console.warn(`[FileQueueStore] Warning: Could not load tasks from ${this.tasksFile}:`, error);
      }
    }

    // Load runners
    if (fs.existsSync(this.runnersFile)) {
      try {
        const content = fs.readFileSync(this.runnersFile, 'utf-8');
        const runners: Record<string, RunnerRecord> = JSON.parse(content);

        // Only load runners for our namespace
        for (const [key, runner] of Object.entries(runners)) {
          if (runner.namespace === this.namespace) {
            this.runners.set(key, runner);
          }
        }
      } catch (error) {
        console.warn(`[FileQueueStore] Warning: Could not load runners from ${this.runnersFile}:`, error);
      }
    }
  }

  /**
   * Save tasks to file
   */
  private saveTasks(): void {
    const data: PersistedData = {
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
        const existing: PersistedData = JSON.parse(content);

        // Keep tasks from other namespaces
        for (const [key, item] of Object.entries(existing.tasks)) {
          if (item.namespace !== this.namespace) {
            data.tasks[key] = item;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    fs.writeFileSync(this.tasksFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Save runners to file
   */
  private saveRunners(): void {
    const runners: Record<string, RunnerRecord> = Object.fromEntries(this.runners);

    // Merge with existing data from other namespaces
    if (fs.existsSync(this.runnersFile)) {
      try {
        const content = fs.readFileSync(this.runnersFile, 'utf-8');
        const existing: Record<string, RunnerRecord> = JSON.parse(content);

        // Keep runners from other namespaces
        for (const [key, runner] of Object.entries(existing)) {
          if (runner.namespace !== this.namespace) {
            runners[key] = runner;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    fs.writeFileSync(this.runnersFile, JSON.stringify(runners, null, 2), 'utf-8');
  }

  /**
   * Enqueue a new task
   */
  async enqueue(
    sessionId: string,
    taskGroupId: string,
    prompt: string,
    taskId?: string,
    taskType?: TaskTypeValue
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
    };

    this.tasks.set(this.getTaskKey(item.task_id), item);
    this.saveTasks();
    return item;
  }

  /**
   * Get task key for internal map
   */
  private getTaskKey(taskId: string, ns?: string): string {
    return `${ns ?? this.namespace}:${taskId}`;
  }

  /**
   * Get item by task_id
   */
  async getItem(taskId: string, targetNamespace?: string): Promise<QueueItem | null> {
    const key = this.getTaskKey(taskId, targetNamespace);
    return this.tasks.get(key) || null;
  }

  /**
   * Claim the oldest QUEUED task
   */
  async claim(): Promise<ClaimResult> {
    let oldest: QueueItem | null = null;

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
  async updateStatus(
    taskId: string,
    status: QueueItemStatus,
    errorMessage?: string,
    output?: string
  ): Promise<void> {
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
    const history = task.conversation_history || [];
    history.push({
      role: 'user',
      content: userResponse,
      timestamp: now,
    });

    task.status = 'RUNNING';
    task.updated_at = now;
    task.conversation_history = history;
    this.saveTasks();

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
    const items: QueueItem[] = [];

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
  async getByTaskGroup(taskGroupId: string, targetNamespace?: string): Promise<QueueItem[]> {
    const ns = targetNamespace ?? this.namespace;
    const items: QueueItem[] = [];

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
  async getAllItems(targetNamespace?: string): Promise<QueueItem[]> {
    const ns = targetNamespace ?? this.namespace;
    const items: QueueItem[] = [];

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
   * Get all distinct namespaces
   */
  async getAllNamespaces(): Promise<NamespaceSummary[]> {
    const taskCounts = new Map<string, number>();
    const runnerCounts = new Map<string, { total: number; active: number }>();

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
   * Delete item
   */
  async deleteItem(taskId: string): Promise<void> {
    const key = this.getTaskKey(taskId);
    this.tasks.delete(key);
    this.saveTasks();
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
  // Runner Heartbeat Methods
  // ===============================

  private getRunnerKey(runnerId: string, ns?: string): string {
    return `${ns ?? this.namespace}:${runnerId}`;
  }

  async updateRunnerHeartbeat(runnerId: string, projectRoot: string): Promise<void> {
    const now = new Date().toISOString();
    const key = this.getRunnerKey(runnerId);
    const existing = this.runners.get(key);

    if (existing) {
      existing.last_heartbeat = now;
      existing.status = 'RUNNING';
    } else {
      const record: RunnerRecord = {
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

  async getRunner(runnerId: string): Promise<RunnerRecord | null> {
    const key = this.getRunnerKey(runnerId);
    return this.runners.get(key) || null;
  }

  async getAllRunners(targetNamespace?: string): Promise<RunnerRecord[]> {
    const ns = targetNamespace ?? this.namespace;
    const runners: RunnerRecord[] = [];

    for (const runner of this.runners.values()) {
      if (runner.namespace === ns) {
        runners.push(runner);
      }
    }

    return runners;
  }

  async getRunnersWithStatus(
    heartbeatTimeoutMs: number = 2 * 60 * 1000,
    targetNamespace?: string
  ): Promise<Array<RunnerRecord & { isAlive: boolean }>> {
    const runners = await this.getAllRunners(targetNamespace);
    const now = Date.now();

    return runners.map(runner => ({
      ...runner,
      isAlive: now - new Date(runner.last_heartbeat).getTime() < heartbeatTimeoutMs,
    }));
  }

  async markRunnerStopped(runnerId: string): Promise<void> {
    const key = this.getRunnerKey(runnerId);
    const runner = this.runners.get(key);
    if (runner) {
      runner.status = 'STOPPED';
      this.saveRunners();
    }
  }

  async deleteRunner(runnerId: string): Promise<void> {
    const key = this.getRunnerKey(runnerId);
    this.runners.delete(key);
    this.saveRunners();
  }

  /**
   * Close (no-op for file store)
   */
  destroy(): void {
    // No-op
  }
}
