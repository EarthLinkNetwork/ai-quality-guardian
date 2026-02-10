/**
 * Executor Output Stream
 *
 * AC A.2: Executor Live Log - Real-time stdout/stderr streaming for Web UI
 *
 * Provides:
 * - Real-time output streaming from executor processes
 * - Subscriber pattern for SSE consumers
 * - Task-based filtering
 * - Recent output buffer for late joiners
 */
/**
 * Output chunk from executor
 */
export interface ExecutorOutputChunk {
    timestamp: string;
    taskId: string;
    projectId?: string;
    sessionId?: string;
    stream: 'stdout' | 'stderr' | 'system' | 'error' | 'spawn' | 'preflight' | 'guard' | 'timeout' | 'state' | 'heartbeat' | 'recovery';
    text: string;
    sequence: number;
}
/**
 * Stale notification detection (fail-closed)
 *
 * Returns true if the chunk should be EXCLUDED from display.
 * Any chunk that cannot be verified as belonging to the current
 * context is treated as stale (fail-closed).
 */
export declare function isStaleNotification(chunk: ExecutorOutputChunk, context: {
    currentTaskId?: string;
    currentSessionId?: string;
    taskCreatedAt?: string;
}): boolean;
/**
 * Subscriber interface for real-time streaming
 */
export interface ExecutorOutputSubscriber {
    onOutput(chunk: ExecutorOutputChunk): void;
}
/**
 * Configuration options
 */
export interface ExecutorOutputStreamOptions {
    /** Maximum chunks to keep in buffer (default: 1000) */
    maxBufferSize?: number;
    /** Maximum age of chunks in buffer in ms (default: 300000 = 5 min) */
    maxBufferAgeMs?: number;
}
/**
 * ExecutorOutputStream - Real-time executor output manager
 *
 * Features:
 * - Emit output chunks to subscribers in real-time
 * - Buffer recent output for late-joining clients
 * - Filter by taskId for focused streams
 * - Automatic cleanup of old data
 */
export declare class ExecutorOutputStream {
    private chunks;
    private subscribers;
    private sequence;
    private maxBufferSize;
    private maxBufferAgeMs;
    private currentSessionId;
    private activeTasks;
    constructor(options?: ExecutorOutputStreamOptions);
    /**
     * Set the current session ID. All subsequent emits will be tagged.
     */
    setSessionId(sessionId: string): void;
    /**
     * Get the current session ID
     */
    getSessionId(): string | null;
    /**
     * Emit an output chunk
     */
    emit(taskId: string, stream: ExecutorOutputChunk['stream'], text: string, projectId?: string): ExecutorOutputChunk;
    /**
     * Mark task as started
     */
    startTask(taskId: string, projectId?: string): void;
    /**
     * Mark task as completed with status-aware message
     */
    endTask(taskId: string, success: boolean, projectId?: string, finalStatus?: string): void;
    /**
     * Get all chunks
     */
    getAll(): ExecutorOutputChunk[];
    /**
     * Get chunks for a specific task
     */
    getByTaskId(taskId: string): ExecutorOutputChunk[];
    /**
     * Get chunks since a sequence number
     */
    getSince(sequence: number): ExecutorOutputChunk[];
    /**
     * Get recent chunks
     */
    getRecent(count?: number): ExecutorOutputChunk[];
    /**
     * Get recent chunks for a specific task
     */
    getRecentForTask(taskId: string, count?: number): ExecutorOutputChunk[];
    /**
     * Get active tasks summary
     */
    getActiveTasks(): Array<{
        taskId: string;
        startTime: number;
        lastOutput: number;
        duration: number;
    }>;
    /**
     * Subscribe to output chunks
     */
    subscribe(subscriber: ExecutorOutputSubscriber): () => void;
    /**
     * Get subscriber count
     */
    getSubscriberCount(): number;
    /**
     * Get chunks for a task, excluding stale notifications (fail-closed)
     */
    getByTaskIdFiltered(taskId: string, taskCreatedAt?: string): ExecutorOutputChunk[];
    /**
     * Clear all chunks
     */
    clear(): void;
    /**
     * Clear chunks for a specific task
     */
    clearTask(taskId: string): void;
    /**
     * Trim buffer based on size and age
     */
    private trimBuffer;
    /**
     * Notify all subscribers of a new chunk
     */
    private notifySubscribers;
}
/**
 * Get global executor output stream instance
 */
export declare function getExecutorOutputStream(): ExecutorOutputStream;
/**
 * Reset global instance (useful for testing)
 */
export declare function resetExecutorOutputStream(): void;
//# sourceMappingURL=executor-output-stream.d.ts.map