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
/**
 * Fixed table name (v2: single table for all namespaces)
 */
export declare const QUEUE_TABLE_NAME = "pm-runner-queue";
/**
 * Runners table name (v2: heartbeat tracking)
 */
export declare const RUNNERS_TABLE_NAME = "pm-runner-runners";
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
export declare const VALID_STATUS_TRANSITIONS: Record<QueueItemStatus, QueueItemStatus[]>;
/**
 * Check if a status transition is valid
 */
export declare function isValidStatusTransition(fromStatus: QueueItemStatus, toStatus: QueueItemStatus): boolean;
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
 * Task type for execution handling
 * - READ_INFO: Information requests, no file changes expected
 * - REPORT: Report/summary generation, no file changes expected
 * - IMPLEMENTATION: File creation/modification tasks
 */
export type TaskTypeValue = 'READ_INFO' | 'IMPLEMENTATION' | 'REPORT';
/**
 * Queue Item schema (v2.2)
 * Per spec/20_QUEUE_STORE.md
 * Extended with clarification fields and task_type
 */
export interface QueueItem {
    namespace: string;
    task_id: string;
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
    namespace: string;
    runner_id: string;
    last_heartbeat: string;
    started_at: string;
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
    enqueue(sessionId: string, taskGroupId: string, prompt: string, taskId?: string, taskType?: TaskTypeValue): Promise<QueueItem>;
    getItem(taskId: string, targetNamespace?: string): Promise<QueueItem | null>;
    claim(): Promise<ClaimResult>;
    updateStatus(taskId: string, status: QueueItemStatus, errorMessage?: string, output?: string): Promise<void>;
    updateStatusWithValidation(taskId: string, newStatus: QueueItemStatus): Promise<StatusUpdateResult>;
    setAwaitingResponse(taskId: string, clarification: ClarificationRequest, conversationHistory?: ConversationEntry[]): Promise<StatusUpdateResult>;
    resumeWithResponse(taskId: string, userResponse: string): Promise<StatusUpdateResult>;
    getByStatus(status: QueueItemStatus): Promise<QueueItem[]>;
    getByTaskGroup(taskGroupId: string, targetNamespace?: string): Promise<QueueItem[]>;
    getAllItems(targetNamespace?: string): Promise<QueueItem[]>;
    getAllTaskGroups(targetNamespace?: string): Promise<TaskGroupSummary[]>;
    getAllNamespaces(): Promise<NamespaceSummary[]>;
    deleteItem(taskId: string): Promise<void>;
    recoverStaleTasks(maxAgeMs?: number): Promise<number>;
    updateRunnerHeartbeat(runnerId: string, projectRoot: string): Promise<void>;
    getRunner(runnerId: string): Promise<RunnerRecord | null>;
    getAllRunners(targetNamespace?: string): Promise<RunnerRecord[]>;
    getRunnersWithStatus(heartbeatTimeoutMs?: number, targetNamespace?: string): Promise<Array<RunnerRecord & {
        isAlive: boolean;
    }>>;
    markRunnerStopped(runnerId: string): Promise<void>;
    deleteRunner(runnerId: string): Promise<void>;
    destroy(): void;
}
/**
 * Queue Store (v2)
 * Manages task queue with DynamoDB Local
 * Single table design with namespace-based separation
 */
export declare class QueueStore implements IQueueStore {
    private readonly client;
    private readonly docClient;
    private readonly namespace;
    private readonly endpoint;
    constructor(config: QueueStoreConfig);
    /**
     * Get fixed table name (v2: always returns pm-runner-queue)
     */
    getTableName(): string;
    /**
     * Get namespace
     */
    getNamespace(): string;
    /**
     * Get endpoint
     */
    getEndpoint(): string;
    /**
     * Check if table exists
     */
    tableExists(): Promise<boolean>;
    /**
     * Delete queue table (for testing)
     */
    deleteTable(): Promise<void>;
    /**
     * Create queue table with composite key (v2)
     * PK: namespace, SK: task_id
     */
    createTable(): Promise<void>;
    /**
     * Create runners table (v2)
     * PK: namespace, SK: runner_id
     */
    createRunnersTable(): Promise<void>;
    /**
     * Check if runners table exists
     */
    runnersTableExists(): Promise<boolean>;
    /**
     * Ensure both tables exist
     */
    ensureTable(): Promise<void>;
    /**
     * Wait for table to become active
     */
    private waitForTableActive;
    /**
     * Enqueue a new task
     * Creates item with status=QUEUED
     * @param sessionId - Session identifier
     * @param taskGroupId - Task group identifier
     * @param prompt - Task prompt
     * @param taskId - Optional task ID (auto-generated if not provided)
     * @param taskType - Optional task type (READ_INFO/IMPLEMENTATION/REPORT)
     */
    enqueue(sessionId: string, taskGroupId: string, prompt: string, taskId?: string, taskType?: TaskTypeValue): Promise<QueueItem>;
    /**
     * Get item by task_id (v2: uses composite key)
     */
    getItem(taskId: string, targetNamespace?: string): Promise<QueueItem | null>;
    /**
     * Claim the oldest QUEUED task for this namespace
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
     * Get items by task group ID for this namespace
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
     * Get all distinct namespaces (scan entire table)
     */
    getAllNamespaces(): Promise<NamespaceSummary[]>;
    /**
     * Delete item (for testing)
     */
    deleteItem(taskId: string): Promise<void>;
    /**
     * Mark stale RUNNING tasks as ERROR
     */
    recoverStaleTasks(maxAgeMs?: number): Promise<number>;
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
     * Close the client connection
     */
    destroy(): void;
}
//# sourceMappingURL=queue-store.d.ts.map