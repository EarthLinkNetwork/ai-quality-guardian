/**
 * QueuePoller Unit Tests
 * Per spec/20_QUEUE_STORE.md
 *
 * Tests:
 * 1. Single tick processes 1 item only
 * 2. In-flight item blocks next claim
 * 3. Executor failure marks item as ERROR (fail-closed)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import {
  QueueItem,
  QueueItemStatus,
  ClaimResult,
  TaskExecutor,
} from '../../../src/queue';

/**
 * Mock QueueStore for Poller testing
 */
class MockQueueStore {
  private items: Map<string, QueueItem> = new Map();
  private claimIndex: number = 0;
  private queuedItems: QueueItem[] = [];

  addQueuedItem(item: Partial<QueueItem>): QueueItem {
    const fullItem: QueueItem = {
      namespace: 'test-namespace',
      task_id: item.task_id || `task-${Date.now()}-${Math.random()}`,
      task_group_id: item.task_group_id || 'test-group',
      session_id: item.session_id || 'test-session',
      status: 'QUEUED',
      prompt: item.prompt || 'test prompt',
      created_at: item.created_at || new Date().toISOString(),
      updated_at: item.updated_at || new Date().toISOString(),
    };
    this.items.set(fullItem.task_id, fullItem);
    this.queuedItems.push(fullItem);
    return fullItem;
  }

  async claim(): Promise<ClaimResult> {
    if (this.claimIndex >= this.queuedItems.length) {
      return { success: false };
    }

    const item = this.queuedItems[this.claimIndex];
    this.claimIndex++;

    // Update status to RUNNING
    item.status = 'RUNNING';
    item.updated_at = new Date().toISOString();
    this.items.set(item.task_id, item);

    return { success: true, item };
  }

  async updateStatus(
    taskId: string,
    status: QueueItemStatus,
    errorMessage?: string
  ): Promise<void> {
    const item = this.items.get(taskId);
    if (item) {
      item.status = status;
      item.updated_at = new Date().toISOString();
      if (errorMessage) {
        item.error_message = errorMessage;
      }
      this.items.set(taskId, item);
    }
  }

  async recoverStaleTasks(_maxAgeMs: number): Promise<number> {
    return 0; // No stale tasks in test
  }

  getItem(taskId: string): QueueItem | undefined {
    return this.items.get(taskId);
  }

  destroy(): void {
    // No-op for mock
  }

  reset(): void {
    this.items.clear();
    this.queuedItems = [];
    this.claimIndex = 0;
  }
}

/**
 * Minimal QueuePoller implementation for testing
 * (Simplified version without real timers)
 */
class TestableQueuePoller extends EventEmitter {
  private readonly store: MockQueueStore;
  private readonly executor: TaskExecutor;
  private inFlight: QueueItem | null = null;
  private isRunning: boolean = false;
  private tasksProcessed: number = 0;
  private errors: number = 0;

  constructor(store: MockQueueStore, executor: TaskExecutor) {
    super();
    this.store = store;
    this.executor = executor;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.emit('started');
  }

  stop(): void {
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Single poll tick (manually triggered for testing)
   */
  async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // In-flight limit: 1
    if (this.inFlight) {
      return;
    }

    // Try to claim
    const claimResult = await this.store.claim();

    if (!claimResult.success) {
      this.emit('no-task');
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
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.store.updateStatus(item.task_id, 'ERROR', errorMessage);
      this.emit('error', item, error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.inFlight = null;
    }
  }

  getState() {
    return {
      isRunning: this.isRunning,
      inFlight: this.inFlight,
      tasksProcessed: this.tasksProcessed,
      errors: this.errors,
    };
  }

  hasInFlight(): boolean {
    return this.inFlight !== null;
  }

  // Test helper: set in-flight directly
  setInFlight(item: QueueItem | null): void {
    this.inFlight = item;
  }
}

describe('QueuePoller', () => {
  let store: MockQueueStore;
  let poller: TestableQueuePoller;

  beforeEach(() => {
    store = new MockQueueStore();
  });

  afterEach(() => {
    if (poller) {
      poller.stop();
    }
    store.reset();
  });

  describe('single tick processing', () => {
    it('should process exactly 1 item per tick', async () => {
      // Add multiple items
      const item1 = store.addQueuedItem({ task_id: 'task-1', prompt: 'first' });
      store.addQueuedItem({ task_id: 'task-2', prompt: 'second' });
      store.addQueuedItem({ task_id: 'task-3', prompt: 'third' });

      const processedItems: QueueItem[] = [];
      const executor: TaskExecutor = async (item) => {
        processedItems.push(item);
        return { status: 'COMPLETE' };
      };

      poller = new TestableQueuePoller(store, executor);
      await poller.start();

      // Single poll tick
      await poller.poll();

      // Only 1 item should be processed
      assert.equal(processedItems.length, 1);
      assert.equal(processedItems[0].task_id, item1.task_id);
    });

    it('should emit claimed and completed events', async () => {
      store.addQueuedItem({ task_id: 'task-1' });

      const events: string[] = [];
      const executor: TaskExecutor = async () => ({ status: 'COMPLETE' });

      poller = new TestableQueuePoller(store, executor);
      poller.on('claimed', () => events.push('claimed'));
      poller.on('completed', () => events.push('completed'));

      await poller.start();
      await poller.poll();

      assert.deepEqual(events, ['claimed', 'completed']);
    });

    it('should emit no-task when queue is empty', async () => {
      let noTaskEmitted = false;
      const executor: TaskExecutor = async () => ({ status: 'COMPLETE' });

      poller = new TestableQueuePoller(store, executor);
      poller.on('no-task', () => {
        noTaskEmitted = true;
      });

      await poller.start();
      await poller.poll();

      assert.equal(noTaskEmitted, true);
    });
  });

  describe('in-flight blocking', () => {
    it('should not claim next item while in-flight', async () => {
      store.addQueuedItem({ task_id: 'task-1' });
      store.addQueuedItem({ task_id: 'task-2' });

      let executionCount = 0;
      const executor: TaskExecutor = async () => {
        executionCount++;
        return { status: 'COMPLETE' };
      };

      poller = new TestableQueuePoller(store, executor);
      await poller.start();

      // Manually set in-flight to simulate task execution in progress
      const fakeInFlight: QueueItem = {
        namespace: 'test-namespace',
        task_id: 'in-progress-task',
        task_group_id: 'tg',
        session_id: 's',
        status: 'RUNNING',
        prompt: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      poller.setInFlight(fakeInFlight);

      // Try to poll while in-flight
      await poller.poll();

      // Nothing should be executed
      assert.equal(executionCount, 0);
      assert.equal(poller.hasInFlight(), true);
    });

    it('should process next item after in-flight completes', async () => {
      const item1 = store.addQueuedItem({ task_id: 'task-1', prompt: 'first' });
      const item2 = store.addQueuedItem({ task_id: 'task-2', prompt: 'second' });

      const processedIds: string[] = [];
      const executor: TaskExecutor = async (item) => {
        processedIds.push(item.task_id);
        return { status: 'COMPLETE' };
      };

      poller = new TestableQueuePoller(store, executor);
      await poller.start();

      // First poll
      await poller.poll();
      assert.deepEqual(processedIds, [item1.task_id]);
      assert.equal(poller.hasInFlight(), false); // Cleared after completion

      // Second poll
      await poller.poll();
      assert.deepEqual(processedIds, [item1.task_id, item2.task_id]);
    });
  });

  describe('fail-closed error handling', () => {
    it('should mark item as ERROR when executor throws', async () => {
      const item = store.addQueuedItem({ task_id: 'task-1' });

      const executor: TaskExecutor = async () => {
        throw new Error('Executor crashed');
      };

      const errorEvents: Array<{ item: QueueItem; error: Error }> = [];
      poller = new TestableQueuePoller(store, executor);
      poller.on('error', (errorItem, error) => {
        errorEvents.push({ item: errorItem, error });
      });

      await poller.start();
      await poller.poll();

      // Item should be marked as ERROR
      const updatedItem = store.getItem(item.task_id);
      assert.equal(updatedItem?.status, 'ERROR');
      assert.equal(updatedItem?.error_message, 'Executor crashed');

      // Error event should be emitted
      assert.equal(errorEvents.length, 1);
      assert.equal(errorEvents[0].item.task_id, item.task_id);
      assert.equal(errorEvents[0].error.message, 'Executor crashed');

      // In-flight should be cleared
      assert.equal(poller.hasInFlight(), false);
    });

    it('should mark item as ERROR when executor returns ERROR status', async () => {
      const item = store.addQueuedItem({ task_id: 'task-1' });

      const executor: TaskExecutor = async () => ({
        status: 'ERROR',
        errorMessage: 'Validation failed',
      });

      poller = new TestableQueuePoller(store, executor);
      poller.on('error', () => {}); // Prevent unhandled error throw
      await poller.start();
      await poller.poll();

      const updatedItem = store.getItem(item.task_id);
      assert.equal(updatedItem?.status, 'ERROR');
      assert.equal(updatedItem?.error_message, 'Validation failed');
    });

    it('should continue processing after error', async () => {
      store.addQueuedItem({ task_id: 'task-1' });
      store.addQueuedItem({ task_id: 'task-2' });

      let callCount = 0;
      const executor: TaskExecutor = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First task fails');
        }
        return { status: 'COMPLETE' };
      };

      poller = new TestableQueuePoller(store, executor);
      poller.on('error', () => {}); // Prevent unhandled error throw
      await poller.start();

      // First poll - should fail
      await poller.poll();
      assert.equal(store.getItem('task-1')?.status, 'ERROR');

      // Second poll - should succeed
      await poller.poll();
      assert.equal(store.getItem('task-2')?.status, 'COMPLETE');
    });

    it('should increment error counter on failure', async () => {
      store.addQueuedItem({ task_id: 'task-1' });

      const executor: TaskExecutor = async () => {
        throw new Error('Task failed');
      };

      poller = new TestableQueuePoller(store, executor);
      poller.on('error', () => {}); // Prevent unhandled error throw
      await poller.start();
      await poller.poll();

      const state = poller.getState();
      assert.equal(state.errors, 1);
      assert.equal(state.tasksProcessed, 0);
    });
  });

  describe('state management', () => {
    it('should track tasksProcessed correctly', async () => {
      store.addQueuedItem({ task_id: 'task-1' });
      store.addQueuedItem({ task_id: 'task-2' });
      store.addQueuedItem({ task_id: 'task-3' });

      const executor: TaskExecutor = async () => ({ status: 'COMPLETE' });

      poller = new TestableQueuePoller(store, executor);
      await poller.start();

      await poller.poll();
      await poller.poll();
      await poller.poll();

      const state = poller.getState();
      assert.equal(state.tasksProcessed, 3);
      assert.equal(state.errors, 0);
    });

    it('should track mixed success/error correctly', async () => {
      store.addQueuedItem({ task_id: 'task-1' });
      store.addQueuedItem({ task_id: 'task-2' });
      store.addQueuedItem({ task_id: 'task-3' });

      let callCount = 0;
      const executor: TaskExecutor = async () => {
        callCount++;
        if (callCount === 2) {
          return { status: 'ERROR', errorMessage: 'Failed' };
        }
        return { status: 'COMPLETE' };
      };

      poller = new TestableQueuePoller(store, executor);
      poller.on('error', () => {}); // Prevent unhandled error throw
      await poller.start();

      await poller.poll();
      await poller.poll();
      await poller.poll();

      const state = poller.getState();
      assert.equal(state.tasksProcessed, 2);
      assert.equal(state.errors, 1);
    });
  });

  describe('lifecycle', () => {
    it('should emit started event on start', async () => {
      let startedEmitted = false;
      const executor: TaskExecutor = async () => ({ status: 'COMPLETE' });

      poller = new TestableQueuePoller(store, executor);
      poller.on('started', () => {
        startedEmitted = true;
      });

      await poller.start();
      assert.equal(startedEmitted, true);
    });

    it('should emit stopped event on stop', () => {
      let stoppedEmitted = false;
      const executor: TaskExecutor = async () => ({ status: 'COMPLETE' });

      poller = new TestableQueuePoller(store, executor);
      poller.on('stopped', () => {
        stoppedEmitted = true;
      });

      poller.stop();
      assert.equal(stoppedEmitted, true);
    });

    it('should not poll when stopped', async () => {
      store.addQueuedItem({ task_id: 'task-1' });

      let executed = false;
      const executor: TaskExecutor = async () => {
        executed = true;
        return { status: 'COMPLETE' };
      };

      poller = new TestableQueuePoller(store, executor);
      // Don't start - isRunning = false

      await poller.poll();
      assert.equal(executed, false);
    });
  });
});
