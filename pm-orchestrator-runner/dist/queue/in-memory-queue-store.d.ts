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
import { QueueItem, QueueItemStatus, ClaimResult, StatusUpdateResult, TaskGroupSummary, NamespaceSummary, RunnerRecord, ClarificationRequest, ConversationEntry, IQueueStore, TaskTypeValue } from './queue-store';
/**
 * In-Memory Queue Store configuration
 */
export interface InMemoryQueueStoreConfig {
    /** Namespace for this store instance */
    namespace: string;
}
/**
 * In-Memory Queue Store
 * Drop-in replacement for QueueStore when DynamoDB is not available
 */
export declare class InMemoryQueueStore implements IQueueStore {
    private readonly namespace;
    private readonly tasks;
    private readonly runners;
    constructor(config: InMemoryQueueStoreConfig);
    /**
     * Get namespace
     */
    getNamespace(): string;
    /**
     * Get endpoint (returns placeholder for in-memory)
     */
    getEndpoint(): string;
    /**
     * Get table name (returns placeholder for in-memory)
     */
    getTableName(): string;
    /**
     * Table always "exists" for in-memory store
     */
    tableExists(): Promise<boolean>;
    /**
     * No-op for in-memory store
     */
    createTable(): Promise<void>;
    /**
     * No-op for in-memory store
     */
    createRunnersTable(): Promise<void>;
    /**
     * Table always "exists" for in-memory store
     */
    runnersTableExists(): Promise<boolean>;
    /**
     * No-op for in-memory store
     */
    ensureTable(): Promise<void>;
    /**
     * Clear all data (for testing)
     */
    deleteTable(): Promise<void>;
    /**
     * Enqueue a new task
     * @param sessionId - Session identifier
     * @param taskGroupId - Task group identifier
     * @param prompt - Task prompt
     * @param taskId - Optional task ID (auto-generated if not provided)
     * @param taskType - Optional task type (READ_INFO/IMPLEMENTATION/REPORT)
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
     * Update task status with validation
     */
    updateStatusWithValidation(taskId: string, newStatus: QueueItemStatus): Promise<StatusUpdateResult>;
    /**
     * Set task to AWAITING_RESPONSE with clarification details
     */
    setAwaitingResponse(taskId: string, clarification: ClarificationRequest, conversationHistory?: ConversationEntry[]): Promise<StatusUpdateResult>;
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
    /**
     * Get runner key for internal map
     */
    private getRunnerKey;
    /**
     * Register or update runner heartbeat
     */
    updateRunnerHeartbeat(runnerId: string, projectRoot: string): Promise<void>;
    /**
     * Get runner by ID
     */
    getRunner(runnerId: string): Promise<RunnerRecord | null>;
    /**
     * Get all runners for this namespace
     */
    getAllRunners(targetNamespace?: string): Promise<RunnerRecord[]>;
    /**
     * Get runners with their alive status
     */
    getRunnersWithStatus(heartbeatTimeoutMs?: number, targetNamespace?: string): Promise<Array<RunnerRecord & {
        isAlive: boolean;
    }>>;
    /**
     * Mark runner as stopped
     */
    markRunnerStopped(runnerId: string): Promise<void>;
    /**
     * Delete runner record
     */
    deleteRunner(runnerId: string): Promise<void>;
    /**
     * Close (no-op for in-memory store)
     */
    destroy(): void;
}
//# sourceMappingURL=in-memory-queue-store.d.ts.map