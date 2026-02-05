/**
 * E2E Test: INCOMPLETE -> AWAITING_RESPONSE Flow
 *
 * Verifies the full flow through Queue -> Executor -> API -> UI:
 * 1. READ_INFO task returning INCOMPLETE should become AWAITING_RESPONSE (not ERROR)
 * 2. Output must be preserved and visible via API
 * 3. Clarification details must be present
 * 4. IMPLEMENTATION INCOMPLETE -> ERROR but output saved
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { initNoDynamo, resetNoDynamo, resetNoDynamoExtended } from '../../src/web/dal/no-dynamo';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: INCOMPLETE -> AWAITING_RESPONSE Flow', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'incomplete-awaiting-e2e';
  const testSessionId = 'incomplete-awaiting-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-incomplete-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    initNoDynamo(stateDir);
  });

  after(() => {
    resetNoDynamo();
    resetNoDynamoExtended();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    queueStore = new InMemoryQueueStore({ namespace: testNamespace });
    app = createApp({
      queueStore: queueStore as unknown as IQueueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('READ_INFO INCOMPLETE with output -> AWAITING_RESPONSE', () => {
    it('should show AWAITING_RESPONSE with output via task detail API', async () => {
      // Create a READ_INFO task
      const task = await queueStore.enqueue(
        testSessionId,
        'tg-incomplete-1',
        'Explain the architecture of this project',
        'task-incomplete-output-1',
        'READ_INFO'
      );

      // Transition to RUNNING then AWAITING_RESPONSE with output
      await queueStore.updateStatus(task.task_id, 'RUNNING');
      const testOutput = 'Partial analysis:\n1. The project uses MVC pattern\n2. Need clarification on the data layer';

      await queueStore.setAwaitingResponse(
        task.task_id,
        {
          type: 'unknown',
          question: 'INCOMPLETE: Task returned partial results. Please clarify the scope.',
          context: task.prompt,
        },
        undefined,
        testOutput
      );

      // Verify via API
      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      // AC: Status is AWAITING_RESPONSE (NOT ERROR)
      assert.equal(response.body.status, 'AWAITING_RESPONSE', 'Status should be AWAITING_RESPONSE, not ERROR');

      // AC: Output is preserved and visible
      assert.ok(response.body.output, 'Output must be present');
      assert.ok(response.body.output.includes('Partial analysis'), 'Output should contain the partial analysis');

      // AC: Clarification is present
      assert.ok(response.body.clarification, 'Clarification should be present');
      assert.ok(response.body.clarification.question.includes('INCOMPLETE'), 'Clarification should mention INCOMPLETE');

      // AC: task_type preserved
      assert.equal(response.body.task_type, 'READ_INFO');
    });
  });

  describe('READ_INFO INCOMPLETE without output -> AWAITING_RESPONSE with fallback', () => {
    it('should generate fallback output for INCOMPLETE without output', async () => {
      const task = await queueStore.enqueue(
        testSessionId,
        'tg-incomplete-2',
        'Summarize the README',
        'task-incomplete-no-output-1',
        'READ_INFO'
      );

      await queueStore.updateStatus(task.task_id, 'RUNNING');

      // Set AWAITING_RESPONSE with fallback output
      const fallbackOutput = 'INCOMPLETE: Task could not produce results.\nPlease clarify your request with more specific details.';

      await queueStore.setAwaitingResponse(
        task.task_id,
        {
          type: 'unknown',
          question: 'Task could not produce results. Please clarify your request.',
          context: task.prompt,
        },
        undefined,
        fallbackOutput
      );

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'AWAITING_RESPONSE');
      assert.ok(response.body.output, 'Fallback output must be present');
      assert.ok(response.body.output.includes('INCOMPLETE:'), 'Fallback output should start with INCOMPLETE:');
    });
  });

  describe('IMPLEMENTATION INCOMPLETE -> ERROR with output saved', () => {
    it('should save output even when IMPLEMENTATION goes to ERROR', async () => {
      const task = await queueStore.enqueue(
        testSessionId,
        'tg-impl-incomplete',
        'Create a new utility function',
        'task-impl-incomplete-1',
        'IMPLEMENTATION'
      );

      const outputWithPartialWork = 'Created src/utils/helper.ts but verification failed.';

      // IMPLEMENTATION INCOMPLETE -> ERROR with output
      await queueStore.updateStatus(
        task.task_id,
        'ERROR',
        'Task ended with status: INCOMPLETE',
        outputWithPartialWork
      );

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'ERROR', 'IMPLEMENTATION INCOMPLETE should be ERROR');
      assert.ok(response.body.output, 'Output should still be saved for ERROR tasks');
      assert.ok(response.body.output.includes('helper.ts'), 'Output content should be preserved');
    });
  });

  describe('Task group listing preserves AWAITING_RESPONSE output', () => {
    it('should show output and status in task group listing', async () => {
      const taskGroupId = 'tg-group-incomplete';

      const task1 = await queueStore.enqueue(
        testSessionId,
        taskGroupId,
        'Task 1: explain code',
        'task-group-1',
        'READ_INFO'
      );
      const task2 = await queueStore.enqueue(
        testSessionId,
        taskGroupId,
        'Task 2: implement feature',
        'task-group-2',
        'IMPLEMENTATION'
      );

      // Task 1: AWAITING_RESPONSE with output
      await queueStore.updateStatus(task1.task_id, 'RUNNING');
      await queueStore.setAwaitingResponse(
        task1.task_id,
        {
          type: 'unknown',
          question: 'Need more context',
          context: 'explain code',
        },
        undefined,
        'Partial explanation of the code'
      );

      // Task 2: COMPLETE with output
      await queueStore.updateStatus(task2.task_id, 'COMPLETE', undefined, 'Feature implemented successfully');

      const response = await request(app)
        .get(`/api/task-groups/${taskGroupId}/tasks`)
        .expect(200);

      const foundTask1 = response.body.tasks.find((t: { task_id: string }) => t.task_id === 'task-group-1');
      const foundTask2 = response.body.tasks.find((t: { task_id: string }) => t.task_id === 'task-group-2');

      assert.ok(foundTask1, 'Task 1 should be in list');
      assert.ok(foundTask2, 'Task 2 should be in list');

      assert.equal(foundTask1.status, 'AWAITING_RESPONSE');
      assert.equal(foundTask1.output, 'Partial explanation of the code');
      assert.equal(foundTask1.has_output, true);

      assert.equal(foundTask2.status, 'COMPLETE');
      assert.equal(foundTask2.output, 'Feature implemented successfully');
      assert.equal(foundTask2.has_output, true);
    });
  });
});
