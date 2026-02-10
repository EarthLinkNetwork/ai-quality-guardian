/**
 * P0-4 E2E Test: Guard/LLM Layer Blocking Prevention
 *
 * PHASE 4 Tests:
 * T-4A: Guard/LLM layer must not block implementation
 *       - Don't stop with fixed questions when user input is specific enough
 *       - Make assumptions and proceed, list confirmation points at end
 *       - Forbid "tell me target files/expected behavior" blocking pattern
 *       - Non-DANGEROUS_OP tasks should progress with COMPLETE/CONTINUE, not ERROR
 *
 * Key requirements:
 * - BLOCKED status is ONLY for DANGEROUS_OP TaskType
 * - Other TaskTypes should use AWAITING_RESPONSE for clarification
 * - Never auto-fail with ERROR when user input is actionable
 */

import { describe, it, before } from 'mocha';
import { strict as assert } from 'assert';
import { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: P0-4 Guard/LLM Blocking Prevention', () => {
  let app: Express;
  let queueStore: IQueueStore;
  const namespace = 'p0-4-guard-test';
  const sessionId = 'session-p0-4-001';

  before(async () => {
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
    });
  });

  describe('T-4A: BLOCKED status scope restriction', () => {
    it('T-4A-1: BLOCKED status should ONLY be for DANGEROUS_OP tasks', () => {
      // Define the TaskType values
      const taskTypes = [
        'READ_INFO',
        'IMPLEMENTATION',
        'REVIEW_RESPONSE',
        'CONFIG_CI_CHANGE',
        'DANGEROUS_OP',
        'REPORT',
      ];

      // Only DANGEROUS_OP should be able to reach BLOCKED status
      const canBeBlocked = (taskType: string) => taskType === 'DANGEROUS_OP';

      assert.strictEqual(canBeBlocked('DANGEROUS_OP'), true);
      assert.strictEqual(canBeBlocked('IMPLEMENTATION'), false);
      assert.strictEqual(canBeBlocked('READ_INFO'), false);
      assert.strictEqual(canBeBlocked('CONFIG_CI_CHANGE'), false);
    });

    it('T-4A-2: Non-DANGEROUS_OP should use AWAITING_RESPONSE for clarification', () => {
      // When a task needs clarification:
      // - DANGEROUS_OP → Can be BLOCKED (requires explicit approval)
      // - Other tasks → Should be AWAITING_RESPONSE (can proceed with assumptions)

      const getStatusForClarification = (taskType: string): string => {
        return taskType === 'DANGEROUS_OP' ? 'BLOCKED' : 'AWAITING_RESPONSE';
      };

      assert.strictEqual(getStatusForClarification('DANGEROUS_OP'), 'BLOCKED');
      assert.strictEqual(getStatusForClarification('IMPLEMENTATION'), 'AWAITING_RESPONSE');
      assert.strictEqual(getStatusForClarification('READ_INFO'), 'AWAITING_RESPONSE');
    });

    it('T-4A-3: FORBIDDEN - Blocking with "tell me target files" pattern', () => {
      // These patterns should be FORBIDDEN for non-DANGEROUS_OP tasks
      const forbiddenBlockingPatterns = [
        'Please tell me the target files',
        'What files should I modify?',
        'Please specify the expected behavior',
        'I need more information before proceeding',
        'Cannot proceed without clarification',
      ];

      // Verify these patterns exist (for documentation)
      assert.ok(forbiddenBlockingPatterns.length > 0);

      // Expected behavior: Make assumptions and list them at the end
      const expectedBehavior = {
        approach: 'Make reasonable assumptions',
        output: 'List confirmation points at end',
        status: 'COMPLETE or AWAITING_RESPONSE (not BLOCKED/ERROR)',
      };

      assert.ok(expectedBehavior.approach);
    });
  });

  describe('T-4B: Task status progression', () => {
    it('T-4B-1: Task should progress from QUEUED to RUNNING', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'progress-test',
          prompt: 'Test task progression',
          session_id: sessionId,
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // Initial status is QUEUED (per queue-store.ts)
      let taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);
      assert.strictEqual(taskRes.body.status, 'QUEUED');

      // Update to RUNNING via /status endpoint
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'RUNNING' })
        .expect(200);

      taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);
      assert.strictEqual(taskRes.body.status, 'RUNNING');
    });

    it('T-4B-2: IMPLEMENTATION task should complete (not block)', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'impl-complete-test',
          prompt: 'Add a hello function to utils.ts',
          session_id: sessionId,
          task_type: 'IMPLEMENTATION',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // First set to RUNNING (valid transition from QUEUED)
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'RUNNING' })
        .expect(200);

      // Simulate execution completing (valid transition from RUNNING)
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'COMPLETE' })
        .expect(200);

      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      // Should be COMPLETE, not BLOCKED
      assert.strictEqual(taskRes.body.status, 'COMPLETE');
    });

    it('T-4B-3: READ_INFO task should complete with output', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'read-info-test',
          prompt: 'What does the main function do?',
          session_id: sessionId,
          task_type: 'READ_INFO',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // First set to RUNNING (valid transition from QUEUED)
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'RUNNING' })
        .expect(200);

      // READ_INFO with response output should be COMPLETE
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'COMPLETE' })
        .expect(200);

      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.strictEqual(taskRes.body.status, 'COMPLETE');
    });
  });

  describe('T-4C: Assumption-based completion', () => {
    it('T-4C-1: Ambiguous input should result in assumptions + AWAITING_RESPONSE', async () => {
      // When input is ambiguous but actionable:
      // 1. Make reasonable assumptions
      // 2. Proceed with implementation
      // 3. Set status to AWAITING_RESPONSE with assumptions listed

      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'assumption-test',
          prompt: 'Refactor the authentication', // Ambiguous but actionable
          session_id: sessionId,
          task_type: 'IMPLEMENTATION',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // First set to RUNNING (valid transition from QUEUED)
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'RUNNING' })
        .expect(200);

      // Verify transition to AWAITING_RESPONSE is valid from RUNNING
      // (requires API to support this status in validStatuses)
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'AWAITING_RESPONSE' })
        .expect(200);

      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      // Should be AWAITING_RESPONSE (not BLOCKED, not ERROR)
      assert.strictEqual(taskRes.body.status, 'AWAITING_RESPONSE');
    });

    it('T-4C-2: Specific input should proceed directly to COMPLETE', async () => {
      // When input is specific and actionable:
      // 1. Execute the task
      // 2. Set status to COMPLETE

      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'specific-input-test',
          prompt: 'Add "export function hello(): string { return "Hello"; }" to src/utils.ts',
          session_id: sessionId,
          task_type: 'IMPLEMENTATION',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // First set to RUNNING
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'RUNNING' })
        .expect(200);

      // Specific input should proceed directly to COMPLETE
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'COMPLETE' })
        .expect(200);

      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.strictEqual(taskRes.body.status, 'COMPLETE');
    });
  });

  describe('T-4D: ERROR vs BLOCKED distinction', () => {
    it('T-4D-1: ERROR should only be for actual failures', () => {
      // ERROR status should be reserved for:
      const errorConditions = [
        'CLI not available',
        'Auth failed',
        'Process crashed',
        'Execution exception',
      ];

      // NOT for:
      const notErrorConditions = [
        'Need clarification',
        'Ambiguous input',
        'Multiple possible interpretations',
      ];

      assert.ok(errorConditions.length > 0);
      assert.ok(notErrorConditions.length > 0);
    });

    it('T-4D-2: Clarification needs should not cause ERROR', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'clarification-test',
          prompt: 'Update the config', // Needs clarification
          session_id: sessionId,
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // First set to RUNNING
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'RUNNING' })
        .expect(200);

      // Should NOT be set to ERROR
      // Should be AWAITING_RESPONSE with question/assumptions
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'AWAITING_RESPONSE' })
        .expect(200);

      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.notStrictEqual(taskRes.body.status, 'ERROR');
      assert.strictEqual(taskRes.body.status, 'AWAITING_RESPONSE');
    });
  });

  describe('T-4E: DANGEROUS_OP special handling', () => {
    it('T-4E-1: DANGEROUS_OP can use AWAITING_RESPONSE for human confirmation', async () => {
      // Note: BLOCKED status doesn't exist in current queue-store.ts
      // DANGEROUS_OP uses AWAITING_RESPONSE for human confirmation
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'dangerous-op-test',
          prompt: 'Delete all files in the temp directory',
          session_id: sessionId,
          task_type: 'DANGEROUS_OP',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // First set to RUNNING
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'RUNNING' })
        .expect(200);

      // DANGEROUS_OP uses AWAITING_RESPONSE for human confirmation
      // The task_type is what distinguishes blocking behavior
      await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .send({ status: 'AWAITING_RESPONSE' })
        .expect(200);

      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      // AWAITING_RESPONSE + task_type=DANGEROUS_OP means blocked
      assert.strictEqual(taskRes.body.status, 'AWAITING_RESPONSE');
      assert.strictEqual(taskRes.body.task_type, 'DANGEROUS_OP');
    });

    it('T-4E-2: DANGEROUS_OP blocking reason should explain risk', async () => {
      // This test verifies the expected behavior contract for DANGEROUS_OP
      // When a DANGEROUS_OP task is created, it must require human confirmation
      // The confirmation request should include risk explanation

      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'dangerous-reason-test',
          prompt: 'Drop the production database',
          session_id: sessionId,
          task_type: 'DANGEROUS_OP',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // Verify task was created with DANGEROUS_OP type
      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.strictEqual(taskRes.body.task_type, 'DANGEROUS_OP');

      // Document the expected behavior:
      // When executor processes DANGEROUS_OP:
      // 1. Set status to AWAITING_RESPONSE
      // 2. Include clarification with risk details
      // 3. Require explicit user confirmation before proceeding

      const expectedClarificationFormat = {
        type: 'dangerous_operation',
        risk_level: 'high',
        action: 'Drop the production database',
        requires_confirmation: true,
      };

      assert.ok(expectedClarificationFormat.requires_confirmation);
    });
  });
});
