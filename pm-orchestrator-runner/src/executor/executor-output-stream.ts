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
export function isStaleNotification(
  chunk: ExecutorOutputChunk,
  context: {
    currentTaskId?: string;
    currentSessionId?: string;
    taskCreatedAt?: string;
  }
): boolean {
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
export class ExecutorOutputStream {
  private chunks: ExecutorOutputChunk[] = [];
  private subscribers: Set<ExecutorOutputSubscriber> = new Set();
  private sequence = 0;
  private maxBufferSize: number;
  private maxBufferAgeMs: number;
  private currentSessionId: string | null = null;

  // Track active tasks for summary
  private activeTasks: Map<string, { startTime: number; lastOutput: number }> = new Map();

  constructor(options: ExecutorOutputStreamOptions = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 1000;
    this.maxBufferAgeMs = options.maxBufferAgeMs ?? 300000; // 5 minutes
  }

  /**
   * Set the current session ID. All subsequent emits will be tagged.
   */
  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Emit an output chunk
   */
  emit(
    taskId: string,
    stream: ExecutorOutputChunk['stream'],
    text: string,
    projectId?: string
  ): ExecutorOutputChunk {
    const chunk: ExecutorOutputChunk = {
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
  startTask(taskId: string, projectId?: string): void {
    this.activeTasks.set(taskId, {
      startTime: Date.now(),
      lastOutput: Date.now(),
    });

    this.emit(taskId, 'system', 'Task started', projectId);
  }

  /**
   * Mark task as completed with status-aware message
   */
  endTask(taskId: string, success: boolean, projectId?: string, finalStatus?: string): void {
    let stream: ExecutorOutputChunk['stream'] = 'state';
    let message: string;
    if (finalStatus === 'AWAITING_RESPONSE') {
      message = 'AWAITING_RESPONSE';
    } else if (finalStatus === 'ERROR') {
      stream = 'error';
      message = 'ERROR';
    } else if (success) {
      message = 'COMPLETE';
    } else {
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
  getAll(): ExecutorOutputChunk[] {
    return [...this.chunks];
  }

  /**
   * Get chunks for a specific task
   */
  getByTaskId(taskId: string): ExecutorOutputChunk[] {
    return this.chunks.filter(chunk => chunk.taskId === taskId);
  }

  /**
   * Get chunks since a sequence number
   */
  getSince(sequence: number): ExecutorOutputChunk[] {
    return this.chunks.filter(chunk => chunk.sequence > sequence);
  }

  /**
   * Get recent chunks
   */
  getRecent(count: number = 100): ExecutorOutputChunk[] {
    return this.chunks.slice(-count);
  }

  /**
   * Get recent chunks for a specific task
   */
  getRecentForTask(taskId: string, count: number = 100): ExecutorOutputChunk[] {
    return this.getByTaskId(taskId).slice(-count);
  }

  /**
   * Get active tasks summary
   */
  getActiveTasks(): Array<{ taskId: string; startTime: number; lastOutput: number; duration: number }> {
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
  subscribe(subscriber: ExecutorOutputSubscriber): () => void {
    this.subscribers.add(subscriber);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Get chunks for a task, excluding stale notifications (fail-closed)
   */
  getByTaskIdFiltered(taskId: string, taskCreatedAt?: string): ExecutorOutputChunk[] {
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
  clear(): void {
    this.chunks = [];
    this.activeTasks.clear();
    this.sequence = 0;
  }

  /**
   * Clear chunks for a specific task
   */
  clearTask(taskId: string): void {
    this.chunks = this.chunks.filter(chunk => chunk.taskId !== taskId);
    this.activeTasks.delete(taskId);
  }

  /**
   * Trim buffer based on size and age
   */
  private trimBuffer(): void {
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
  private notifySubscribers(chunk: ExecutorOutputChunk): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.onOutput(chunk);
      } catch (error) {
        // Don't let subscriber errors affect other subscribers
        console.error('[ExecutorOutputStream] Subscriber error:', error);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalOutputStream: ExecutorOutputStream | null = null;

/**
 * Get global executor output stream instance
 */
export function getExecutorOutputStream(): ExecutorOutputStream {
  if (!globalOutputStream) {
    globalOutputStream = new ExecutorOutputStream();
  }
  return globalOutputStream;
}

/**
 * Reset global instance (useful for testing)
 */
export function resetExecutorOutputStream(): void {
  globalOutputStream = null;
}
