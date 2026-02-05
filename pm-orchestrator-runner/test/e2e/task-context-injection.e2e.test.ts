/**
 * E2E Test: TaskContext Injection and PM Block Stripping
 *
 * This test verifies:
 * AC1: Format validation - [TaskContext] block is properly formatted
 * AC2: No PM blocks - PM Orchestrator meta-blocks are stripped from output
 * AC3: No secrets - API keys and sensitive data are redacted
 * AC4: Value matching - TaskContext values match queue item fields
 *
 * Acceptance Criteria:
 * - TaskContext is injected with correct format
 * - PM Orchestrator blocks (━━━) are stripped from output
 * - API keys are redacted (hasOpenAIKey=true/false instead of actual key)
 * - TaskContext values match the actual queue item
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

describe('E2E: TaskContext Injection and PM Block Stripping', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'context-injection-e2e';
  const testSessionId = 'context-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-context-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
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
      queueStore: queueStore as unknown as IQueueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('TaskContext Injection', () => {
    it('AC1: should inject TaskContext with correct format', async function() {
      this.timeout(15000);

      // Set PM_TEST_EXECUTOR_MODE=context_echo to echo the prompt back
      process.env.PM_TEST_EXECUTOR_MODE = 'context_echo';

      try {
        // Submit a task
        const submitResponse = await request(app)
          .post('/api/tasks')
          .send({
            task_group_id: 'test-group-context',
            prompt: 'Original user prompt'
          })
          .expect(200);

        const taskId = submitResponse.body.id;
        assert.ok(taskId, 'Task ID should be returned');

        // Wait for task to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get task details
        const taskResponse = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);

        const task = taskResponse.body;
        assert.equal(task.status, 'COMPLETE', 'Task should be COMPLETE');
        assert.ok(task.output, 'Task output should exist');

        // Verify TaskContext format
        const output = task.output;
        assert.ok(output.includes('[TaskContext]'), 'Output should contain [TaskContext] header');
        assert.ok(output.includes('[/TaskContext]'), 'Output should contain [/TaskContext] footer');

        // Verify TaskContext fields
        assert.ok(output.includes('taskId:'), 'TaskContext should contain taskId');
        assert.ok(output.includes('taskGroupId:'), 'TaskContext should contain taskGroupId');
        assert.ok(output.includes('status:'), 'TaskContext should contain status');
        assert.ok(output.includes('timestamp:'), 'TaskContext should contain timestamp');
        assert.ok(output.includes('hasOpenAIKey:'), 'TaskContext should contain hasOpenAIKey');
        assert.ok(output.includes('hasRunnerDevDir:'), 'TaskContext should contain hasRunnerDevDir');
      } finally {
        delete process.env.PM_TEST_EXECUTOR_MODE;
      }
    });

    it('AC2: should strip PM Orchestrator meta-blocks from output', async function() {
      this.timeout(15000);

      // Use static_output mode which returns COMPLETE with output
      process.env.PM_TEST_EXECUTOR_MODE = 'static_output';

      try {
        const submitResponse = await request(app)
          .post('/api/tasks')
          .send({
            task_group_id: 'test-group-pm-strip',
            prompt: 'Test PM block stripping'
          })
          .expect(200);

        const taskId = submitResponse.body.id;

        await new Promise(resolve => setTimeout(resolve, 2000));

        const taskResponse = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);

        const task = taskResponse.body;
        assert.equal(task.status, 'COMPLETE');
        assert.ok(task.output);

        // Verify PM Orchestrator blocks are stripped
        const output = task.output;
        assert.ok(!output.includes('━━━'), 'Output should not contain PM fence lines');
        assert.ok(!output.includes('PM Orchestrator 起動ルール'), 'Output should not contain PM title');
        assert.ok(!output.includes('【表示ルール】'), 'Output should not contain PM rules');
        assert.ok(!output.includes('【禁止事項】'), 'Output should not contain PM prohibitions');
      } finally {
        delete process.env.PM_TEST_EXECUTOR_MODE;
      }
    });

    it('AC3: should redact API keys in TaskContext', async function() {
      this.timeout(15000);

      // Set a test API key
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-key-12345';
      process.env.PM_TEST_EXECUTOR_MODE = 'context_echo';

      try {
        const submitResponse = await request(app)
          .post('/api/tasks')
          .send({
            task_group_id: 'test-group-secrets',
            prompt: 'Test secret redaction'
          })
          .expect(200);

        const taskId = submitResponse.body.id;

        await new Promise(resolve => setTimeout(resolve, 2000));

        const taskResponse = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);

        const task = taskResponse.body;
        assert.equal(task.status, 'COMPLETE');
        assert.ok(task.output);

        // Verify API key is NOT exposed
        const output = task.output;
        assert.ok(!output.includes('sk-test-key-12345'), 'Output should not contain actual API key');
        assert.ok(output.includes('hasOpenAIKey: true') || output.includes('hasOpenAIKey: false'),
          'Output should contain hasOpenAIKey boolean flag');
      } finally {
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
        delete process.env.PM_TEST_EXECUTOR_MODE;
      }
    });

    it('AC4: should inject TaskContext values matching queue item', async function() {
      this.timeout(15000);

      process.env.PM_TEST_EXECUTOR_MODE = 'context_echo';

      try {
        const submitResponse = await request(app)
          .post('/api/tasks')
          .send({
            task_group_id: 'test-group-values',
            prompt: 'Test value matching'
          })
          .expect(200);

        const taskId = submitResponse.body.id;

        await new Promise(resolve => setTimeout(resolve, 2000));

        const taskResponse = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);

        const task = taskResponse.body;
        assert.equal(task.status, 'COMPLETE');
        assert.ok(task.output);

        // Verify TaskContext values match the task
        const output = task.output;
        assert.ok(output.includes(`taskId: ${taskId}`), 'TaskContext taskId should match actual task ID');
        assert.ok(output.includes('taskGroupId: test-group-values'), 'TaskContext taskGroupId should match');
        assert.ok(output.includes('status: PENDING') || output.includes('status: RUNNING'),
          'TaskContext should contain valid status');
      } finally {
        delete process.env.PM_TEST_EXECUTOR_MODE;
      }
    });
  });

  describe('OutputRules Injection', () => {
    it('should inject OutputRules after TaskContext', async function() {
      this.timeout(15000);

      process.env.PM_TEST_EXECUTOR_MODE = 'context_echo';

      try {
        const submitResponse = await request(app)
          .post('/api/tasks')
          .send({
            task_group_id: 'test-group-output-rules',
            prompt: 'Test OutputRules'
          })
          .expect(200);

        const taskId = submitResponse.body.id;

        await new Promise(resolve => setTimeout(resolve, 2000));

        const taskResponse = await request(app)
          .get(`/api/tasks/${taskId}`)
          .expect(200);

        const task = taskResponse.body;
        assert.equal(task.status, 'COMPLETE');
        assert.ok(task.output);

        // Verify OutputRules are injected
        const output = task.output;
        assert.ok(output.includes('[OutputRules]'), 'Output should contain [OutputRules] header');
        assert.ok(output.includes('[/OutputRules]'), 'Output should contain [/OutputRules] footer');
        assert.ok(output.includes('CRITICAL: Your response will be shown directly to the user'),
          'OutputRules should contain critical notice');
        assert.ok(output.includes('Do NOT prepend any meta-blocks'),
          'OutputRules should contain no-meta-block instruction');
      } finally {
        delete process.env.PM_TEST_EXECUTOR_MODE;
      }
    });
  });
});
