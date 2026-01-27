/**
 * Event Store Tests
 *
 * Minimal tests for unified event system:
 * 1. Event can be recorded
 * 2. Event survives restart (persistence)
 * 3. Can trace to related events (executor output, file diff)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  EventStore,
  createEvent,
  createFileChangeEvent,
  createExecutorEvent,
  createTaskEvent,
  isFileChangeData,
  isExecutorEventData,
  isTaskEventData,
} from '../../../src/events';

describe('Event Store', () => {
  let tempDir: string;
  let store: EventStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-store-test-'));
    store = new EventStore({ stateDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Event recording', () => {
    it('should record an event and retrieve it', async () => {
      const event = createEvent('system', 'Test event', { message: 'hello' });

      await store.record(event);

      const retrieved = await store.get(event.id);
      assert.ok(retrieved, 'Event should be retrievable');
      assert.equal(retrieved.id, event.id);
      assert.equal(retrieved.source, 'system');
      assert.equal(retrieved.summary, 'Test event');
    });

    it('should record file change event with correct type guard', async () => {
      const event = createFileChangeEvent('src/foo.ts', 'modified', {
        diff: '+ new line',
        taskId: 'task-123',
      });

      await store.record(event);

      const retrieved = await store.get(event.id);
      assert.ok(retrieved, 'Event should be retrievable');
      assert.equal(retrieved.source, 'file_change');
      assert.ok(isFileChangeData(retrieved.data), 'Should be FileChangeData');
      if (isFileChangeData(retrieved.data)) {
        assert.equal(retrieved.data.path, 'src/foo.ts');
        assert.equal(retrieved.data.status, 'modified');
        assert.equal(retrieved.data.diff, '+ new line');
      }
    });

    it('should record executor event with correct type guard', async () => {
      const event = createExecutorEvent('exec-1', 'end', {
        exitCode: 0,
        stdout: 'Success',
        durationMs: 1500,
        taskId: 'task-123',
      });

      await store.record(event);

      const retrieved = await store.get(event.id);
      assert.ok(retrieved, 'Event should be retrievable');
      assert.equal(retrieved.source, 'executor');
      assert.ok(isExecutorEventData(retrieved.data), 'Should be ExecutorEventData');
      if (isExecutorEventData(retrieved.data)) {
        assert.equal(retrieved.data.executorId, 'exec-1');
        assert.equal(retrieved.data.action, 'end');
        assert.equal(retrieved.data.exitCode, 0);
        assert.equal(retrieved.data.stdout, 'Success');
      }
    });

    it('should record task event with correct type guard', async () => {
      const event = createTaskEvent('task-123', 'completed', {
        previousStatus: 'in_progress',
        filesModified: ['src/a.ts', 'src/b.ts'],
      });

      await store.record(event);

      const retrieved = await store.get(event.id);
      assert.ok(retrieved, 'Event should be retrievable');
      assert.equal(retrieved.source, 'task');
      assert.ok(isTaskEventData(retrieved.data), 'Should be TaskEventData');
      if (isTaskEventData(retrieved.data)) {
        assert.equal(retrieved.data.taskId, 'task-123');
        assert.equal(retrieved.data.newStatus, 'completed');
        assert.equal(retrieved.data.previousStatus, 'in_progress');
        assert.deepEqual(retrieved.data.filesModified, ['src/a.ts', 'src/b.ts']);
      }
    });
  });

  describe('Persistence (survives restart)', () => {
    it('should persist events and reload after store recreation', async () => {
      const event1 = createEvent('system', 'Event 1', { n: 1 });
      const event2 = createEvent('system', 'Event 2', { n: 2 });

      await store.record(event1);
      await store.record(event2);

      // Create a new store instance (simulates restart)
      const store2 = new EventStore({ stateDir: tempDir });
      await store2.reload();

      const retrieved1 = await store2.get(event1.id);
      const retrieved2 = await store2.get(event2.id);

      assert.ok(retrieved1, 'Event 1 should survive restart');
      assert.ok(retrieved2, 'Event 2 should survive restart');
      assert.equal(retrieved1.summary, 'Event 1');
      assert.equal(retrieved2.summary, 'Event 2');
    });

    it('should write events to JSONL file format', async () => {
      const event = createEvent('system', 'Persistent event', { key: 'value' });

      await store.record(event);

      // Check that file was created
      const eventsDir = path.join(tempDir, 'events');
      const files = fs.readdirSync(eventsDir);
      assert.ok(files.length > 0, 'Should create event file');

      // Check file content is JSONL
      const filePath = path.join(eventsDir, files[0]);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      assert.equal(lines.length, 1, 'Should have 1 line');

      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.id, event.id);
      assert.equal(parsed.summary, 'Persistent event');
    });
  });

  describe('Event tracing (related events)', () => {
    it('should trace events by shared taskId', async () => {
      const taskId = 'task-trace-test';

      // Create multiple events related to the same task
      const taskStart = createTaskEvent(taskId, 'in_progress');
      const execStart = createExecutorEvent('exec-1', 'start', { taskId });
      const fileChange = createFileChangeEvent('src/file.ts', 'modified', { taskId });
      const execEnd = createExecutorEvent('exec-1', 'end', { taskId, exitCode: 0 });
      const taskComplete = createTaskEvent(taskId, 'completed', { previousStatus: 'in_progress' });

      // Record all events
      await store.record(taskStart);
      await store.record(execStart);
      await store.record(fileChange);
      await store.record(execEnd);
      await store.record(taskComplete);

      // Get related events for the task start event
      const related = await store.getRelated(taskStart.id);

      // Should find all events with same taskId (except itself)
      assert.ok(related.length >= 3, 'Should find related events');

      // Verify we can find executor and file change events
      const hasExecStart = related.some(e => e.id === execStart.id);
      const hasFileChange = related.some(e => e.id === fileChange.id);
      const hasExecEnd = related.some(e => e.id === execEnd.id);

      assert.ok(hasExecStart, 'Should trace to executor start');
      assert.ok(hasFileChange, 'Should trace to file change');
      assert.ok(hasExecEnd, 'Should trace to executor end');
    });

    it('should trace events by shared executorId', async () => {
      const executorId = 'exec-trace-test';

      // Create executor events
      const start = createExecutorEvent(executorId, 'start', { command: 'npm test' });
      const output = createExecutorEvent(executorId, 'output', { stdout: 'Running tests...' });
      const end = createExecutorEvent(executorId, 'end', { exitCode: 0 });

      await store.record(start);
      await store.record(output);
      await store.record(end);

      // Get related events for the start event
      const related = await store.getRelated(start.id);

      // Should find output and end events
      assert.ok(related.length >= 2, 'Should find related executor events');

      const hasOutput = related.some(e => e.id === output.id);
      const hasEnd = related.some(e => e.id === end.id);

      assert.ok(hasOutput, 'Should trace to executor output');
      assert.ok(hasEnd, 'Should trace to executor end');
    });
  });

  describe('Query filtering', () => {
    it('should filter events by source', async () => {
      await store.record(createEvent('system', 'System 1', {}));
      await store.record(createFileChangeEvent('a.ts', 'added'));
      await store.record(createExecutorEvent('e1', 'start'));
      await store.record(createEvent('system', 'System 2', {}));

      const systemEvents = await store.query({ source: 'system' });
      const fileEvents = await store.query({ source: 'file_change' });
      const execEvents = await store.query({ source: 'executor' });

      assert.equal(systemEvents.length, 2, 'Should find 2 system events');
      assert.equal(fileEvents.length, 1, 'Should find 1 file_change event');
      assert.equal(execEvents.length, 1, 'Should find 1 executor event');
    });

    it('should filter events by taskId', async () => {
      await store.record(createTaskEvent('task-A', 'pending'));
      await store.record(createTaskEvent('task-B', 'pending'));
      await store.record(createFileChangeEvent('a.ts', 'modified', { taskId: 'task-A' }));
      await store.record(createFileChangeEvent('b.ts', 'modified', { taskId: 'task-B' }));

      const taskAEvents = await store.query({ taskId: 'task-A' });
      const taskBEvents = await store.query({ taskId: 'task-B' });

      assert.equal(taskAEvents.length, 2, 'Should find 2 events for task-A');
      assert.equal(taskBEvents.length, 2, 'Should find 2 events for task-B');
    });

    it('should limit and paginate results', async () => {
      // Create 10 events
      for (let i = 0; i < 10; i++) {
        await store.record(createEvent('system', `Event ${i}`, { n: i }));
      }

      const first5 = await store.query({ limit: 5 });
      const next5 = await store.query({ limit: 5, offset: 5 });

      assert.equal(first5.length, 5, 'Should return first 5');
      assert.equal(next5.length, 5, 'Should return next 5');

      // Verify no overlap (IDs are different)
      const first5Ids = new Set(first5.map(e => e.id));
      for (const e of next5) {
        assert.ok(!first5Ids.has(e.id), 'Should not overlap');
      }
    });
  });

  describe('Stats', () => {
    it('should return correct statistics', async () => {
      await store.record(createEvent('system', 'S1', {}));
      await store.record(createEvent('system', 'S2', {}));
      await store.record(createFileChangeEvent('a.ts', 'added'));
      await store.record(createExecutorEvent('e1', 'start'));

      const stats = await store.getStats();

      assert.equal(stats.totalEvents, 4, 'Should count 4 events');
      assert.equal(stats.bySource['system'], 2, 'Should count 2 system events');
      assert.equal(stats.bySource['file_change'], 1, 'Should count 1 file_change');
      assert.equal(stats.bySource['executor'], 1, 'Should count 1 executor');
    });
  });
});
