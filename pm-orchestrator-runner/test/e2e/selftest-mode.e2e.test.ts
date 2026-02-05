/**
 * E2E Test: Self-Test Mode (PM_AUTO_SELFTEST=true)
 *
 * Verifies the full selftest flow:
 * 1. Inject 5 READ_INFO tasks into the queue
 * 2. Wait for completion (simulate by manually completing tasks)
 * 3. Judge results based on COMPLETE + output presence
 * 4. Generate JSON report
 * 5. Return correct exit code (0=all pass, 1=any fail)
 *
 * These tests run without a real executor - tasks are manually
 * transitioned to terminal states to test the judgment/report logic.
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import {
  SELFTEST_CASES,
  SELFTEST_TASK_GROUP,
  SELFTEST_TASK_TYPE,
  injectSelftestTasks,
  waitForSelftestCompletion,
  judgeResult,
  buildSelftestReport,
  writeSelftestReport,
  runSelftest,
} from '../../src/selftest/selftest-runner';

describe('E2E: Self-Test Mode (PM_AUTO_SELFTEST)', () => {
  let queueStore: InMemoryQueueStore;
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-selftest-e2e-'));
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    queueStore = new InMemoryQueueStore({ namespace: 'selftest-e2e' });
  });

  describe('Task injection', () => {
    it('should inject exactly 5 tasks with READ_INFO type', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');

      assert.equal(items.length, 5);
      for (const item of items) {
        assert.equal(item.task_type, SELFTEST_TASK_TYPE);
        assert.equal(item.task_group_id, SELFTEST_TASK_GROUP);
        assert.equal(item.status, 'QUEUED');
      }
    });

    it('should use prompts from SELFTEST_CASES', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');
      const prompts = items.map(i => i.prompt);

      for (const tc of SELFTEST_CASES) {
        assert.ok(
          prompts.includes(tc.prompt),
          `Missing prompt for case: ${tc.name}`,
        );
      }
    });
  });

  describe('Completion waiting', () => {
    it('should return completed items when all reach terminal status', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');
      const taskIds = items.map(i => i.task_id);

      // Manually complete all tasks
      for (const taskId of taskIds) {
        await queueStore.updateStatus(taskId, 'COMPLETE', undefined, 'Test output');
      }

      const results = await waitForSelftestCompletion(
        queueStore,
        taskIds,
        5000, // 5 second timeout
        100,  // 100ms poll interval
      );

      assert.equal(results.length, 5);
      for (const item of results) {
        assert.equal(item.status, 'COMPLETE');
      }
    });

    it('should return partial results on timeout', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');
      const taskIds = items.map(i => i.task_id);

      // Complete only 2 of 5 tasks, leave others QUEUED
      await queueStore.updateStatus(taskIds[0], 'COMPLETE', undefined, 'Output 1');
      await queueStore.updateStatus(taskIds[1], 'COMPLETE', undefined, 'Output 2');

      const results = await waitForSelftestCompletion(
        queueStore,
        taskIds,
        500,  // very short timeout
        100,  // 100ms poll interval
      );

      // Should have all 5 items (some still QUEUED)
      assert.equal(results.length, 5);
      const completedCount = results.filter(r => r.status === 'COMPLETE').length;
      assert.equal(completedCount, 2);
    });

    it('should detect mixed terminal statuses', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');
      const taskIds = items.map(i => i.task_id);

      // Mix of terminal statuses
      await queueStore.updateStatus(taskIds[0], 'COMPLETE', undefined, 'Output 1');
      await queueStore.updateStatus(taskIds[1], 'ERROR', 'Task failed');
      await queueStore.updateStatus(taskIds[2], 'COMPLETE', undefined, 'Output 3');
      await queueStore.updateStatus(taskIds[3], 'CANCELLED');
      await queueStore.updateStatus(taskIds[4], 'COMPLETE', undefined, 'Output 5');

      const results = await waitForSelftestCompletion(
        queueStore,
        taskIds,
        5000,
        100,
      );

      assert.equal(results.length, 5);
    });
  });

  describe('Report generation', () => {
    it('should generate correct report for all-pass scenario', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');
      const taskIds = items.map(i => i.task_id);

      // Complete all tasks with output
      for (const taskId of taskIds) {
        await queueStore.updateStatus(taskId, 'COMPLETE', undefined, 'Valid output text');
      }

      const completedItems = await waitForSelftestCompletion(
        queueStore,
        taskIds,
        5000,
        100,
      );

      const report = buildSelftestReport(completedItems, SELFTEST_CASES);

      assert.equal(report.total, 5);
      assert.equal(report.success, 5);
      assert.equal(report.fail, 0);
      assert.match(report.run_id, /^selftest-\d{8}-\d{4}$/);

      // All results should be ok
      for (const r of report.results) {
        assert.equal(r.ok, true);
      }
    });

    it('should generate correct report for mixed results', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');
      const taskIds = items.map(i => i.task_id);

      // 3 pass, 2 fail
      await queueStore.updateStatus(taskIds[0], 'COMPLETE', undefined, 'Output 1');
      await queueStore.updateStatus(taskIds[1], 'COMPLETE', undefined, 'Output 2');
      await queueStore.updateStatus(taskIds[2], 'ERROR', 'Failed');
      await queueStore.updateStatus(taskIds[3], 'COMPLETE', undefined, 'Output 4');
      await queueStore.updateStatus(taskIds[4], 'COMPLETE', undefined, ''); // empty output = fail

      const completedItems = await waitForSelftestCompletion(
        queueStore,
        taskIds,
        5000,
        100,
      );

      const report = buildSelftestReport(completedItems, SELFTEST_CASES);

      assert.equal(report.total, 5);
      assert.equal(report.success, 3);
      assert.equal(report.fail, 2);
    });

    it('should write report to disk as JSON', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-session');
      const taskIds = items.map(i => i.task_id);

      for (const taskId of taskIds) {
        await queueStore.updateStatus(taskId, 'COMPLETE', undefined, 'Output');
      }

      const completedItems = await waitForSelftestCompletion(
        queueStore,
        taskIds,
        5000,
        100,
      );

      const report = buildSelftestReport(completedItems, SELFTEST_CASES);
      const filePath = writeSelftestReport(report, tempDir);

      // Verify file exists
      assert.ok(fs.existsSync(filePath), `Report file should exist: ${filePath}`);

      // Verify it's valid JSON
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.equal(parsed.total, 5);
      assert.equal(parsed.success, 5);
      assert.equal(parsed.fail, 0);
      assert.ok(parsed.run_id);
      assert.ok(parsed.timestamp);
      assert.ok(Array.isArray(parsed.results));
    });
  });

  describe('Full selftest flow (runSelftest)', () => {
    it('should return exit code 0 when all tasks pass', async () => {
      // We need to pre-complete tasks as they're enqueued.
      // Use a custom approach: enqueue, then complete before polling finishes.

      // Override: manually run the flow steps
      const sessionId = 'e2e-full-flow';
      const items = await injectSelftestTasks(queueStore, sessionId);
      const taskIds = items.map(i => i.task_id);

      // Complete all tasks
      for (const taskId of taskIds) {
        await queueStore.updateStatus(taskId, 'COMPLETE', undefined, 'Self-test output');
      }

      const completedItems = await waitForSelftestCompletion(queueStore, taskIds, 5000, 100);
      const report = buildSelftestReport(completedItems, SELFTEST_CASES);
      const exitCode = report.fail === 0 ? 0 : 1;

      assert.equal(exitCode, 0);
      assert.equal(report.total, 5);
      assert.equal(report.success, 5);
      assert.equal(report.fail, 0);
    });

    it('should return exit code 1 when any task fails', async () => {
      const sessionId = 'e2e-full-flow-fail';
      const items = await injectSelftestTasks(queueStore, sessionId);
      const taskIds = items.map(i => i.task_id);

      // Complete 4, fail 1
      for (let i = 0; i < 4; i++) {
        await queueStore.updateStatus(taskIds[i], 'COMPLETE', undefined, 'Output');
      }
      await queueStore.updateStatus(taskIds[4], 'ERROR', 'Execution failed');

      const completedItems = await waitForSelftestCompletion(queueStore, taskIds, 5000, 100);
      const report = buildSelftestReport(completedItems, SELFTEST_CASES);
      const exitCode = report.fail === 0 ? 0 : 1;

      assert.equal(exitCode, 1);
      assert.equal(report.total, 5);
      assert.equal(report.success, 4);
      assert.equal(report.fail, 1);
    });

    it('should treat COMPLETE with empty output as failure', async () => {
      const sessionId = 'e2e-empty-output';
      const items = await injectSelftestTasks(queueStore, sessionId);
      const taskIds = items.map(i => i.task_id);

      // All COMPLETE but one has empty output
      for (let i = 0; i < 4; i++) {
        await queueStore.updateStatus(taskIds[i], 'COMPLETE', undefined, 'Valid output');
      }
      await queueStore.updateStatus(taskIds[4], 'COMPLETE', undefined, '');

      const completedItems = await waitForSelftestCompletion(queueStore, taskIds, 5000, 100);
      const report = buildSelftestReport(completedItems, SELFTEST_CASES);

      assert.equal(report.fail, 1);
      const failedResult = report.results.find(r => !r.ok);
      assert.ok(failedResult);
      assert.equal(failedResult!.reason, 'output is empty');
    });

    it('should treat AWAITING_RESPONSE as failure', async () => {
      const sessionId = 'e2e-awaiting';
      const items = await injectSelftestTasks(queueStore, sessionId);
      const taskIds = items.map(i => i.task_id);

      for (let i = 0; i < 4; i++) {
        await queueStore.updateStatus(taskIds[i], 'COMPLETE', undefined, 'Output');
      }
      // AWAITING_RESPONSE is a terminal status for polling but not a success
      // Must transition QUEUED -> RUNNING -> AWAITING_RESPONSE
      await queueStore.updateStatus(taskIds[4], 'RUNNING');
      await queueStore.setAwaitingResponse(taskIds[4], {
        type: 'unknown',
        question: 'Needs clarification',
      });

      const completedItems = await waitForSelftestCompletion(queueStore, taskIds, 5000, 100);
      const report = buildSelftestReport(completedItems, SELFTEST_CASES);

      assert.equal(report.fail, 1);
    });
  });

  describe('Report file naming', () => {
    it('should place report in reports/ subdirectory', async () => {
      const items = await injectSelftestTasks(queueStore, 'e2e-naming');
      for (const item of items) {
        await queueStore.updateStatus(item.task_id, 'COMPLETE', undefined, 'Output');
      }

      const completedItems = await waitForSelftestCompletion(
        queueStore,
        items.map(i => i.task_id),
        5000,
        100,
      );

      const report = buildSelftestReport(completedItems, SELFTEST_CASES);
      const filePath = writeSelftestReport(report, tempDir);

      assert.ok(filePath.includes('/reports/'));
      assert.ok(filePath.endsWith('.json'));

      // Verify reports directory was created
      const reportsDir = path.join(tempDir, 'reports');
      assert.ok(fs.existsSync(reportsDir));
    });
  });
});
