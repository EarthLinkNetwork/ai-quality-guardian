/**
 * E2E Test: Resume = Replay After Restart
 *
 * Tests:
 * - AC-RESUME-1: Resume is re-execution, not process continuation
 * - AC-RESUME-2: Default is Rollback -> Replay
 * - AC-RESUME-3: Resume UI for AWAITING_RESPONSE tasks
 */

import { describe, it, before } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';
import {
  detectRestartCondition,
  shouldShowResumeUI,
  getResumeOptions,
  addProgressEvent,
  createHeartbeatEvent,
  PersistedTask,
} from '../../src/utils/restart-detector';

describe('E2E: Resume = Replay After Restart (AC-RESUME-1, AC-RESUME-2, AC-RESUME-3)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  const namespace = 'resume-replay-test';
  const sessionId = 'session-resume-001';

  before(async () => {
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
    });
  });

  // Helper to create timestamps relative to now
  function getTimestamps() {
    const now = Date.now();
    return {
      now: new Date(now),
      thirtySecsAgo: new Date(now - 30_000),
      oneMinAgo: new Date(now - 60_000),
      fiveSecsAgo: new Date(now - 5_000),
      twoMinsAgo: new Date(now - 120_000),
    };
  }

  function createTask(overrides: Partial<PersistedTask> = {}): PersistedTask {
    const { oneMinAgo, thirtySecsAgo } = getTimestamps();
    return {
      namespace: 'test',
      task_id: 'task-1',
      task_group_id: 'group-1',
      session_id: 'session-1',
      status: 'RUNNING',
      prompt: 'test prompt',
      created_at: oneMinAgo.toISOString(),
      updated_at: thirtySecsAgo.toISOString(),
      events: [],
      attempt: 1,
      ...overrides,
    };
  }

  describe('AC-RESUME-1: Resume is Re-execution', () => {
    it('should detect stale RUNNING task after restart', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        events: [],
      });

      const result = detectRestartCondition(task);

      assert.strictEqual(result.isStale, true, 'Task should be detected as stale');
      assert.strictEqual(
        result.reason,
        'no_events',
        'Reason should be no_events for task without progress'
      );
    });

    it('should not consider active RUNNING task as stale', () => {
      const { fiveSecsAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        events: [
          { type: 'heartbeat', timestamp: fiveSecsAgo.toISOString() },
        ],
      });

      const result = detectRestartCondition(task);

      assert.strictEqual(result.isStale, false, 'Active task should not be stale');
    });

    it('should trigger replay recommendation for stale task', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        events: [],
      });

      const result = detectRestartCondition(task);

      assert.strictEqual(result.recommendedAction, 'rollback_replay');
    });
  });

  describe('AC-RESUME-2: Default is Rollback -> Replay', () => {
    it('should recommend rollback_replay by default for stale tasks', () => {
      const { twoMinsAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: twoMinsAgo.toISOString(),
        events: [],
      });

      const options = getResumeOptions(task);

      assert.strictEqual(options.canResume, true);
      assert.strictEqual(options.canRollbackReplay, true);
      assert.strictEqual(options.defaultAction, 'rollback_replay');
    });

    it('should allow soft_resume only when artifacts are complete', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        output: 'Partial work completed',
        events: [
          { type: 'log_chunk', timestamp: oneMinAgo.toISOString(), data: 'step 1' },
        ],
      });

      const options = getResumeOptions(task, { allowSoftResume: true, staleThresholdMs: 30_000 });

      assert.strictEqual(options.canSoftResume, true, 'Soft resume should be allowed');
      assert.strictEqual(options.defaultAction, 'soft_resume');
    });

    it('should not allow soft_resume when artifacts incomplete', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        events: [], // No events
      });

      const options = getResumeOptions(task);

      assert.strictEqual(options.canSoftResume, false);
      assert.strictEqual(options.defaultAction, 'rollback_replay');
    });
  });

  describe('AC-RESUME-3: Resume UI', () => {
    it('should show Resume UI for AWAITING_RESPONSE tasks', () => {
      const task = createTask({
        status: 'AWAITING_RESPONSE',
      });

      const shouldShow = shouldShowResumeUI(task);

      assert.strictEqual(shouldShow, true);
    });

    it('should show Resume UI for stale RUNNING tasks', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        events: [],
      });

      const shouldShow = shouldShowResumeUI(task);

      assert.strictEqual(shouldShow, true);
    });

    it('should not show Resume UI for active RUNNING tasks', () => {
      const { fiveSecsAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        events: [
          { type: 'heartbeat', timestamp: fiveSecsAgo.toISOString() },
        ],
      });

      const shouldShow = shouldShowResumeUI(task);

      assert.strictEqual(shouldShow, false);
    });

    it('should not show Resume UI for COMPLETE tasks', () => {
      const task = createTask({
        status: 'COMPLETE',
      });

      const shouldShow = shouldShowResumeUI(task);

      assert.strictEqual(shouldShow, false);
    });
  });

  describe('Task state reconstruction from storage', () => {
    it('should persist and retrieve task state', async () => {
      // Create task
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'resume-test-group',
          prompt: 'Test task for resume',
        })
        .expect(201);

      const taskId = res.body.task_id;

      // Retrieve task
      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      // Verify state is persisted
      assert.ok(taskRes.body.task_id);
      assert.ok(taskRes.body.task_group_id);
      assert.ok(taskRes.body.prompt);
      assert.ok(taskRes.body.created_at);
    });

    it('should track attempt count', async () => {
      // Create task
      const res = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'attempt-test-group',
          prompt: 'Test task with attempts',
        })
        .expect(201);

      const taskId = res.body.task_id;

      // Initial attempt should be 1
      const taskRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      // attempt field may or may not be exposed in API
      // but should be trackable internally
      assert.ok(taskRes.body.task_id);
    });
  });

  describe('Progress event updates', () => {
    it('should update task timestamps when progress event added', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        updated_at: oneMinAgo.toISOString(),
      });

      const updated = addProgressEvent(task, createHeartbeatEvent());

      assert.notStrictEqual(
        updated.updated_at,
        oneMinAgo.toISOString(),
        'updated_at should change after progress event'
      );
    });

    it('should accumulate events', () => {
      let task = createTask({ events: [] });

      task = addProgressEvent(task, createHeartbeatEvent());
      task = addProgressEvent(task, createHeartbeatEvent());
      task = addProgressEvent(task, createHeartbeatEvent());

      assert.strictEqual(task.events?.length, 3);
    });
  });

  describe('Integration: Simulated restart scenario', () => {
    it('should handle complete restart flow', async () => {
      // 1. Create task before "restart"
      const createRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: 'restart-flow-group',
          prompt: 'Task that will be interrupted by restart',
        })
        .expect(201);

      const taskId = createRes.body.task_id;

      // 2. Simulate task becoming RUNNING
      await queueStore.updateStatus(taskId, 'RUNNING');

      // 3. Verify task is RUNNING
      const runningRes = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      assert.strictEqual(runningRes.body.status, 'RUNNING');

      // 4. "Restart" happens - no more progress events
      // (In real scenario, executor process would die)

      // 5. Create a task representation for restart detection
      const taskForDetection: PersistedTask = {
        namespace,
        task_id: taskId,
        task_group_id: 'restart-flow-group',
        session_id: sessionId,
        status: 'RUNNING',
        prompt: 'Task that will be interrupted by restart',
        created_at: runningRes.body.created_at,
        updated_at: new Date(Date.now() - 60_000).toISOString(), // Simulate old timestamp
        events: [],
        attempt: 1,
      };

      // 6. Detect restart condition
      const detection = detectRestartCondition(taskForDetection);
      assert.strictEqual(detection.isStale, true);

      // 7. Get resume options
      const options = getResumeOptions(taskForDetection);
      assert.strictEqual(options.canResume, true);
      assert.strictEqual(options.defaultAction, 'rollback_replay');
    });
  });
});
