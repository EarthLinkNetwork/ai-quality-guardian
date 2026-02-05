/**
 * E2E Test: Web UI Task Type Propagation
 *
 * Verifies that task_type is correctly propagated from Web API endpoints
 * and that detectTaskType correctly classifies Japanese inputs.
 *
 * This test covers the root cause of the "矛盾検知テスト" ERROR bug:
 * - POST /api/tasks was NOT passing task_type to enqueue
 * - detectTaskType was classifying Japanese inputs incorrectly
 * - INCOMPLETE READ_INFO tasks were treated as ERROR instead of AWAITING_RESPONSE
 *
 * Root cause: task-type-detector.ts defaulted to IMPLEMENTATION for any input
 * not matching specific patterns, including most Japanese analysis/test inputs.
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
import { detectTaskType } from '../../src/utils/task-type-detector';

describe('E2E: Web Task Type Propagation', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'tasktype-propagation-e2e';
  const testSessionId = 'tasktype-propagation-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-tasktype-e2e-'));
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

  describe('POST /api/tasks should propagate task_type via detectTaskType', () => {
    it('should set task_type=READ_INFO for Japanese test/verification prompts', async () => {
      // "矛盾検知テスト" was the exact prompt that triggered the bug
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-tasktype-1',
          prompt: '矛盾検知テスト',
        })
        .expect(201);

      const task = await queueStore.getItem(response.body.task_id);
      assert.ok(task, 'Task should exist in queue');
      assert.equal(task!.task_type, 'READ_INFO',
        'Japanese test/verification prompt should be classified as READ_INFO, not IMPLEMENTATION');
    });

    it('should set task_type=READ_INFO for Japanese analysis prompts', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-tasktype-2',
          prompt: '品質チェック',
        })
        .expect(201);

      const task = await queueStore.getItem(response.body.task_id);
      assert.ok(task, 'Task should exist in queue');
      assert.equal(task!.task_type, 'READ_INFO');
    });

    it('should set task_type=IMPLEMENTATION for explicit file modification prompts', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-tasktype-3',
          prompt: 'fix the authentication bug in login.ts',
        })
        .expect(201);

      const task = await queueStore.getItem(response.body.task_id);
      assert.ok(task, 'Task should exist in queue');
      assert.equal(task!.task_type, 'IMPLEMENTATION');
    });

    it('should set task_type=REPORT for report prompts', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-tasktype-4',
          prompt: 'generate a summary of recent changes',
        })
        .expect(201);

      const task = await queueStore.getItem(response.body.task_id);
      assert.ok(task, 'Task should exist in queue');
      assert.equal(task!.task_type, 'REPORT');
    });
  });

  describe('POST /api/task-groups should propagate task_type via detectTaskType', () => {
    it('should set task_type=READ_INFO for Japanese verification prompts', async () => {
      const response = await request(app)
        .post('/api/task-groups')
        .send({
          task_group_id: 'tg-group-tasktype-1',
          prompt: '整合性テスト',
        })
        .expect(201);

      const task = await queueStore.getItem(response.body.task_id);
      assert.ok(task, 'Task should exist in queue');
      assert.equal(task!.task_type, 'READ_INFO',
        'Japanese verification prompt should be classified as READ_INFO');
    });
  });

  describe('INCOMPLETE handling with correct task_type propagation', () => {
    it('READ_INFO INCOMPLETE via POST /api/tasks should become AWAITING_RESPONSE, not ERROR', async () => {
      // Step 1: Submit task via POST /api/tasks (the exact flow that had the bug)
      const createResponse = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-incomplete-tasktype',
          prompt: '矛盾検知テスト',
        })
        .expect(201);

      const taskId = createResponse.body.task_id;
      const task = await queueStore.getItem(taskId);

      // Verify task_type was correctly set
      assert.equal(task!.task_type, 'READ_INFO',
        'task_type must be READ_INFO for 矛盾検知テスト');

      // Step 2: Simulate the executor returning INCOMPLETE (what createTaskExecutor does)
      // Since we can't run the full executor in tests, we simulate the result
      // by setting the task to AWAITING_RESPONSE (which is what the executor does
      // for READ_INFO INCOMPLETE tasks)
      await queueStore.updateStatus(taskId, 'RUNNING');
      await queueStore.setAwaitingResponse(
        taskId,
        {
          type: 'unknown',
          question: 'INCOMPLETE: Task returned partial results. Please clarify.',
          context: '矛盾検知テスト',
        },
        undefined,
        'Partial results from contradiction detection test'
      );

      // Step 3: Verify via API - should be AWAITING_RESPONSE, not ERROR
      const detailResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.equal(detailResponse.body.status, 'AWAITING_RESPONSE',
        'READ_INFO INCOMPLETE must become AWAITING_RESPONSE, NOT ERROR');
      assert.equal(detailResponse.body.task_type, 'READ_INFO');
      assert.ok(detailResponse.body.output, 'Output must be preserved');
      assert.ok(detailResponse.body.clarification, 'Clarification must be present');
    });

    it('IMPLEMENTATION INCOMPLETE via POST /api/tasks should become ERROR with output preserved', async () => {
      // Submit an IMPLEMENTATION task
      const createResponse = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'tg-impl-incomplete-tasktype',
          prompt: 'fix the authentication bug in login.ts',
        })
        .expect(201);

      const taskId = createResponse.body.task_id;
      const task = await queueStore.getItem(taskId);

      // Verify task_type
      assert.equal(task!.task_type, 'IMPLEMENTATION');

      // Simulate IMPLEMENTATION INCOMPLETE -> ERROR
      await queueStore.updateStatus(taskId, 'RUNNING');
      await queueStore.updateStatus(
        taskId,
        'ERROR',
        'Task ended with status: INCOMPLETE',
        'Partial fix applied but verification failed.'
      );

      const detailResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.equal(detailResponse.body.status, 'ERROR',
        'IMPLEMENTATION INCOMPLETE should be ERROR');
      assert.ok(detailResponse.body.output,
        'Output should be preserved even for ERROR tasks');
    });
  });

  describe('detectTaskType Japanese classification (regression prevention)', () => {
    // These are the exact inputs that were misclassified before the fix
    const readInfoJapanese = [
      '矛盾検知テスト',
      '整合性テスト',
      '動作確認',
      '品質チェック',
      'ヘルスチェック',
      'セキュリティ検査',
      '矛盾検知',
      'パフォーマンス分析',
      'コード解析',
      'このプロジェクトの構造を教えて',
      'アーキテクチャの説明して',
    ];

    const implementationJapanese = [
      'バグを修正して',
      'テストを書いて',
      '新しい機能を追加',
      'ファイルを削除して',
      'テストを追加して',
    ];

    for (const input of readInfoJapanese) {
      it(`should classify "${input}" as READ_INFO`, () => {
        assert.equal(detectTaskType(input), 'READ_INFO',
          `"${input}" must be READ_INFO to prevent INCOMPLETE -> ERROR bug`);
      });
    }

    for (const input of implementationJapanese) {
      it(`should classify "${input}" as IMPLEMENTATION`, () => {
        assert.equal(detectTaskType(input), 'IMPLEMENTATION',
          `"${input}" should be IMPLEMENTATION for correct handling`);
      });
    }
  });
});
