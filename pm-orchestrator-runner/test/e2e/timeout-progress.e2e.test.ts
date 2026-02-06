/**
 * E2E Test: Timeout with Progress Awareness
 *
 * Tests AC-TIMEOUT-1: Progress-Aware Timeout
 * - idle_timeout: Triggers only when no progress events for specified duration
 * - hard_timeout: Absolute upper limit (safety)
 * - progress_event: Executor emits heartbeat/tool-progress/log-chunk events
 * - On hard_timeout: Set to AWAITING_RESPONSE with Resume option
 */

import { describe, it, before } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';
import {
  STANDARD_PROFILE,
  LONG_PROFILE,
  EXTENDED_PROFILE,
  checkTimeout,
  getRemainingTime,
  selectTimeoutProfile,
} from '../../src/utils/timeout-profile';
import {
  detectRestartCondition,
  addProgressEvent,
  createHeartbeatEvent,
  createToolProgressEvent,
  PersistedTask,
} from '../../src/utils/restart-detector';

describe('E2E: Timeout with Progress Awareness (AC-TIMEOUT-1)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  const namespace = 'timeout-progress-test';
  const sessionId = 'session-timeout-001';

  before(async () => {
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
    });
  });

  describe('Timeout profile selection', () => {
    it('should use standard profile by default', () => {
      const profile = selectTimeoutProfile({});
      assert.strictEqual(profile.name, 'standard');
      assert.strictEqual(profile.idle_timeout_ms, 60_000);
      assert.strictEqual(profile.hard_timeout_ms, 600_000);
    });

    it('should use extended profile for auto-dev loop', () => {
      const profile = selectTimeoutProfile({ isAutoDevLoop: true });
      assert.strictEqual(profile.name, 'extended');
      assert.strictEqual(profile.idle_timeout_ms, 300_000);
      assert.strictEqual(profile.hard_timeout_ms, 3_600_000);
    });

    it('should use long profile for long-running operations', () => {
      const profile = selectTimeoutProfile({ hasLongRunningOperations: true });
      assert.strictEqual(profile.name, 'long');
    });
  });

  describe('Progress events prevent idle timeout', () => {
    it('should not trigger idle timeout when heartbeat is recent', () => {
      const now = Date.now();
      const startTime = new Date(now - 5 * 60 * 1000); // 5 min ago
      const lastProgress = new Date(now - 10 * 1000); // 10 sec ago

      const result = checkTimeout(startTime, lastProgress, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, false);
      assert.strictEqual(result.timeoutType, 'none');
    });

    it('should trigger idle timeout when no recent progress', () => {
      const now = Date.now();
      const startTime = new Date(now - 5 * 60 * 1000); // 5 min ago
      const lastProgress = new Date(now - 2 * 60 * 1000); // 2 min ago (> 60s idle)

      const result = checkTimeout(startTime, lastProgress, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, true);
      assert.strictEqual(result.timeoutType, 'idle');
    });

    it('should trigger hard timeout regardless of recent progress', () => {
      const now = Date.now();
      const startTime = new Date(now - 15 * 60 * 1000); // 15 min ago (> 10 min hard)
      const lastProgress = new Date(now - 5 * 1000); // 5 sec ago (recent)

      const result = checkTimeout(startTime, lastProgress, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, true);
      assert.strictEqual(result.timeoutType, 'hard');
    });
  });

  describe('Progress event types', () => {
    function createTask(overrides: Partial<PersistedTask> = {}): PersistedTask {
      const now = Date.now();
      return {
        namespace: 'test',
        task_id: 'task-1',
        task_group_id: 'group-1',
        session_id: 'session-1',
        status: 'RUNNING',
        prompt: 'test prompt',
        created_at: new Date(now - 60_000).toISOString(),
        updated_at: new Date(now - 30_000).toISOString(),
        events: [],
        attempt: 1,
        ...overrides,
      };
    }

    it('should add heartbeat event to task', () => {
      const task = createTask({ events: [] });
      const updated = addProgressEvent(task, createHeartbeatEvent());

      assert.strictEqual(updated.events?.length, 1);
      assert.strictEqual(updated.events?.[0].type, 'heartbeat');
    });

    it('should add tool_progress event with data', () => {
      const task = createTask({ events: [] });
      const updated = addProgressEvent(
        task,
        createToolProgressEvent({ tool: 'Bash', progress: 50 })
      );

      assert.strictEqual(updated.events?.length, 1);
      assert.strictEqual(updated.events?.[0].type, 'tool_progress');
      assert.deepStrictEqual(updated.events?.[0].data, { tool: 'Bash', progress: 50 });
    });

    it('should prevent stale detection when recent progress exists', () => {
      const now = Date.now();
      const task = createTask({
        status: 'RUNNING',
        events: [
          {
            type: 'heartbeat',
            timestamp: new Date(now - 5_000).toISOString(),
          },
        ],
      });

      const result = detectRestartCondition(task);
      assert.strictEqual(result.isStale, false);
    });
  });

  describe('Remaining time calculation', () => {
    it('should calculate time until next timeout', () => {
      const now = Date.now();
      const startTime = new Date(now - 2 * 60 * 1000); // 2 min ago
      const lastProgress = new Date(now - 30 * 1000); // 30 sec ago

      const result = getRemainingTime(startTime, lastProgress, STANDARD_PROFILE);

      // Idle: 60s - 30s = ~30s remaining
      assert.ok(result.untilIdleTimeout > 0);
      assert.ok(result.untilIdleTimeout <= 31_000);

      // Hard: 10min - 2min = ~8min remaining
      assert.ok(result.untilHardTimeout > 0);
      assert.ok(result.untilHardTimeout <= 8 * 60 * 1000 + 1000);

      // Next timeout should be idle
      assert.strictEqual(result.nextTimeoutType, 'idle');
    });

    it('should return 0 for expired timeouts', () => {
      const now = Date.now();
      const veryOld = new Date(now - 20 * 60 * 1000); // 20 min ago

      const result = getRemainingTime(veryOld, veryOld, STANDARD_PROFILE);

      assert.strictEqual(result.untilIdleTimeout, 0);
      assert.strictEqual(result.untilHardTimeout, 0);
      assert.strictEqual(result.nextTimeout, 0);
    });
  });

  describe('Integration: Task with timeout behavior', () => {
    it('should create task and track timeout readiness', async () => {
      // Create a task
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'timeout-test-group',
          prompt: 'Long running operation',
        })
        .expect(201);

      const taskId = res.body.task_id;

      // Verify task created
      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.ok(taskRes.body.created_at);
      assert.ok(taskRes.body.updated_at);

      // Task should have timestamps that can be used for timeout checking
      const startTime = new Date(taskRes.body.created_at);
      const lastUpdate = new Date(taskRes.body.updated_at);

      // Initially should not be timed out
      const now = Date.now();
      const msSinceUpdate = now - lastUpdate.getTime();

      // If just created, should not be timed out
      if (msSinceUpdate < 60_000) {
        const result = checkTimeout(startTime, lastUpdate, STANDARD_PROFILE);
        assert.strictEqual(result.isTimedOut, false);
      }
    });
  });

  describe('On hard_timeout: AWAITING_RESPONSE recommendation', () => {
    it('should recommend AWAITING_RESPONSE status on timeout', () => {
      const now = Date.now();
      const startTime = new Date(now - 15 * 60 * 1000); // 15 min (hard timeout)
      const lastProgress = new Date(now - 5 * 1000);

      const result = checkTimeout(startTime, lastProgress, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, true);
      assert.strictEqual(result.timeoutType, 'hard');
      assert.strictEqual(result.shouldSetAwaitingResponse, true);
    });

    it('should also recommend AWAITING_RESPONSE on idle timeout', () => {
      const now = Date.now();
      const startTime = new Date(now - 3 * 60 * 1000); // 3 min
      const lastProgress = new Date(now - 2 * 60 * 1000); // 2 min ago (idle timeout)

      const result = checkTimeout(startTime, lastProgress, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, true);
      assert.strictEqual(result.timeoutType, 'idle');
      assert.strictEqual(result.shouldSetAwaitingResponse, true);
    });
  });
});
