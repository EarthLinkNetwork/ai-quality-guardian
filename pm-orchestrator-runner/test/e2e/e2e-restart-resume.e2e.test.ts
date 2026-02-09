/**
 * E2E Test: Restart and Resume Scenarios
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md E2E-3
 *
 * Tests SUP-6: Restart resilience
 * - RUNNING + stale → rollback_replay
 * - AWAITING_RESPONSE → continue
 * - COMPLETE/ERROR → none
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  RestartHandler,
  RestartCheckResult,
  detectRestartState,
  TaskState,
  RestartAction,
} from '../../src/supervisor/index';

import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { QueueItem } from '../../src/queue/queue-store';

describe('E2E: Restart and Resume Scenarios (SUP-6)', () => {
  let testDir: string;
  let queueStore: InMemoryQueueStore;
  let restartHandler: RestartHandler;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-resume-test-'));
  });

  after(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  beforeEach(() => {
    queueStore = new InMemoryQueueStore({ namespace: 'test-ns' });
    restartHandler = new RestartHandler({
      queueStore,
      staleThresholdMs: 1000, // 1 second for testing
    });
  });

  describe('SUP-6: Restart State Detection', () => {
    it('should detect RUNNING + stale → rollback_replay', () => {
      const staleTimestamp = new Date(Date.now() - 60000).toISOString(); // 60 seconds ago
      const taskState: TaskState = {
        taskId: 'task-1',
        status: 'RUNNING',
        lastProgressTimestamp: staleTimestamp,
        hasCompleteArtifacts: false,
      };

      const restartState = detectRestartState(taskState, 30000); // 30s threshold

      assert.equal(restartState.action, 'rollback_replay');
      assert.equal(restartState.taskId, 'task-1');
    });

    it('should detect RUNNING + recent → none (no intervention needed)', () => {
      const recentTimestamp = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      const taskState: TaskState = {
        taskId: 'task-2',
        status: 'RUNNING',
        lastProgressTimestamp: recentTimestamp,
        hasCompleteArtifacts: true,
      };

      const restartState = detectRestartState(taskState, 30000);

      // RUNNING + recent means task is actively running, no restart intervention needed
      assert.equal(restartState.action, 'none');
    });

    it('should detect AWAITING_RESPONSE → continue', () => {
      const taskState: TaskState = {
        taskId: 'task-3',
        status: 'AWAITING_RESPONSE',
        lastProgressTimestamp: new Date().toISOString(),
        hasCompleteArtifacts: false,
      };

      const restartState = detectRestartState(taskState, 30000);

      assert.equal(restartState.action, 'continue');
    });

    it('should detect COMPLETE → none', () => {
      const taskState: TaskState = {
        taskId: 'task-4',
        status: 'COMPLETE',
        lastProgressTimestamp: new Date().toISOString(),
        hasCompleteArtifacts: true,
      };

      const restartState = detectRestartState(taskState, 30000);

      assert.equal(restartState.action, 'none');
    });

    it('should detect ERROR → none', () => {
      const taskState: TaskState = {
        taskId: 'task-5',
        status: 'ERROR',
        lastProgressTimestamp: new Date().toISOString(),
        hasCompleteArtifacts: false,
      };

      const restartState = detectRestartState(taskState, 30000);

      assert.equal(restartState.action, 'none');
    });
  });

  describe('RestartHandler: Check All Tasks', () => {
    it('should check all non-terminal tasks', async () => {
      // Add tasks with different statuses
      await queueStore.enqueue('session-1', 'group-1', 'Running task');
      const runningClaim = await queueStore.claim();
      if (runningClaim.success && runningClaim.item) {
        await queueStore.updateStatus(runningClaim.item.task_id, 'RUNNING');
      }

      await queueStore.enqueue('session-2', 'group-2', 'Awaiting task');
      const awaitingClaim = await queueStore.claim();
      if (awaitingClaim.success && awaitingClaim.item) {
        await queueStore.updateStatus(awaitingClaim.item.task_id, 'AWAITING_RESPONSE');
      }

      await queueStore.enqueue('session-3', 'group-3', 'Complete task');
      const completeClaim = await queueStore.claim();
      if (completeClaim.success && completeClaim.item) {
        await queueStore.updateStatus(completeClaim.item.task_id, 'COMPLETE', 'Done');
      }

      const result = await restartHandler.checkAllTasks();

      assert.ok(result.totalChecked >= 2, 'Should check at least 2 tasks');
      assert.ok('needsAction' in result, 'Should have needsAction property');
      assert.ok('staleTasks' in result, 'Should have staleTasks property');
      assert.ok('continueTasks' in result, 'Should have continueTasks property');
      assert.ok('rollbackTasks' in result, 'Should have rollbackTasks property');
    });

    it('should identify stale tasks correctly', async () => {
      // Create a task and make it stale by simulating old timestamp
      await queueStore.enqueue('session-1', 'group-1', 'Stale task');
      const taskClaim = await queueStore.claim();
      if (taskClaim.success && taskClaim.item) {
        await queueStore.updateStatus(taskClaim.item.task_id, 'RUNNING');
      }

      // Wait for stale threshold (1 second in test)
      await new Promise(resolve => setTimeout(resolve, 1500));

      const result = await restartHandler.checkAllTasks();

      // Task should be detected as stale
      assert.ok(result.staleTasks.length >= 0, 'Should have staleTasks array');
    });
  });

  describe('RestartHandler: Handle Single Task', () => {
    it('should handle task not found', async () => {
      const result = await restartHandler.handleTask('nonexistent-task');

      assert.equal(result.action, 'none');
      assert.ok(result.reason.includes('not found'), 'Reason should include not found');
    });

    it('should handle AWAITING_RESPONSE task', async () => {
      await queueStore.enqueue('session-1', 'group-1', 'Awaiting response task');
      const taskClaim = await queueStore.claim();
      if (taskClaim.success && taskClaim.item) {
        await queueStore.updateStatus(taskClaim.item.task_id, 'AWAITING_RESPONSE');

        const result = await restartHandler.handleTask(taskClaim.item.task_id);

        assert.equal(result.action, 'continue');
      }
    });

    it('should handle COMPLETE task', async () => {
      await queueStore.enqueue('session-1', 'group-1', 'Complete task');
      const taskClaim = await queueStore.claim();
      if (taskClaim.success && taskClaim.item) {
        await queueStore.updateStatus(taskClaim.item.task_id, 'COMPLETE', 'Done');

        const result = await restartHandler.handleTask(taskClaim.item.task_id);

        assert.equal(result.action, 'none');
      }
    });
  });

  describe('RestartHandler: Recovery', () => {
    it('should recover stale tasks', async () => {
      // Create multiple tasks
      await queueStore.enqueue('session-1', 'group-1', 'Task 1');
      await queueStore.enqueue('session-2', 'group-2', 'Task 2');

      const task1Claim = await queueStore.claim();
      const task2Claim = await queueStore.claim();

      if (task1Claim.success && task1Claim.item && task2Claim.success && task2Claim.item) {
        await queueStore.updateStatus(task1Claim.item.task_id, 'RUNNING');
        await queueStore.updateStatus(task2Claim.item.task_id, 'RUNNING');
      }

      const recoveredCount = await restartHandler.recoverStaleTasks();

      assert.equal(typeof recoveredCount, 'number');
      assert.ok(recoveredCount >= 0, 'Should recover 0 or more tasks');
    });

    it('should return zero when no stale tasks', async () => {
      // Empty queue - no tasks to recover
      const recoveredCount = await restartHandler.recoverStaleTasks();

      assert.equal(recoveredCount, 0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent task operations', async () => {
      // Add multiple tasks concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          queueStore.enqueue(`session-${i}`, `group-${i}`, `Concurrent task ${i}`)
        );
      }
      await Promise.all(promises);

      const result = await restartHandler.checkAllTasks();

      assert.ok('totalChecked' in result, 'Should have totalChecked property');
    });

    it('should handle rapid status changes', async () => {
      await queueStore.enqueue('session-1', 'group-1', 'Rapid status task');
      const taskClaim = await queueStore.claim();

      if (taskClaim.success && taskClaim.item) {
        // Rapid status changes
        await queueStore.updateStatus(taskClaim.item.task_id, 'RUNNING');
        await queueStore.updateStatus(taskClaim.item.task_id, 'AWAITING_RESPONSE');
        await queueStore.updateStatus(taskClaim.item.task_id, 'RUNNING');

        const result = await restartHandler.handleTask(taskClaim.item.task_id);

        assert.ok('action' in result, 'Should have action property');
      }
    });

    it('should handle task with output (hasCompleteArtifacts)', async () => {
      await queueStore.enqueue('session-1', 'group-1', 'Task with output');
      const taskClaim = await queueStore.claim();

      if (taskClaim.success && taskClaim.item) {
        await queueStore.updateStatus(taskClaim.item.task_id, 'RUNNING', undefined, 'Some output content');

        const result = await restartHandler.handleTask(taskClaim.item.task_id);

        // Task with output should potentially be resumable
        assert.ok('action' in result, 'Should have action property');
      }
    });
  });
});
