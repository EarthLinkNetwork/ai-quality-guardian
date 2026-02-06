/**
 * Unit Tests for Restart Detector
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-RESUME-1, AC-RESUME-2
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  detectRestartCondition,
  shouldShowResumeUI,
  getResumeOptions,
  addProgressEvent,
  createHeartbeatEvent,
  createToolProgressEvent,
  createLogChunkEvent,
  PersistedTask,
  ProgressEvent,
} from '../../../src/utils/restart-detector';

describe('restart-detector', () => {
  // Helper to get fresh timestamps
  function getTimestamps() {
    const now = Date.now();
    return {
      now: new Date(now),
      thirtySecsAgo: new Date(now - 30_000),
      oneMinAgo: new Date(now - 60_000),
      fiveSecsAgo: new Date(now - 5_000),
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

  describe('detectRestartCondition', () => {
    it('should detect stale RUNNING task with no events', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        events: [],
      });

      const result = detectRestartCondition(task);

      assert.strictEqual(result.isStale, true);
      assert.strictEqual(result.reason, 'no_events');
      assert.ok(result.elapsedMs >= 59_000); // Allow some tolerance
      assert.strictEqual(result.recommendedAction, 'rollback_replay');
    });

    it('should detect stale RUNNING task with old events', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        events: [
          { type: 'heartbeat', timestamp: oneMinAgo.toISOString() },
        ],
      });

      const result = detectRestartCondition(task);

      assert.strictEqual(result.isStale, true);
      assert.strictEqual(result.reason, 'timeout');
      assert.ok(result.elapsedMs >= 59_000);
    });

    it('should not detect stale for recent progress', () => {
      const { fiveSecsAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        events: [
          { type: 'heartbeat', timestamp: fiveSecsAgo.toISOString() },
        ],
      });

      const result = detectRestartCondition(task);

      assert.strictEqual(result.isStale, false);
      assert.strictEqual(result.reason, 'none');
      assert.strictEqual(result.recommendedAction, 'none');
    });

    it('should not check non-RUNNING tasks', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'COMPLETE',
        updated_at: oneMinAgo.toISOString(),
      });

      const result = detectRestartCondition(task);

      assert.strictEqual(result.isStale, false);
      assert.strictEqual(result.reason, 'none');
    });

    it('should recommend soft_resume when artifacts are complete', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        output: 'Some output was saved',
        events: [
          { type: 'log_chunk', timestamp: oneMinAgo.toISOString(), data: 'some log' },
        ],
      });

      const result = detectRestartCondition(task, { allowSoftResume: true, staleThresholdMs: 30_000 });

      assert.strictEqual(result.isStale, true);
      assert.strictEqual(result.recommendedAction, 'soft_resume');
    });

    it('should respect custom staleThresholdMs', () => {
      const { fiveSecsAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: fiveSecsAgo.toISOString(),
        events: [],
      });

      // With default 30s threshold, should not be stale
      const result1 = detectRestartCondition(task);
      assert.strictEqual(result1.isStale, false);

      // With 1s threshold, should be stale
      const result2 = detectRestartCondition(task, { staleThresholdMs: 1000, allowSoftResume: false });
      assert.strictEqual(result2.isStale, true);
    });
  });

  describe('shouldShowResumeUI', () => {
    it('should return true for AWAITING_RESPONSE status', () => {
      const task = createTask({
        status: 'AWAITING_RESPONSE',
      });

      const result = shouldShowResumeUI(task);
      assert.strictEqual(result, true);
    });

    it('should return true for stale RUNNING task', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        events: [],
      });

      const result = shouldShowResumeUI(task);
      assert.strictEqual(result, true);
    });

    it('should return false for active RUNNING task', () => {
      const { fiveSecsAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        events: [
          { type: 'heartbeat', timestamp: fiveSecsAgo.toISOString() },
        ],
      });

      const result = shouldShowResumeUI(task);
      assert.strictEqual(result, false);
    });

    it('should return false for COMPLETE task', () => {
      const task = createTask({
        status: 'COMPLETE',
      });

      const result = shouldShowResumeUI(task);
      assert.strictEqual(result, false);
    });
  });

  describe('getResumeOptions', () => {
    it('should return resume options for stale task', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        events: [],
      });

      const options = getResumeOptions(task);

      assert.strictEqual(options.canResume, true);
      assert.strictEqual(options.canRollbackReplay, true);
      assert.strictEqual(options.canSoftResume, false); // No artifacts
      assert.strictEqual(options.defaultAction, 'rollback_replay');
    });

    it('should enable soft resume when artifacts complete', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        updated_at: oneMinAgo.toISOString(),
        output: 'Saved output',
        events: [
          { type: 'log_chunk', timestamp: oneMinAgo.toISOString(), data: 'log' },
        ],
      });

      const options = getResumeOptions(task, { allowSoftResume: true, staleThresholdMs: 30_000 });

      assert.strictEqual(options.canSoftResume, true);
      assert.strictEqual(options.defaultAction, 'soft_resume');
    });

    it('should return no resume for active task', () => {
      const { fiveSecsAgo } = getTimestamps();
      const task = createTask({
        status: 'RUNNING',
        events: [
          { type: 'heartbeat', timestamp: fiveSecsAgo.toISOString() },
        ],
      });

      const options = getResumeOptions(task);

      assert.strictEqual(options.canResume, false);
      assert.strictEqual(options.defaultAction, 'none');
    });
  });

  describe('addProgressEvent', () => {
    it('should add event with timestamp', () => {
      const task = createTask({ events: [] });
      const beforeAdd = Date.now();

      const updated = addProgressEvent(task, { type: 'heartbeat' });

      assert.strictEqual(updated.events?.length, 1);
      assert.strictEqual(updated.events?.[0].type, 'heartbeat');
      assert.ok(new Date(updated.events?.[0].timestamp).getTime() >= beforeAdd);
    });

    it('should preserve existing events', () => {
      const { oneMinAgo } = getTimestamps();
      const existingEvent: ProgressEvent = {
        type: 'heartbeat',
        timestamp: oneMinAgo.toISOString(),
      };
      const task = createTask({ events: [existingEvent] });

      const updated = addProgressEvent(task, { type: 'log_chunk', data: 'test' });

      assert.strictEqual(updated.events?.length, 2);
      assert.strictEqual(updated.events?.[0].type, 'heartbeat');
      assert.strictEqual(updated.events?.[1].type, 'log_chunk');
    });

    it('should update updated_at timestamp', () => {
      const { oneMinAgo } = getTimestamps();
      const task = createTask({ updated_at: oneMinAgo.toISOString() });

      const updated = addProgressEvent(task, { type: 'heartbeat' });

      assert.notStrictEqual(updated.updated_at, oneMinAgo.toISOString());
    });
  });

  describe('event factory functions', () => {
    it('should create heartbeat event', () => {
      const event = createHeartbeatEvent();
      assert.strictEqual(event.type, 'heartbeat');
    });

    it('should create tool progress event with data', () => {
      const data = { tool: 'Bash', progress: 50 };
      const event = createToolProgressEvent(data);

      assert.strictEqual(event.type, 'tool_progress');
      assert.deepStrictEqual(event.data, data);
    });

    it('should create log chunk event with data', () => {
      const log = 'Build completed successfully';
      const event = createLogChunkEvent(log);

      assert.strictEqual(event.type, 'log_chunk');
      assert.strictEqual(event.data, log);
    });
  });
});
