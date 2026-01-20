/**
 * Queue Poller - Polls queue and executes tasks
 * Per spec/20_QUEUE_STORE.md
 *
 * Features:
 * - Polling interval configurable (default 1000ms)
 * - 1 task per tick
 * - In-flight limit: 1 (no concurrent execution)
 * - Fail-closed error handling
 */
import { EventEmitter } from 'events';
import { QueueStore, QueueItem } from './queue-store';
/**
 * Task executor function type
 * Returns status and optional error message
 */
export type TaskExecutor = (item: QueueItem) => Promise<{
    status: 'COMPLETE' | 'ERROR';
    errorMessage?: string;
}>;
/**
 * Poller configuration
 */
export interface QueuePollerConfig {
    /** Polling interval in milliseconds (default: 1000) */
    pollIntervalMs?: number;
    /** Max stale task age in milliseconds (default: 5 minutes) */
    maxStaleTaskAgeMs?: number;
    /** Recover stale tasks on startup (default: true) */
    recoverOnStartup?: boolean;
}
/**
 * Poller state
 */
export interface QueuePollerState {
    isRunning: boolean;
    inFlight: QueueItem | null;
    lastPollAt: string | null;
    tasksProcessed: number;
    errors: number;
}
/**
 * Poller events
 */
export interface QueuePollerEvents {
    started: [];
    stopped: [];
    poll: [{
        queuedCount: number;
    }];
    claimed: [QueueItem];
    completed: [QueueItem];
    error: [QueueItem, Error];
    'no-task': [];
    'already-claimed': [string];
    'stale-recovered': [number];
}
/**
 * Queue Poller
 * Polls the queue store and executes tasks
 */
export declare class QueuePoller extends EventEmitter {
    private readonly store;
    private readonly executor;
    private readonly pollIntervalMs;
    private readonly maxStaleTaskAgeMs;
    private readonly recoverOnStartup;
    private pollTimer;
    private inFlight;
    private isRunning;
    private lastPollAt;
    private tasksProcessed;
    private errors;
    constructor(store: QueueStore, executor: TaskExecutor, config?: QueuePollerConfig);
    /**
     * Start polling
     */
    start(): Promise<void>;
    /**
     * Stop polling
     */
    stop(): void;
    /**
     * Single poll iteration
     * - Skip if task in-flight
     * - Claim oldest QUEUED task
     * - Execute and update status
     */
    poll(): Promise<void>;
    /**
     * Get current state
     */
    getState(): QueuePollerState;
    /**
     * Check if poller is running
     */
    isActive(): boolean;
    /**
     * Check if task is in-flight
     */
    hasInFlight(): boolean;
    /**
     * Get in-flight task
     */
    getInFlight(): QueueItem | null;
}
//# sourceMappingURL=queue-poller.d.ts.map