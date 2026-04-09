/**
 * Unit Tests: DELETE /api/task-groups/:task_group_id and DELETE /api/tasks/:task_id
 *
 * Verifies:
 * - DELETE /api/task-groups/:id removes all tasks in group and returns deleted_count
 * - DELETE /api/task-groups/:id returns 404 when group not found
 * - DELETE /api/tasks/:id removes the specific task
 * - DELETE /api/tasks/:id returns 404 when task not found
 * - After group deletion, getByTaskGroup returns empty array
 * - After task deletion, getItem returns null
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../../src/web/server';
import {
  QueueItem,
  QueueItemStatus,
  ClaimResult,
  TaskGroupSummary,
  TaskGroupStatus,
} from '../../../src/queue';

/**
 * Minimal mock QueueStore for delete tests
 */
class MockQueueStore {
  items: Map<string, QueueItem> = new Map();
  private taskCounter = 0;
  private archivedGroups: Set<string> = new Set();
  private groupStatusOverrides: Map<string, TaskGroupStatus> = new Map();

  clear(): void {
    this.items.clear();
    this.taskCounter = 0;
    this.archivedGroups.clear();
    this.groupStatusOverrides.clear();
  }

  async enqueue(
    sessionId: string,
    taskGroupId: string,
    prompt: string,
    taskId?: string
  ): Promise<QueueItem> {
    const now = new Date().toISOString();
    const id = taskId || `task-${++this.taskCounter}`;
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
    return this.items.get(taskId) ?? null;
  }

  async claim(): Promise<ClaimResult> {
    return { success: false };
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
      if (errorMessage) item.error_message = errorMessage;
    }
  }

  async getBySession(_sessionId: string): Promise<QueueItem[]> {
    return [];
  }

  async getByStatus(status: QueueItemStatus): Promise<QueueItem[]> {
    return Array.from(this.items.values()).filter(i => i.status === status);
  }

  async getByTaskGroup(taskGroupId: string): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(i => i.task_group_id === taskGroupId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getAllItems(): Promise<QueueItem[]> {
    return Array.from(this.items.values());
  }

  async getAllItemsSummary(): Promise<QueueItem[]> {
    return Array.from(this.items.values());
  }

  async getAllTaskGroups(): Promise<TaskGroupSummary[]> {
    const groupMap = new Map<string, { count: number; createdAt: string; latestUpdatedAt: string }>();
    for (const item of this.items.values()) {
      const existing = groupMap.get(item.task_group_id);
      if (existing) {
        existing.count++;
        if (item.updated_at > existing.latestUpdatedAt) existing.latestUpdatedAt = item.updated_at;
      } else {
        groupMap.set(item.task_group_id, { count: 1, createdAt: item.created_at, latestUpdatedAt: item.updated_at });
      }
    }
    const groups: TaskGroupSummary[] = [];
    for (const [taskGroupId, data] of groupMap) {
      groups.push({
        task_group_id: taskGroupId,
        task_count: data.count,
        created_at: data.createdAt,
        latest_updated_at: data.latestUpdatedAt,
        group_status: this.groupStatusOverrides.get(taskGroupId) ?? (this.archivedGroups.has(taskGroupId) ? 'archived' : 'active'),
      } as TaskGroupSummary);
    }
    return groups;
  }

  async getAllNamespaces() {
    return [];
  }

  async deleteItem(taskId: string): Promise<void> {
    this.items.delete(taskId);
  }

  async deleteTaskGroup(taskGroupId: string): Promise<number> {
    const toDelete = Array.from(this.items.values()).filter(i => i.task_group_id === taskGroupId);
    for (const item of toDelete) {
      this.items.delete(item.task_id);
    }
    this.archivedGroups.delete(taskGroupId);
    this.groupStatusOverrides.delete(taskGroupId);
    return toDelete.length;
  }

  async setTaskGroupArchived(taskGroupId: string, archived: boolean): Promise<boolean> {
    const items = Array.from(this.items.values()).filter(i => i.task_group_id === taskGroupId);
    if (items.length === 0) return false;
    if (archived) { this.archivedGroups.add(taskGroupId); this.groupStatusOverrides.set(taskGroupId, 'archived'); }
    else { this.archivedGroups.delete(taskGroupId); this.groupStatusOverrides.delete(taskGroupId); }
    return true;
  }

  async setTaskGroupStatus(taskGroupId: string, status: TaskGroupStatus | null): Promise<boolean> {
    const items = Array.from(this.items.values()).filter(i => i.task_group_id === taskGroupId);
    if (items.length === 0) return false;
    if (status === null) { this.groupStatusOverrides.delete(taskGroupId); this.archivedGroups.delete(taskGroupId); }
    else { this.groupStatusOverrides.set(taskGroupId, status); if (status === 'archived') this.archivedGroups.add(taskGroupId); else this.archivedGroups.delete(taskGroupId); }
    return true;
  }

  async recoverStaleTasks(_maxAgeMs: number): Promise<number> { return 0; }
  getTableName(): string { return 'pm-runner-queue'; }
  getEndpoint(): string { return 'mock://test'; }
  getNamespace(): string { return 'test-namespace'; }
  destroy(): void {}
}

describe('DELETE /api/task-groups/:task_group_id', function () {
  this.timeout(10000);
  let app: Express;
  let store: MockQueueStore;

  beforeEach(() => {
    store = new MockQueueStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = createApp({ queueStore: store as any, sessionId: 'test-session', namespace: 'test-namespace', projectRoot: '/tmp/test' });
  });

  afterEach(() => {
    store.clear();
  });

  it('should delete all tasks in a group and return deleted_count', async () => {
    await store.enqueue('s1', 'group-alpha', 'prompt 1');
    await store.enqueue('s1', 'group-alpha', 'prompt 2');
    await store.enqueue('s1', 'group-alpha', 'prompt 3');

    const res = await request(app)
      .delete('/api/task-groups/group-alpha')
      .expect(200);

    assert.equal(res.body.task_group_id, 'group-alpha');
    assert.equal(res.body.deleted_count, 3);
  });

  it('should actually remove tasks from the store', async () => {
    await store.enqueue('s1', 'group-beta', 'prompt A');
    await store.enqueue('s1', 'group-beta', 'prompt B');

    assert.equal((await store.getByTaskGroup('group-beta')).length, 2);

    await request(app)
      .delete('/api/task-groups/group-beta')
      .expect(200);

    const remaining = await store.getByTaskGroup('group-beta');
    assert.equal(remaining.length, 0, 'All tasks should be removed');
  });

  it('should return 404 for non-existent task group', async () => {
    const res = await request(app)
      .delete('/api/task-groups/non-existent-group')
      .expect(404);

    assert.equal(res.body.error, 'NOT_FOUND');
    assert.ok(res.body.message.includes('non-existent-group'));
  });

  it('should only delete tasks in the target group, leaving others intact', async () => {
    await store.enqueue('s1', 'group-to-delete', 'prompt 1');
    await store.enqueue('s1', 'group-to-delete', 'prompt 2');
    await store.enqueue('s1', 'group-to-keep', 'prompt 3');
    await store.enqueue('s1', 'group-to-keep', 'prompt 4');

    await request(app)
      .delete('/api/task-groups/group-to-delete')
      .expect(200);

    const deleted = await store.getByTaskGroup('group-to-delete');
    const kept = await store.getByTaskGroup('group-to-keep');

    assert.equal(deleted.length, 0, 'Deleted group should be empty');
    assert.equal(kept.length, 2, 'Other group should be untouched');
  });

  it('should return deleted_count = 1 when group has a single task', async () => {
    await store.enqueue('s1', 'group-single', 'only task');

    const res = await request(app)
      .delete('/api/task-groups/group-single')
      .expect(200);

    assert.equal(res.body.deleted_count, 1);
    assert.equal(res.body.task_group_id, 'group-single');
  });

  it('should handle groups with tasks in various statuses', async () => {
    const t1 = await store.enqueue('s1', 'group-mixed', 'queued task');
    const t2 = await store.enqueue('s1', 'group-mixed', 'running task');
    const t3 = await store.enqueue('s1', 'group-mixed', 'complete task');

    await store.updateStatus(t2.task_id, 'RUNNING');
    await store.updateStatus(t3.task_id, 'COMPLETE');

    const res = await request(app)
      .delete('/api/task-groups/group-mixed')
      .expect(200);

    assert.equal(res.body.deleted_count, 3, 'Should delete all regardless of status');
    assert.equal((await store.getByTaskGroup('group-mixed')).length, 0);
  });

  it('should not affect group listing after deletion', async () => {
    await store.enqueue('s1', 'group-gone', 'task 1');
    await store.enqueue('s1', 'group-remaining', 'task 2');

    await request(app)
      .delete('/api/task-groups/group-gone')
      .expect(200);

    const groups = await store.getAllTaskGroups();
    const ids = groups.map(g => g.task_group_id);
    assert.ok(!ids.includes('group-gone'), 'Deleted group should not appear');
    assert.ok(ids.includes('group-remaining'), 'Remaining group should still appear');
  });
});

describe('DELETE /api/tasks/:task_id', function () {
  this.timeout(10000);
  let app: Express;
  let store: MockQueueStore;

  beforeEach(() => {
    store = new MockQueueStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = createApp({ queueStore: store as any, sessionId: 'test-session', namespace: 'test-namespace', projectRoot: '/tmp/test' });
  });

  afterEach(() => {
    store.clear();
  });

  it('should delete a single task and return deleted: true', async () => {
    const task = await store.enqueue('s1', 'group-x', 'delete me');

    const res = await request(app)
      .delete(`/api/tasks/${task.task_id}`)
      .expect(200);

    assert.equal(res.body.task_id, task.task_id);
    assert.equal(res.body.deleted, true);
  });

  it('should actually remove the task from the store', async () => {
    const task = await store.enqueue('s1', 'group-x', 'delete me');

    assert.ok(await store.getItem(task.task_id), 'Task should exist before delete');

    await request(app)
      .delete(`/api/tasks/${task.task_id}`)
      .expect(200);

    const result = await store.getItem(task.task_id);
    assert.equal(result, null, 'Task should not exist after delete');
  });

  it('should return 404 for non-existent task', async () => {
    const res = await request(app)
      .delete('/api/tasks/task-does-not-exist')
      .expect(404);

    assert.equal(res.body.error, 'NOT_FOUND');
    assert.ok(res.body.message.includes('task-does-not-exist'));
  });

  it('should only delete the target task, leaving siblings intact', async () => {
    const t1 = await store.enqueue('s1', 'group-x', 'keep me 1');
    const t2 = await store.enqueue('s1', 'group-x', 'delete me');
    const t3 = await store.enqueue('s1', 'group-x', 'keep me 2');

    await request(app)
      .delete(`/api/tasks/${t2.task_id}`)
      .expect(200);

    assert.ok(await store.getItem(t1.task_id), 'Sibling t1 should remain');
    assert.equal(await store.getItem(t2.task_id), null, 'Deleted task should be gone');
    assert.ok(await store.getItem(t3.task_id), 'Sibling t3 should remain');

    const groupTasks = await store.getByTaskGroup('group-x');
    assert.equal(groupTasks.length, 2, 'Group should have 2 remaining tasks');
  });

  it('should delete a task regardless of its status', async () => {
    const task = await store.enqueue('s1', 'group-y', 'running task');
    await store.updateStatus(task.task_id, 'RUNNING');

    const res = await request(app)
      .delete(`/api/tasks/${task.task_id}`)
      .expect(200);

    assert.equal(res.body.deleted, true);
    assert.equal(await store.getItem(task.task_id), null);
  });

  it('should delete a COMPLETE task', async () => {
    const task = await store.enqueue('s1', 'group-y', 'complete task');
    await store.updateStatus(task.task_id, 'COMPLETE');

    await request(app)
      .delete(`/api/tasks/${task.task_id}`)
      .expect(200);

    assert.equal(await store.getItem(task.task_id), null, 'COMPLETE task should be deleted');
  });

  it('should delete an ERROR task', async () => {
    const task = await store.enqueue('s1', 'group-y', 'error task');
    await store.updateStatus(task.task_id, 'ERROR', 'something failed');

    await request(app)
      .delete(`/api/tasks/${task.task_id}`)
      .expect(200);

    assert.equal(await store.getItem(task.task_id), null, 'ERROR task should be deleted');
  });
});
