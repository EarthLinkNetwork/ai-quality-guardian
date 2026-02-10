/**
 * E2E Tests for Reply API
 * Tests for POST /api/tasks/:task_id/reply
 * Per spec REPLY_PROTOCOL.md
 */

import * as assert from 'assert';
import request from 'supertest';
import express, { Express } from 'express';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { createApp } from '../../src/web/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('E2E: Reply API', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testSessionId = 'reply-api-e2e-test-session';
  const testNamespace = 'reply-api-e2e-test';

  before(() => {
    // Create temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-api-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
  });

  beforeEach(() => {
    // Create fresh queue store for each test
    queueStore = new InMemoryQueueStore({ namespace: testNamespace });

    // Create app with queue store
    app = createApp({
      queueStore: queueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  after(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('POST /api/tasks/:task_id/reply', () => {
    describe('Successful Reply', () => {
      it('should accept reply for AWAITING_RESPONSE task', async () => {
        // Create a task in AWAITING_RESPONSE status
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-1',
          'Original prompt',
          'run-1'
        );

        // Update to AWAITING_RESPONSE
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Please clarify your requirements.');

        // Send reply
        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'I want option A' })
          .expect(200);

        assert.ok(res.body.success, 'Should be successful');
        assert.equal(res.body.task_id, task.task_id);
        assert.equal(res.body.old_status, 'AWAITING_RESPONSE');
        // resumeWithResponse returns QUEUED for poller re-pickup
        assert.equal(res.body.new_status, 'QUEUED');
      });

      it('should trim whitespace from reply', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-2',
          'Original prompt',
          'run-2'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Choose an option.');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: '  Option B  \n' })
          .expect(200);

        assert.ok(res.body.success);
      });

      it('should store reply in conversation history', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-3',
          'Initial task prompt',
          'run-3'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'What format do you prefer?');

        await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'JSON format please' })
          .expect(200);

        // Verify the reply is stored in conversation history
        const updatedTask = await queueStore.getItem(task.task_id);
        assert.ok(updatedTask?.conversation_history, 'Should have conversation history');
        const lastEntry = updatedTask?.conversation_history?.[updatedTask.conversation_history.length - 1];
        assert.equal(lastEntry?.role, 'user', 'Last entry should be user');
        assert.equal(lastEntry?.content, 'JSON format please', 'Reply should be stored');
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 for empty reply', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-4',
          'Test prompt',
          'run-4'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: '' })
          .expect(400);

        assert.equal(res.body.error, 'INVALID_INPUT');
        assert.ok(res.body.message.includes('non-empty string'));
      });

      it('should return 400 for whitespace-only reply', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-5',
          'Test prompt',
          'run-5'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: '   \n\t  ' })
          .expect(400);

        assert.equal(res.body.error, 'INVALID_INPUT');
      });

      it('should return 400 for missing reply field', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-6',
          'Test prompt',
          'run-6'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({})
          .expect(400);

        assert.equal(res.body.error, 'INVALID_INPUT');
      });

      it('should return 400 for non-string reply', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-7',
          'Test prompt',
          'run-7'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 12345 })
          .expect(400);

        assert.equal(res.body.error, 'INVALID_INPUT');
      });
    });

    describe('Task Status Errors', () => {
      it('should return 404 for non-existent task', async () => {
        const res = await request(app)
          .post('/api/tasks/non-existent-task/reply')
          .send({ reply: 'Some reply' })
          .expect(404);

        assert.equal(res.body.error, 'NOT_FOUND');
        assert.ok(res.body.message.includes('not found'));
      });

      it('should return 409 for task not in AWAITING_RESPONSE status (QUEUED)', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-8',
          'Test prompt',
          'run-8'
        );
        // Task is in QUEUED status by default

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'My reply' })
          .expect(409);

        assert.equal(res.body.error, 'INVALID_STATUS');
        assert.ok(res.body.message.includes('QUEUED'));
      });

      it('should return 409 for task in RUNNING status', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-9',
          'Test prompt',
          'run-9'
        );
        await queueStore.updateStatus(task.task_id, 'RUNNING');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'My reply' })
          .expect(409);

        assert.equal(res.body.error, 'INVALID_STATUS');
        assert.ok(res.body.message.includes('RUNNING'));
      });

      it('should return 409 for task in COMPLETE status', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-10',
          'Test prompt',
          'run-10'
        );
        await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, 'Done');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'My reply' })
          .expect(409);

        assert.equal(res.body.error, 'INVALID_STATUS');
        assert.ok(res.body.message.includes('COMPLETE'));
      });

      it('should return 409 for task in ERROR status', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-11',
          'Test prompt',
          'run-11'
        );
        await queueStore.updateStatus(task.task_id, 'ERROR', 'Something failed');

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'My reply' })
          .expect(409);

        assert.equal(res.body.error, 'INVALID_STATUS');
        assert.ok(res.body.message.includes('ERROR'));
      });
    });

    describe('Reply Continuation Flow', () => {
      it('should allow multiple reply rounds', async () => {
        // First round
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-12',
          'Create a report',
          'run-12'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'What format?');

        let res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'PDF format' })
          .expect(200);

        // resumeWithResponse returns QUEUED for poller re-pickup
        assert.equal(res.body.new_status, 'QUEUED');

        // Simulate processing and another question
        // Need to transition through RUNNING first since QUEUED->AWAITING_RESPONSE is not valid
        await queueStore.updateStatus(task.task_id, 'RUNNING');
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Include charts?');

        // Second round
        res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'Yes, include charts' })
          .expect(200);

        assert.ok(res.body.success);
      });

      it('should preserve task context through reply flow', async () => {
        const originalPrompt = 'Analyze the codebase and suggest improvements';
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-13',
          originalPrompt,
          'run-13'
        );

        // Check original prompt is preserved
        let currentTask = await queueStore.getItem(task.task_id);
        assert.equal(currentTask?.prompt, originalPrompt);

        // Set to AWAITING_RESPONSE
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Which files?');

        // Send reply
        await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: 'Focus on src/ directory' })
          .expect(200);

        // Verify original prompt is still preserved
        currentTask = await queueStore.getItem(task.task_id);
        assert.equal(currentTask?.prompt, originalPrompt, 'Original prompt should be preserved');
        // Reply stored in conversation_history
        const lastEntry = currentTask?.conversation_history?.[currentTask.conversation_history.length - 1];
        assert.equal(lastEntry?.content, 'Focus on src/ directory', 'Reply should be in conversation history');
      });
    });

    describe('Free-form Reply (Per REPLY_PROTOCOL.md)', () => {
      it('should accept long free-form text replies', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-14',
          'Help me design an API',
          'run-14'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'Describe requirements');

        const longReply = `
          Here are my requirements:
          1. RESTful API with JSON responses
          2. Authentication using JWT tokens
          3. Rate limiting: 100 requests/minute
          4. Endpoints needed:
             - GET /users
             - POST /users
             - GET /users/:id
             - PUT /users/:id
             - DELETE /users/:id
          5. Include pagination for list endpoints
          6. Use OpenAPI/Swagger documentation
        `;

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: longReply })
          .expect(200);

        assert.ok(res.body.success);

        const updatedTask = await queueStore.getItem(task.task_id);
        const lastEntry = updatedTask?.conversation_history?.[updatedTask.conversation_history.length - 1];
        assert.ok(lastEntry?.content?.includes('RESTful API'));
        assert.ok(lastEntry?.content?.includes('JWT tokens'));
      });

      it('should accept Japanese text in reply', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-15',
          'タスクを作成してください',
          'run-15'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE', undefined, 'どのような形式ですか？');

        const japaneseReply = 'JSON形式でお願いします。配列で複数のタスクを含めてください。';

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: japaneseReply })
          .expect(200);

        assert.ok(res.body.success);

        const updatedTask = await queueStore.getItem(task.task_id);
        const lastEntry = updatedTask?.conversation_history?.[updatedTask.conversation_history.length - 1];
        assert.equal(lastEntry?.content, japaneseReply);
      });

      it('should accept special characters in reply', async () => {
        const task = await queueStore.enqueue(
          testSessionId,
          'test-task-group-16',
          'Process input',
          'run-16'
        );
        await queueStore.updateStatus(task.task_id, 'AWAITING_RESPONSE');

        const specialCharsReply = 'Use regex: /^[a-z0-9_]+$/i and symbols: @#$%^&*()';

        const res = await request(app)
          .post('/api/tasks/' + task.task_id + '/reply')
          .send({ reply: specialCharsReply })
          .expect(200);

        assert.ok(res.body.success);
      });
    });
  });

  describe('Route Registration', () => {
    it('should have reply endpoint in routes list', async () => {
      const res = await request(app)
        .get('/api/routes')
        .expect(200);

      // Routes are returned as string array like 'POST /api/tasks:task_id/reply'
      const hasReplyRoute = res.body.routes.some((r: string) =>
        r.includes('/api/tasks') && r.includes('reply') && r.startsWith('POST')
      );

      assert.ok(hasReplyRoute, 'Reply endpoint should be registered');
    });
  });
});
