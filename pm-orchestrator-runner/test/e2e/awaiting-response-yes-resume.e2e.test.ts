/**
 * E2E Test: AWAITING_RESPONSE YES Resume
 *
 * Per docs/spec/RUNNER_CONTROLS_SELF_UPDATE.md AC-YES-RESUME-1:
 * - POST /api/tasks/:task_id/reply with { reply: "YES" }
 * - Task transitions from AWAITING_RESPONSE to RUNNING
 * - Conversation history includes YES
 * - YES variations: YES, yes, Y, y, etc.
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';

describe('E2E: AWAITING_RESPONSE YES Resume (AC-YES-RESUME-1)', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempStateDir: string;
  const namespace = 'yes-resume-test';
  const sessionId = 'session-yes-001';

  before(async () => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yes-resume-test-'));
  });

  beforeEach(() => {
    // Fresh queue store for each test
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
      projectRoot: process.cwd(),
      stateDir: tempStateDir,
    });
  });

  after(() => {
    if (tempStateDir && fs.existsSync(tempStateDir)) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    }
  });

  describe('YES Reply Acceptance', () => {
    it('should resume task with "YES" reply', async () => {
      // Create and set task to AWAITING_RESPONSE
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-yes-1',
        'Test task',
        'run-1'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      // Send YES
      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'YES' })
        .expect(200);

      assert.ok(res.body.success, 'Reply should succeed');
      assert.strictEqual(res.body.old_status, 'AWAITING_RESPONSE');
      assert.strictEqual(res.body.new_status, 'QUEUED');
    });

    it('should resume task with lowercase "yes" reply', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-yes-2',
        'Test task',
        'run-2'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Proceed?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'yes' })
        .expect(200);

      assert.ok(res.body.success);
      assert.strictEqual(res.body.new_status, 'QUEUED');
    });

    it('should resume task with "Yes" reply', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-yes-3',
        'Test task',
        'run-3'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'Yes' })
        .expect(200);

      assert.ok(res.body.success);
      assert.strictEqual(res.body.new_status, 'QUEUED');
    });

    it('should resume task with "y" reply', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-yes-4',
        'Test task',
        'run-4'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'y' })
        .expect(200);

      assert.ok(res.body.success);
      assert.strictEqual(res.body.new_status, 'QUEUED');
    });

    it('should resume task with "Y" reply', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-yes-5',
        'Test task',
        'run-5'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'Y' })
        .expect(200);

      assert.ok(res.body.success);
      assert.strictEqual(res.body.new_status, 'QUEUED');
    });
  });

  describe('Conversation History', () => {
    it('should add YES to conversation history', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-history-1',
        'Initial prompt',
        'run-h1'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Should I continue?');

      await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'YES' })
        .expect(200);

      const updatedTask = await queueStore.getItem(task.task_id);
      assert.ok(updatedTask?.conversation_history, 'Should have conversation history');

      const lastEntry = updatedTask.conversation_history[updatedTask.conversation_history.length - 1];
      assert.strictEqual(lastEntry.role, 'user');
      assert.strictEqual(lastEntry.content, 'YES');
    });

    it('should preserve existing conversation history when adding YES', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-history-2',
        'Initial prompt',
        'run-h2'
      );

      // First round of clarification - start from QUEUED -> RUNNING -> AWAITING_RESPONSE
      await queueStore.updateStatus(task.task_id, 'RUNNING');
      await queueStore.setAwaitingResponse(
        task.task_id,
        { type: 'unknown', question: 'First question?' },
        [{ role: 'assistant', content: 'First question?', timestamp: new Date().toISOString() }]
      );

      await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'First answer' })
        .expect(200);

      // Task is now in QUEUED - transition to RUNNING first, then AWAITING_RESPONSE
      await queueStore.updateStatus(task.task_id, 'RUNNING');
      const currentTask = await queueStore.getItem(task.task_id);
      const currentHistory = currentTask?.conversation_history || [];

      await queueStore.setAwaitingResponse(
        task.task_id,
        { type: 'unknown', question: 'Continue?' },
        [...currentHistory, { role: 'assistant', content: 'Continue?', timestamp: new Date().toISOString() }]
      );

      await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'YES' })
        .expect(200);

      const finalTask = await queueStore.getItem(task.task_id);
      const history = finalTask?.conversation_history || [];

      // Should have: assistant question, user answer, assistant continue, user YES
      assert.ok(history.length >= 4, 'Should preserve conversation history');

      const lastEntry = history[history.length - 1];
      assert.strictEqual(lastEntry.content, 'YES');
    });
  });

  describe('Status Validation', () => {
    it('should reject YES for task not in AWAITING_RESPONSE', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-status-1',
        'Test task',
        'run-s1'
      );
      // Task is in QUEUED status

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'YES' })
        .expect(409);

      assert.strictEqual(res.body.error, 'INVALID_STATUS');
    });

    it('should reject YES for COMPLETE task', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-status-2',
        'Test task',
        'run-s2'
      );
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, 'Done');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'YES' })
        .expect(409);

      assert.strictEqual(res.body.error, 'INVALID_STATUS');
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .post('/api/tasks/nonexistent-task-id/reply')
        .send({ reply: 'YES' })
        .expect(404);

      assert.strictEqual(res.body.error, 'NOT_FOUND');
    });
  });

  describe('Other Reply Variations', () => {
    it('should accept "OK" as valid reply and resume', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-ok-1',
        'Test task',
        'run-ok1'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'OK' })
        .expect(200);

      // OK is also a valid affirmative reply
      assert.ok(res.body.success);
      assert.strictEqual(res.body.new_status, 'QUEUED');
    });

    it('should accept any non-empty reply as valid', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-custom-1',
        'Test task',
        'run-c1'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'What next?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: 'Please continue with the implementation' })
        .expect(200);

      assert.ok(res.body.success);
      assert.strictEqual(res.body.new_status, 'QUEUED');

      const updatedTask = await queueStore.getItem(task.task_id);
      const lastEntry = updatedTask?.conversation_history?.[updatedTask.conversation_history.length - 1];
      assert.strictEqual(lastEntry?.content, 'Please continue with the implementation');
    });
  });

  describe('Edge Cases', () => {
    it('should handle YES with surrounding whitespace', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-ws-1',
        'Test task',
        'run-ws1'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: '  YES  \n' })
        .expect(200);

      assert.ok(res.body.success);

      // Verify trimmed value is stored
      const updatedTask = await queueStore.getItem(task.task_id);
      const lastEntry = updatedTask?.conversation_history?.[updatedTask.conversation_history.length - 1];
      assert.strictEqual(lastEntry?.content, 'YES');
    });

    it('should reject empty string reply', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-empty-1',
        'Test task',
        'run-e1'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: '' })
        .expect(400);

      assert.strictEqual(res.body.error, 'INVALID_INPUT');
    });

    it('should reject whitespace-only reply', async () => {
      const task = await queueStore.enqueue(
        sessionId,
        'test-group-ws-only-1',
        'Test task',
        'run-wso1'
      );
      await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Continue?');

      const res = await request(app)
        .post(`/api/tasks/${task.task_id}/reply`)
        .send({ reply: '   \n\t   ' })
        .expect(400);

      assert.strictEqual(res.body.error, 'INVALID_INPUT');
    });
  });
});
