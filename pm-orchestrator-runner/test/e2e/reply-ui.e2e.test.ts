/**
 * E2E Test: Reply UI
 *
 * Tests:
 * - AC-CHAT-2: Questions = AWAITING_RESPONSE (not COMPLETE)
 * - AC-CHAT-3: Reply textarea for AWAITING_RESPONSE tasks
 * - AC-INPUT-1: Textarea multiline support
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: Reply UI (AC-CHAT-2, AC-CHAT-3, AC-INPUT-1)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  const namespace = 'reply-ui-test';
  const sessionId = 'session-reply-001';

  before(async () => {
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
    });
  });

  describe('AC-CHAT-3: Reply UI for AWAITING_RESPONSE', () => {
    let taskId: string;

    before(async () => {
      // Create a task
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'reply-test-group',
          prompt: 'Test task for reply',
        })
        .expect(201);

      taskId = res.body.task_id;

      // First transition to RUNNING (required before AWAITING_RESPONSE)
      await queueStore.updateStatus(taskId, 'RUNNING');

      // Then set to AWAITING_RESPONSE with clarification
      await queueStore.setAwaitingResponse(
        taskId,
        { question: 'What do you prefer?', type: 'unknown', options: ['Option A', 'Option B'] },
        undefined,
        'Question: What do you prefer?'
      );
    });

    it('should return show_reply_ui: true for AWAITING_RESPONSE task', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.equal(res.body.status, 'AWAITING_RESPONSE');
      assert.equal(res.body.show_reply_ui, true, 'show_reply_ui should be true');
    });

    it('should return show_reply_ui: false for non-AWAITING_RESPONSE task', async () => {
      // Create another task and keep it QUEUED
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'reply-test-group-2',
          prompt: 'Another test task',
        })
        .expect(201);

      const detailRes = await request(app)
        .get(`/api/tasks/${res.body.task_id}`)
        .expect(200);

      assert.equal(detailRes.body.status, 'QUEUED');
      assert.equal(detailRes.body.show_reply_ui, false, 'show_reply_ui should be false for QUEUED');
    });
  });

  describe('POST /api/tasks/:task_id/reply', () => {
    let taskId: string;

    beforeEach(async () => {
      // Create a fresh task for each test
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: `reply-post-test-${Date.now()}`,
          prompt: 'Test task',
        })
        .expect(201);

      taskId = res.body.task_id;

      // First transition to RUNNING (required before AWAITING_RESPONSE)
      await queueStore.updateStatus(taskId, 'RUNNING');

      // Then set to AWAITING_RESPONSE
      await queueStore.setAwaitingResponse(
        taskId,
        { question: 'Please clarify', type: 'unknown' },
        undefined,
        'Please clarify'
      );
    });

    it('should accept reply for AWAITING_RESPONSE task', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/reply`)
        .send({ reply: 'My reply text' })
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.task_id, taskId);
      assert.equal(res.body.old_status, 'AWAITING_RESPONSE');
      // Status should change to RUNNING or QUEUED for re-processing
      assert.ok(['RUNNING', 'QUEUED'].includes(res.body.new_status),
        `Expected RUNNING or QUEUED, got ${res.body.new_status}`);
    });

    it('should reject empty reply', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/reply`)
        .send({ reply: '' })
        .expect(400);

      assert.equal(res.body.error, 'INVALID_INPUT');
    });

    it('should reject reply for non-AWAITING_RESPONSE task', async () => {
      // Create a QUEUED task
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: `reply-reject-test-${Date.now()}`,
          prompt: 'Test task',
        })
        .expect(201);

      const res = await request(app)
        .post(`/api/tasks/${createRes.body.task_id}/reply`)
        .send({ reply: 'Should be rejected' })
        .expect(409);

      assert.equal(res.body.error, 'INVALID_STATUS');
    });

    it('should accept multiline reply (AC-INPUT-1)', async () => {
      const multilineReply = 'Line 1\nLine 2\nLine 3';
      const res = await request(app)
        .post(`/api/tasks/${taskId}/reply`)
        .send({ reply: multilineReply })
        .expect(200);

      assert.equal(res.body.success, true);
    });
  });

  describe('Reply flow integration', () => {
    it('should complete the reply flow: AWAITING_RESPONSE -> reply -> RUNNING', async () => {
      // 1. Create task
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: `reply-flow-${Date.now()}`,
          prompt: 'Integration test task',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // 2. First transition to RUNNING (required before AWAITING_RESPONSE)
      await queueStore.updateStatus(taskId, 'RUNNING');

      // 3. Set to AWAITING_RESPONSE
      await queueStore.setAwaitingResponse(
        taskId,
        { question: 'What is your preference?', type: 'unknown', options: ['A', 'B'] },
        undefined,
        'What is your preference?'
      );

      // 3. Verify show_reply_ui
      const detailRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.equal(detailRes.body.show_reply_ui, true);

      // 4. Submit reply
      const replyRes = await request(app)
        .post(`/api/tasks/${taskId}/reply`)
        .send({ reply: 'I choose option A' })
        .expect(200);

      assert.equal(replyRes.body.success, true);
      assert.equal(replyRes.body.old_status, 'AWAITING_RESPONSE');

      // 5. Verify task is no longer AWAITING_RESPONSE
      const afterReplyRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.notEqual(afterReplyRes.body.status, 'AWAITING_RESPONSE');
      assert.equal(afterReplyRes.body.show_reply_ui, false);
    });
  });
});
