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
import { QueueItem, QueueItemStatus, ClaimResult, TaskGroupSummary } from '../../../src/queue';

/**
 * Mock QueueStore for Web Server testing
 */
class MockQueueStore {
  private items: Map<string, QueueItem> = new Map();
  private taskCounter = 0;

  clear(): void {
    this.items.clear();
    this.taskCounter = 0;
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
});
