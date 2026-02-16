/**
 * ExecutorOutputStream Unit Tests
 *
 * AC A.2: Executor Live Log - Real-time stdout/stderr streaming for Web UI
 */

import { strict as assert } from 'assert';
import {
  ExecutorOutputStream,
  getExecutorOutputStream,
  resetExecutorOutputStream,
  ExecutorOutputChunk,
  ExecutorOutputSubscriber,
} from '../../../src/executor/executor-output-stream';

describe('ExecutorOutputStream', () => {
  let stream: ExecutorOutputStream;

  beforeEach(() => {
    stream = new ExecutorOutputStream({ maxBufferSize: 100 });
  });

  describe('emit()', () => {
    it('should create an output chunk with timestamp and sequence', () => {
      const chunk = stream.emit('task-123', 'stdout', 'Hello, World!');

      assert.equal(typeof chunk.timestamp, 'string');
      assert.equal(chunk.taskId, 'task-123');
      assert.equal(chunk.stream, 'stdout');
      assert.equal(chunk.text, 'Hello, World!');
      assert.equal(chunk.sequence, 1);
    });

    it('should increment sequence for each chunk', () => {
      const chunk1 = stream.emit('task-1', 'stdout', 'First');
      const chunk2 = stream.emit('task-1', 'stdout', 'Second');
      const chunk3 = stream.emit('task-2', 'stderr', 'Third');

      assert.equal(chunk1.sequence, 1);
      assert.equal(chunk2.sequence, 2);
      assert.equal(chunk3.sequence, 3);
    });

    it('should include projectId when provided', () => {
      const chunk = stream.emit('task-123', 'stdout', 'Hello', 'project-456');

      assert.equal(chunk.projectId, 'project-456');
    });

    it('should track active tasks', () => {
      stream.emit('task-123', 'stdout', 'Hello');

      const activeTasks = stream.getActiveTasks();
      assert.equal(activeTasks.length, 1);
      assert.equal(activeTasks[0].taskId, 'task-123');
    });
  });

  describe('startTask() and endTask()', () => {
    it('should emit system message on startTask', () => {
      stream.startTask('task-123');

      const chunks = stream.getByTaskId('task-123');
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].stream, 'system');
      assert.ok(chunks[0].text.includes('started'));
    });

    it('should emit COMPLETE state on endTask(success=true)', () => {
      stream.startTask('task-123');
      stream.endTask('task-123', true);

      const chunks = stream.getByTaskId('task-123');
      assert.equal(chunks.length, 2);
      assert.equal(chunks[1].stream, 'state');
      assert.ok(chunks[1].text.includes('COMPLETE'));
    });

    it('should emit ERROR state on endTask(success=false)', () => {
      stream.startTask('task-123');
      stream.endTask('task-123', false);

      const chunks = stream.getByTaskId('task-123');
      assert.equal(chunks.length, 2);
      assert.equal(chunks[1].stream, 'error');
      assert.ok(chunks[1].text.includes('ERROR'));
    });

    it('should emit AWAITING_RESPONSE state on endTask with finalStatus', () => {
      stream.startTask('task-123');
      stream.endTask('task-123', false, undefined, 'AWAITING_RESPONSE');

      const chunks = stream.getByTaskId('task-123');
      assert.equal(chunks.length, 2);
      assert.equal(chunks[1].stream, 'state');
      assert.ok(chunks[1].text.includes('AWAITING_RESPONSE'));
    });

    it('should remove task from active tasks on endTask', () => {
      stream.startTask('task-123');
      assert.equal(stream.getActiveTasks().length, 1);

      stream.endTask('task-123', true);
      assert.equal(stream.getActiveTasks().length, 0);
    });
  });

  describe('Retrieval methods', () => {
    beforeEach(() => {
      stream.emit('task-1', 'stdout', 'Msg 1');
      stream.emit('task-2', 'stderr', 'Msg 2');
      stream.emit('task-1', 'stdout', 'Msg 3');
      stream.emit('task-3', 'system', 'Msg 4');
    });

    it('getAll() should return all chunks', () => {
      const chunks = stream.getAll();
      assert.equal(chunks.length, 4);
    });

    it('getByTaskId() should filter by task', () => {
      const chunks = stream.getByTaskId('task-1');
      assert.equal(chunks.length, 2);
      assert.ok(chunks.every(c => c.taskId === 'task-1'));
    });

    it('getSince() should filter by sequence', () => {
      const chunks = stream.getSince(2);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].sequence, 3);
      assert.equal(chunks[1].sequence, 4);
    });

    it('getRecent() should return last N chunks', () => {
      const chunks = stream.getRecent(2);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].text, 'Msg 3');
      assert.equal(chunks[1].text, 'Msg 4');
    });

    it('getRecentForTask() should return last N chunks for task', () => {
      stream.emit('task-1', 'stdout', 'Msg 5');
      stream.emit('task-1', 'stdout', 'Msg 6');

      const chunks = stream.getRecentForTask('task-1', 2);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].text, 'Msg 5');
      assert.equal(chunks[1].text, 'Msg 6');
    });

    it('clear() should remove all chunks', () => {
      stream.clear();
      assert.equal(stream.getAll().length, 0);
    });

    it('clearTask() should remove chunks for a specific task', () => {
      stream.clearTask('task-1');
      const chunks = stream.getAll();
      assert.equal(chunks.length, 2);
      assert.ok(chunks.every(c => c.taskId !== 'task-1'));
    });
  });

  describe('Buffer trimming', () => {
    it('should trim buffer when exceeding maxBufferSize', () => {
      const smallStream = new ExecutorOutputStream({ maxBufferSize: 5 });

      for (let i = 0; i < 10; i++) {
        smallStream.emit('task-1', 'stdout', `Message ${i}`);
      }

      const chunks = smallStream.getAll();
      assert.equal(chunks.length, 5);
      assert.equal(chunks[0].text, 'Message 5'); // First 5 trimmed
    });
  });

  describe('Subscription', () => {
    it('should notify subscribers of new chunks', () => {
      const received: ExecutorOutputChunk[] = [];
      const subscriber: ExecutorOutputSubscriber = {
        onOutput(chunk) {
          received.push(chunk);
        },
      };

      stream.subscribe(subscriber);
      stream.emit('task-123', 'stdout', 'Test message');

      assert.equal(received.length, 1);
      assert.equal(received[0].text, 'Test message');
    });

    it('should support multiple subscribers', () => {
      const received1: ExecutorOutputChunk[] = [];
      const received2: ExecutorOutputChunk[] = [];

      stream.subscribe({ onOutput: c => received1.push(c) });
      stream.subscribe({ onOutput: c => received2.push(c) });
      stream.emit('task-123', 'stdout', 'Test message');

      assert.equal(received1.length, 1);
      assert.equal(received2.length, 1);
    });

    it('should allow unsubscription', () => {
      const received: ExecutorOutputChunk[] = [];
      const unsubscribe = stream.subscribe({
        onOutput: c => received.push(c),
      });

      stream.emit('task-123', 'stdout', 'Before unsubscribe');
      unsubscribe();
      stream.emit('task-123', 'stdout', 'After unsubscribe');

      assert.equal(received.length, 1);
    });

    it('should handle subscriber errors gracefully', () => {
      const received: ExecutorOutputChunk[] = [];

      stream.subscribe({
        onOutput() {
          throw new Error('Subscriber error');
        },
      });
      stream.subscribe({
        onOutput: c => received.push(c),
      });

      // Should not throw
      stream.emit('task-123', 'stdout', 'Test message');
      assert.equal(received.length, 1);
    });

    it('should report subscriber count', () => {
      assert.equal(stream.getSubscriberCount(), 0);

      const unsub1 = stream.subscribe({ onOutput: () => {} });
      const unsub2 = stream.subscribe({ onOutput: () => {} });
      assert.equal(stream.getSubscriberCount(), 2);

      unsub1();
      assert.equal(stream.getSubscriberCount(), 1);
    });
  });
});

describe('Singleton ExecutorOutputStream', () => {
  beforeEach(() => {
    resetExecutorOutputStream();
  });

  it('getExecutorOutputStream() should return same instance', () => {
    const stream1 = getExecutorOutputStream();
    const stream2 = getExecutorOutputStream();
    assert.equal(stream1, stream2);
  });

  it('resetExecutorOutputStream() should clear singleton', () => {
    const stream1 = getExecutorOutputStream();
    stream1.emit('task-123', 'stdout', 'Test');

    resetExecutorOutputStream();

    const stream2 = getExecutorOutputStream();
    assert.notEqual(stream2, stream1);
    assert.equal(stream2.getAll().length, 0);
  });
});
