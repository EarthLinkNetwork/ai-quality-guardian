/**
 * E2E Tests: Script Failure UX Improvements
 *
 * Verifies:
 * 1. Failure classification (QUOTE_ERROR, PATH_NOT_FOUND, etc.)
 * 2. Next Actions appear on ERROR tasks in Required Actions
 * 3. Task Detail API returns failure_category and failure_next_actions
 * 4. Tmpfile fallback conversion works correctly
 * 5. Dashboard Required Actions includes classified error tasks
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
import { classifyScriptFailure } from '../../src/executor/script-failure-classifier';
import { convertToTmpfile, cleanupTmpfile } from '../../src/executor/script-fallback';

describe('E2E: Script Failure UX Improvements', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  let queueStore: InMemoryQueueStore;
  const testSessionId = 'failure-ux-e2e-session';
  const testNamespace = 'failure-ux-e2e';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-failure-ux-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    resetNoDynamo();
    initNoDynamo(stateDir);
  });

  after(() => {
    resetNoDynamo();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    queueStore = new InMemoryQueueStore({ namespace: testNamespace });
    app = createApp({
      queueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  // ==========================================
  // 1. Failure Classification Unit Tests
  // ==========================================
  describe('Failure Classification', () => {
    it('should classify QUOTE_ERROR from SyntaxError', () => {
      const result = classifyScriptFailure('SyntaxError: unexpected token');
      assert.equal(result.category, 'QUOTE_ERROR');
      assert.ok(result.summary.includes('quoting'));
      assert.ok(result.nextActions.length > 0);
    });

    it('should classify PATH_NOT_FOUND from ENOENT', () => {
      const result = classifyScriptFailure('Error: ENOENT: no such file or directory');
      assert.equal(result.category, 'PATH_NOT_FOUND');
      assert.ok(result.summary.includes('not found'));
    });

    it('should classify COMMAND_NOT_FOUND', () => {
      const result = classifyScriptFailure('zsh: command not found: foobar');
      assert.equal(result.category, 'COMMAND_NOT_FOUND');
    });

    it('should classify PERMISSION errors', () => {
      const result = classifyScriptFailure('Error: EACCES: permission denied');
      assert.equal(result.category, 'PERMISSION');
    });

    it('should classify TIMEOUT errors', () => {
      const result = classifyScriptFailure('Error: execution timed out after 30s');
      assert.equal(result.category, 'TIMEOUT');
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      const result = classifyScriptFailure('Something totally unexpected happened');
      assert.equal(result.category, 'UNKNOWN');
    });

    it('should include retry action for all categories', () => {
      const result = classifyScriptFailure('ENOENT: no such file');
      const retryAction = result.nextActions.find(a => a.actionType === 'retry');
      assert.ok(retryAction, 'Should include retry action');
      assert.equal(retryAction?.label, 'Retry same step');
    });

    it('should include retry_fallback for QUOTE_ERROR', () => {
      const result = classifyScriptFailure('SyntaxError: unexpected token', undefined, 'task-1');
      const fallbackAction = result.nextActions.find(a => a.actionType === 'retry_fallback');
      assert.ok(fallbackAction, 'Should include retry_fallback for QUOTE_ERROR');
    });

    it('should include navigate action when taskGroupId provided', () => {
      const result = classifyScriptFailure('ENOENT', undefined, 'task-1', 'group-1');
      const navAction = result.nextActions.find(a => a.actionType === 'navigate');
      assert.ok(navAction, 'Should include navigate action');
      assert.equal(navAction?.target, '/task-groups/group-1');
    });

    it('should truncate detail to 500 chars', () => {
      const longError = 'x'.repeat(1000);
      const result = classifyScriptFailure(longError);
      assert.ok(result.detail.length <= 500);
    });
  });

  // ==========================================
  // 2. Tmpfile Fallback Conversion Tests
  // ==========================================
  describe('Tmpfile Fallback Conversion', () => {
    it('should convert node -e to tmpfile', () => {
      const result = convertToTmpfile('node -e "console.log(42)"');
      assert.equal(result.converted, true);
      assert.ok(result.tmpfilePath);
      assert.ok(result.command.includes(result.tmpfilePath!));
      assert.ok(result.command.startsWith('node'));

      // Verify the tmp file was created with correct content
      const content = fs.readFileSync(result.tmpfilePath!, 'utf-8');
      assert.equal(content, 'console.log(42)');

      // Cleanup
      cleanupTmpfile(result.tmpfilePath!);
      assert.equal(fs.existsSync(result.tmpfilePath!), false);
    });

    it('should convert python -c to tmpfile', () => {
      const result = convertToTmpfile("python -c 'print(42)'");
      assert.equal(result.converted, true);
      assert.ok(result.tmpfilePath?.endsWith('.py'));
      cleanupTmpfile(result.tmpfilePath!);
    });

    it('should not convert non-inline commands', () => {
      const result = convertToTmpfile('npm run test');
      assert.equal(result.converted, false);
      assert.equal(result.command, 'npm run test');
    });

    it('should preserve original command in result', () => {
      const original = 'node -e "console.log(1)"';
      const result = convertToTmpfile(original);
      assert.equal(result.originalCommand, original);
      if (result.tmpfilePath) cleanupTmpfile(result.tmpfilePath);
    });
  });

  // ==========================================
  // 3. Queue Store setFailureInfo Tests
  // ==========================================
  describe('QueueStore setFailureInfo', () => {
    it('should store failure classification on a task', async () => {
      const item = await queueStore.enqueue(testSessionId, 'group-1', 'Run script');
      await queueStore.updateStatus(item.task_id, 'RUNNING');
      await queueStore.updateStatus(item.task_id, 'ERROR', 'ENOENT: no such file');

      await queueStore.setFailureInfo(item.task_id, {
        failure_category: 'PATH_NOT_FOUND',
        failure_summary: 'Script failed: file or path not found',
        failure_next_actions: [
          { label: 'Retry same step', actionType: 'retry', target: item.task_id },
          { label: 'Open execution logs', actionType: 'open_logs', target: `/tasks/${item.task_id}` },
        ],
        command_preview: 'node scripts/deploy.js',
      });

      const task = await queueStore.getItem(item.task_id);
      assert.ok(task);
      assert.equal(task!.failure_category, 'PATH_NOT_FOUND');
      assert.equal(task!.failure_summary, 'Script failed: file or path not found');
      assert.equal(task!.failure_next_actions?.length, 2);
      assert.equal(task!.command_preview, 'node scripts/deploy.js');
    });
  });

  // ==========================================
  // 4. Required Actions API includes errors
  // ==========================================
  describe('GET /api/required-actions with failure classification', () => {
    it('should include classified ERROR tasks in required actions', async () => {
      // Create a task, make it ERROR with failure info
      const item = await queueStore.enqueue(testSessionId, 'grp-fail', 'Run deploy script');
      await queueStore.updateStatus(item.task_id, 'RUNNING');
      await queueStore.updateStatus(item.task_id, 'ERROR', 'SyntaxError: unexpected token');
      await queueStore.setFailureInfo(item.task_id, {
        failure_category: 'QUOTE_ERROR',
        failure_summary: 'Script failed due to quoting/syntax error',
        failure_next_actions: [
          { label: 'Retry same step', actionType: 'retry', target: item.task_id },
          { label: 'Retry with tmpfile fallback', actionType: 'retry_fallback', target: item.task_id },
        ],
      });

      const res = await request(app).get('/api/required-actions');
      assert.equal(res.status, 200);
      assert.ok(res.body.count >= 1);

      const errorAction = res.body.actions.find((a: any) => a.task_id === item.task_id);
      assert.ok(errorAction, 'Classified ERROR task should appear in required actions');
      assert.equal(errorAction.status, 'ERROR');
      assert.equal(errorAction.failure_category, 'QUOTE_ERROR');
      assert.equal(errorAction.failure_summary, 'Script failed due to quoting/syntax error');
      assert.ok(errorAction.failure_next_actions.length >= 2);
    });

    it('should NOT include ERROR tasks without failure classification', async () => {
      const item = await queueStore.enqueue(testSessionId, 'grp-plain', 'Some task');
      await queueStore.updateStatus(item.task_id, 'RUNNING');
      await queueStore.updateStatus(item.task_id, 'ERROR', 'Generic error');

      const res = await request(app).get('/api/required-actions');
      assert.equal(res.status, 200);

      const found = res.body.actions.find((a: any) => a.task_id === item.task_id);
      assert.ok(!found, 'Unclassified ERROR should NOT appear in required actions');
    });

    it('should mix AWAITING and ERROR actions sorted by time', async () => {
      // Create an AWAITING task (oldest)
      const t1 = await queueStore.enqueue(testSessionId, 'grp-mix', 'Task A');
      await queueStore.updateStatus(t1.task_id, 'RUNNING');
      await queueStore.setAwaitingResponse(t1.task_id, {
        type: 'case_by_case',
        question: 'Which option?',
      });

      // Create an ERROR task (newer)
      const t2 = await queueStore.enqueue(testSessionId, 'grp-mix', 'Task B');
      await queueStore.updateStatus(t2.task_id, 'RUNNING');
      await queueStore.updateStatus(t2.task_id, 'ERROR', 'permission denied');
      await queueStore.setFailureInfo(t2.task_id, {
        failure_category: 'PERMISSION',
        failure_summary: 'Script failed: permission denied',
        failure_next_actions: [{ label: 'Retry', actionType: 'retry' }],
      });

      const res = await request(app).get('/api/required-actions');
      assert.equal(res.status, 200);
      assert.ok(res.body.count >= 2);

      // Both should be present
      const ids = res.body.actions.map((a: any) => a.task_id);
      assert.ok(ids.includes(t1.task_id), 'AWAITING task should be in actions');
      assert.ok(ids.includes(t2.task_id), 'ERROR task should be in actions');
    });
  });

  // ==========================================
  // 5. Task Detail API returns failure info
  // ==========================================
  describe('GET /api/tasks/:task_id with failure info', () => {
    it('should return failure fields in task detail', async () => {
      const item = await queueStore.enqueue(testSessionId, 'grp-detail', 'Run test');
      await queueStore.updateStatus(item.task_id, 'RUNNING');
      await queueStore.updateStatus(item.task_id, 'ERROR', 'command not found: jest');
      await queueStore.setFailureInfo(item.task_id, {
        failure_category: 'COMMAND_NOT_FOUND',
        failure_summary: 'Script failed: command not found',
        failure_next_actions: [
          { label: 'Retry same step', actionType: 'retry', target: item.task_id },
        ],
        command_preview: 'jest --coverage',
      });

      const res = await request(app).get(`/api/tasks/${item.task_id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.failure_category, 'COMMAND_NOT_FOUND');
      assert.equal(res.body.failure_summary, 'Script failed: command not found');
      assert.equal(res.body.command_preview, 'jest --coverage');
      assert.ok(Array.isArray(res.body.failure_next_actions));
      assert.equal(res.body.failure_next_actions.length, 1);
    });

    it('should return null failure fields for non-classified tasks', async () => {
      const item = await queueStore.enqueue(testSessionId, 'grp-noclass', 'Normal task');

      const res = await request(app).get(`/api/tasks/${item.task_id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.failure_category, undefined);
      assert.equal(res.body.failure_next_actions, undefined);
    });
  });
});
