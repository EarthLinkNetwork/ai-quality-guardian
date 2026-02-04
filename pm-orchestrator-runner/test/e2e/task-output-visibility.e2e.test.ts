/**
 * E2E Tests: Task Output Visibility
 *
 * Verifies AC-CHAT-001 through AC-CHAT-005:
 * 1. READ_INFO/REPORT tasks must have final_output or clarification (non-empty)
 * 2. UI must display final_output or clarification (not just "Task completed successfully")
 * 3. At least one API must return final_output/clarification
 * 4. E2E test with PM_TEST_EXECUTOR_MODE=static_output to verify output appears
 * 5. Clarification flow must also show in UI
 *
 * This test uses InMemoryQueueStore to simulate the full task lifecycle
 * without requiring a real executor or DynamoDB.
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
import { initNoDynamo, resetNoDynamo } from '../../src/web/dal/no-dynamo';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: Task Output Visibility (AC-CHAT-001 to AC-CHAT-005)', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'task-output-e2e-test';
  const testSessionId = 'task-output-test-session';

  before(() => {
    // Create temporary state directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-task-output-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    // Initialize NoDynamo DAL
    initNoDynamo(stateDir);
  });

  after(() => {
    // Cleanup
    resetNoDynamo();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Create fresh InMemoryQueueStore for each test
    queueStore = new InMemoryQueueStore({ namespace: testNamespace });

    // Create fresh app
    app = createApp({
      queueStore: queueStore as unknown as IQueueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('AC-CHAT-001: READ_INFO/REPORT tasks have output', () => {
    it('should store and return output for completed READ_INFO task', async () => {
      // Create a task
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-001',
        'Test prompt for READ_INFO task',
        'task-001',
        'READ_INFO'
      );

      assert.equal(task.task_id, 'task-001');
      assert.equal(task.task_type, 'READ_INFO');

      // Simulate executor completing the task with output
      const testOutput = 'E2E_TEST_OUTPUT: This is the READ_INFO result that should be visible in the UI.';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, testOutput);

      // Verify via API
      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE', 'Task should be COMPLETE');
      assert.equal(response.body.output, testOutput, 'Output should be returned from API');
      assert.equal(response.body.task_type, 'READ_INFO', 'task_type should be returned');
    });

    it('should store and return output for completed REPORT task', async () => {
      // Create a REPORT task
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-002',
        'Test prompt for REPORT task',
        'task-002',
        'REPORT'
      );

      assert.equal(task.task_type, 'REPORT');

      // Simulate executor completing the task with output
      const testOutput = 'E2E_TEST_OUTPUT: This is the REPORT result with analysis summary.';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, testOutput);

      // Verify via API
      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE');
      assert.equal(response.body.output, testOutput, 'REPORT output should be returned from API');
    });
  });

  describe('AC-CHAT-003: API returns output field', () => {
    it('should return output field in task group tasks API', async () => {
      const taskGroupId = 'task-group-003';

      // Create and complete a task with output
      const task = await queueStore.enqueue(
        testSessionId,
        taskGroupId,
        'Test task for output visibility',
        'task-003',
        'READ_INFO'
      );

      const testOutput = 'Task result for listing test';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, testOutput);

      // Get task list via task group endpoint
      const response = await request(app)
        .get(`/api/task-groups/${taskGroupId}/tasks`)
        .expect(200);

      assert.ok(Array.isArray(response.body.tasks), 'Should return tasks array');

      const foundTask = response.body.tasks.find((t: { task_id: string }) => t.task_id === 'task-003');
      assert.ok(foundTask, 'Task should be in the list');
      assert.equal(foundTask.output, testOutput, 'Task list should include output field');
    });

    it('should return has_output boolean in task group tasks', async () => {
      const taskGroupId = 'task-group-004';

      // Create two tasks - one with output, one without
      const taskWithOutput = await queueStore.enqueue(
        testSessionId,
        taskGroupId,
        'Task with output',
        'task-004',
        'READ_INFO'
      );
      await queueStore.updateStatus(taskWithOutput.task_id, 'COMPLETE', undefined, 'Some output');

      const taskWithoutOutput = await queueStore.enqueue(
        testSessionId,
        taskGroupId,
        'Task without output',
        'task-005',
        'READ_INFO'
      );
      await queueStore.updateStatus(taskWithoutOutput.task_id, 'COMPLETE');

      // Get task list via task group endpoint
      const response = await request(app)
        .get(`/api/task-groups/${taskGroupId}/tasks`)
        .expect(200);

      const task4 = response.body.tasks.find((t: { task_id: string }) => t.task_id === 'task-004');
      const task5 = response.body.tasks.find((t: { task_id: string }) => t.task_id === 'task-005');

      assert.equal(task4.has_output, true, 'Task with output should have has_output=true');
      assert.equal(task5.has_output, false, 'Task without output should have has_output=false');
    });
  });

  describe('AC-CHAT-004: Output appears in UI (static_output mode simulation)', () => {
    it('should display actual output content (not just "Task completed successfully")', async () => {
      // This simulates the static_output mode behavior
      // The static_output mode in TestIncompleteExecutor returns:
      // 'E2E_TEST_OUTPUT: This is the task result that should be visible in the UI...'

      const staticOutput = 'E2E_TEST_OUTPUT: This is the task result that should be visible in the UI. If you can see this message, the output visibility fix is working correctly.';

      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-static',
        'Static output test task',
        'task-static-001',
        'READ_INFO'
      );

      // Simulate static_output executor completing with fixed output
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, staticOutput);

      // Verify via API (this is what the UI fetches)
      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      // AC-CHAT-002: UI must display final_output (not just "Task completed successfully")
      assert.equal(response.body.output, staticOutput, 'API should return actual output');
      assert.ok(
        response.body.output.includes('E2E_TEST_OUTPUT'),
        'Output should contain the test marker'
      );
      assert.ok(
        !response.body.output.includes('Task completed successfully'),
        'Output should NOT be the generic success message'
      );
    });

    it('should preserve output through full task lifecycle', async () => {
      // Simulate full lifecycle: QUEUED -> RUNNING -> COMPLETE with output
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-lifecycle',
        'Full lifecycle test',
        'task-lifecycle-001',
        'READ_INFO'
      );

      // Check initial state
      let response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);
      assert.equal(response.body.status, 'QUEUED');
      assert.equal(response.body.output, undefined);

      // Simulate claim (RUNNING)
      const claimResult = await queueStore.claim();
      assert.ok(claimResult.success, 'Claim should succeed');

      response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);
      assert.equal(response.body.status, 'RUNNING');

      // Simulate completion with output
      const finalOutput = 'Lifecycle test completed successfully with this detailed result.';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, finalOutput);

      response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);
      assert.equal(response.body.status, 'COMPLETE');
      assert.equal(response.body.output, finalOutput, 'Output should be preserved through lifecycle');
    });
  });

  describe('AC-CHAT-005: Clarification flow shows in UI', () => {
    it('should return clarification details for AWAITING_RESPONSE task', async () => {
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-clarify',
        'Task needing clarification',
        'task-clarify-001',
        'READ_INFO'
      );

      // First, claim the task to move it to RUNNING (required for AWAITING_RESPONSE transition)
      const claimResult = await queueStore.claim();
      assert.ok(claimResult.success, 'Claim should succeed');
      assert.equal(claimResult.item?.task_id, task.task_id, 'Claimed task should match');

      // Now simulate executor setting AWAITING_RESPONSE with clarification
      const clarification = {
        type: 'case_by_case' as const,
        question: 'Which database should I query? PostgreSQL or MySQL?',
        options: ['PostgreSQL', 'MySQL'],
        context: 'Database selection required for the query',
      };

      const result = await queueStore.setAwaitingResponse(task.task_id, clarification);
      assert.ok(result.success, 'setAwaitingResponse should succeed');

      // Verify via API
      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'AWAITING_RESPONSE');
      assert.ok(response.body.clarification, 'Should have clarification field');
      assert.equal(
        response.body.clarification.question,
        clarification.question,
        'Clarification question should be returned'
      );
      assert.deepEqual(
        response.body.clarification.options,
        clarification.options,
        'Clarification options should be returned'
      );
    });

    it('should transition from AWAITING_RESPONSE to COMPLETE with output', async () => {
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-clarify-complete',
        'Task needing clarification then completing',
        'task-clarify-002',
        'READ_INFO'
      );

      // First, claim the task to move it to RUNNING
      const claimResult = await queueStore.claim();
      assert.ok(claimResult.success, 'Claim should succeed');

      // Set to AWAITING_RESPONSE
      const clarification = {
        type: 'case_by_case' as const,
        question: 'Choose a framework',
        options: ['React', 'Vue', 'Angular'],
        context: 'Framework selection for the project',
      };
      const awaitResult = await queueStore.setAwaitingResponse(task.task_id, clarification);
      assert.ok(awaitResult.success, 'setAwaitingResponse should succeed');

      // Resume with user response
      const resumeResult = await queueStore.resumeWithResponse(task.task_id, 'React');
      assert.ok(resumeResult.success, 'resumeWithResponse should succeed');

      // Should be back to RUNNING
      let response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);
      assert.equal(response.body.status, 'RUNNING');

      // Complete with final output
      const finalOutput = 'Analysis complete. Using React framework as selected.';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, finalOutput);

      response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE');
      assert.equal(response.body.output, finalOutput);
      // Clarification should still be preserved for history
      assert.ok(response.body.clarification, 'Clarification history should be preserved');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle ERROR status with error_message', async () => {
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-error',
        'Task that will error',
        'task-error-001',
        'READ_INFO'
      );

      // Simulate error
      await queueStore.updateStatus(task.task_id, 'ERROR', 'Execution failed: timeout');

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'ERROR');
      assert.equal(response.body.error_message, 'Execution failed: timeout');
      assert.equal(response.body.output, undefined, 'ERROR tasks should not have output');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(app)
        .get('/api/tasks/non-existent-task-id')
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
    });
  });
});
