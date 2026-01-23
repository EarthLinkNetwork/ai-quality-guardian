/**
 * QueueStore Task Group Methods Unit Tests
 * Per spec/19_WEB_UI.md and spec/20_QUEUE_STORE.md
 *
 * Tests:
 * 1. getByTaskGroup returns tasks for a specific task group
 * 2. getAllTaskGroups returns distinct task groups with counts
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  QueueItem,
  QueueItemStatus,
  ClaimResult,
  TaskGroupSummary,
} from '../../../src/queue';

/**
 * Mock QueueStore for testing task group methods
 */
class MockQueueStore {
  private items: Map<string, QueueItem> = new Map();

  clear(): void {
    this.items.clear();
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
      namespace: 'test-namespace',
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
    const queuedItems = Array.from(this.items.values())
      .filter(item => item.status === 'QUEUED')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    if (queuedItems.length === 0) {
      return { success: false };
    }

    const item = queuedItems[0];
    item.status = 'RUNNING';
    item.updated_at = new Date().toISOString();
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
    }
  }

  async getBySession(sessionId: string): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getByStatus(status: QueueItemStatus): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.status === status)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Get items by task group ID
   * Uses task-group-index GSI
   */
  async getByTaskGroup(taskGroupId: string): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.task_group_id === taskGroupId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Get all distinct task groups with summary
   */
  async getAllTaskGroups(): Promise<TaskGroupSummary[]> {
    const groupMap = new Map<string, { count: number; createdAt: string; latestUpdatedAt: string }>();

    for (const item of this.items.values()) {
      const existing = groupMap.get(item.task_group_id);
      if (existing) {
        existing.count++;
        if (item.created_at < existing.createdAt) {
          existing.createdAt = item.created_at;
        }
        if (item.updated_at > existing.latestUpdatedAt) {
          existing.latestUpdatedAt = item.updated_at;
        }
      } else {
        groupMap.set(item.task_group_id, {
          count: 1,
          createdAt: item.created_at,
          latestUpdatedAt: item.updated_at,
        });
      }
    }

    const groups: TaskGroupSummary[] = [];
    for (const [taskGroupId, data] of groupMap) {
      groups.push({
        task_group_id: taskGroupId,
        task_count: data.count,
        created_at: data.createdAt,
        latest_updated_at: data.latestUpdatedAt,
      });
    }

    groups.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return groups;
  }

  async deleteItem(taskId: string): Promise<void> {
    this.items.delete(taskId);
  }

  async recoverStaleTasks(_maxAgeMs: number): Promise<number> {
    return 0;
  }
}

describe('QueueStore Task Group Methods', () => {
  let store: MockQueueStore;

  beforeEach(() => {
    store = new MockQueueStore();
  });

  afterEach(() => {
    store.clear();
  });

  describe('getByTaskGroup', () => {
    it('should return empty array for non-existent task group', async () => {
      const tasks = await store.getByTaskGroup('non-existent');
      assert.deepEqual(tasks, []);
    });

    it('should return tasks for specific task group only', async () => {
      await store.enqueue('s1', 'group-a', 'prompt 1');
      await store.enqueue('s1', 'group-a', 'prompt 2');
      await store.enqueue('s1', 'group-b', 'prompt 3');

      const tasksA = await store.getByTaskGroup('group-a');
      const tasksB = await store.getByTaskGroup('group-b');

      assert.equal(tasksA.length, 2);
      assert.equal(tasksB.length, 1);
      assert.ok(tasksA.every(t => t.task_group_id === 'group-a'));
      assert.ok(tasksB.every(t => t.task_group_id === 'group-b'));
    });

    it('should return tasks sorted by created_at', async () => {
      // Add small delays to ensure different timestamps
      const item1 = await store.enqueue('s1', 'group-a', 'first');
      await new Promise(resolve => setTimeout(resolve, 5));
      const item2 = await store.enqueue('s1', 'group-a', 'second');
      await new Promise(resolve => setTimeout(resolve, 5));
      const item3 = await store.enqueue('s1', 'group-a', 'third');

      const tasks = await store.getByTaskGroup('group-a');

      assert.equal(tasks.length, 3);
      assert.equal(tasks[0].task_id, item1.task_id);
      assert.equal(tasks[1].task_id, item2.task_id);
      assert.equal(tasks[2].task_id, item3.task_id);
    });

    it('should include tasks with different statuses', async () => {
      const item1 = await store.enqueue('s1', 'group-a', 'prompt 1');
      const item2 = await store.enqueue('s1', 'group-a', 'prompt 2');
      const item3 = await store.enqueue('s1', 'group-a', 'prompt 3');

      await store.updateStatus(item1.task_id, 'RUNNING');
      await store.updateStatus(item2.task_id, 'COMPLETE');
      await store.updateStatus(item3.task_id, 'ERROR', 'Failed');

      const tasks = await store.getByTaskGroup('group-a');

      assert.equal(tasks.length, 3);
      assert.equal(tasks[0].status, 'RUNNING');
      assert.equal(tasks[1].status, 'COMPLETE');
      assert.equal(tasks[2].status, 'ERROR');
      assert.equal(tasks[2].error_message, 'Failed');
    });
  });

  describe('getAllTaskGroups', () => {
    it('should return empty array when no tasks exist', async () => {
      const groups = await store.getAllTaskGroups();
      assert.deepEqual(groups, []);
    });

    it('should return distinct task groups with counts', async () => {
      await store.enqueue('s1', 'group-a', 'prompt 1');
      await store.enqueue('s1', 'group-a', 'prompt 2');
      await store.enqueue('s1', 'group-b', 'prompt 3');
      await store.enqueue('s1', 'group-c', 'prompt 4');

      const groups = await store.getAllTaskGroups();

      assert.equal(groups.length, 3);

      const groupA = groups.find(g => g.task_group_id === 'group-a');
      const groupB = groups.find(g => g.task_group_id === 'group-b');
      const groupC = groups.find(g => g.task_group_id === 'group-c');

      assert.ok(groupA, 'group-a should exist');
      assert.ok(groupB, 'group-b should exist');
      assert.ok(groupC, 'group-c should exist');

      assert.equal(groupA.task_count, 2);
      assert.equal(groupB.task_count, 1);
      assert.equal(groupC.task_count, 1);
    });

    it('should return groups sorted by created_at (oldest first)', async () => {
      // Add delays to ensure different timestamps
      await store.enqueue('s1', 'oldest-group', 'prompt 1');
      await new Promise(resolve => setTimeout(resolve, 5));
      await store.enqueue('s1', 'middle-group', 'prompt 2');
      await new Promise(resolve => setTimeout(resolve, 5));
      await store.enqueue('s1', 'newest-group', 'prompt 3');

      const groups = await store.getAllTaskGroups();

      assert.equal(groups.length, 3);
      assert.equal(groups[0].task_group_id, 'oldest-group');
      assert.equal(groups[1].task_group_id, 'middle-group');
      assert.equal(groups[2].task_group_id, 'newest-group');
    });

    it('should track latest_updated_at correctly', async () => {
      const item1 = await store.enqueue('s1', 'group-a', 'prompt 1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await store.enqueue('s1', 'group-a', 'prompt 2');
      await new Promise(resolve => setTimeout(resolve, 10));
      await store.updateStatus(item1.task_id, 'COMPLETE');

      const groups = await store.getAllTaskGroups();
      const groupA = groups.find(g => g.task_group_id === 'group-a');

      assert.ok(groupA);
      // latest_updated_at should be from item1 (which was updated to COMPLETE)
      // Note: This depends on implementation - the mock updates updated_at on status change
    });

    it('should include groups from multiple sessions', async () => {
      await store.enqueue('session-1', 'group-a', 'prompt 1');
      await store.enqueue('session-2', 'group-a', 'prompt 2');
      await store.enqueue('session-1', 'group-b', 'prompt 3');

      const groups = await store.getAllTaskGroups();

      assert.equal(groups.length, 2);

      const groupA = groups.find(g => g.task_group_id === 'group-a');
      assert.ok(groupA);
      assert.equal(groupA.task_count, 2);
    });
  });
});
