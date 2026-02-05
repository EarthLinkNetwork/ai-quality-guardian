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
import { IQueueStore, QueueItem } from './queue-store';
/**
 * Task executor function type
 * Returns status and optional error message
 */
export type TaskExecutor = (item: QueueItem) => Promise<{
    status: 'COMPLETE' | 'ERROR';
    errorMessage?: string;
    output?: string;
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
    /** Runner ID for heartbeat tracking (v2) */
    runnerId?: string;
    /** Project root for runner identification (v2) */
    projectRoot?: string;
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
    /** Runner ID (v2) */
    runnerId: string;
    /** Project root (v2) */
    projectRoot: string;
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
    private readonly runnerId;
    private readonly projectRoot;
    private pollTimer;
    private inFlight;
    private isRunning;
    private lastPollAt;
    private tasksProcessed;
    private errors;
    constructor(store: IQueueStore, executor: TaskExecutor, config?: QueuePollerConfig);
    /**
     * Generate a unique runner ID
     */
    private generateRunnerId;
    /**
     * Start polling
     */
    start(): Promise<void>;
    /**
     * Stop polling
     */
    stop(): Promise<void>;
    /**
     * Single poll iteration
     * - Update heartbeat (v2)
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
     * Get runner ID (v2)
     */
    getRunnerId(): string;
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