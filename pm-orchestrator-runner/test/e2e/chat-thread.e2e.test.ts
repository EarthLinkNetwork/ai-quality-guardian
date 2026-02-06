/**
 * E2E Test: Chat Thread Behavior
 *
 * Tests AC-CHAT-1: 1 thread = 1 taskGroupId (fixed)
 * - Consecutive posts within a thread ADD tasks to the same taskGroupId
 * - New posts MUST NOT create new taskGroupId within the same thread
 */

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: Chat Thread Behavior (AC-CHAT-1)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  const namespace = 'chat-thread-test';
  const sessionId = 'session-chat-thread-001';

  before(async () => {
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
    });
  });

  describe('AC-CHAT-1: Thread = TaskGroup Invariant', () => {
    const threadId = 'thread-001';

    it('should create first task with taskGroupId = threadId', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: threadId,
          prompt: 'First message in thread',
        })
        .expect(201);

      assert.equal(res.body.task_group_id, threadId);
      assert.ok(res.body.task_id);
    });

    it('should add second task to same taskGroupId', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: threadId,
          prompt: 'Second message in same thread',
        })
        .expect(201);

      assert.equal(res.body.task_group_id, threadId, 'Second task should have same taskGroupId');
    });

    it('should add third task to same taskGroupId', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: threadId,
          prompt: 'Third message in same thread',
        })
        .expect(201);

      assert.equal(res.body.task_group_id, threadId, 'Third task should have same taskGroupId');
    });

    it('should have exactly 3 tasks in the thread', async () => {
      const res = await request(app)
        .get(`/api/task-groups/${threadId}/tasks`)
        .expect(200);

      assert.equal(res.body.tasks.length, 3, 'Thread should have exactly 3 tasks');

      // Verify all tasks belong to same taskGroupId
      res.body.tasks.forEach((task: { task_group_id: string }) => {
        assert.equal(task.task_group_id, threadId);
      });
    });

    it('should have only one task group for the thread', async () => {
      const res = await request(app)
        .get('/api/task-groups')
        .expect(200);

      const matchingGroups = res.body.task_groups.filter(
        (g: { task_group_id: string }) => g.task_group_id === threadId
      );

      assert.equal(matchingGroups.length, 1, 'Should have exactly one task group for the thread');
    });
  });

  describe('Separate threads remain separate', () => {
    const thread1 = 'separate-thread-1';
    const thread2 = 'separate-thread-2';

    before(async () => {
      // Create tasks in two separate threads
      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: thread1, prompt: 'Thread 1 message' })
        .expect(201);

      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: thread2, prompt: 'Thread 2 message' })
        .expect(201);
    });

    it('should keep thread 1 tasks separate from thread 2', async () => {
      const res1 = await request(app)
        .get(`/api/task-groups/${thread1}/tasks`)
        .expect(200);

      const res2 = await request(app)
        .get(`/api/task-groups/${thread2}/tasks`)
        .expect(200);

      assert.equal(res1.body.tasks.length, 1, 'Thread 1 should have 1 task');
      assert.equal(res2.body.tasks.length, 1, 'Thread 2 should have 1 task');

      // Verify task_group_ids are different
      assert.equal(res1.body.tasks[0].task_group_id, thread1);
      assert.equal(res2.body.tasks[0].task_group_id, thread2);
    });
  });

  describe('Task count increases with consecutive posts', () => {
    const countThread = 'count-thread';
    let initialCount = 0;

    before(async () => {
      // Create initial task
      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: countThread, prompt: 'Initial message' })
        .expect(201);

      const res = await request(app)
        .get(`/api/task-groups/${countThread}/tasks`)
        .expect(200);

      initialCount = res.body.tasks.length;
    });

    it('should increase task count after each post', async () => {
      // Add 3 more tasks
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/tasks')
          .send({ task_group_id: countThread, prompt: `Message ${i}` })
          .expect(201);
      }

      const res = await request(app)
        .get(`/api/task-groups/${countThread}/tasks`)
        .expect(200);

      assert.equal(
        res.body.tasks.length,
        initialCount + 3,
        'Task count should increase by 3 after 3 posts'
      );
    });
  });
});
