/**
 * AC-6: Web UI から命令投入可能
 *
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md AC-6:
 * - Web UI の新規命令投入フォームが動作する
 * - 投入した命令が Queue Store に追加される
 * - Runner が polling して実行する
 *
 * Per spec/19_WEB_UI.md:
 * - REST API for queue operations
 * - POST /api/tasks for task submission
 * - GET /api/task-groups for listing
 * - Web UI does NOT directly command Runner (queue-only)
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { createApp } from '../../src/web/server';
import { QueueStore, QueueItem, QueueItemStatus, TaskGroupSummary, NamespaceSummary, RunnerRecord, StatusUpdateResult } from '../../src/queue';
import express from 'express';
import * as http from 'http';

/**
 * Mock QueueStore for testing Web UI endpoints
 * This avoids dependency on DynamoDB Local
 */
class MockQueueStore {
  private items: Map<string, QueueItem> = new Map();
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  getTableName(): string {
    return 'pm-runner-queue';
  }

  getNamespace(): string {
    return this.namespace;
  }

  getEndpoint(): string {
    return 'mock://test';
  }

  async enqueue(sessionId: string, taskGroupId: string, prompt: string): Promise<QueueItem> {
    const item: QueueItem = {
      namespace: this.namespace,
      task_id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      task_group_id: taskGroupId,
      session_id: sessionId,
      status: 'QUEUED' as QueueItemStatus,
      prompt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.items.set(item.task_id, item);
    return item;
  }

  async getItem(taskId: string, _namespace?: string): Promise<QueueItem | null> {
    return this.items.get(taskId) || null;
  }

  async getAllTaskGroups(_namespace?: string): Promise<TaskGroupSummary[]> {
    const groups = new Map<string, { task_count: number; created_at: string; latest_updated_at: string }>();
    
    for (const item of this.items.values()) {
      if (!groups.has(item.task_group_id)) {
        groups.set(item.task_group_id, {
          task_count: 0,
          created_at: item.created_at,
          latest_updated_at: item.updated_at,
        });
      }
      const group = groups.get(item.task_group_id)!;
      group.task_count++;
      if (item.updated_at > group.latest_updated_at) {
        group.latest_updated_at = item.updated_at;
      }
    }
    
    const result: TaskGroupSummary[] = [];
    for (const [taskGroupId, data] of groups) {
      result.push({
        task_group_id: taskGroupId,
        task_count: data.task_count,
        created_at: data.created_at,
        latest_updated_at: data.latest_updated_at,
      });
    }
    return result;
  }

  async getByTaskGroup(taskGroupId: string, _namespace?: string): Promise<QueueItem[]> {
    return Array.from(this.items.values()).filter(
      item => item.task_group_id === taskGroupId
    );
  }

  async getAllNamespaces(): Promise<NamespaceSummary[]> {
    return [{
      namespace: this.namespace,
      task_count: this.items.size,
      runner_count: 0,
      active_runner_count: 0,
    }];
  }

  async getRunnersWithStatus(_timeoutMs: number, _namespace?: string): Promise<Array<RunnerRecord & { isAlive: boolean }>> {
    return [];
  }

  async updateStatusWithValidation(taskId: string, newStatus: QueueItemStatus): Promise<StatusUpdateResult> {
    const item = this.items.get(taskId);
    if (!item) {
      return { success: false, task_id: taskId, error: 'Task not found', message: 'Task not found: ' + taskId };
    }
    
    // Simple validation: QUEUED can go to CANCELLED or RUNNING
    const validTransitions: Record<string, string[]> = {
      QUEUED: ['RUNNING', 'CANCELLED'],
      RUNNING: ['COMPLETE', 'ERROR', 'CANCELLED'],
      COMPLETE: [],
      ERROR: [],
      CANCELLED: [],
    };
    
    if (!validTransitions[item.status].includes(newStatus)) {
      return {
        success: false,
        task_id: taskId,
        error: 'Invalid status transition',
        message: 'Cannot transition from ' + item.status + ' to ' + newStatus,
      };
    }
    
    const oldStatus = item.status;
    item.status = newStatus;
    item.updated_at = new Date().toISOString();
    
    return {
      success: true,
      task_id: taskId,
      old_status: oldStatus,
      new_status: newStatus,
    };
  }
}

// Test helper to make HTTP requests
async function makeRequest(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      const port = address.port;
      
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          server.close();
          try {
            resolve({
              status: res.statusCode || 500,
              data: data ? JSON.parse(data) : null,
            });
          } catch {
            resolve({
              status: res.statusCode || 500,
              data: data,
            });
          }
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

describe('AC-6: Web UI から命令投入可能', () => {
  let mockQueueStore: MockQueueStore;
  let app: express.Express;

  beforeEach(async () => {
    // Create mock QueueStore
    mockQueueStore = new MockQueueStore('test-namespace');

    // Create Express app with mock store (cast to QueueStore)
    app = createApp({
      queueStore: mockQueueStore as unknown as QueueStore,
      sessionId: 'test-session',
      namespace: 'test-namespace',
      projectRoot: '/tmp/test-project',
    });
  });

  describe('POST /api/tasks - 命令投入', () => {
    it('新しいタスクを投入できる', async () => {
      const response = await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'test-group-1',
        prompt: 'hello world',
      });

      assert.strictEqual(response.status, 201, 'Should return 201 Created');
      
      const data = response.data as {
        task_id: string;
        task_group_id: string;
        namespace: string;
        status: string;
        created_at: string;
      };
      
      assert.ok(data.task_id, 'Should return task_id');
      assert.strictEqual(data.task_group_id, 'test-group-1');
      assert.strictEqual(data.namespace, 'test-namespace');
      assert.strictEqual(data.status, 'QUEUED');
      assert.ok(data.created_at);
    });

    it('task_group_id が必須', async () => {
      const response = await makeRequest(app, 'POST', '/api/tasks', {
        prompt: 'missing task_group_id',
      });

      assert.strictEqual(response.status, 400);
      const data = response.data as { error: string };
      assert.strictEqual(data.error, 'INVALID_INPUT');
    });

    it('prompt が必須', async () => {
      const response = await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'test-group',
      });

      assert.strictEqual(response.status, 400);
      const data = response.data as { error: string };
      assert.strictEqual(data.error, 'INVALID_INPUT');
    });

    it('空の prompt は拒否される', async () => {
      const response = await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'test-group',
        prompt: '   ',
      });

      assert.strictEqual(response.status, 400);
    });
  });

  describe('POST /api/task-groups - Task Group 作成', () => {
    it('新しい Task Group を作成できる', async () => {
      const response = await makeRequest(app, 'POST', '/api/task-groups', {
        task_group_id: 'new-group-1',
        prompt: 'First task in new group',
      });

      assert.strictEqual(response.status, 201);
      
      const data = response.data as {
        task_id: string;
        task_group_id: string;
        status: string;
      };
      
      assert.ok(data.task_id);
      assert.strictEqual(data.task_group_id, 'new-group-1');
      assert.strictEqual(data.status, 'QUEUED');
    });
  });

  describe('GET /api/task-groups - Task Group 一覧', () => {
    it('Task Group 一覧を取得できる', async () => {
      // まずタスクを作成
      await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'group-1',
        prompt: 'Task 1',
      });
      await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'group-1',
        prompt: 'Task 2',
      });

      const response = await makeRequest(app, 'GET', '/api/task-groups');

      assert.strictEqual(response.status, 200);
      
      const data = response.data as {
        namespace: string;
        task_groups: Array<{
          task_group_id: string;
          task_count: number;
        }>;
      };
      
      assert.strictEqual(data.namespace, 'test-namespace');
      assert.ok(Array.isArray(data.task_groups));
    });
  });

  describe('GET /api/tasks/:task_id - タスク詳細', () => {
    it('タスク詳細を取得できる', async () => {
      // タスクを作成
      const createResponse = await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'detail-test-group',
        prompt: 'Test task for detail',
      });
      
      const createData = createResponse.data as { task_id: string };
      const taskId = createData.task_id;

      // 詳細を取得
      const response = await makeRequest(app, 'GET', '/api/tasks/' + taskId);

      assert.strictEqual(response.status, 200);
      
      const data = response.data as {
        task_id: string;
        prompt: string;
        status: string;
      };
      
      assert.strictEqual(data.task_id, taskId);
      assert.strictEqual(data.prompt, 'Test task for detail');
      assert.strictEqual(data.status, 'QUEUED');
    });

    it('存在しないタスクは 404', async () => {
      const response = await makeRequest(app, 'GET', '/api/tasks/non-existent-task');

      assert.strictEqual(response.status, 404);
      const data = response.data as { error: string };
      assert.strictEqual(data.error, 'NOT_FOUND');
    });
  });

  describe('PATCH /api/tasks/:task_id/status - 状態変更', () => {
    it('タスクをキャンセルできる', async () => {
      // タスクを作成
      const createResponse = await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'cancel-test-group',
        prompt: 'Task to cancel',
      });
      
      const createData = createResponse.data as { task_id: string };
      const taskId = createData.task_id;

      // キャンセル
      const response = await makeRequest(
        app,
        'PATCH',
        '/api/tasks/' + taskId + '/status',
        { status: 'CANCELLED' }
      );

      assert.strictEqual(response.status, 200);
      
      const data = response.data as {
        success: boolean;
        old_status: string;
        new_status: string;
      };
      
      assert.ok(data.success);
      assert.strictEqual(data.old_status, 'QUEUED');
      assert.strictEqual(data.new_status, 'CANCELLED');
    });

    it('不正な状態遷移は拒否される', async () => {
      // タスクを作成
      const createResponse = await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'invalid-transition-group',
        prompt: 'Task for invalid transition',
      });
      
      const createData = createResponse.data as { task_id: string };
      const taskId = createData.task_id;

      // QUEUED -> COMPLETE は不正（RUNNING を経由すべき）
      const response = await makeRequest(
        app,
        'PATCH',
        '/api/tasks/' + taskId + '/status',
        { status: 'COMPLETE' }
      );

      assert.strictEqual(response.status, 400);
    });
  });

  describe('GET /api/health - ヘルスチェック', () => {
    it('ヘルスチェックが動作する', async () => {
      const response = await makeRequest(app, 'GET', '/api/health');

      assert.strictEqual(response.status, 200);

      const data = response.data as {
        status: string;
        timestamp: string;
        namespace: string;
        queue_store: {
          type: string;
          endpoint: string;
          table_name: string;
        };
      };

      assert.strictEqual(data.status, 'ok');
      assert.ok(data.timestamp, 'timestamp should be present');
      assert.strictEqual(data.namespace, 'test-namespace');
      assert.strictEqual(data.queue_store.table_name, 'pm-runner-queue');
    });
  });

  describe('GET /api/namespaces - Namespace 一覧', () => {
    it('Namespace 一覧を取得できる', async () => {
      const response = await makeRequest(app, 'GET', '/api/namespaces');

      assert.strictEqual(response.status, 200);
      
      const data = response.data as {
        namespaces: unknown[];
        current_namespace: string;
      };
      
      assert.ok(Array.isArray(data.namespaces));
      assert.strictEqual(data.current_namespace, 'test-namespace');
    });
  });

  describe('GET /api/runners - Runner 状態', () => {
    it('Runner 状態を取得できる', async () => {
      const response = await makeRequest(app, 'GET', '/api/runners');

      assert.strictEqual(response.status, 200);
      
      const data = response.data as {
        namespace: string;
        runners: unknown[];
      };
      
      assert.strictEqual(data.namespace, 'test-namespace');
      assert.ok(Array.isArray(data.runners));
    });
  });

  describe('Queue Store 連携', () => {
    it('投入したタスクが Queue Store に追加される', async () => {
      // タスクを投入
      const createResponse = await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'queue-test-group',
        prompt: 'Task for queue verification',
      });
      
      const createData = createResponse.data as { task_id: string };
      const taskId = createData.task_id;

      // Queue Store から直接取得（モックから）
      const item = await mockQueueStore.getItem(taskId);

      assert.ok(item, 'Task should be in Queue Store');
      assert.strictEqual(item.task_id, taskId);
      assert.strictEqual(item.prompt, 'Task for queue verification');
      assert.strictEqual(item.status, 'QUEUED');
    });

    it('複数タスクを投入して一覧取得', async () => {
      // 複数タスクを投入
      await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'multi-task-group',
        prompt: 'Task 1',
      });
      await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'multi-task-group',
        prompt: 'Task 2',
      });
      await makeRequest(app, 'POST', '/api/tasks', {
        task_group_id: 'multi-task-group',
        prompt: 'Task 3',
      });

      // Task Group のタスク一覧を取得
      const response = await makeRequest(
        app,
        'GET',
        '/api/task-groups/multi-task-group/tasks'
      );

      assert.strictEqual(response.status, 200);
      
      const data = response.data as {
        task_group_id: string;
        tasks: Array<{ prompt: string }>;
      };
      
      assert.strictEqual(data.task_group_id, 'multi-task-group');
      assert.strictEqual(data.tasks.length, 3);
    });
  });
});
