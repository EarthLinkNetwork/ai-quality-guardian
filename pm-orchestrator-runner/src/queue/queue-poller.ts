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
import { QueueStore, QueueItem, QueueItemStatus } from './queue-store';

/**
 * Task executor function type
 * Returns status and optional error message
 */
export type TaskExecutor = (
  item: QueueItem
) => Promise<{ status: 'COMPLETE' | 'ERROR'; errorMessage?: string }>;

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
  poll: [{ queuedCount: number }];
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
export class QueuePoller extends EventEmitter {
  private readonly store: QueueStore;
  private readonly executor: TaskExecutor;
  private readonly pollIntervalMs: number;
  private readonly maxStaleTaskAgeMs: number;
  private readonly recoverOnStartup: boolean;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight: QueueItem | null = null;
  private isRunning: boolean = false;
  private lastPollAt: string | null = null;
  private tasksProcessed: number = 0;
  private errors: number = 0;

  constructor(
    store: QueueStore,
    executor: TaskExecutor,
    config: QueuePollerConfig = {}
  ) {
    super();
    this.store = store;
    this.executor = executor;
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.maxStaleTaskAgeMs = config.maxStaleTaskAgeMs ?? 5 * 60 * 1000;
    this.recoverOnStartup = config.recoverOnStartup ?? true;
  }

  /**
   * Start polling
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Recover stale tasks on startup (fail-closed)
    if (this.recoverOnStartup) {
      try {
        const recovered = await this.store.recoverStaleTasks(this.maxStaleTaskAgeMs);
        if (recovered > 0) {
          this.emit('stale-recovered', recovered);
        }
      } catch (error) {
        // Log but don't fail startup
        // eslint-disable-next-line no-console
        console.error('[QueuePoller] Failed to recover stale tasks:', error);
      }
    }

    this.emit('started');

    // Start polling loop
    this.pollTimer = setInterval(() => {
      this.poll().catch(error => {
        // eslint-disable-next-line no-console
        console.error('[QueuePoller] Poll error:', error);
      });
    }, this.pollIntervalMs);

    // Immediate first poll
    await this.poll();
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * Single poll iteration
   * - Skip if task in-flight
   * - Claim oldest QUEUED task
   * - Execute and update status
   */
  async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.lastPollAt = new Date().toISOString();

    // In-flight limit: 1
    if (this.inFlight) {
      return;
    }

    // Try to claim a task
    const claimResult = await this.store.claim();

    if (!claimResult.success) {
      if (claimResult.error) {
        // Task was claimed by another process
        this.emit('already-claimed', claimResult.error);
      } else {
        // No tasks in queue
        this.emit('no-task');
      }
      return;
    }

    const item = claimResult.item!;
    this.inFlight = item;
    this.emit('claimed', item);

    try {
      // Execute the task
      const result = await this.executor(item);

      // Update status
      await this.store.updateStatus(
        item.task_id,
        result.status,
        result.errorMessage
      );

      if (result.status === 'COMPLETE') {
        this.tasksProcessed++;
        this.emit('completed', item);
      } else {
        this.errors++;
        this.emit('error', item, new Error(result.errorMessage || 'Task failed'));
      }
    } catch (error) {
      // Fail-closed: mark as ERROR
      this.errors++;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      try {
        await this.store.updateStatus(item.task_id, 'ERROR', errorMessage);
      } catch (updateError) {
        // Log but don't throw - we've already failed
        // eslint-disable-next-line no-console
        console.error('[QueuePoller] Failed to update error status:', updateError);
      }

      this.emit('error', item, error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.inFlight = null;
    }
  }

  /**
   * Get current state
   */
  getState(): QueuePollerState {
    return {
      isRunning: this.isRunning,
      inFlight: this.inFlight,
      lastPollAt: this.lastPollAt,
      tasksProcessed: this.tasksProcessed,
      errors: this.errors,
    };
  }

  /**
   * Check if poller is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Check if task is in-flight
   */
  hasInFlight(): boolean {
    return this.inFlight !== null;
  }

  /**
   * Get in-flight task
   */
  getInFlight(): QueueItem | null {
    return this.inFlight;
  }
}
