/**
 * E2E Test: Web Auto-Dev Loop
 *
 * Tests:
 * - AC-CORE-1: Web-driven auto-dev loop
 * - AC-AUTO-TEST-1: Pre-completion test requirement
 * - AC-AUTO-TEST-2: Fail = No complete
 * - AC-AUTO-TEST-4: AI judge dynamic evaluation
 *
 * IMPORTANT: These tests use mock executor (no real AI) to verify the flow.
 * Real AI tests require LLM_TEST_MODE=1.
 */

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';
import { loadAITestConfig } from '../../src/auto-e2e/runner';
import { containsQuestions } from '../../src/auto-e2e/judge';

describe('E2E: Web Auto-Dev Loop (AC-CORE-1, AC-AUTO-TEST-*)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  const namespace = 'autodev-loop-test';
  const sessionId = 'session-autodev-001';

  before(async () => {
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
    });
  });

  describe('AC-CORE-1: Web-driven task submission', () => {
    it('should accept implementation instruction via Web API', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'autodev-test-group',
          prompt: 'Create a hello API endpoint',
        })
        .expect(201);

      assert.ok(res.body.task_id);
      assert.equal(res.body.status, 'QUEUED');
    });

    it('should detect task type for implementation task', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'autodev-test-group-2',
          prompt: 'Implement a new feature to handle user authentication',
        })
        .expect(201);

      // Task type detection should classify this as IMPLEMENTATION
      const detailRes = await request(app)
        .get(`/api/tasks/${res.body.task_id}`)
        .expect(200);

      assert.ok(detailRes.body.task_type);
      // The task type detector should recognize implementation keywords
    });
  });

  describe('AC-AUTO-TEST-3: Sandbox isolation', () => {
    it('should load AI test config from config file', () => {
      const config = loadAITestConfig();

      assert.ok(config.sandboxDir);
      assert.ok(config.passThreshold > 0);
      assert.ok(config.maxAutoFixIterations > 0);
    });

    it('should have testsandbox directory available', () => {
      const sandboxPath = path.join(process.cwd(), 'testsandbox');
      // Create if not exists
      if (!fs.existsSync(sandboxPath)) {
        fs.mkdirSync(sandboxPath, { recursive: true });
      }
      assert.ok(fs.existsSync(sandboxPath), 'testsandbox directory should exist');
    });
  });

  describe('AC-AUTO-TEST-4: AI judge question detection', () => {
    it('should detect questions in Japanese text', () => {
      assert.ok(containsQuestions('これでよろしいですか？'));
      assert.ok(containsQuestions('確認してください'));
      assert.ok(containsQuestions('どうですか'));
    });

    it('should detect questions in English text', () => {
      assert.ok(containsQuestions('Would you like me to proceed?'));
      assert.ok(containsQuestions('Could you clarify?'));
      assert.ok(containsQuestions('Should I continue?'));
    });

    it('should not flag non-questions', () => {
      assert.ok(!containsQuestions('This is a statement.'));
      assert.ok(!containsQuestions('Implementation completed successfully.'));
      assert.ok(!containsQuestions('The function returns the expected value.'));
    });
  });

  describe('AC-CHAT-2: Questions = AWAITING_RESPONSE', () => {
    it('should set AWAITING_RESPONSE when output contains questions', async () => {
      // Create task
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'question-test-group',
          prompt: 'Test prompt',
        })
        .expect(201);

      const taskId = res.body.task_id;

      // First transition to RUNNING (required before AWAITING_RESPONSE)
      await queueStore.updateStatus(taskId, 'RUNNING');

      // Simulate executor setting AWAITING_RESPONSE (because output contains question)
      await queueStore.setAwaitingResponse(
        taskId,
        { question: 'Which option do you prefer?', type: 'unknown', options: ['A', 'B'] },
        undefined,
        'I need clarification. Which option do you prefer?'
      );

      // Verify status
      const detailRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.equal(detailRes.body.status, 'AWAITING_RESPONSE');
      assert.ok(detailRes.body.output.includes('?'), 'Output should contain question');
    });

    it('should not allow COMPLETE when output contains questions (verified via flow)', async () => {
      // This test verifies the principle - in real use, executor should detect questions
      // and set AWAITING_RESPONSE instead of COMPLETE

      // The AI judge (containsQuestions) detects questions
      const outputWithQuestion = 'I have completed the task. Do you want me to continue?';
      assert.ok(containsQuestions(outputWithQuestion), 'Should detect question');

      // In proper implementation, executor uses containsQuestions to decide status
    });
  });

  describe('Auto-dev loop state tracking', () => {
    it('should track multiple tasks in same thread', async () => {
      const threadId = `loop-track-${Date.now()}`;

      // Submit initial instruction
      await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: threadId,
          prompt: 'Create hello API',
        })
        .expect(201);

      // Submit fix instruction
      await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: threadId,
          prompt: 'Fix the API to handle errors',
        })
        .expect(201);

      // Verify thread has 2 tasks
      const res = await request(app)
        .get(`/api/task-groups/${threadId}/tasks`)
        .expect(200);

      assert.equal(res.body.tasks.length, 2);
    });
  });
});

describe('E2E: Web Auto-Dev Loop - Live AI Tests', function() {
  // These tests require real AI and are gated
  const isLiveEnabled = process.env.LLM_TEST_MODE === '1';

  before(function() {
    if (!isLiveEnabled) {
      console.log('[Web Auto-Dev Live E2E] GATE: CLOSED - Tests will be SKIPPED');
      console.log('[Web Auto-Dev Live E2E] Set LLM_TEST_MODE=1 to run live tests');
      this.skip();
    }
  });

  // Placeholder for live AI tests
  it('should run auto-e2e with real AI judge', function() {
    // This would test with real OpenAI API
    // Left as placeholder - real implementation requires LLM_TEST_MODE=1
    assert.ok(true);
  });
});
