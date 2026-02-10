"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutorOutputStream = void 0;
exports.isStaleNotification = isStaleNotification;
exports.getExecutorOutputStream = getExecutorOutputStream;
exports.resetExecutorOutputStream = resetExecutorOutputStream;
/**
 * Stale notification detection (fail-closed)
 *
 * Returns true if the chunk should be EXCLUDED from display.
 * Any chunk that cannot be verified as belonging to the current
 * context is treated as stale (fail-closed).
 */
function isStaleNotification(chunk, context) {
    // If no context provided, cannot verify → fail-closed = stale
    if (!context.currentTaskId && !context.currentSessionId) {
        return true;
    }
    // Task ID mismatch → stale
    if (context.currentTaskId && chunk.taskId !== context.currentTaskId) {
        return true;
    }
    // Session ID mismatch → stale
    if (context.currentSessionId && chunk.sessionId && chunk.sessionId !== context.currentSessionId) {
        return true;
    }
    // Timestamp before task creation → stale
    if (context.taskCreatedAt && chunk.timestamp < context.taskCreatedAt) {
        return true;
    }
    // Stale text patterns (fail-closed on known stale indicators)
    const stalePatterns = [
        'previous session',
        'already cleaned up',
        'stale output',
        'background task finished earlier',
    ];
    const lowerText = chunk.text.toLowerCase();
    for (const pattern of stalePatterns) {
        if (lowerText.includes(pattern)) {
            return true;
        }
    }
    return false;
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
class ExecutorOutputStream {
    chunks = [];
    subscribers = new Set();
    sequence = 0;
    maxBufferSize;
    maxBufferAgeMs;
    currentSessionId = null;
    // Track active tasks for summary
    activeTasks = new Map();
    constructor(options = {}) {
        this.maxBufferSize = options.maxBufferSize ?? 1000;
        this.maxBufferAgeMs = options.maxBufferAgeMs ?? 300000; // 5 minutes
    }
    /**
     * Set the current session ID. All subsequent emits will be tagged.
     */
    setSessionId(sessionId) {
        this.currentSessionId = sessionId;
    }
    /**
     * Get the current session ID
     */
    getSessionId() {
        return this.currentSessionId;
    }
    /**
     * Emit an output chunk
     */
    emit(taskId, stream, text, projectId) {
        const chunk = {
            timestamp: new Date().toISOString(),
            taskId,
            projectId,
            sessionId: this.currentSessionId ?? undefined,
            stream,
            text,
            sequence: ++this.sequence,
        };
        // Add to buffer
        this.chunks.push(chunk);
        // Track active task
        this.activeTasks.set(taskId, {
            startTime: this.activeTasks.get(taskId)?.startTime ?? Date.now(),
            lastOutput: Date.now(),
        });
        // Trim buffer if needed
        this.trimBuffer();
        // Notify subscribers
        this.notifySubscribers(chunk);
        return chunk;
    }
    /**
     * Mark task as started
     */
    startTask(taskId, projectId) {
        this.activeTasks.set(taskId, {
            startTime: Date.now(),
            lastOutput: Date.now(),
        });
        this.emit(taskId, 'system', 'Task started', projectId);
    }
    /**
     * Mark task as completed with status-aware message
     */
    endTask(taskId, success, projectId, finalStatus) {
        let stream = 'state';
        let message;
        if (finalStatus === 'AWAITING_RESPONSE') {
            message = 'AWAITING_RESPONSE';
        }
        else if (finalStatus === 'ERROR') {
            stream = 'error';
            message = 'ERROR';
        }
        else if (success) {
            message = 'COMPLETE';
        }
        else {
            stream = 'error';
            message = 'ERROR';
        }
        this.emit(taskId, stream, `[state] ${message}`, projectId);
        // Remove from active tasks
        this.activeTasks.delete(taskId);
    }
    /**
     * Get all chunks
     */
    getAll() {
        return [...this.chunks];
    }
    /**
     * Get chunks for a specific task
     */
    getByTaskId(taskId) {
        return this.chunks.filter(chunk => chunk.taskId === taskId);
    }
    /**
     * Get chunks since a sequence number
     */
    getSince(sequence) {
        return this.chunks.filter(chunk => chunk.sequence > sequence);
    }
    /**
     * Get recent chunks
     */
    getRecent(count = 100) {
        return this.chunks.slice(-count);
    }
    /**
     * Get recent chunks for a specific task
     */
    getRecentForTask(taskId, count = 100) {
        return this.getByTaskId(taskId).slice(-count);
    }
    /**
     * Get active tasks summary
     */
    getActiveTasks() {
        const now = Date.now();
        return Array.from(this.activeTasks.entries()).map(([taskId, info]) => ({
            taskId,
            startTime: info.startTime,
            lastOutput: info.lastOutput,
            duration: now - info.startTime,
        }));
    }
    /**
     * Subscribe to output chunks
     */
    subscribe(subscriber) {
        this.subscribers.add(subscriber);
        // Return unsubscribe function
        return () => {
            this.subscribers.delete(subscriber);
        };
    }
    /**
     * Get subscriber count
     */
    getSubscriberCount() {
        return this.subscribers.size;
    }
    /**
     * Get chunks for a task, excluding stale notifications (fail-closed)
     */
    getByTaskIdFiltered(taskId, taskCreatedAt) {
        const context = {
            currentTaskId: taskId,
            currentSessionId: this.currentSessionId ?? undefined,
            taskCreatedAt,
        };
        return this.chunks.filter(chunk => !isStaleNotification(chunk, context));
    }
    /**
     * Clear all chunks
     */
    clear() {
        this.chunks = [];
        this.activeTasks.clear();
        this.sequence = 0;
    }
    /**
     * Clear chunks for a specific task
     */
    clearTask(taskId) {
        this.chunks = this.chunks.filter(chunk => chunk.taskId !== taskId);
        this.activeTasks.delete(taskId);
    }
    /**
     * Trim buffer based on size and age
     */
    trimBuffer() {
        const now = Date.now();
        // Remove old chunks
        this.chunks = this.chunks.filter(chunk => {
            const age = now - new Date(chunk.timestamp).getTime();
            return age < this.maxBufferAgeMs;
        });
        // Trim to max size
        if (this.chunks.length > this.maxBufferSize) {
            this.chunks = this.chunks.slice(-this.maxBufferSize);
        }
    }
    /**
     * Notify all subscribers of a new chunk
     */
    notifySubscribers(chunk) {
        for (const subscriber of this.subscribers) {
            try {
                subscriber.onOutput(chunk);
            }
            catch (error) {
                // Don't let subscriber errors affect other subscribers
                console.error('[ExecutorOutputStream] Subscriber error:', error);
            }
        }
    }
}
exports.ExecutorOutputStream = ExecutorOutputStream;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalOutputStream = null;
/**
 * Get global executor output stream instance
 */
function getExecutorOutputStream() {
    if (!globalOutputStream) {
        globalOutputStream = new ExecutorOutputStream();
    }
    return globalOutputStream;
}
/**
 * Reset global instance (useful for testing)
 */
function resetExecutorOutputStream() {
    globalOutputStream = null;
}
//# sourceMappingURL=executor-output-stream.js.map