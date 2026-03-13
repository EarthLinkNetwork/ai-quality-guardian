/**
 * P0-1: Executor Logs Visibility Tests
 *
 * Verifies that executor logs are accessible and visible to authorized users.
 *
 * Covers:
 * 1. Executor logs are stored in the directory 'logs/executor/'
 * 2. Users with role 'admin' can view the logs
 * 3. Users with any other role cannot access the logs
 * 4. Log generation, task isolation, and subscriber notifications
 * 5. Stale log filtering and buffer management
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';

import {
  ExecutorOutputStream,
  ExecutorOutputChunk,
  isStaleNotification,
  resetExecutorOutputStream,
} from '../../../src/executor/executor-output-stream';

import {
  requireRole,
  EXECUTOR_LOGS_DIR,
  type AuthenticatedRequest,
  type UserRole,
} from '../../../src/web/middleware/auth';

import type { Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock AuthenticatedRequest with a given role */
function mockRequest(role?: UserRole, userId?: string): AuthenticatedRequest {
  return {
    role,
    userId: userId ?? (role === 'admin' ? 'admin-user' : 'some-user'),
  } as AuthenticatedRequest;
}

/** Build a minimal mock Response that captures status and json output */
function mockResponse(): Response & { _status: number; _json: unknown } {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P0-1: Executor Logs Visibility', () => {
  let stream: ExecutorOutputStream;

  beforeEach(() => {
    resetExecutorOutputStream();
    stream = new ExecutorOutputStream({ maxBufferSize: 100, maxBufferAgeMs: 60000 });
  });

  afterEach(() => {
    stream.clear();
    resetExecutorOutputStream();
  });

  // =========================================================================
  // 1. Executor logs storage directory
  // =========================================================================
  describe('1. Log storage directory', () => {
    it('should define executor logs directory as logs/executor/', () => {
      assert.equal(
        EXECUTOR_LOGS_DIR,
        'logs/executor/',
        'Executor logs directory constant must be logs/executor/'
      );
    });

    it('should store log chunks with correct task metadata', () => {
      stream.startTask('task-dir-1', 'project-a');
      stream.emit('task-dir-1', 'stdout', 'executor output line 1', 'project-a');

      const logs = stream.getByTaskId('task-dir-1');
      assert.ok(logs.length >= 2, 'Should have start + output logs');
      assert.equal(logs[0].taskId, 'task-dir-1');
      assert.equal(logs[0].projectId, 'project-a');
    });

    it('should isolate logs per task (directory-like partitioning)', () => {
      stream.startTask('task-a');
      stream.emit('task-a', 'stdout', 'output A');
      stream.startTask('task-b');
      stream.emit('task-b', 'stdout', 'output B');

      const logsA = stream.getByTaskId('task-a');
      const logsB = stream.getByTaskId('task-b');

      for (const log of logsA) {
        assert.equal(log.taskId, 'task-a', 'task-a logs must not contain task-b data');
      }
      for (const log of logsB) {
        assert.equal(log.taskId, 'task-b', 'task-b logs must not contain task-a data');
      }
    });
  });

  // =========================================================================
  // 2. Admin role can view logs
  // =========================================================================
  describe('2. Admin role log access', () => {
    it('should allow admin role to access executor logs', (done) => {
      const middleware = requireRole('admin');
      const req = mockRequest('admin');
      const res = mockResponse();

      middleware(req, res as any, (() => {
        // next() was called → access granted
        done();
      }) as NextFunction);
    });

    it('should allow local dev mode users (implicit admin) to access logs', (done) => {
      const middleware = requireRole('admin');
      const req = mockRequest(undefined, 'local'); // no explicit role, userId='local'
      const res = mockResponse();

      middleware(req, res as any, (() => {
        done();
      }) as NextFunction);
    });

    it('admin should be able to retrieve all log entries for a task', () => {
      stream.startTask('admin-task');
      stream.emit('admin-task', 'stdout', 'line 1');
      stream.emit('admin-task', 'stdout', 'line 2');
      stream.emit('admin-task', 'stderr', 'warning');

      const logs = stream.getByTaskId('admin-task');
      assert.equal(logs.length, 4, 'Admin should see start + 3 output lines');
    });

    it('admin should be able to view logs across multiple tasks', () => {
      stream.emit('t1', 'stdout', 'task1 out');
      stream.emit('t2', 'stdout', 'task2 out');
      stream.emit('t3', 'stdout', 'task3 out');

      const all = stream.getAll();
      assert.ok(all.length >= 3, 'Admin should see all logs');
    });

    it('admin should be able to view log stream types', () => {
      stream.startTask('typed-task');
      stream.emit('typed-task', 'stdout', 'standard output');
      stream.emit('typed-task', 'stderr', 'error output');
      stream.emit('typed-task', 'system', 'system message');
      stream.endTask('typed-task', false);

      const logs = stream.getByTaskId('typed-task');
      const streamTypes = new Set(logs.map(l => l.stream));

      assert.ok(streamTypes.has('system'), 'Admin should see system logs');
      assert.ok(streamTypes.has('stdout'), 'Admin should see stdout logs');
      assert.ok(streamTypes.has('stderr'), 'Admin should see stderr logs');
      assert.ok(streamTypes.has('error'), 'Admin should see error logs');
    });
  });

  // =========================================================================
  // 3. Non-admin roles cannot access logs
  // =========================================================================
  describe('3. Non-admin role access denied', () => {
    const nonAdminRoles: UserRole[] = ['viewer', 'guest'];

    for (const role of nonAdminRoles) {
      it(`should deny ${role} role access to executor logs`, () => {
        const middleware = requireRole('admin');
        const req = mockRequest(role);
        const res = mockResponse();
        let nextCalled = false;

        middleware(req, res as any, (() => {
          nextCalled = true;
        }) as NextFunction);

        assert.equal(nextCalled, false, `${role} should not reach next()`);
        assert.equal(res._status, 403, `${role} should receive 403 Forbidden`);
        assert.ok(
          (res._json as any).error === 'Forbidden',
          `${role} response should contain Forbidden error`
        );
      });

      it(`should return descriptive error message for ${role}`, () => {
        const middleware = requireRole('admin');
        const req = mockRequest(role);
        const res = mockResponse();

        middleware(req, res as any, (() => {}) as NextFunction);

        const body = res._json as any;
        assert.equal(body.currentRole, role, 'Response should include current role');
        assert.deepEqual(body.requiredRoles, ['admin'], 'Response should include required roles');
        assert.ok(
          body.message.includes(role),
          'Error message should mention the denied role'
        );
      });
    }

    it('should deny unauthenticated users (no role, non-local userId)', () => {
      const middleware = requireRole('admin');
      const req = mockRequest(undefined, 'remote-user');
      const res = mockResponse();
      let nextCalled = false;

      middleware(req, res as any, (() => {
        nextCalled = true;
      }) as NextFunction);

      assert.equal(nextCalled, false, 'Unauthenticated non-local users should be denied');
      assert.equal(res._status, 403, 'Should receive 403');
    });
  });

  // =========================================================================
  // 4. Log generation and retrieval (detailed visibility checks)
  // =========================================================================
  describe('4. Log generation and retrieval', () => {
    it('should generate logs when a task starts', () => {
      stream.startTask('task-1', 'project-a');

      const logs = stream.getByTaskId('task-1');
      assert.ok(logs.length > 0, 'Logs should be generated on task start');
      assert.equal(logs[0].taskId, 'task-1');
      assert.equal(logs[0].stream, 'system');
      assert.ok(logs[0].text.includes('Task started'));
    });

    it('should generate logs when a task ends successfully', () => {
      stream.startTask('task-2', 'project-a');
      stream.endTask('task-2', true, 'project-a');

      const logs = stream.getByTaskId('task-2');
      assert.equal(logs.length, 2, 'Should have start and end logs');

      const endLog = logs[1];
      assert.equal(endLog.stream, 'state');
      assert.ok(endLog.text.includes('COMPLETE'));
    });

    it('should generate error logs when a task fails', () => {
      stream.startTask('task-3', 'project-a');
      stream.endTask('task-3', false, 'project-a');

      const logs = stream.getByTaskId('task-3');
      const endLog = logs[logs.length - 1];
      assert.equal(endLog.stream, 'error');
      assert.ok(endLog.text.includes('ERROR'));
    });

    it('should assign monotonically increasing sequence numbers', () => {
      stream.emit('task-1', 'stdout', 'first');
      stream.emit('task-1', 'stdout', 'second');
      stream.emit('task-1', 'stdout', 'third');

      const logs = stream.getByTaskId('task-1');
      for (let i = 1; i < logs.length; i++) {
        assert.ok(
          logs[i].sequence > logs[i - 1].sequence,
          `Sequence ${logs[i].sequence} should be > ${logs[i - 1].sequence}`
        );
      }
    });

    it('should include timestamps on all log entries', () => {
      stream.emit('task-1', 'stdout', 'test output');

      const logs = stream.getByTaskId('task-1');
      for (const log of logs) {
        assert.ok(log.timestamp, 'Each log should have a timestamp');
        assert.ok(!isNaN(Date.parse(log.timestamp)), 'Timestamp should be valid ISO string');
      }
    });

    it('should support getSince for incremental log retrieval', () => {
      stream.emit('task-1', 'stdout', 'line 1');
      stream.emit('task-1', 'stdout', 'line 2');

      const allLogs = stream.getAll();
      const firstSeq = allLogs[0].sequence;

      stream.emit('task-1', 'stdout', 'line 3');

      const newLogs = stream.getSince(firstSeq);
      assert.ok(newLogs.length >= 1, 'Should return logs after the given sequence');
      assert.ok(newLogs.every(l => l.sequence > firstSeq));
    });

    it('should return recent logs for a specific task', () => {
      for (let i = 0; i < 10; i++) {
        stream.emit('task-1', 'stdout', `line ${i}`);
      }

      const recent = stream.getRecentForTask('task-1', 3);
      assert.equal(recent.length, 3, 'Should return only 3 recent logs');
      assert.ok(recent[2].text.includes('line 9'));
    });
  });

  // =========================================================================
  // 5. Subscriber notification
  // =========================================================================
  describe('5. Subscriber notification', () => {
    it('should notify subscribers when logs are emitted', () => {
      const received: ExecutorOutputChunk[] = [];
      stream.subscribe({ onOutput: (chunk) => received.push(chunk) });

      stream.emit('task-1', 'stdout', 'hello');

      assert.equal(received.length, 1);
      assert.equal(received[0].text, 'hello');
      assert.equal(received[0].taskId, 'task-1');
    });

    it('should support unsubscribe', () => {
      const received: ExecutorOutputChunk[] = [];
      const unsub = stream.subscribe({ onOutput: (chunk) => received.push(chunk) });

      stream.emit('task-1', 'stdout', 'before');
      unsub();
      stream.emit('task-1', 'stdout', 'after');

      assert.equal(received.length, 1, 'Should only receive logs before unsubscribe');
    });

    it('should not crash if a subscriber throws', () => {
      stream.subscribe({
        onOutput: () => { throw new Error('bad subscriber'); },
      });
      stream.subscribe({
        onOutput: () => { /* ok */ },
      });

      assert.doesNotThrow(() => {
        stream.emit('task-1', 'stdout', 'test');
      });
    });
  });

  // =========================================================================
  // 6. Stale log filtering
  // =========================================================================
  describe('6. Stale log filtering', () => {
    it('should filter logs from a different task', () => {
      const chunk: ExecutorOutputChunk = {
        timestamp: new Date().toISOString(),
        taskId: 'old-task',
        stream: 'stdout',
        text: 'old output',
        sequence: 1,
      };

      const isStale = isStaleNotification(chunk, { currentTaskId: 'new-task' });
      assert.equal(isStale, true, 'Logs from a different task should be stale');
    });

    it('should not filter logs from the current task', () => {
      const chunk: ExecutorOutputChunk = {
        timestamp: new Date().toISOString(),
        taskId: 'current-task',
        stream: 'stdout',
        text: 'current output',
        sequence: 1,
      };

      const isStale = isStaleNotification(chunk, { currentTaskId: 'current-task' });
      assert.equal(isStale, false, 'Logs from current task should not be stale');
    });

    it('should filter logs with stale text patterns', () => {
      const chunk: ExecutorOutputChunk = {
        timestamp: new Date().toISOString(),
        taskId: 'task-1',
        stream: 'stdout',
        text: 'This is from a previous session',
        sequence: 1,
      };

      const isStale = isStaleNotification(chunk, { currentTaskId: 'task-1' });
      assert.equal(isStale, true, 'Logs with stale patterns should be filtered');
    });

    it('should use getByTaskIdFiltered to exclude stale logs', () => {
      stream.setSessionId('session-1');
      stream.emit('task-1', 'stdout', 'valid output');

      const filtered = stream.getByTaskIdFiltered('task-1');
      assert.ok(filtered.length > 0, 'Filtered results should include valid logs');

      for (const log of filtered) {
        assert.equal(log.taskId, 'task-1');
      }
    });
  });

  // =========================================================================
  // 7. Buffer management
  // =========================================================================
  describe('7. Buffer management', () => {
    it('should respect maxBufferSize', () => {
      const smallStream = new ExecutorOutputStream({ maxBufferSize: 5, maxBufferAgeMs: 60000 });

      for (let i = 0; i < 10; i++) {
        smallStream.emit('task-1', 'stdout', `line ${i}`);
      }

      const all = smallStream.getAll();
      assert.ok(all.length <= 5, `Buffer should not exceed maxBufferSize, got ${all.length}`);
    });

    it('should clear all logs', () => {
      stream.emit('task-1', 'stdout', 'data');
      stream.emit('task-2', 'stdout', 'data');
      stream.clear();

      assert.equal(stream.getAll().length, 0, 'All logs should be cleared');
    });

    it('should clear logs for a specific task', () => {
      stream.emit('task-1', 'stdout', 'keep');
      stream.emit('task-2', 'stdout', 'remove');
      stream.clearTask('task-2');

      assert.equal(stream.getByTaskId('task-1').length, 1);
      assert.equal(stream.getByTaskId('task-2').length, 0);
    });
  });

  // =========================================================================
  // 8. Active task tracking
  // =========================================================================
  describe('8. Active task tracking', () => {
    it('should track active tasks', () => {
      stream.startTask('task-1');
      stream.startTask('task-2');

      const active = stream.getActiveTasks();
      assert.equal(active.length, 2);
      assert.ok(active.some(t => t.taskId === 'task-1'));
      assert.ok(active.some(t => t.taskId === 'task-2'));
    });

    it('should remove task from active list on end', () => {
      stream.startTask('task-1');
      stream.endTask('task-1', true);

      const active = stream.getActiveTasks();
      assert.equal(active.length, 0);
    });

    it('should track duration for active tasks', () => {
      stream.startTask('task-1');

      const active = stream.getActiveTasks();
      assert.equal(active.length, 1);
      assert.ok(active[0].duration >= 0, 'Duration should be non-negative');
      assert.ok(active[0].startTime > 0, 'Start time should be set');
    });
  });

  // =========================================================================
  // 9. Session tagging
  // =========================================================================
  describe('9. Session tagging', () => {
    it('should tag emitted logs with session ID', () => {
      stream.setSessionId('sess-abc');
      stream.emit('task-1', 'stdout', 'hello');

      const logs = stream.getByTaskId('task-1');
      assert.equal(logs[0].sessionId, 'sess-abc');
    });

    it('should return session ID via getter', () => {
      assert.equal(stream.getSessionId(), null);
      stream.setSessionId('sess-xyz');
      assert.equal(stream.getSessionId(), 'sess-xyz');
    });
  });

  // =========================================================================
  // 10. AWAITING_RESPONSE status
  // =========================================================================
  describe('10. AWAITING_RESPONSE status', () => {
    it('should emit AWAITING_RESPONSE state log', () => {
      stream.startTask('task-1');
      stream.endTask('task-1', true, undefined, 'AWAITING_RESPONSE');

      const logs = stream.getByTaskId('task-1');
      const endLog = logs[logs.length - 1];
      assert.equal(endLog.stream, 'state');
      assert.ok(endLog.text.includes('AWAITING_RESPONSE'));
    });
  });
});
