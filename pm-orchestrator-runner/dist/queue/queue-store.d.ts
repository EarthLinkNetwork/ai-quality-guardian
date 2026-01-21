/**
 * Queue Store - DynamoDB Local implementation
 * Per spec/20_QUEUE_STORE.md
 *
 * Provides queue operations with:
 * - Atomic QUEUED -> RUNNING transitions (conditional update)
 * - Double execution prevention
 * - Fail-closed error handling
 */
/**
 * Queue Item status
 * Per spec/20: QUEUED / RUNNING / COMPLETE / ERROR / CANCELLED
 */
export type QueueItemStatus = 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'ERROR' | 'CANCELLED';
/**
 * Valid status transitions
 * Per spec/20_QUEUE_STORE.md
 */
export declare const VALID_STATUS_TRANSITIONS: Record<QueueItemStatus, QueueItemStatus[]>;
/**
 * Check if a status transition is valid
 */
export declare function isValidStatusTransition(fromStatus: QueueItemStatus, toStatus: QueueItemStatus): boolean;
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
export declare class QueueStore {
    private readonly client;
    private readonly docClient;
    private readonly tableName;
    private readonly endpoint;
    constructor(config?: QueueStoreConfig);
    /**
     * Get table name
     */
    getTableName(): string;
    /**
     * Get endpoint
     */
    getEndpoint(): string;
    /**
     * Check if table exists
     */
    tableExists(): Promise<boolean>;
    /**
     * Create table with required GSIs
     * Per spec/20_QUEUE_STORE.md table definition
     */
    createTable(): Promise<void>;
    /**
     * Ensure table exists, create if not
     */
    ensureTable(): Promise<void>;
    /**
     * Wait for table to become active
     */
    private waitForTableActive;
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
    enqueue(sessionId: string, taskGroupId: string, prompt: string, taskId?: string): Promise<QueueItem>;
    /**
     * Get item by task_id
     */
    getItem(taskId: string): Promise<QueueItem | null>;
    /**
     * Claim the oldest QUEUED task (atomic QUEUED -> RUNNING)
     * Per spec: Uses conditional update for double execution prevention
     *
     * @returns ClaimResult with success flag and item if claimed
     */
    claim(): Promise<ClaimResult>;
    /**
     * Update task status
     * Per spec: RUNNING -> COMPLETE or RUNNING -> ERROR
     *
     * @param taskId - Task ID
     * @param status - New status
     * @param errorMessage - Optional error message (for ERROR status)
     */
    updateStatus(taskId: string, status: QueueItemStatus, errorMessage?: string): Promise<void>;
    /**
     * Update task status with validation
     * Per spec/19_WEB_UI.md: PATCH /api/tasks/:task_id/status
     *
     * @param taskId - Task ID
     * @param newStatus - Target status
     * @returns StatusUpdateResult with success/error info
     */
    updateStatusWithValidation(taskId: string, newStatus: QueueItemStatus): Promise<StatusUpdateResult>;
    /**
     * Get items by session ID
     * Uses session-index GSI
     */
    getBySession(sessionId: string): Promise<QueueItem[]>;
    /**
     * Get items by status
     * Uses status-index GSI
     */
    getByStatus(status: QueueItemStatus): Promise<QueueItem[]>;
    /**
     * Get items by task group ID
     * Uses task-group-index GSI
     * Per spec/19_WEB_UI.md: for listing tasks in a task group
     */
    getByTaskGroup(taskGroupId: string): Promise<QueueItem[]>;
    /**
     * Get all distinct task groups with summary
     * Per spec/19_WEB_UI.md: for task group list view
     * Note: Uses Scan - consider pagination for large datasets
     */
    getAllTaskGroups(): Promise<TaskGroupSummary[]>;
    /**
     * Delete item (for testing)
     */
    deleteItem(taskId: string): Promise<void>;
    /**
     * Mark stale RUNNING tasks as ERROR
     * Per spec: fail-closed - don't leave tasks in "limbo"
     *
     * @param maxAgeMs - Max age in milliseconds for RUNNING tasks
     * @returns Number of tasks marked as ERROR
     */
    recoverStaleTasks(maxAgeMs?: number): Promise<number>;
    /**
     * Close the client connection
     */
    destroy(): void;
}
//# sourceMappingURL=queue-store.d.ts.map