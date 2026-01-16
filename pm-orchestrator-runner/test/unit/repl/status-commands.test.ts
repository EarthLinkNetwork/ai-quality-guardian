/**
 * Tests for StatusCommands
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { StatusCommands, REPLSession } from '../../../src/repl/commands/status';

describe('StatusCommands', () => {
  let session: REPLSession;
  let statusCommands: StatusCommands;

  describe('getStatus', () => {
    it('should return no session message when sessionId is null', async () => {
      session = {
        sessionId: null,
        projectPath: '/tmp/test',
        runner: null,
        supervisor: null,
        status: 'idle',
      };
      statusCommands = new StatusCommands(session);

      const status = await statusCommands.getStatus();

      assert.ok(status.includes('No active session'));
      assert.ok(status.includes('/start'));
    });

    it('should return no runner message when runner is null but sessionId exists', async () => {
      session = {
        sessionId: 'test-session-123',
        projectPath: '/tmp/test',
        runner: null,
        supervisor: null,
        status: 'idle',
      };
      statusCommands = new StatusCommands(session);

      const status = await statusCommands.getStatus();

      assert.ok(status.includes('Runner not initialized'));
      assert.ok(status.includes('test-session-123'));
    });

    it('should format status correctly with mock runner', async () => {
      const mockRunner = {
        getSessionState: () => ({
          session_id: 'test-session-456',
          current_phase: 'executing',
        }),
        getOverallStatus: () => 'INCOMPLETE',
        getTaskResults: () => [
          { task_id: 'task-1', status: 'completed' },
          { task_id: 'task-2', status: 'in_progress' },
        ],
      };

      session = {
        sessionId: 'test-session-456',
        projectPath: '/tmp/test',
        runner: mockRunner as any,
        supervisor: null,
        status: 'running',
      };
      statusCommands = new StatusCommands(session);

      const status = await statusCommands.getStatus();

      assert.ok(status.includes('test-session-456'));
      assert.ok(status.includes('executing'));
      assert.ok(status.includes('running'));
      assert.ok(status.includes('1/2 completed'));
    });
  });

  describe('getTasks', () => {
    it('should return no session message when sessionId is null', async () => {
      session = {
        sessionId: null,
        projectPath: '/tmp/test',
        runner: null,
        supervisor: null,
        status: 'idle',
      };
      statusCommands = new StatusCommands(session);

      const tasks = await statusCommands.getTasks();

      assert.ok(tasks.includes('No active session'));
      assert.ok(tasks.includes('/start'));
    });

    it('should return no tasks message when no tasks exist', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'INCOMPLETE',
        getTaskResults: () => [],
      };

      session = {
        sessionId: 'test-session',
        projectPath: '/tmp/test',
        runner: mockRunner as any,
        supervisor: null,
        status: 'running',
      };
      statusCommands = new StatusCommands(session);

      const tasks = await statusCommands.getTasks();

      assert.ok(tasks.includes('No tasks'));
    });

    it('should format tasks list correctly', async () => {
      const mockRunner = {
        getSessionState: () => ({ session_id: 'test' }),
        getOverallStatus: () => 'INCOMPLETE',
        getTaskResults: () => [
          { task_id: 'task-1', status: 'completed' },
          { task_id: 'task-2', status: 'in_progress' },
          { task_id: 'task-3', status: 'pending' },
          { task_id: 'task-4', status: 'failed' },
        ],
      };

      session = {
        sessionId: 'test-session',
        projectPath: '/tmp/test',
        runner: mockRunner as any,
        supervisor: null,
        status: 'running',
      };
      statusCommands = new StatusCommands(session);

      const tasks = await statusCommands.getTasks();

      // Check task list
      assert.ok(tasks.includes('[x] task-1'));
      assert.ok(tasks.includes('[>] task-2'));
      assert.ok(tasks.includes('[ ] task-3'));
      assert.ok(tasks.includes('[!] task-4'));

      // Check summary
      assert.ok(tasks.includes('1 completed'));
      assert.ok(tasks.includes('1 running'));
      assert.ok(tasks.includes('1 pending'));
      assert.ok(tasks.includes('1 failed'));
    });
  });
});
