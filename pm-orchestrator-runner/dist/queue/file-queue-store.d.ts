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
import { QueueItem, QueueItemStatus, ProgressEvent, ClaimResult, StatusUpdateResult, TaskGroupSummary, NamespaceSummary, RunnerRecord, ClarificationRequest, ConversationEntry, IQueueStore, TaskTypeValue } from './queue-store';
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
 * File-based Queue Store
 * Drop-in replacement for QueueStore with file persistence
 */
export declare class FileQueueStore implements IQueueStore {
    private readonly namespace;
    private readonly stateDir;
    private readonly queueDir;
    private readonly tasksFile;
    private readonly runnersFile;
    private tasks;
    private runners;
    private initialized;
    constructor(config: FileQueueStoreConfig);
    /**
     * Get namespace
     */
    getNamespace(): string;
    /**
     * Get endpoint (returns file path for file-based store)
     */
    getEndpoint(): string;
    /**
     * Get table name (returns file-queue for file-based store)
     */
    getTableName(): string;
    /**
     * Get store type identifier
     */
    getStoreType(): string;
    /**
     * Table always "exists" after ensureTable is called
     */
    tableExists(): Promise<boolean>;
    /**
     * Create queue directory and initialize files
     */
    createTable(): Promise<void>;
    /**
     * No-op for file store (runners stored in same directory)
     */
    createRunnersTable(): Promise<void>;
    /**
     * Table always "exists" after ensureTable
     */
    runnersTableExists(): Promise<boolean>;
    /**
     * Ensure queue directory and files are ready
     */
    ensureTable(): Promise<void>;
    /**
     * Clear all data and delete files
     */
    deleteTable(): Promise<void>;
    /**
     * Load data from files
     */
    private loadData;
    /**
     * Save tasks to file
     */
    private saveTasks;
    /**
     * Save runners to file
     */
    private saveRunners;
    /**
     * Enqueue a new task
     */
    enqueue(sessionId: string, taskGroupId: string, prompt: string, taskId?: string, taskType?: TaskTypeValue): Promise<QueueItem>;
    /**
     * Get task key for internal map
     */
    private getTaskKey;
    /**
     * Get item by task_id
     */
    getItem(taskId: string, targetNamespace?: string): Promise<QueueItem | null>;
    /**
     * Claim the oldest QUEUED task
     */
    claim(): Promise<ClaimResult>;
    /**
     * Update task status
     */
    updateStatus(taskId: string, status: QueueItemStatus, errorMessage?: string, output?: string): Promise<void>;
    /**
     * Append a progress event to a task (file store)
     */
    appendEvent(taskId: string, event: ProgressEvent): Promise<boolean>;
    /**
     * Update task status with validation
     */
    updateStatusWithValidation(taskId: string, newStatus: QueueItemStatus): Promise<StatusUpdateResult>;
    /**
     * Set task to AWAITING_RESPONSE with clarification details
     */
    setAwaitingResponse(taskId: string, clarification: ClarificationRequest, conversationHistory?: ConversationEntry[], output?: string): Promise<StatusUpdateResult>;
    /**
     * Resume task from AWAITING_RESPONSE with user response
     */
    resumeWithResponse(taskId: string, userResponse: string): Promise<StatusUpdateResult>;
    /**
     * Get items by status for this namespace
     */
    getByStatus(status: QueueItemStatus): Promise<QueueItem[]>;
    /**
     * Get items by task group ID
     */
    getByTaskGroup(taskGroupId: string, targetNamespace?: string): Promise<QueueItem[]>;
    /**
     * Get all items in a namespace
     */
    getAllItems(targetNamespace?: string): Promise<QueueItem[]>;
    /**
     * Get all distinct task groups for a namespace with summary
     */
    getAllTaskGroups(targetNamespace?: string): Promise<TaskGroupSummary[]>;
    /**
     * Get all distinct namespaces
     */
    getAllNamespaces(): Promise<NamespaceSummary[]>;
    /**
     * Delete item
     */
    deleteItem(taskId: string): Promise<void>;
    /**
     * Mark stale RUNNING tasks as ERROR
     */
    recoverStaleTasks(maxAgeMs?: number): Promise<number>;
    private getRunnerKey;
    updateRunnerHeartbeat(runnerId: string, projectRoot: string): Promise<void>;
    getRunner(runnerId: string): Promise<RunnerRecord | null>;
    getAllRunners(targetNamespace?: string): Promise<RunnerRecord[]>;
    getRunnersWithStatus(heartbeatTimeoutMs?: number, targetNamespace?: string): Promise<Array<RunnerRecord & {
        isAlive: boolean;
    }>>;
    markRunnerStopped(runnerId: string): Promise<void>;
    deleteRunner(runnerId: string): Promise<void>;
    /**
     * Close (no-op for file store)
     */
    destroy(): void;
}
//# sourceMappingURL=file-queue-store.d.ts.map