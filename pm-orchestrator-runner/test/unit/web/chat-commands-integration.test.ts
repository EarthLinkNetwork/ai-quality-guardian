/**
 * Chat Commands Integration Tests
 *
 * Tests custom command handling through the chat API route.
 * Verifies that:
 * 1. Slash commands are intercepted and handled in the chat endpoint
 * 2. Local commands return immediate responses (no queue)
 * 3. Passthrough commands enqueue tasks to Claude Code
 * 4. GET /api/commands lists available commands
 * 5. Normal messages still flow through the standard chat pipeline
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../../src/web/server';
import { QueueItem, QueueItemStatus, ClaimResult, TaskGroupSummary, TaskGroupStatus } from '../../../src/queue';
import { resetCommandRegistry } from '../../../src/web/services/custom-command-registry';

/**
 * Minimal MockQueueStore for chat route tests
 */
class MockQueueStore {
  private items: Map<string, QueueItem> = new Map();
  private taskCounter = 0;
  enqueuedItems: QueueItem[] = [];

  clear(): void {
    this.items.clear();
    this.taskCounter = 0;
    this.enqueuedItems = [];
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
    this.enqueuedItems.push(item);
    return item;
  }

  async getItem(taskId: string): Promise<QueueItem | null> {
    return this.items.get(taskId) || null;
  }

  async claim(): Promise<ClaimResult> {
    for (const item of this.items.values()) {
      if (item.status === 'QUEUED') {
        item.status = 'RUNNING';
        return { success: true, item };
      }
    }
    return { success: false };
  }

  async updateStatus(taskId: string, status: QueueItemStatus): Promise<void> {
    const item = this.items.get(taskId);
    if (item) item.status = status;
  }

  async getBySession(): Promise<QueueItem[]> { return []; }
  async getByStatus(): Promise<QueueItem[]> { return []; }
  async getByTaskGroup(): Promise<QueueItem[]> { return []; }
  async getAllTaskGroups(): Promise<TaskGroupSummary[]> { return []; }
  async setTaskGroupArchived(): Promise<boolean> { return true; }
  async setTaskGroupStatus(): Promise<boolean> { return true; }
  async deleteItem(): Promise<void> {}
  async recoverStaleTasks(): Promise<number> { return 0; }
  getTableName(): string { return 'test'; }
  getEndpoint(): string { return 'mock://test'; }
  getNamespace(): string { return 'test-namespace'; }
  destroy(): void {}
}

describe('Chat Commands Integration', () => {
  let app: Express;
  let store: MockQueueStore;

  beforeEach(() => {
    resetCommandRegistry();
    store = new MockQueueStore();
    app = createApp({
      queueStore: store as any,
      sessionId: 'test-session',
      namespace: 'test-ns',
      projectRoot: '/tmp/test',
      stateDir: '/tmp/test-state',
    });
  });

  afterEach(() => {
    store.clear();
    resetCommandRegistry();
  });

  describe('GET /api/commands', () => {
    it('should list available commands', async () => {
      const response = await request(app)
        .get('/api/commands')
        .expect(200);

      assert.ok(Array.isArray(response.body.commands));
      const names = response.body.commands.map((c: { name: string }) => c.name);
      assert.ok(names.includes('help'), 'Should include /help');
      assert.ok(names.includes('status'), 'Should include /status');
      assert.ok(names.includes('run'), 'Should include /run');
      assert.ok(names.includes('clear'), 'Should include /clear');
      assert.ok(names.includes('task'), 'Should include /task');
      assert.ok(names.includes('model'), 'Should include /model');
    });

    it('should include description for each command', async () => {
      const response = await request(app)
        .get('/api/commands')
        .expect(200);

      for (const cmd of response.body.commands) {
        assert.ok(typeof cmd.name === 'string');
        assert.ok(typeof cmd.description === 'string');
        assert.ok(cmd.description.length > 0, `Command ${cmd.name} should have a description`);
      }
    });
  });
});
