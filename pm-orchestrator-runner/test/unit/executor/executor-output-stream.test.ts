/**
 * ExecutorOutputStream Unit Tests
 *
 * AC A.2: Executor Live Log - Real-time stdout/stderr streaming for Web UI
 */

import { expect } from 'chai';
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

      expect(chunk.timestamp).to.be.a('string');
      expect(chunk.taskId).to.equal('task-123');
      expect(chunk.stream).to.equal('stdout');
      expect(chunk.text).to.equal('Hello, World!');
      expect(chunk.sequence).to.equal(1);
    });

    it('should increment sequence for each chunk', () => {
      const chunk1 = stream.emit('task-1', 'stdout', 'First');
      const chunk2 = stream.emit('task-1', 'stdout', 'Second');
      const chunk3 = stream.emit('task-2', 'stderr', 'Third');

      expect(chunk1.sequence).to.equal(1);
      expect(chunk2.sequence).to.equal(2);
      expect(chunk3.sequence).to.equal(3);
    });

    it('should include projectId when provided', () => {
      const chunk = stream.emit('task-123', 'stdout', 'Hello', 'project-456');

      expect(chunk.projectId).to.equal('project-456');
    });

    it('should track active tasks', () => {
      stream.emit('task-123', 'stdout', 'Hello');

      const activeTasks = stream.getActiveTasks();
      expect(activeTasks.length).to.equal(1);
      expect(activeTasks[0].taskId).to.equal('task-123');
    });
  });

  describe('startTask() and endTask()', () => {
    it('should emit system message on startTask', () => {
      stream.startTask('task-123');

      const chunks = stream.getByTaskId('task-123');
      expect(chunks.length).to.equal(1);
      expect(chunks[0].stream).to.equal('system');
      expect(chunks[0].text).to.include('started');
    });

    it('should emit COMPLETE state on endTask(success=true)', () => {
      stream.startTask('task-123');
      stream.endTask('task-123', true);

      const chunks = stream.getByTaskId('task-123');
      expect(chunks.length).to.equal(2);
      expect(chunks[1].stream).to.equal('state');
      expect(chunks[1].text).to.include('COMPLETE');
    });

    it('should emit ERROR state on endTask(success=false)', () => {
      stream.startTask('task-123');
      stream.endTask('task-123', false);

      const chunks = stream.getByTaskId('task-123');
      expect(chunks.length).to.equal(2);
      expect(chunks[1].stream).to.equal('error');
      expect(chunks[1].text).to.include('ERROR');
    });

    it('should emit AWAITING_RESPONSE state on endTask with finalStatus', () => {
      stream.startTask('task-123');
      stream.endTask('task-123', false, undefined, 'AWAITING_RESPONSE');

      const chunks = stream.getByTaskId('task-123');
      expect(chunks.length).to.equal(2);
      expect(chunks[1].stream).to.equal('state');
      expect(chunks[1].text).to.include('AWAITING_RESPONSE');
    });

    it('should remove task from active tasks on endTask', () => {
      stream.startTask('task-123');
      expect(stream.getActiveTasks().length).to.equal(1);

      stream.endTask('task-123', true);
      expect(stream.getActiveTasks().length).to.equal(0);
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
      expect(chunks.length).to.equal(4);
    });

    it('getByTaskId() should filter by task', () => {
      const chunks = stream.getByTaskId('task-1');
      expect(chunks.length).to.equal(2);
      expect(chunks.every(c => c.taskId === 'task-1')).to.be.true;
    });

    it('getSince() should filter by sequence', () => {
      const chunks = stream.getSince(2);
      expect(chunks.length).to.equal(2);
      expect(chunks[0].sequence).to.equal(3);
      expect(chunks[1].sequence).to.equal(4);
    });

    it('getRecent() should return last N chunks', () => {
      const chunks = stream.getRecent(2);
      expect(chunks.length).to.equal(2);
      expect(chunks[0].text).to.equal('Msg 3');
      expect(chunks[1].text).to.equal('Msg 4');
    });

    it('getRecentForTask() should return last N chunks for task', () => {
      stream.emit('task-1', 'stdout', 'Msg 5');
      stream.emit('task-1', 'stdout', 'Msg 6');

      const chunks = stream.getRecentForTask('task-1', 2);
      expect(chunks.length).to.equal(2);
      expect(chunks[0].text).to.equal('Msg 5');
      expect(chunks[1].text).to.equal('Msg 6');
    });

    it('clear() should remove all chunks', () => {
      stream.clear();
      expect(stream.getAll().length).to.equal(0);
    });

    it('clearTask() should remove chunks for a specific task', () => {
      stream.clearTask('task-1');
      const chunks = stream.getAll();
      expect(chunks.length).to.equal(2);
      expect(chunks.every(c => c.taskId !== 'task-1')).to.be.true;
    });
  });

  describe('Buffer trimming', () => {
    it('should trim buffer when exceeding maxBufferSize', () => {
      const smallStream = new ExecutorOutputStream({ maxBufferSize: 5 });

      for (let i = 0; i < 10; i++) {
        smallStream.emit('task-1', 'stdout', `Message ${i}`);
      }

      const chunks = smallStream.getAll();
      expect(chunks.length).to.equal(5);
      expect(chunks[0].text).to.equal('Message 5'); // First 5 trimmed
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

      expect(received.length).to.equal(1);
      expect(received[0].text).to.equal('Test message');
    });

    it('should support multiple subscribers', () => {
      const received1: ExecutorOutputChunk[] = [];
      const received2: ExecutorOutputChunk[] = [];

      stream.subscribe({ onOutput: c => received1.push(c) });
      stream.subscribe({ onOutput: c => received2.push(c) });
      stream.emit('task-123', 'stdout', 'Test message');

      expect(received1.length).to.equal(1);
      expect(received2.length).to.equal(1);
    });

    it('should allow unsubscription', () => {
      const received: ExecutorOutputChunk[] = [];
      const unsubscribe = stream.subscribe({
        onOutput: c => received.push(c),
      });

      stream.emit('task-123', 'stdout', 'Before unsubscribe');
      unsubscribe();
      stream.emit('task-123', 'stdout', 'After unsubscribe');

      expect(received.length).to.equal(1);
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
      expect(received.length).to.equal(1);
    });

    it('should report subscriber count', () => {
      expect(stream.getSubscriberCount()).to.equal(0);

      const unsub1 = stream.subscribe({ onOutput: () => {} });
      const unsub2 = stream.subscribe({ onOutput: () => {} });
      expect(stream.getSubscriberCount()).to.equal(2);

      unsub1();
      expect(stream.getSubscriberCount()).to.equal(1);
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
    expect(stream1).to.equal(stream2);
  });

  it('resetExecutorOutputStream() should clear singleton', () => {
    const stream1 = getExecutorOutputStream();
    stream1.emit('task-123', 'stdout', 'Test');

    resetExecutorOutputStream();

    const stream2 = getExecutorOutputStream();
    expect(stream2).to.not.equal(stream1);
    expect(stream2.getAll().length).to.equal(0);
  });
});
