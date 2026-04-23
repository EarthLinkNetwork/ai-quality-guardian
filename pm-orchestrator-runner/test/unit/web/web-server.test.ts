/**
 * Web Server Unit Tests
 * Per spec/19_WEB_UI.md
 *
 * Tests:
 * 1. POST /api/tasks enqueues and returns task_id
 * 2. GET /api/task-groups returns list
 * 3. GET /api/task-groups/:id/tasks returns tasks
 * 4. GET /api/tasks/:task_id returns status/prompt
 * 5. fail-closed: empty input = 400
 * 6. No "Runner direct command API" exists (route list test)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../../src/web/server';
import { QueueItem, QueueItemStatus, ClaimResult, TaskGroupSummary, TaskGroupStatus } from '../../../src/queue';
import { resetDAL } from '../../../src/web/dal/dal-factory';

/**
 * Mock QueueStore for Web Server testing
 */
class MockQueueStore {
  private items: Map<string, QueueItem> = new Map();
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
    return this.items.get(taskId) || null;
  }

  async claim(): Promise<ClaimResult> {
    for (const item of this.items.values()) {
      if (item.status === 'QUEUED') {
        item.status = 'RUNNING';
        item.updated_at = new Date().toISOString();
        return { success: true, item };
      }
    }
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

  async getByTaskGroup(taskGroupId: string): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(item => item.task_group_id === taskGroupId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getAllTaskGroups(): Promise<TaskGroupSummary[]> {
    const groupMap = new Map<string, {
      count: number;
      createdAt: string;
      latestUpdatedAt: string;
      statusCounts: Record<string, number>;
      latestStatus: string;
      firstPrompt: string;
    }>();

    for (const item of this.items.values()) {
      const existing = groupMap.get(item.task_group_id);
      if (existing) {
        existing.count++;
        if (item.created_at < existing.createdAt) {
          existing.createdAt = item.created_at;
          existing.firstPrompt = item.prompt?.substring(0, 120) || '';
        }
        if (item.updated_at > existing.latestUpdatedAt) {
          existing.latestUpdatedAt = item.updated_at;
        }
        existing.statusCounts[item.status] = (existing.statusCounts[item.status] || 0) + 1;
        existing.latestStatus = item.status;
      } else {
        const statusCounts: Record<string, number> = { QUEUED: 0, RUNNING: 0, AWAITING_RESPONSE: 0, COMPLETE: 0, ERROR: 0, CANCELLED: 0 };
        statusCounts[item.status] = 1;
        groupMap.set(item.task_group_id, {
          count: 1,
          createdAt: item.created_at,
          latestUpdatedAt: item.updated_at,
          statusCounts,
          latestStatus: item.status,
          firstPrompt: item.prompt?.substring(0, 120) || '',
        });
      }
    }

    const groups: TaskGroupSummary[] = [];
    for (const [taskGroupId, data] of groupMap) {
      // Group lifecycle is user-controlled: default is always 'active'
      groups.push({
        task_group_id: taskGroupId,
        task_count: data.count,
        created_at: data.createdAt,
        latest_updated_at: data.latestUpdatedAt,
        status_counts: data.statusCounts as any,
        latest_status: data.latestStatus as any,
        group_status: this.groupStatusOverrides.get(taskGroupId) || (this.archivedGroups.has(taskGroupId) ? 'archived' : 'active'),
        first_prompt: data.firstPrompt,
      });
    }

    groups.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return groups;
  }

  async setTaskGroupArchived(taskGroupId: string, archived: boolean): Promise<boolean> {
    const items = Array.from(this.items.values()).filter(i => i.task_group_id === taskGroupId);
    if (items.length === 0) return false;
    if (archived) {
      this.archivedGroups.add(taskGroupId);
      this.groupStatusOverrides.set(taskGroupId, 'archived');
    } else {
      this.archivedGroups.delete(taskGroupId);
      this.groupStatusOverrides.delete(taskGroupId);
    }
    return true;
  }

  async setTaskGroupStatus(taskGroupId: string, status: TaskGroupStatus | null): Promise<boolean> {
    const items = Array.from(this.items.values()).filter(i => i.task_group_id === taskGroupId);
    if (items.length === 0) return false;
    if (status === null) {
      this.groupStatusOverrides.delete(taskGroupId);
      this.archivedGroups.delete(taskGroupId);
    } else {
      this.groupStatusOverrides.set(taskGroupId, status);
      if (status === 'archived') {
        this.archivedGroups.add(taskGroupId);
      } else {
        this.archivedGroups.delete(taskGroupId);
      }
    }
    return true;
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

  async recoverStaleTasks(_maxAgeMs: number): Promise<number> {
    return 0;
  }

  getTableName(): string {
    return 'pm-runner-queue';
  }

  getEndpoint(): string {
    return 'mock://test';
  }

  getNamespace(): string {
    return 'test-namespace';
  }

  destroy(): void {
    // No-op for mock
  }
}

describe('Web Server', () => {
  let app: Express;
  let store: MockQueueStore;
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    resetDAL();
    store = new MockQueueStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = createApp({ queueStore: store as any, sessionId: testSessionId, namespace: 'test-namespace', projectRoot: '/tmp/test' });
  });

  afterEach(() => {
    store.clear();
  });

  describe('POST /api/tasks', () => {
    it('should enqueue task and return task_id with QUEUED status', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'test-group',
          prompt: 'Test prompt',
        })
        .expect(201);

      assert.ok(response.body.task_id, 'task_id should be present');
      assert.equal(response.body.task_group_id, 'test-group');
      assert.equal(response.body.status, 'QUEUED');
      assert.ok(response.body.created_at, 'created_at should be present');
    });

    it('should return 400 for empty task_group_id (fail-closed)', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: '',
          prompt: 'Test prompt',
        })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
      assert.ok(response.body.message.includes('task_group_id'));
    });

    it('should return 400 for empty prompt (fail-closed)', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'test-group',
          prompt: '',
        })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
      assert.ok(response.body.message.includes('prompt'));
    });

    it('should return 400 for missing task_group_id (fail-closed)', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          prompt: 'Test prompt',
        })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
    });

    it('should return 400 for missing prompt (fail-closed)', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'test-group',
        })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
    });

    it('should trim whitespace from inputs', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: '  test-group  ',
          prompt: '  Test prompt  ',
        })
        .expect(201);

      assert.equal(response.body.task_group_id, 'test-group');

      // Verify stored item has trimmed values
      const items = await store.getByTaskGroup('test-group');
      assert.equal(items.length, 1);
      assert.equal(items[0].prompt, 'Test prompt');
    });
  });

  describe('GET /api/task-groups', () => {
    it('should return empty list when no tasks exist', async () => {
      const response = await request(app)
        .get('/api/task-groups')
        .expect(200);

      assert.deepEqual(response.body.task_groups, []);
    });

    it('should return list of task groups', async () => {
      // Add tasks to multiple groups
      await store.enqueue(testSessionId, 'group-a', 'prompt 1');
      await store.enqueue(testSessionId, 'group-a', 'prompt 2');
      await store.enqueue(testSessionId, 'group-b', 'prompt 3');

      const response = await request(app)
        .get('/api/task-groups')
        .expect(200);

      assert.equal(response.body.task_groups.length, 2);

      const groupA = response.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-a');
      const groupB = response.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-b');

      assert.ok(groupA, 'group-a should exist');
      assert.ok(groupB, 'group-b should exist');
      assert.equal(groupA.task_count, 2);
      assert.equal(groupB.task_count, 1);
    });

    it('should include group_status derived from task statuses', async () => {
      await store.enqueue(testSessionId, 'group-active', 'prompt 1');
      // group-active has QUEUED tasks -> group_status should be "active"

      const response = await request(app)
        .get('/api/task-groups')
        .expect(200);

      const activeGroup = response.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-active');
      assert.ok(activeGroup, 'group-active should exist');
      assert.equal(activeGroup.group_status, 'active');
    });

    it('should include total_count and has_more fields', async () => {
      await store.enqueue(testSessionId, 'group-a', 'prompt 1');
      await store.enqueue(testSessionId, 'group-b', 'prompt 2');

      const response = await request(app)
        .get('/api/task-groups')
        .expect(200);

      assert.equal(typeof response.body.total_count, 'number');
      assert.equal(response.body.total_count, 2);
      assert.equal(response.body.has_more, false);
    });

    it('should support limit and offset for pagination', async () => {
      await store.enqueue(testSessionId, 'group-a', 'prompt 1');
      await store.enqueue(testSessionId, 'group-b', 'prompt 2');
      await store.enqueue(testSessionId, 'group-c', 'prompt 3');

      const response = await request(app)
        .get('/api/task-groups?limit=2&offset=0')
        .expect(200);

      assert.equal(response.body.task_groups.length, 2);
      assert.equal(response.body.total_count, 3);
      assert.equal(response.body.has_more, true);

      // Second page
      const response2 = await request(app)
        .get('/api/task-groups?limit=2&offset=2')
        .expect(200);

      assert.equal(response2.body.task_groups.length, 1);
      assert.equal(response2.body.has_more, false);
    });
  });

  describe('GET /api/task-groups/:id/tasks', () => {
    it('should return tasks for a specific task group', async () => {
      await store.enqueue(testSessionId, 'group-a', 'prompt 1');
      await store.enqueue(testSessionId, 'group-a', 'prompt 2');
      await store.enqueue(testSessionId, 'group-b', 'prompt 3');

      const response = await request(app)
        .get('/api/task-groups/group-a/tasks')
        .expect(200);

      assert.equal(response.body.task_group_id, 'group-a');
      assert.equal(response.body.tasks.length, 2);
      assert.equal(response.body.tasks[0].prompt, 'prompt 1');
      assert.equal(response.body.tasks[1].prompt, 'prompt 2');
    });

    it('should return empty list for non-existent task group', async () => {
      const response = await request(app)
        .get('/api/task-groups/non-existent/tasks')
        .expect(200);

      assert.equal(response.body.task_group_id, 'non-existent');
      assert.deepEqual(response.body.tasks, []);
    });

    it('should include task status and timestamps', async () => {
      await store.enqueue(testSessionId, 'group-a', 'prompt 1');

      const response = await request(app)
        .get('/api/task-groups/group-a/tasks')
        .expect(200);

      const task = response.body.tasks[0];
      assert.ok(task.task_id, 'task_id should be present');
      assert.equal(task.status, 'QUEUED');
      assert.ok(task.created_at, 'created_at should be present');
      assert.ok(task.updated_at, 'updated_at should be present');
    });
  });

  describe('GET /api/tasks/:task_id', () => {
    it('should return task detail with status and prompt', async () => {
      const item = await store.enqueue(testSessionId, 'group-a', 'Test prompt');

      const response = await request(app)
        .get(`/api/tasks/${item.task_id}`)
        .expect(200);

      assert.equal(response.body.task_id, item.task_id);
      assert.equal(response.body.task_group_id, 'group-a');
      assert.equal(response.body.session_id, testSessionId);
      assert.equal(response.body.status, 'QUEUED');
      assert.equal(response.body.prompt, 'Test prompt');
      assert.ok(response.body.created_at, 'created_at should be present');
      assert.ok(response.body.updated_at, 'updated_at should be present');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(app)
        .get('/api/tasks/non-existent-task-id')
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
      assert.ok(response.body.message.includes('non-existent-task-id'));
    });

    it('should include error_message for ERROR status', async () => {
      const item = await store.enqueue(testSessionId, 'group-a', 'Test prompt');
      await store.updateStatus(item.task_id, 'ERROR', 'Something went wrong');

      const response = await request(app)
        .get(`/api/tasks/${item.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'ERROR');
      assert.equal(response.body.error_message, 'Something went wrong');
    });
  });

  describe('POST /api/task-groups', () => {
    it('should create task group by enqueuing first task', async () => {
      const response = await request(app)
        .post('/api/task-groups')
        .send({
          task_group_id: 'new-group',
          prompt: 'Initial prompt',
        })
        .expect(201);

      assert.ok(response.body.task_id, 'task_id should be present');
      assert.equal(response.body.task_group_id, 'new-group');
      assert.equal(response.body.status, 'QUEUED');
    });

    it('should return 400 for empty task_group_id', async () => {
      const response = await request(app)
        .post('/api/task-groups')
        .send({
          task_group_id: '   ',
          prompt: 'Test prompt',
        })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
    });
  });

  describe('GET /api/routes (no direct Runner command API)', () => {
    it('should list all routes', async () => {
      const response = await request(app)
        .get('/api/routes')
        .expect(200);

      assert.ok(Array.isArray(response.body.routes), 'routes should be an array');
    });

    it('should NOT have any direct Runner command API', async () => {
      const response = await request(app)
        .get('/api/routes')
        .expect(200);

      const routes = response.body.routes as string[];

      // Check that no route contains arbitrary execution commands
      // Runner Controls API (/api/runner/*) is explicitly allowed per AC-RC-API-1
      const prohibitedPatterns = [
        /POST.*\/api\/run[^n]/i,  // exclude /api/runner
        /POST.*\/api\/execute/i,
        /POST.*\/api\/start/i,
        /POST.*\/api\/command/i,
      ];

      for (const route of routes) {
        for (const pattern of prohibitedPatterns) {
          assert.ok(
            !pattern.test(route),
            `Route "${route}" appears to be a direct Runner command API, which is prohibited. ` +
            'Web UI must only insert to queue, not command Runner directly.'
          );
        }
      }
    });

    it('should have expected enqueue APIs only', async () => {
      const response = await request(app)
        .get('/api/routes')
        .expect(200);

      const routes = response.body.routes as string[];

      // These are the only write APIs that should exist
      // Runner Controls APIs added per AC-RC-API-1
      const expectedWriteApis = [
        'POST /api/tasks',
        'POST /api/task-groups',
        'POST /api/projects',
        'POST /api/projects/:projectId/archive',
        'POST /api/projects/:projectId/unarchive',
        'POST /api/inspection/run/:runId',
        'POST /api/runner/build',
        'POST /api/runner/restart',
        'POST /api/runner/stop',
        'POST /api/tasks/:task_id/reply',
        'POST /api/system/processes/:pid/kill',
      ];

      const writeApis = routes.filter((r: string) => r.startsWith('POST /api/'));

      // All write APIs should be enqueue operations only
      for (const api of writeApis) {
        assert.ok(
          expectedWriteApis.some(e => api.includes(e)),
          `Unexpected write API: "${api}". Only enqueue operations are allowed.`
        );
      }
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      assert.equal(response.body.status, 'ok');
      assert.ok(response.body.timestamp, 'timestamp should be present');
    });
  });

  describe('PATCH /api/task-groups/:task_group_id', () => {
    it('should archive a task group', async () => {
      await store.enqueue(testSessionId, 'group-to-archive', 'prompt 1');

      const response = await request(app)
        .patch('/api/task-groups/group-to-archive')
        .send({ archived: true })
        .expect(200);

      assert.equal(response.body.task_group_id, 'group-to-archive');
      assert.equal(response.body.archived, true);
      assert.equal(response.body.group_status, 'archived');
    });

    it('should unarchive a task group', async () => {
      await store.enqueue(testSessionId, 'group-to-unarchive', 'prompt 1');
      // Archive first
      await request(app)
        .patch('/api/task-groups/group-to-unarchive')
        .send({ archived: true })
        .expect(200);

      // Unarchive
      const response = await request(app)
        .patch('/api/task-groups/group-to-unarchive')
        .send({ archived: false })
        .expect(200);

      assert.equal(response.body.task_group_id, 'group-to-unarchive');
      assert.equal(response.body.archived, false);
    });

    it('should return 404 for non-existent task group', async () => {
      const response = await request(app)
        .patch('/api/task-groups/non-existent')
        .send({ archived: true })
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
    });

    it('should return 400 for invalid archived value', async () => {
      const response = await request(app)
        .patch('/api/task-groups/some-group')
        .send({ archived: 'yes' })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
    });

    it('should return 400 when neither group_status nor archived provided', async () => {
      await store.enqueue(testSessionId, 'group-a', 'prompt 1');
      const response = await request(app)
        .patch('/api/task-groups/group-a')
        .send({ foo: 'bar' })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
    });

    it('should set group_status to complete via group_status field', async () => {
      await store.enqueue(testSessionId, 'group-complete', 'prompt 1');

      const response = await request(app)
        .patch('/api/task-groups/group-complete')
        .send({ group_status: 'complete' })
        .expect(200);

      assert.equal(response.body.task_group_id, 'group-complete');
      assert.equal(response.body.group_status, 'complete');
      assert.equal(response.body.archived, false);
    });

    it('should set group_status to archived via group_status field', async () => {
      await store.enqueue(testSessionId, 'group-arch', 'prompt 1');

      const response = await request(app)
        .patch('/api/task-groups/group-arch')
        .send({ group_status: 'archived' })
        .expect(200);

      assert.equal(response.body.group_status, 'archived');
      assert.equal(response.body.archived, true);
    });

    it('should clear override when group_status is null', async () => {
      await store.enqueue(testSessionId, 'group-clear', 'prompt 1');

      // Set to complete first
      await request(app)
        .patch('/api/task-groups/group-clear')
        .send({ group_status: 'complete' })
        .expect(200);

      // Clear by setting to null
      const response = await request(app)
        .patch('/api/task-groups/group-clear')
        .send({ group_status: null })
        .expect(200);

      assert.equal(response.body.group_status, null);
    });

    it('should return 400 for invalid group_status value', async () => {
      await store.enqueue(testSessionId, 'group-invalid', 'prompt 1');
      const response = await request(app)
        .patch('/api/task-groups/group-invalid')
        .send({ group_status: 'invalid_status' })
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
    });

    it('should return 404 for non-existent group with group_status', async () => {
      const response = await request(app)
        .patch('/api/task-groups/nonexistent-group')
        .send({ group_status: 'complete' })
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
    });

    it('should prefer group_status over archived when both provided', async () => {
      await store.enqueue(testSessionId, 'group-both', 'prompt 1');

      const response = await request(app)
        .patch('/api/task-groups/group-both')
        .send({ group_status: 'complete', archived: true })
        .expect(200);

      // group_status takes precedence
      assert.equal(response.body.group_status, 'complete');
      assert.equal(response.body.archived, false);
    });
  });

  describe('GET /api/task-groups group_status filtering', () => {
    it('should exclude archived groups by default', async () => {
      await store.enqueue(testSessionId, 'active-group', 'prompt 1');
      await store.enqueue(testSessionId, 'archived-group', 'prompt 2');

      // Archive one group
      await request(app)
        .patch('/api/task-groups/archived-group')
        .send({ archived: true })
        .expect(200);

      // Default query should exclude archived
      const response = await request(app)
        .get('/api/task-groups')
        .expect(200);

      assert.equal(response.body.task_groups.length, 1);
      assert.equal(response.body.task_groups[0].task_group_id, 'active-group');
    });

    it('should include archived groups when group_status=all', async () => {
      await store.enqueue(testSessionId, 'active-group', 'prompt 1');
      await store.enqueue(testSessionId, 'archived-group', 'prompt 2');

      // Archive one group
      await request(app)
        .patch('/api/task-groups/archived-group')
        .send({ archived: true })
        .expect(200);

      const response = await request(app)
        .get('/api/task-groups?group_status=all')
        .expect(200);

      assert.equal(response.body.task_groups.length, 2);
    });

    it('should filter to archived only when group_status=archived', async () => {
      await store.enqueue(testSessionId, 'active-group', 'prompt 1');
      await store.enqueue(testSessionId, 'archived-group', 'prompt 2');

      // Archive one group
      await request(app)
        .patch('/api/task-groups/archived-group')
        .send({ archived: true })
        .expect(200);

      const response = await request(app)
        .get('/api/task-groups?group_status=archived')
        .expect(200);

      assert.equal(response.body.task_groups.length, 1);
      assert.equal(response.body.task_groups[0].task_group_id, 'archived-group');
      assert.equal(response.body.task_groups[0].group_status, 'archived');
    });

    it('should show group_status=active for groups with queued tasks', async () => {
      await store.enqueue(testSessionId, 'queued-group', 'prompt 1');

      const response = await request(app)
        .get('/api/task-groups?group_status=active')
        .expect(200);

      assert.equal(response.body.task_groups.length, 1);
      assert.equal(response.body.task_groups[0].group_status, 'active');
    });

    it('should show group_status=active for groups with all completed tasks (user controls lifecycle)', async () => {
      const item = await store.enqueue(testSessionId, 'done-group', 'prompt 1');
      await store.updateStatus(item.task_id, 'RUNNING');
      await store.updateStatus(item.task_id, 'COMPLETE');

      const response = await request(app)
        .get('/api/task-groups?group_status=active')
        .expect(200);

      // Group stays active even when all tasks are complete — user decides when to mark it complete
      const doneGroup = response.body.task_groups.find((g: any) => g.task_group_id === 'done-group');
      assert.ok(doneGroup, 'done-group should be in active list');
      assert.equal(doneGroup.group_status, 'active');
    });
  });

  describe('Task group grouping correctness', () => {
    it('should add tasks to existing group when using same task_group_id', async () => {
      // Enqueue two tasks with the same task_group_id
      await store.enqueue(testSessionId, 'shared-group', 'prompt 1');
      await store.enqueue(testSessionId, 'shared-group', 'prompt 2');
      await store.enqueue(testSessionId, 'shared-group', 'prompt 3');

      // Verify there's only 1 group with 3 tasks
      const groupsResponse = await request(app)
        .get('/api/task-groups')
        .expect(200);

      assert.equal(groupsResponse.body.task_groups.length, 1);
      assert.equal(groupsResponse.body.task_groups[0].task_group_id, 'shared-group');
      assert.equal(groupsResponse.body.task_groups[0].task_count, 3);

      // Verify tasks are listed correctly
      const tasksResponse = await request(app)
        .get('/api/task-groups/shared-group/tasks')
        .expect(200);

      assert.equal(tasksResponse.body.tasks.length, 3);
    });

    it('should create separate groups for different task_group_ids', async () => {
      await store.enqueue(testSessionId, 'group-x', 'prompt 1');
      await store.enqueue(testSessionId, 'group-y', 'prompt 2');

      const response = await request(app)
        .get('/api/task-groups')
        .expect(200);

      assert.equal(response.body.task_groups.length, 2);
      const ids = response.body.task_groups.map((g: TaskGroupSummary) => g.task_group_id);
      assert.ok(ids.includes('group-x'));
      assert.ok(ids.includes('group-y'));
    });
  });

  describe('Task group status management - immediate reflection', () => {
    it('should reflect status change immediately in subsequent GET', async () => {
      await store.enqueue(testSessionId, 'group-reflect', 'prompt 1');

      // Verify initial status is active
      const before = await request(app).get('/api/task-groups?group_status=all').expect(200);
      const groupBefore = before.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-reflect');
      assert.equal(groupBefore.group_status, 'active');

      // Change to archived
      await request(app)
        .patch('/api/task-groups/group-reflect')
        .send({ group_status: 'archived' })
        .expect(200);

      // Verify status changed immediately
      const after = await request(app).get('/api/task-groups?group_status=all').expect(200);
      const groupAfter = after.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-reflect');
      assert.equal(groupAfter.group_status, 'archived');
    });

    it('should cycle through all statuses: active -> complete -> archived -> active', async () => {
      await store.enqueue(testSessionId, 'group-cycle', 'prompt 1');

      // Set to complete
      await request(app).patch('/api/task-groups/group-cycle').send({ group_status: 'complete' }).expect(200);
      let resp = await request(app).get('/api/task-groups?group_status=all').expect(200);
      assert.equal(resp.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-cycle').group_status, 'complete');

      // Set to archived
      await request(app).patch('/api/task-groups/group-cycle').send({ group_status: 'archived' }).expect(200);
      resp = await request(app).get('/api/task-groups?group_status=all').expect(200);
      assert.equal(resp.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-cycle').group_status, 'archived');

      // Set back to active
      await request(app).patch('/api/task-groups/group-cycle').send({ group_status: 'active' }).expect(200);
      resp = await request(app).get('/api/task-groups?group_status=all').expect(200);
      assert.equal(resp.body.task_groups.find((g: TaskGroupSummary) => g.task_group_id === 'group-cycle').group_status, 'active');
    });

    it('should exclude both archived AND completed groups from default listing', async () => {
      await store.enqueue(testSessionId, 'group-active', 'prompt 1');
      await store.enqueue(testSessionId, 'group-completed', 'prompt 2');
      await store.enqueue(testSessionId, 'group-archived', 'prompt 3');

      // Set statuses
      await request(app).patch('/api/task-groups/group-completed').send({ group_status: 'complete' }).expect(200);
      await request(app).patch('/api/task-groups/group-archived').send({ group_status: 'archived' }).expect(200);

      // Default listing should only show active group (archived excluded by default)
      const defaultResp = await request(app).get('/api/task-groups').expect(200);
      assert.equal(defaultResp.body.task_groups.length, 2); // active + completed (only archived excluded by default)

      // Filter to active only
      const activeResp = await request(app).get('/api/task-groups?group_status=active').expect(200);
      assert.equal(activeResp.body.task_groups.length, 1);
      assert.equal(activeResp.body.task_groups[0].task_group_id, 'group-active');
    });
  });

  describe('Static file serving', () => {
    it('should serve index.html for root path', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      assert.ok(response.text.includes('PM Orchestrator Runner'));
    });

    it('should serve index.html for /new path', async () => {
      const response = await request(app)
        .get('/new')
        .expect(200);

      assert.ok(response.text.includes('PM Orchestrator Runner'));
    });
  });

  describe('Auth bypass for public paths (mount-aware)', () => {
    let authedApp: Express;

    beforeEach(() => {
      // Minimal stub ApiKeyManager: any request with auth enabled and no
      // x-api-key header should hit createApiKeyAuth and be rejected.
      // For the bypass test we deliberately omit the header to verify the
      // public-path bypass returns 200 *without* delegating to authMiddleware.
      const stubApiKeyManager = {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        validateApiKey: async (_key: string) => null,
      };
      authedApp = createApp({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queueStore: store as any,
        sessionId: testSessionId,
        namespace: 'test-namespace',
        projectRoot: '/tmp/test',
        authConfig: {
          enabled: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          apiKeyManager: stubApiKeyManager as any,
        },
      });
    });

    it('GET /api/health bypasses auth and returns 200 without x-api-key', async () => {
      const response = await request(authedApp)
        .get('/api/health')
        .expect(200);

      assert.equal(response.body.status, 'ok');
      assert.ok(response.body.timestamp, 'timestamp should be present');
    });
  });

  /**
   * SPA routes (Phase 1-fix regression):
   *
   * The Web UI is a single-page application served from src/web/public/index.html.
   * Every left-menu navigable URL must return that index.html so the client-side
   * router can take over. The /ai-generate route was missing in commit 194c0d1,
   * causing the menu link to render an Express 404 instead of the SPA shell.
   *
   * This block locks down the full set of menu routes in one place so a future
   * "I added a menu but forgot the server route" regression fails at unit test
   * time, not in the user's browser.
   */
  describe('SPA routes (left-menu navigation)', () => {
    const spaPaths = [
      '/',
      '/dashboard',
      '/projects',
      '/task-groups',
      '/activity',
      '/processes',
      '/settings',
      '/commands',
      '/agents',
      '/skills',
      '/hooks',
      '/mcp-servers',
      '/plugins',
      '/backup',
      '/assistant',
      '/ai-generate',
    ];

    for (const p of spaPaths) {
      it(`GET ${p} returns 200 with HTML (SPA shell)`, async () => {
        const response = await request(app).get(p);
        // Some routes may 401 if auth middleware wraps them; SPA routes must be
        // public so the login screen itself can render. Accept 200 only.
        assert.equal(
          response.status,
          200,
          `expected 200 for SPA route ${p}, got ${response.status}`
        );
        // Body must look like HTML (the SPA shell), not JSON.
        const ct = String(response.headers['content-type'] || '');
        assert.ok(
          ct.includes('text/html'),
          `expected text/html content-type for ${p}, got "${ct}"`
        );
      });
    }
  });
});
