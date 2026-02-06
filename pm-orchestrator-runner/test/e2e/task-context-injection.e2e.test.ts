/**
 * E2E Test: TaskContext Injection and PM Block Stripping
 *
 * This test verifies:
 * AC1: Format validation - output starts with user-requested format, no preamble
 * AC2: No PM blocks - PM Orchestrator meta-blocks are stripped from output
 * AC3: No secrets - API keys are redacted to boolean flags only
 * AC4: Value matching - TaskContext values match queue item metadata
 *
 * Tests are structured in two layers:
 * 1. Unit tests for buildTaskContext / injectTaskContext / stripPmOrchestratorBlocks
 * 2. E2E tests via API to verify output visibility through the full pipeline
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
import { QueueItem } from '../../src/queue';
import {
  buildTaskContext,
  injectTaskContext,
  stripPmOrchestratorBlocks,
} from '../../src/cli/index';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  GlobalConfig,
} from '../../src/config/global-config';

// Helper to create a mock QueueItem for unit tests
function createMockQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    task_id: 'test-task-001',
    task_group_id: 'test-group-001',
    session_id: 'test-session-001',
    prompt: 'Test prompt',
    status: 'RUNNING',
    created_at: '2025-01-15T10:00:00.000Z',
    updated_at: '2025-01-15T10:01:00.000Z',
    task_type: 'READ_INFO',
    namespace: 'test-ns',
    ...overrides,
  } as QueueItem;
}

describe('E2E: TaskContext Injection and PM Block Stripping', () => {
  // ================================================================
  // Unit Tests: buildTaskContext
  // ================================================================
  describe('buildTaskContext()', () => {
    it('should produce [TaskContext] block with all required fields', () => {
      const item = createMockQueueItem();
      const ctx = buildTaskContext(item);

      assert.ok(ctx.startsWith('[TaskContext]'), 'Should start with [TaskContext]');
      assert.ok(ctx.endsWith('[/TaskContext]'), 'Should end with [/TaskContext]');
      assert.ok(ctx.includes('taskId: test-task-001'), 'Should include taskId');
      assert.ok(ctx.includes('taskGroupId: test-group-001'), 'Should include taskGroupId');
      assert.ok(ctx.includes('sessionId: test-session-001'), 'Should include sessionId');
      assert.ok(ctx.includes('status: RUNNING'), 'Should include status');
      assert.ok(ctx.includes('createdAt: 2025-01-15T10:00:00.000Z'), 'Should include createdAt');
      assert.ok(ctx.includes('updatedAt: 2025-01-15T10:01:00.000Z'), 'Should include updatedAt');
      assert.ok(ctx.includes('taskType: READ_INFO'), 'Should include taskType');
      assert.ok(ctx.includes('hasOpenAIKey:'), 'Should include hasOpenAIKey');
      assert.ok(ctx.includes('hasRunnerDevDir:'), 'Should include hasRunnerDevDir');
    });

    it('AC3: should expose only boolean for hasOpenAIKey, never the actual key', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      try {
        process.env.OPENAI_API_KEY = 'sk-test-SUPERSECRET-12345678901234567890';
        const item = createMockQueueItem();
        const ctx = buildTaskContext(item);

        // Must contain boolean flag
        assert.ok(ctx.includes('hasOpenAIKey: true'), 'Should show hasOpenAIKey: true');
        // Must NOT contain the actual key
        assert.ok(!ctx.includes('sk-test-SUPERSECRET'), 'Must NOT contain actual API key');
        // Regex check for any sk- pattern
        const secretPattern = /sk-[A-Za-z0-9_-]{10,}/;
        assert.ok(!secretPattern.test(ctx), 'Must not match sk-* secret pattern');
      } finally {
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
      }
    });

    it('AC3: should show hasOpenAIKey: false when no key is set', () => {
      const originalEnvKey = process.env.OPENAI_API_KEY;
      // Also need to clear config file API key (DI compliance)
      const originalConfig = loadGlobalConfig();
      const originalConfigKey = originalConfig.apiKeys?.openai;
      try {
        delete process.env.OPENAI_API_KEY;
        // Clear config file API key temporarily
        if (originalConfig.apiKeys?.openai) {
          const tempConfig = { ...originalConfig, apiKeys: { ...originalConfig.apiKeys, openai: undefined } };
          saveGlobalConfig(tempConfig);
        }
        const item = createMockQueueItem();
        const ctx = buildTaskContext(item);
        assert.ok(ctx.includes('hasOpenAIKey: false'), 'Should show hasOpenAIKey: false');
      } finally {
        if (originalEnvKey) {
          process.env.OPENAI_API_KEY = originalEnvKey;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
        // Restore config file API key
        if (originalConfigKey) {
          const restoredConfig = loadGlobalConfig();
          restoredConfig.apiKeys = restoredConfig.apiKeys || {};
          restoredConfig.apiKeys.openai = originalConfigKey;
          saveGlobalConfig(restoredConfig);
        }
      }
    });

    it('should default taskType to READ_INFO when undefined', () => {
      const item = createMockQueueItem({ task_type: undefined });
      const ctx = buildTaskContext(item);
      assert.ok(ctx.includes('taskType: READ_INFO'), 'Should default to READ_INFO');
    });
  });

  // ================================================================
  // Unit Tests: injectTaskContext
  // ================================================================
  describe('injectTaskContext()', () => {
    it('should prepend TaskContext and OutputRules before the original prompt', () => {
      const item = createMockQueueItem();
      const enriched = injectTaskContext('Original user prompt', item);

      // Order must be: [TaskContext] ... [/TaskContext] ... [OutputRules] ... [/OutputRules] ... Original
      const ctxStart = enriched.indexOf('[TaskContext]');
      const ctxEnd = enriched.indexOf('[/TaskContext]');
      const rulesStart = enriched.indexOf('[OutputRules]');
      const rulesEnd = enriched.indexOf('[/OutputRules]');
      const promptStart = enriched.indexOf('Original user prompt');

      assert.ok(ctxStart >= 0, '[TaskContext] should be present');
      assert.ok(ctxEnd > ctxStart, '[/TaskContext] should come after [TaskContext]');
      assert.ok(rulesStart > ctxEnd, '[OutputRules] should come after [/TaskContext]');
      assert.ok(rulesEnd > rulesStart, '[/OutputRules] should come after [OutputRules]');
      assert.ok(promptStart > rulesEnd, 'Original prompt should come after [/OutputRules]');
    });

    it('should include critical no-meta-block instruction in OutputRules', () => {
      const item = createMockQueueItem();
      const enriched = injectTaskContext('Test', item);

      assert.ok(enriched.includes('Do NOT prepend any meta-blocks'), 'Should include no-meta-block instruction');
      assert.ok(enriched.includes('Do NOT add decorative separators'), 'Should include no-separators instruction');
      assert.ok(enriched.includes('Never output raw API keys'), 'Should include no-secrets instruction');
    });

    it('AC4: TaskContext values should match the QueueItem fields exactly', () => {
      const item = createMockQueueItem({
        task_id: 'my-unique-task-42',
        task_group_id: 'group-alpha',
        session_id: 'session-beta',
        created_at: '2025-02-01T08:30:00.000Z',
        updated_at: '2025-02-01T08:31:00.000Z',
      });
      const enriched = injectTaskContext('Check values', item);

      assert.ok(enriched.includes('taskId: my-unique-task-42'), 'taskId must match');
      assert.ok(enriched.includes('taskGroupId: group-alpha'), 'taskGroupId must match');
      assert.ok(enriched.includes('sessionId: session-beta'), 'sessionId must match');
      assert.ok(enriched.includes('createdAt: 2025-02-01T08:30:00.000Z'), 'createdAt must match');
      assert.ok(enriched.includes('updatedAt: 2025-02-01T08:31:00.000Z'), 'updatedAt must match');
    });
  });

  // ================================================================
  // Unit Tests: stripPmOrchestratorBlocks
  // ================================================================
  describe('stripPmOrchestratorBlocks()', () => {
    it('AC2: should strip PM Orchestrator fence blocks (━━━)', () => {
      const pollutedOutput = [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'PM Orchestrator 起動ルール（毎チャット冒頭表示）',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'SECTION A: System Status Report',
        'taskId: abc-123',
      ].join('\n');

      const cleaned = stripPmOrchestratorBlocks(pollutedOutput);
      assert.ok(!cleaned.includes('━━━'), 'Should not contain fence lines');
      assert.ok(!cleaned.includes('PM Orchestrator 起動ルール'), 'Should not contain PM title');
      assert.ok(cleaned.includes('SECTION A: System Status Report'), 'Should preserve user content');
      assert.ok(cleaned.includes('taskId: abc-123'), 'Should preserve task data');
    });

    it('AC1: cleaned output should start with user-requested format', () => {
      const pollutedOutput = [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'PM Orchestrator 起動ルール（毎チャット冒頭表示）',
        '【表示ルール】',
        'このブロック全体を、毎回応答の「一番最初」にそのまま表示すること。',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'SECTION A: Status',
        'Value: OK',
      ].join('\n');

      const cleaned = stripPmOrchestratorBlocks(pollutedOutput);
      assert.ok(cleaned.startsWith('SECTION A:'), `Output should start with "SECTION A:", got: "${cleaned.substring(0, 30)}"`);
    });

    it('should strip 【表示ルール】and similar PM artifact lines', () => {
      const output = '【表示ルール】このブロック\n【禁止事項】テスト\nReal content here';
      const cleaned = stripPmOrchestratorBlocks(output);
      assert.ok(!cleaned.includes('【表示ルール】'), 'Should strip 表示ルール');
      assert.ok(!cleaned.includes('【禁止事項】'), 'Should strip 禁止事項');
      assert.ok(cleaned.includes('Real content here'), 'Should preserve real content');
    });

    it('should handle empty/null output gracefully', () => {
      assert.equal(stripPmOrchestratorBlocks(''), '');
      assert.equal(stripPmOrchestratorBlocks(null as unknown as string), null);
      assert.equal(stripPmOrchestratorBlocks(undefined as unknown as string), undefined);
    });

    it('should not strip content that merely mentions PM Orchestrator in normal text', () => {
      const output = 'The PM Orchestrator system handles task routing.\nIt works well.';
      const cleaned = stripPmOrchestratorBlocks(output);
      assert.equal(cleaned, output, 'Should not strip normal text mentioning PM Orchestrator');
    });
  });

  // ================================================================
  // E2E Tests: Full pipeline via API
  // ================================================================
  describe('Full E2E: API pipeline with TaskContext output', () => {
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

    it('AC1+AC2: output from executor should have PM blocks stripped (simulated)', async () => {
      // Simulate executor producing output that contains PM Orchestrator blocks
      // In real flow, stripPmOrchestratorBlocks runs in createTaskExecutor
      // Here we verify the strip function + API output pipeline

      const pmPollutedOutput = [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'PM Orchestrator 起動ルール（毎チャット冒頭表示）',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'SECTION A: System Status',
        'taskId: task-pm-strip-001',
        'status: operational',
      ].join('\n');

      // Strip PM blocks (as createTaskExecutor does)
      const cleanOutput = stripPmOrchestratorBlocks(pmPollutedOutput);

      // Enqueue and complete with clean output
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-pm-test',
        'Report status in SECTION A format',
        'task-pm-strip-001',
        'READ_INFO'
      );
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, cleanOutput);

      // Verify via API
      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      assert.equal(response.body.status, 'COMPLETE');
      assert.ok(response.body.output, 'Output should exist');
      assert.ok(!response.body.output.includes('━━━'), 'API output should not contain PM fence lines');
      assert.ok(!response.body.output.includes('PM Orchestrator 起動ルール'), 'API output should not contain PM title');
      assert.ok(response.body.output.startsWith('SECTION A:'), 'Output should start with SECTION A:');
    });

    it('AC3: output should not contain sk-* secret patterns', async () => {
      // Simulate output that includes TaskContext values (no secrets)
      const safeOutput = [
        'SECTION A: Environment',
        'hasOpenAIKey: true',
        'hasRunnerDevDir: false',
        'No secrets exposed.',
      ].join('\n');

      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-secrets-test',
        'Report environment',
        'task-secrets-001',
        'READ_INFO'
      );
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, safeOutput);

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      const output = response.body.output;
      const secretPattern = /sk-[A-Za-z0-9_-]{10,}/;
      assert.ok(!secretPattern.test(output), 'Output must NOT contain sk-* secret pattern');
      assert.ok(output.includes('hasOpenAIKey: true'), 'Should contain boolean flag');
    });

    it('AC4: TaskContext values should be transcribable via API', async () => {
      // Create a task with known metadata
      const task = await queueStore.enqueue(
        testSessionId,
        'task-group-values-test',
        'Transcribe screen values',
        'task-values-001',
        'READ_INFO'
      );

      // Simulate executor output that transcribes TaskContext values
      const item = createMockQueueItem({
        task_id: task.task_id,
        task_group_id: task.task_group_id,
        session_id: task.session_id,
        created_at: task.created_at,
        updated_at: task.updated_at,
      });
      const ctx = buildTaskContext(item);

      // The executor would echo these values; verify they match API fields
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, ctx);

      const response = await request(app)
        .get(`/api/tasks/${task.task_id}`)
        .expect(200);

      const output = response.body.output;
      assert.ok(output.includes(`taskId: ${response.body.task_id}`), 'taskId in output must match API task_id');
      assert.ok(output.includes(`taskGroupId: ${response.body.task_group_id}`), 'taskGroupId must match API task_group_id');
      assert.ok(output.includes(`sessionId: ${response.body.session_id}`), 'sessionId must match API session_id');
    });

    it('should preserve output through task group listing', async () => {
      const taskGroupId = 'task-group-listing-test';
      const cleanOutput = 'SECTION A: Summary\nAll systems nominal.';

      const task = await queueStore.enqueue(
        testSessionId,
        taskGroupId,
        'Summarize',
        'task-listing-001',
        'READ_INFO'
      );
      await queueStore.updateStatus(task.task_id, 'COMPLETE', undefined, cleanOutput);

      const response = await request(app)
        .get(`/api/task-groups/${taskGroupId}/tasks`)
        .expect(200);

      const found = response.body.tasks.find((t: { task_id: string }) => t.task_id === 'task-listing-001');
      assert.ok(found, 'Task should be in listing');
      assert.equal(found.output, cleanOutput, 'Output should be preserved in listing');
      assert.equal(found.has_output, true, 'has_output flag should be true');
    });
  });
});
