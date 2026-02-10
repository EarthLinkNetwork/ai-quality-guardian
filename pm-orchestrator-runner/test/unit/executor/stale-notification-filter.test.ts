/**
 * Stale Notification Filter Tests
 *
 * P0: stale background notification mixing = CRITICAL DEFECT
 *
 * Verifies that:
 * - isStaleNotification() correctly identifies stale chunks (fail-closed)
 * - getByTaskIdFiltered() excludes stale chunks
 * - Session ID mismatch → stale
 * - Task ID mismatch → stale
 * - Timestamp before task creation → stale
 * - Stale text patterns → stale
 * - No context → fail-closed (stale)
 */

import { expect } from 'chai';
import {
  ExecutorOutputStream,
  ExecutorOutputChunk,
  isStaleNotification,
  resetExecutorOutputStream,
} from '../../../src/executor/executor-output-stream';

describe('isStaleNotification (fail-closed)', () => {
  const makeChunk = (overrides: Partial<ExecutorOutputChunk> = {}): ExecutorOutputChunk => ({
    timestamp: '2026-02-10T04:00:00.000Z',
    taskId: 'task-current',
    sessionId: 'session-current',
    stream: 'stdout',
    text: 'normal output',
    sequence: 1,
    ...overrides,
  });

  it('should return true (stale) when no context provided', () => {
    const chunk = makeChunk();
    expect(isStaleNotification(chunk, {})).to.be.true;
  });

  it('should return false for matching task ID', () => {
    const chunk = makeChunk({ taskId: 'task-123' });
    expect(isStaleNotification(chunk, { currentTaskId: 'task-123' })).to.be.false;
  });

  it('should return true for mismatched task ID', () => {
    const chunk = makeChunk({ taskId: 'task-old' });
    expect(isStaleNotification(chunk, { currentTaskId: 'task-current' })).to.be.true;
  });

  it('should return true for mismatched session ID', () => {
    const chunk = makeChunk({ sessionId: 'session-old' });
    expect(isStaleNotification(chunk, {
      currentTaskId: 'task-current',
      currentSessionId: 'session-current',
    })).to.be.true;
  });

  it('should return false when chunk has no sessionId (backward compat)', () => {
    const chunk = makeChunk({ sessionId: undefined });
    expect(isStaleNotification(chunk, {
      currentTaskId: 'task-current',
      currentSessionId: 'session-current',
    })).to.be.false;
  });

  it('should return true when timestamp is before task creation', () => {
    const chunk = makeChunk({ timestamp: '2026-02-10T03:00:00.000Z' });
    expect(isStaleNotification(chunk, {
      currentTaskId: 'task-current',
      taskCreatedAt: '2026-02-10T03:30:00.000Z',
    })).to.be.true;
  });

  it('should return false when timestamp is after task creation', () => {
    const chunk = makeChunk({ timestamp: '2026-02-10T04:00:00.000Z' });
    expect(isStaleNotification(chunk, {
      currentTaskId: 'task-current',
      taskCreatedAt: '2026-02-10T03:30:00.000Z',
    })).to.be.false;
  });

  describe('stale text pattern detection', () => {
    const staleTexts = [
      'This was a background task from the previous session',
      'Output file already cleaned up',
      'Contains stale output from prior run',
      'background task finished earlier than expected',
    ];

    for (const text of staleTexts) {
      it(`should detect stale pattern: "${text.substring(0, 40)}..."`, () => {
        const chunk = makeChunk({ text });
        expect(isStaleNotification(chunk, { currentTaskId: 'task-current' })).to.be.true;
      });
    }

    it('should NOT flag normal log text as stale', () => {
      const normalTexts = [
        '[spawn] start',
        '[guard] taskType=READ_INFO',
        '[timeout] silent=5s total=9s',
        '[state] COMPLETE',
        'config\ndiagnostics\ndist\n',
      ];

      for (const text of normalTexts) {
        const chunk = makeChunk({ text });
        expect(isStaleNotification(chunk, { currentTaskId: 'task-current' })).to.be.false;
      }
    });
  });

  it('should handle combined context (all matching)', () => {
    const chunk = makeChunk({
      taskId: 'task-123',
      sessionId: 'session-abc',
      timestamp: '2026-02-10T04:00:00.000Z',
    });
    expect(isStaleNotification(chunk, {
      currentTaskId: 'task-123',
      currentSessionId: 'session-abc',
      taskCreatedAt: '2026-02-10T03:00:00.000Z',
    })).to.be.false;
  });

  it('should fail-closed: any single mismatch → stale', () => {
    // Task ID matches, session ID mismatches → stale
    const chunk = makeChunk({
      taskId: 'task-123',
      sessionId: 'session-OLD',
    });
    expect(isStaleNotification(chunk, {
      currentTaskId: 'task-123',
      currentSessionId: 'session-NEW',
    })).to.be.true;
  });
});

describe('ExecutorOutputStream stale filtering', () => {
  let stream: ExecutorOutputStream;

  beforeEach(() => {
    stream = new ExecutorOutputStream({ maxBufferSize: 100 });
    stream.setSessionId('session-current');
  });

  it('setSessionId/getSessionId should work', () => {
    expect(stream.getSessionId()).to.equal('session-current');
    stream.setSessionId('session-new');
    expect(stream.getSessionId()).to.equal('session-new');
  });

  it('emitted chunks should include sessionId', () => {
    const chunk = stream.emit('task-1', 'stdout', 'Hello');
    expect(chunk.sessionId).to.equal('session-current');
  });

  it('getByTaskIdFiltered should exclude chunks from other tasks', () => {
    stream.emit('task-1', 'stdout', 'Task 1 output');
    stream.emit('task-2', 'stdout', 'Task 2 output');
    stream.emit('task-1', 'stdout', 'Task 1 more');

    const filtered = stream.getByTaskIdFiltered('task-1');
    expect(filtered.length).to.equal(2);
    expect(filtered.every(c => c.taskId === 'task-1')).to.be.true;
  });

  it('getByTaskIdFiltered should exclude chunks before task creation', () => {
    // Emit a chunk, then change session, then filter with taskCreatedAt
    stream.emit('task-1', 'stdout', 'Old chunk');

    // The old chunk's timestamp is now, simulate taskCreatedAt in the future
    const futureTime = new Date(Date.now() + 60000).toISOString();
    const filtered = stream.getByTaskIdFiltered('task-1', futureTime);
    expect(filtered.length).to.equal(0);
  });

  it('getByTaskIdFiltered should exclude chunks from different sessions', () => {
    // Emit with session-current
    stream.emit('task-1', 'stdout', 'Current session chunk');

    // Manually inject a chunk from a different session
    const oldChunk: ExecutorOutputChunk = {
      timestamp: new Date().toISOString(),
      taskId: 'task-1',
      sessionId: 'session-OLD',
      stream: 'stdout',
      text: 'Old session chunk',
      sequence: 999,
    };
    // Access internal chunks array for test injection
    (stream as any).chunks.push(oldChunk);

    const filtered = stream.getByTaskIdFiltered('task-1');
    expect(filtered.length).to.equal(1);
    expect(filtered[0].text).to.equal('Current session chunk');
  });

  it('getByTaskIdFiltered should exclude stale text patterns', () => {
    stream.emit('task-1', 'stdout', 'Normal output');
    stream.emit('task-1', 'system', 'This was a background task from the previous session');
    stream.emit('task-1', 'stdout', 'More normal output');

    const filtered = stream.getByTaskIdFiltered('task-1');
    expect(filtered.length).to.equal(2);
    expect(filtered.every(c => !c.text.includes('previous session'))).to.be.true;
  });

  it('complete task lifecycle should have zero stale chunks', () => {
    stream.startTask('task-new');
    stream.emit('task-new', 'spawn', '[spawn] start');
    stream.emit('task-new', 'preflight', '[preflight] cli found');
    stream.emit('task-new', 'guard', '[guard] taskType=READ_INFO');
    stream.emit('task-new', 'stdout', 'File listing output');
    stream.emit('task-new', 'state', '[state] COMPLETE');
    stream.endTask('task-new', true);

    const filtered = stream.getByTaskIdFiltered('task-new');

    // Verify zero stale chunks
    const context = {
      currentTaskId: 'task-new',
      currentSessionId: stream.getSessionId() ?? undefined,
    };
    const staleCount = filtered.filter(c => isStaleNotification(c, context)).length;
    expect(staleCount).to.equal(0);

    // Verify all expected stream types present
    const streamTypes = new Set(filtered.map(c => c.stream));
    expect(streamTypes.has('system')).to.be.true;
    expect(streamTypes.has('spawn')).to.be.true;
    expect(streamTypes.has('preflight')).to.be.true;
    expect(streamTypes.has('guard')).to.be.true;
    expect(streamTypes.has('stdout')).to.be.true;
    expect(streamTypes.has('state')).to.be.true;
  });

  it('mixed old/new session chunks: only current session visible', () => {
    // Simulate: old session emitted chunks for task-1
    const oldStream = new ExecutorOutputStream({ maxBufferSize: 100 });
    oldStream.setSessionId('session-OLD');
    oldStream.emit('task-1', 'stdout', 'Old session output');
    oldStream.emit('task-1', 'state', '[state] COMPLETE');

    // New session starts, reuses same task ID (shouldn't happen but fail-closed)
    stream.emit('task-1', 'stdout', 'New session output');
    stream.emit('task-1', 'state', '[state] COMPLETE');

    // Inject old chunks into new stream (simulating singleton reuse without clear)
    const oldChunks = oldStream.getAll();
    for (const c of oldChunks) {
      (stream as any).chunks.unshift(c); // prepend old chunks
    }

    // Filtered should only show current session
    const filtered = stream.getByTaskIdFiltered('task-1');
    expect(filtered.length).to.equal(2);
    expect(filtered.every(c => c.sessionId === 'session-current')).to.be.true;
    expect(filtered.some(c => c.text === 'New session output')).to.be.true;
    expect(filtered.some(c => c.text === 'Old session output')).to.be.false;
  });
});
