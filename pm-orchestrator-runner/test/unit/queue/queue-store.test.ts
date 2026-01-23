/**
 * QueueStore Unit Tests
 * Per spec/20_QUEUE_STORE.md
 *
 * Tests:
 * 1. enqueue creates Item with timestamps
 * 2. claim only gets QUEUED items
 * 3. claim is conditional (no double execution)
 * 4. updateStatus sets COMPLETE/ERROR
 * 5. status-index preserves oldest-first ordering
 */

import { describe, it, beforeEach, afterEach, before, after } from 'mocha';
import { strict as assert } from 'assert';
import {
  QueueStore,
  QueueItem,
  QueueItemStatus,
  ClaimResult,
} from '../../../src/queue';

/**
 * Mock DynamoDB client for unit testing
 * Simulates DynamoDB behavior without actual connection
 */
class MockDynamoDBStore {
  private items: Map<string, QueueItem> = new Map();
  private claimedIds: Set<string> = new Set();
  private readonly namespace: string = 'test-namespace';

  clear(): void {
    this.items.clear();
    this.claimedIds.clear();
  }

  async enqueue(
    sessionId: string,
    taskGroupId: string,
    prompt: string,
    taskId?: string
  ): Promise<QueueItem> {
    const now = new Date().toISOString();
    const id = taskId || `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const item: QueueItem = {
      namespace: this.namespace,
      task_id: id,
      task_group_id: taskGroupId,
      session_id: sessionId,
      status: 'QUEUED',
      prompt,
      created_at: now,
      updated_at: now,
    };
    this.items.set(id, item);
    return item;
  }

  async getItem(taskId: string): Promise<QueueItem | null> {
    return this.items.get(taskId) || null;
  }

  async claim(): Promise<ClaimResult> {
    // Find oldest QUEUED item
    const queuedItems = Array.from(this.items.values())
      .filter(item => item.status === 'QUEUED')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    if (queuedItems.length === 0) {
      return { success: false };
    }

    const item = queuedItems[0];

    // Simulate conditional check - if already claimed, fail
    if (this.claimedIds.has(item.task_id)) {
      return { success: false, error: 'Task already claimed by another process' };
    }

    // Mark as claimed and update status
    this.claimedIds.add(item.task_id);
    const now = new Date().toISOString();
    item.status = 'RUNNING';
    item.updated_at = now;
    this.items.set(item.task_id, item);

    return { success: true, item };
  }

  async updateStatus(
    taskId: string,
    status: QueueItemStatus,
    errorMessage?: string
  ): Promise<void> {
    const item = this.items.get(taskId);
    if (!item) {
      throw new Error(`Item not found: ${taskId}`);
    }
    const now = new Date().toISOString();
    item.status = status;
    item.updated_at = now;
    if (errorMessage) {
      item.error_message = errorMessage;
    }
    this.items.set(taskId, item);
  }

  async getByStatus(status: QueueItemStatus): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.status === status)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getBySession(sessionId: string): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // Simulate concurrent claim attempt
  simulateConcurrentClaim(taskId: string): void {
    this.claimedIds.add(taskId);
  }
}

describe('QueueStore (Mock)', () => {
  let store: MockDynamoDBStore;

  beforeEach(() => {
    store = new MockDynamoDBStore();
  });

  afterEach(() => {
    store.clear();
  });

  describe('enqueue', () => {
    it('should create item with timestamps', async () => {
      const beforeTime = new Date().toISOString();

      const item = await store.enqueue(
        'session-123',
        'task-group-456',
        'Test prompt'
      );

      const afterTime = new Date().toISOString();

      assert.equal(typeof item.task_id, 'string');
      assert.equal(item.task_group_id, 'task-group-456');
      assert.equal(item.session_id, 'session-123');
      assert.equal(item.status, 'QUEUED');
      assert.equal(item.prompt, 'Test prompt');
      assert.equal(typeof item.created_at, 'string');
      assert.equal(typeof item.updated_at, 'string');
      assert.ok(item.created_at >= beforeTime);
      assert.ok(item.created_at <= afterTime);
      assert.equal(item.created_at, item.updated_at);
    });

    it('should use provided task_id if given', async () => {
      const item = await store.enqueue(
        'session-123',
        'task-group-456',
        'Test prompt',
        'custom-task-id'
      );

      assert.equal(item.task_id, 'custom-task-id');
    });

    it('should store item retrievable by getItem', async () => {
      const item = await store.enqueue(
        'session-123',
        'task-group-456',
        'Test prompt'
      );

      const retrieved = await store.getItem(item.task_id);
      assert.deepEqual(retrieved, item);
    });
  });

  describe('claim', () => {
    it('should only claim QUEUED items', async () => {
      // Create items with different statuses
      const item1 = await store.enqueue('s1', 'tg1', 'prompt1');
      await store.updateStatus(item1.task_id, 'COMPLETE');

      const item2 = await store.enqueue('s2', 'tg2', 'prompt2');
      await store.updateStatus(item2.task_id, 'ERROR', 'Some error');

      const item3 = await store.enqueue('s3', 'tg3', 'prompt3');
      // item3 stays QUEUED

      // Claim should get item3 (the only QUEUED one)
      const result = await store.claim();
      assert.equal(result.success, true);
      assert.equal(result.item?.task_id, item3.task_id);
      assert.equal(result.item?.status, 'RUNNING');
    });

    it('should return failure when no QUEUED items exist', async () => {
      const result = await store.claim();
      assert.equal(result.success, false);
      assert.equal(result.item, undefined);
    });

    it('should prevent double execution (conditional update)', async () => {
      const item = await store.enqueue('s1', 'tg1', 'prompt1');

      // Simulate another process claiming first
      store.simulateConcurrentClaim(item.task_id);

      // Our claim attempt should fail
      const result = await store.claim();
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('already claimed'));
    });

    it('should update status to RUNNING on successful claim', async () => {
      const item = await store.enqueue('s1', 'tg1', 'prompt1');
      const originalUpdatedAt = item.updated_at;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await store.claim();
      assert.equal(result.success, true);
      assert.equal(result.item?.status, 'RUNNING');
      assert.notEqual(result.item?.updated_at, originalUpdatedAt);
    });
  });

  describe('updateStatus', () => {
    it('should set status to COMPLETE', async () => {
      const item = await store.enqueue('s1', 'tg1', 'prompt1');

      await store.updateStatus(item.task_id, 'COMPLETE');

      const updated = await store.getItem(item.task_id);
      assert.equal(updated?.status, 'COMPLETE');
    });

    it('should set status to ERROR with message', async () => {
      const item = await store.enqueue('s1', 'tg1', 'prompt1');

      await store.updateStatus(item.task_id, 'ERROR', 'Task failed: timeout');

      const updated = await store.getItem(item.task_id);
      assert.equal(updated?.status, 'ERROR');
      assert.equal(updated?.error_message, 'Task failed: timeout');
    });

    it('should update updated_at timestamp', async () => {
      const item = await store.enqueue('s1', 'tg1', 'prompt1');
      const originalUpdatedAt = item.updated_at;

      await new Promise(resolve => setTimeout(resolve, 10));
      await store.updateStatus(item.task_id, 'COMPLETE');

      const updated = await store.getItem(item.task_id);
      assert.notEqual(updated?.updated_at, originalUpdatedAt);
    });
  });

  describe('oldest-first ordering (status-index)', () => {
    it('should return items in created_at order', async () => {
      // Create items with small delays to ensure different timestamps
      const item1 = await store.enqueue('s1', 'tg1', 'first');
      await new Promise(resolve => setTimeout(resolve, 5));

      const item2 = await store.enqueue('s2', 'tg2', 'second');
      await new Promise(resolve => setTimeout(resolve, 5));

      const item3 = await store.enqueue('s3', 'tg3', 'third');

      // getByStatus should return oldest first
      const queuedItems = await store.getByStatus('QUEUED');
      assert.equal(queuedItems.length, 3);
      assert.equal(queuedItems[0].task_id, item1.task_id);
      assert.equal(queuedItems[1].task_id, item2.task_id);
      assert.equal(queuedItems[2].task_id, item3.task_id);
    });

    it('should claim oldest QUEUED item first', async () => {
      // Create items in order
      const item1 = await store.enqueue('s1', 'tg1', 'oldest');
      await new Promise(resolve => setTimeout(resolve, 5));

      await store.enqueue('s2', 'tg2', 'middle');
      await new Promise(resolve => setTimeout(resolve, 5));

      await store.enqueue('s3', 'tg3', 'newest');

      // First claim should get oldest
      const result1 = await store.claim();
      assert.equal(result1.success, true);
      assert.equal(result1.item?.task_id, item1.task_id);
      assert.equal(result1.item?.prompt, 'oldest');
    });

    it('should maintain ordering after status changes', async () => {
      const item1 = await store.enqueue('s1', 'tg1', 'first');
      await new Promise(resolve => setTimeout(resolve, 5));

      const item2 = await store.enqueue('s2', 'tg2', 'second');
      await new Promise(resolve => setTimeout(resolve, 5));

      await store.enqueue('s3', 'tg3', 'third');

      // Complete item1
      await store.updateStatus(item1.task_id, 'COMPLETE');

      // Next claim should get item2 (oldest remaining QUEUED)
      const result = await store.claim();
      assert.equal(result.success, true);
      assert.equal(result.item?.task_id, item2.task_id);
    });
  });

  describe('getBySession', () => {
    it('should return items for specific session', async () => {
      await store.enqueue('session-A', 'tg1', 'prompt1');
      await store.enqueue('session-B', 'tg2', 'prompt2');
      await store.enqueue('session-A', 'tg3', 'prompt3');

      const sessionAItems = await store.getBySession('session-A');
      assert.equal(sessionAItems.length, 2);
      assert.ok(sessionAItems.every(item => item.session_id === 'session-A'));
    });
  });
});

describe('QueueStore (Real DynamoDB - Integration)', function() {
  // Skip these tests if DynamoDB Local is not running
  // Run with: DYNAMODB_ENDPOINT=http://localhost:8000 npm test
  const endpoint = process.env.DYNAMODB_ENDPOINT;

  before(function() {
    if (!endpoint) {
      this.skip();
    }
  });

  let store: QueueStore;

  before(async function() {
    if (!endpoint) return;

    store = new QueueStore({
      endpoint,
      namespace: 'test-integration',
    });

    // Create test table
    try {
      await store.createTable();
      // Wait for table to be active
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {
      // Table might already exist
    }
  });

  after(async function() {
    if (store) {
      store.destroy();
    }
  });

  it('should enqueue and claim item', async function() {
    if (!endpoint) this.skip();

    const item = await store.enqueue(
      'test-session',
      'test-group',
      'Test prompt',
      `test-task-${Date.now()}`
    );

    assert.equal(item.status, 'QUEUED');

    const result = await store.claim();
    assert.equal(result.success, true);
    assert.equal(result.item?.status, 'RUNNING');
  });
});
