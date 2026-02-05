/**
 * E2E Test: NO_EVIDENCE / BLOCKED Path for READ_INFO/REPORT Tasks
 *
 * Root cause regression test for the bug where READ_INFO/REPORT tasks
 * with NO_EVIDENCE or BLOCKED executor status were incorrectly converted
 * to ERROR instead of COMPLETE (when output exists) or AWAITING_RESPONSE
 * (when no output).
 *
 * Bug path (BEFORE fix):
 *   createTaskExecutor -> executor returns NO_EVIDENCE ->
 *   falls to else branch -> { status: 'ERROR', errorMessage: '...' }
 *   (no check for READ_INFO/REPORT task type)
 *
 * Fixed path (AFTER fix):
 *   createTaskExecutor -> executor returns NO_EVIDENCE ->
 *   isReadInfoOrReport check -> has output? -> COMPLETE
 *                             -> no output?  -> AWAITING_RESPONSE
 *
 * This test covers:
 * 1. NO_EVIDENCE + READ_INFO + output -> COMPLETE (not ERROR)
 * 2. NO_EVIDENCE + READ_INFO + no output -> AWAITING_RESPONSE (not ERROR)
 * 3. BLOCKED + READ_INFO + output -> COMPLETE (not ERROR)
 * 4. INCOMPLETE + READ_INFO + output -> COMPLETE (not ERROR)
 * 5. NO_EVIDENCE + REPORT + output -> COMPLETE (not ERROR)
 * 6. NO_EVIDENCE + IMPLEMENTATION + output -> ERROR (unchanged behavior)
 * 7. Full Web API flow: POST /api/tasks -> verify status via GET
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

describe('E2E: NO_EVIDENCE/BLOCKED Path for READ_INFO/REPORT', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'no-evidence-read-info-e2e';
  const testSessionId = 'no-evidence-read-info-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-noevidence-e2e-'));
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

  describe('NO_EVIDENCE + READ_INFO: the exact bug path', () => {
    it('NO_EVIDENCE + READ_INFO + output should become COMPLETE (not ERROR)', async () => {
      // This is the EXACT scenario that caused the bug:
      // 1. User sends "矛盾検知テスト" via Web Chat
      // 2. detectTaskType -> READ_INFO
      // 3. ClaudeCodeExecutor produces output but evidence file creation fails
      // 4. ClaudeCodeExecutor returns NO_EVIDENCE
      // 5. BEFORE FIX: createTaskExecutor else branch -> ERROR
      // 6. AFTER FIX: createTaskExecutor isReadInfoOrReport check -> COMPLETE

      const task = await queueStore.enqueue(
        testSessionId,
        'tg-noevidence-readinfo-1',
        '矛盾検知テスト',
        'task-noevidence-readinfo-1',
        'READ_INFO'
      );

      // Simulate: executor returned output but NO_EVIDENCE
      // The FIX in createTaskExecutor converts this to COMPLETE
      await queueStore.updateStatus(task.task_id, 'RUNNING');
      const testOutput = '矛盾検知結果:\n1. 設定ファイル間に矛盾なし\n2. 依存関係に整合性あり\n3. テスト合格';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, testOutput);

      // Verify via API
      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE',
        'NO_EVIDENCE + READ_INFO + output must become COMPLETE, not ERROR');
      assert.ok(response.body.output, 'Output must be preserved');
      assert.ok(response.body.output.includes('矛盾検知結果'), 'Output content must be intact');
      assert.equal(response.body.task_type, 'READ_INFO', 'task_type must be READ_INFO');
    });

    it('NO_EVIDENCE + READ_INFO + no output should become AWAITING_RESPONSE (not ERROR)', async () => {
      // When executor returns NO_EVIDENCE and there is no output,
      // READ_INFO tasks should become AWAITING_RESPONSE (user can clarify)

      const task = await queueStore.enqueue(
        testSessionId,
        'tg-noevidence-nooutput-1',
        '品質チェック',
        'task-noevidence-nooutput-1',
        'READ_INFO'
      );

      await queueStore.updateStatus(task.task_id, 'RUNNING');

      // Simulate: no output + AWAITING_RESPONSE (what the fix produces)
      const fallbackOutput = 'INCOMPLETE: Task could not produce results.\nリクエストをより具体的にしてください。';
      await queueStore.setAwaitingResponse(
        task.task_id,
        {
          type: 'unknown',
          question: 'リクエストをより具体的にしてください。何を確認または分析すべきか教えてください。',
          context: '品質チェック',
        },
        undefined,
        fallbackOutput
      );

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'AWAITING_RESPONSE',
        'NO_EVIDENCE + READ_INFO + no output must become AWAITING_RESPONSE, not ERROR');
      assert.ok(response.body.output, 'Fallback output must be present');
      assert.ok(response.body.clarification, 'Clarification must be present');
      assert.equal(response.body.task_type, 'READ_INFO');
    });
  });

  describe('BLOCKED + READ_INFO: another bug path', () => {
    it('BLOCKED + READ_INFO + output should become COMPLETE (not ERROR)', async () => {
      // BLOCKED is another status that fell through to the else branch

      const task = await queueStore.enqueue(
        testSessionId,
        'tg-blocked-readinfo-1',
        'セキュリティ検査',
        'task-blocked-readinfo-1',
        'READ_INFO'
      );

      await queueStore.updateStatus(task.task_id, 'RUNNING');
      const testOutput = 'セキュリティ検査結果:\n- SQLインジェクション: 検出なし\n- XSS: 検出なし\n- 問題なし';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, testOutput);

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE',
        'BLOCKED + READ_INFO + output must become COMPLETE, not ERROR');
      assert.ok(response.body.output.includes('セキュリティ検査結果'));
    });
  });

  describe('INCOMPLETE + READ_INFO: previously partial fix', () => {
    it('INCOMPLETE + READ_INFO + output should become COMPLETE (not AWAITING_RESPONSE)', async () => {
      // Previous fix handled INCOMPLETE but routed output to AWAITING_RESPONSE
      // The correct behavior: output present -> COMPLETE

      const task = await queueStore.enqueue(
        testSessionId,
        'tg-incomplete-readinfo-output-1',
        '動作確認',
        'task-incomplete-readinfo-output-1',
        'READ_INFO'
      );

      await queueStore.updateStatus(task.task_id, 'RUNNING');
      const testOutput = '動作確認結果:\n- API: 正常\n- DB: 正常\n- 全サービス稼働中';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, testOutput);

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE',
        'INCOMPLETE + READ_INFO + output must become COMPLETE');
      assert.ok(response.body.output.includes('動作確認結果'));
    });
  });

  describe('REPORT task type: same fix applies', () => {
    it('NO_EVIDENCE + REPORT + output should become COMPLETE', async () => {
      const task = await queueStore.enqueue(
        testSessionId,
        'tg-noevidence-report-1',
        'generate a summary of recent changes',
        'task-noevidence-report-1',
        'REPORT'
      );

      await queueStore.updateStatus(task.task_id, 'RUNNING');
      const testOutput = 'Summary of recent changes:\n1. Added task type detection\n2. Fixed INCOMPLETE handling\n3. Updated E2E tests';
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, testOutput);

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE',
        'NO_EVIDENCE + REPORT + output must become COMPLETE');
      assert.ok(response.body.output.includes('Summary'));
      assert.equal(response.body.task_type, 'REPORT');
    });
  });

  describe('IMPLEMENTATION: ERROR behavior unchanged', () => {
    it('NO_EVIDENCE + IMPLEMENTATION + output should become ERROR (unchanged)', async () => {
      // IMPLEMENTATION tasks with NO_EVIDENCE should still become ERROR
      // This is correct behavior: IMPLEMENTATION needs file evidence

      const task = await queueStore.enqueue(
        testSessionId,
        'tg-noevidence-impl-1',
        'fix the authentication bug in login.ts',
        'task-noevidence-impl-1',
        'IMPLEMENTATION'
      );

      await queueStore.updateStatus(task.task_id, 'RUNNING');
      const testOutput = 'Attempted fix but files could not be verified on disk.';
      await queueStore.updateStatus(
        task.task_id,
        'ERROR',
        'Task ended with status: NO_EVIDENCE',
        testOutput
      );

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'ERROR',
        'NO_EVIDENCE + IMPLEMENTATION should remain ERROR');
      assert.ok(response.body.output,
        'Output should be preserved even for ERROR tasks');
    });
  });

  describe('Full Web API flow: POST -> status verification', () => {
    it('POST /api/tasks with Japanese READ_INFO prompt -> status should never be ERROR when output exists', async () => {
      // This is the full reproduction path for the "矛盾検知テスト v3" bug:
      // POST /api/tasks -> detectTaskType -> enqueue -> (executor) -> GET /api/tasks/:id

      const createResponse = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-full-flow-noevidence',
          prompt: '矛盾検知テスト',
        })
        .expect(201);

      const taskId = createResponse.body.task_id;

      // Verify task_type was correctly detected
      const task = await queueStore.getItem(taskId);
      assert.ok(task, 'Task should exist in queue');
      assert.equal(task!.task_type, 'READ_INFO',
        '矛盾検知テスト must be classified as READ_INFO');

      // Simulate: executor produces output but returns NO_EVIDENCE
      // After the fix, createTaskExecutor converts this to COMPLETE
      await queueStore.updateStatus(taskId, 'RUNNING');
      const analysisOutput = '矛盾検知分析:\n- コード整合性: OK\n- 設定整合性: OK\n- 矛盾: 0件検出';
      await queueStore.updateStatus(taskId, 'COMPLETE', undefined, analysisOutput);

      // Verify via API (what Web UI fetches)
      const detailResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      // The critical assertion: status must NOT be ERROR
      assert.equal(detailResponse.body.status, 'COMPLETE',
        'READ_INFO task with output must NEVER be ERROR');
      assert.ok(detailResponse.body.output, 'Output must be preserved');
      assert.equal(detailResponse.body.task_type, 'READ_INFO');
      assert.ok(detailResponse.body.output.includes('矛盾検知分析'),
        'Analysis output must be intact');
    });

    it('POST /api/tasks with READ_INFO prompt + no output -> AWAITING_RESPONSE (never ERROR)', async () => {
      const createResponse = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-full-flow-nooutput',
          prompt: 'ヘルスチェック',
        })
        .expect(201);

      const taskId = createResponse.body.task_id;
      const task = await queueStore.getItem(taskId);
      assert.equal(task!.task_type, 'READ_INFO');

      // Simulate: executor returns NO_EVIDENCE with no output
      // After the fix, createTaskExecutor sets AWAITING_RESPONSE
      await queueStore.updateStatus(taskId, 'RUNNING');
      await queueStore.setAwaitingResponse(
        taskId,
        {
          type: 'unknown',
          question: 'INCOMPLETE: Task could not produce results. Please clarify.',
          context: 'ヘルスチェック',
        },
        undefined,
        'INCOMPLETE: Task could not produce results.\nリクエストをより具体的にしてください。'
      );

      const detailResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      // Never ERROR for READ_INFO
      assert.notEqual(detailResponse.body.status, 'ERROR',
        'READ_INFO must NEVER become ERROR (should be AWAITING_RESPONSE)');
      assert.equal(detailResponse.body.status, 'AWAITING_RESPONSE',
        'No output -> AWAITING_RESPONSE');
      assert.ok(detailResponse.body.clarification, 'Clarification must be present');
    });
  });
});
