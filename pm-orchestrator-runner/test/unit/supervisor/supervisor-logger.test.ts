/**
 * SupervisorLogger Unit Tests
 *
 * AC A.1: Supervisor Log: TaskType判定、write許可、ガード判定、再試行/再開理由、採用したテンプレ
 */

import assert from 'node:assert/strict';
import {
  SupervisorLogger,
  getSupervisorLogger,
  resetSupervisorLogger,
  SupervisorLogEntry,
  SupervisorLogSubscriber,
} from '../../../src/supervisor/supervisor-logger';

describe('SupervisorLogger', () => {
  let logger: SupervisorLogger;

  beforeEach(() => {
    logger = new SupervisorLogger({ maxEntries: 100 });
  });

  describe('log()', () => {
    it('should create a log entry with timestamp', () => {
      const entry = logger.log('info', 'TASK_TYPE_DETECTION', 'Test message');

      assert.equal(typeof entry.timestamp, 'string');
      assert.equal(entry.level, 'info');
      assert.equal(entry.category, 'TASK_TYPE_DETECTION');
      assert.equal(entry.message, 'Test message');
    });

    it('should include details when provided', () => {
      const entry = logger.log('info', 'TASK_TYPE_DETECTION', 'Test message', {
        details: { taskType: 'READ_INFO', inputLength: 100 },
      });

      assert.deepEqual(entry.details, { taskType: 'READ_INFO', inputLength: 100 });
    });

    it('should include taskId and projectId when provided', () => {
      const entry = logger.log('info', 'EXECUTION_START', 'Starting', {
        taskId: 'task-123',
        projectId: 'project-456',
      });

      assert.equal(entry.taskId, 'task-123');
      assert.equal(entry.projectId, 'project-456');
    });

    it('should trim entries when over maxEntries limit', () => {
      const smallLogger = new SupervisorLogger({ maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        smallLogger.log('info', 'TASK_TYPE_DETECTION', `Message ${i}`);
      }

      const entries = smallLogger.getAll();
      assert.equal(entries.length, 5);
      assert.equal(entries[0].message, 'Message 5'); // First 5 trimmed
    });
  });

  describe('logTaskTypeDetection()', () => {
    it('should log task type detection with input preview', () => {
      const input = 'What is the status of the project?';
      const entry = logger.logTaskTypeDetection('READ_INFO', input, {
        taskId: 'task-123',
      });

      assert.equal(entry.category, 'TASK_TYPE_DETECTION');
      assert.ok(entry.message.includes('READ_INFO'));
      assert.equal(entry.details?.taskType, 'READ_INFO');
      assert.ok(entry.details?.inputPreview?.includes('What is the status'));
      assert.equal(entry.details?.inputLength, input.length);
    });

    it('should truncate long input previews', () => {
      const longInput = 'A'.repeat(200);
      const entry = logger.logTaskTypeDetection('IMPLEMENTATION', longInput);

      assert.ok(entry.details?.inputPreview?.includes('...'));
      assert.ok((entry.details?.inputPreview as string).length < 110);
    });
  });

  describe('logWritePermission()', () => {
    it('should log allowed permission with info level', () => {
      const entry = logger.logWritePermission(true, 'TaskType is IMPLEMENTATION', {
        taskId: 'task-123',
        taskType: 'IMPLEMENTATION',
      });

      assert.equal(entry.level, 'info');
      assert.equal(entry.category, 'WRITE_PERMISSION');
      assert.ok(entry.message.includes('ALLOWED'));
      assert.equal(entry.details?.allowed, true);
    });

    it('should log denied permission with warn level', () => {
      const entry = logger.logWritePermission(false, 'TaskType is READ_INFO', {
        taskId: 'task-123',
        taskType: 'READ_INFO',
      });

      assert.equal(entry.level, 'warn');
      assert.ok(entry.message.includes('DENIED'));
      assert.equal(entry.details?.allowed, false);
    });
  });

  describe('logGuardDecision()', () => {
    it('should log passed guard with info level', () => {
      const entry = logger.logGuardDecision('API_KEY_CHECK', true, 'API key is valid', {
        taskId: 'task-123',
      });

      assert.equal(entry.level, 'info');
      assert.equal(entry.category, 'GUARD_DECISION');
      assert.ok(entry.message.includes('PASSED'));
      assert.equal(entry.details?.guardName, 'API_KEY_CHECK');
    });

    it('should log blocked guard with warn level', () => {
      const entry = logger.logGuardDecision('DANGEROUS_OP', false, 'Operation too risky', {
        taskId: 'task-123',
        details: { riskLevel: 'high' },
      });

      assert.equal(entry.level, 'warn');
      assert.ok(entry.message.includes('BLOCKED'));
      assert.equal(entry.details?.riskLevel, 'high');
    });
  });

  describe('logRetryResume()', () => {
    it('should log retry action with attempt info', () => {
      const entry = logger.logRetryResume('retry', 'Execution failed, retrying', {
        taskId: 'task-123',
        attempt: 2,
        maxAttempts: 3,
      });

      assert.equal(entry.category, 'RETRY_RESUME');
      assert.ok(entry.message.includes('RETRY'));
      assert.equal(entry.details?.attempt, 2);
      assert.equal(entry.details?.maxAttempts, 3);
    });

    it('should log resume action', () => {
      const entry = logger.logRetryResume('resume', 'Task is awaiting response', {
        taskId: 'task-123',
      });

      assert.ok(entry.message.includes('RESUME'));
    });

    it('should log rollback action', () => {
      const entry = logger.logRetryResume('rollback', 'Stale task without artifacts', {
        taskId: 'task-123',
      });

      assert.ok(entry.message.includes('ROLLBACK'));
    });
  });

  describe('logTemplateSelection()', () => {
    it('should log template selection with source', () => {
      const entry = logger.logTemplateSelection('default-output-template', {
        taskId: 'task-123',
        templateType: 'output',
        source: 'global',
      });

      assert.equal(entry.category, 'TEMPLATE_SELECTION');
      assert.ok(entry.message.includes('default-output-template'));
      assert.equal(entry.details?.templateType, 'output');
      assert.equal(entry.details?.source, 'global');
    });
  });

  describe('logExecutionStart/End()', () => {
    it('should log execution start', () => {
      const entry = logger.logExecutionStart('task-123', {
        projectId: 'project-456',
        taskType: 'IMPLEMENTATION',
        prompt: 'Create a new feature',
      });

      assert.equal(entry.category, 'EXECUTION_START');
      assert.equal(entry.taskId, 'task-123');
      assert.equal(entry.details?.taskType, 'IMPLEMENTATION');
    });

    it('should log successful execution end', () => {
      const entry = logger.logExecutionEnd('task-123', true, {
        projectId: 'project-456',
        durationMs: 5000,
      });

      assert.equal(entry.level, 'info');
      assert.equal(entry.category, 'EXECUTION_END');
      assert.ok(entry.message.includes('completed'));
      assert.equal(entry.details?.durationMs, 5000);
    });

    it('should log failed execution end', () => {
      const entry = logger.logExecutionEnd('task-123', false, {
        durationMs: 3000,
        error: 'Timeout exceeded',
      });

      assert.equal(entry.level, 'error');
      assert.ok(entry.message.includes('failed'));
      assert.equal(entry.details?.error, 'Timeout exceeded');
    });
  });

  describe('logValidation()', () => {
    it('should log valid output', () => {
      const entry = logger.logValidation(true, [], { taskId: 'task-123' });

      assert.equal(entry.level, 'info');
      assert.equal(entry.category, 'VALIDATION');
      assert.ok(entry.message.includes('PASSED'));
    });

    it('should log invalid output with violations', () => {
      const violations = [
        { type: 'missing_required_section', message: 'Output is empty' },
        { type: 'skipped_validation', message: 'Validation skip marker found' },
      ];

      const entry = logger.logValidation(false, violations, { taskId: 'task-123' });

      assert.equal(entry.level, 'warn');
      assert.ok(entry.message.includes('FAILED'));
      assert.equal(entry.details?.violationCount, 2);
    });
  });

  describe('logError()', () => {
    it('should log error with message and stack', () => {
      const error = new Error('Something went wrong');
      const entry = logger.logError('Execution failed', error, { taskId: 'task-123' });

      assert.equal(entry.level, 'error');
      assert.equal(entry.category, 'ERROR');
      assert.equal(entry.details?.error, 'Something went wrong');
      assert.equal(typeof entry.details?.stack, 'string');
    });

    it('should handle non-Error objects', () => {
      const entry = logger.logError('Execution failed', 'String error');

      assert.equal(entry.details?.error, 'String error');
    });
  });

  describe('Retrieval methods', () => {
    beforeEach(() => {
      logger.log('info', 'TASK_TYPE_DETECTION', 'Msg 1', { taskId: 'task-1' });
      logger.log('warn', 'WRITE_PERMISSION', 'Msg 2', { taskId: 'task-2' });
      logger.log('error', 'ERROR', 'Msg 3', { taskId: 'task-1' });
      logger.log('info', 'TASK_TYPE_DETECTION', 'Msg 4', { taskId: 'task-3' });
    });

    it('getAll() should return all entries', () => {
      const entries = logger.getAll();
      assert.equal(entries.length, 4);
    });

    it('getByTaskId() should filter by task', () => {
      const entries = logger.getByTaskId('task-1');
      assert.equal(entries.length, 2);
      assert.ok(entries.every(e => e.taskId === 'task-1'));
    });

    it('getByCategory() should filter by category', () => {
      const entries = logger.getByCategory('TASK_TYPE_DETECTION');
      assert.equal(entries.length, 2);
      assert.ok(entries.every(e => e.category === 'TASK_TYPE_DETECTION'));
    });

    it('getRecent() should return last N entries', () => {
      const entries = logger.getRecent(2);
      assert.equal(entries.length, 2);
      assert.equal(entries[0].message, 'Msg 3');
      assert.equal(entries[1].message, 'Msg 4');
    });

    it('getSince() should filter by timestamp', () => {
      // Create a timestamp before all entries
      const beforeAllTimestamp = new Date(Date.now() - 1000).toISOString();
      const filtered = logger.getSince(beforeAllTimestamp);
      // All 4 entries should be returned (since they were created after beforeAllTimestamp)
      assert.equal(filtered.length, 4);

      // Create a timestamp after all entries
      const afterAllTimestamp = new Date(Date.now() + 1000).toISOString();
      const filteredNone = logger.getSince(afterAllTimestamp);
      assert.equal(filteredNone.length, 0);
    });

    it('clear() should remove all entries', () => {
      logger.clear();
      assert.equal(logger.getAll().length, 0);
    });
  });

  describe('Subscription', () => {
    it('should notify subscribers of new logs', () => {
      const received: SupervisorLogEntry[] = [];
      const subscriber: SupervisorLogSubscriber = {
        onLog(entry) {
          received.push(entry);
        },
      };

      logger.subscribe(subscriber);
      logger.log('info', 'TASK_TYPE_DETECTION', 'Test message');

      assert.equal(received.length, 1);
      assert.equal(received[0].message, 'Test message');
    });

    it('should support multiple subscribers', () => {
      const received1: SupervisorLogEntry[] = [];
      const received2: SupervisorLogEntry[] = [];

      logger.subscribe({ onLog: e => received1.push(e) });
      logger.subscribe({ onLog: e => received2.push(e) });
      logger.log('info', 'TASK_TYPE_DETECTION', 'Test message');

      assert.equal(received1.length, 1);
      assert.equal(received2.length, 1);
    });

    it('should allow unsubscription', () => {
      const received: SupervisorLogEntry[] = [];
      const unsubscribe = logger.subscribe({
        onLog: e => received.push(e),
      });

      logger.log('info', 'TASK_TYPE_DETECTION', 'Before unsubscribe');
      unsubscribe();
      logger.log('info', 'TASK_TYPE_DETECTION', 'After unsubscribe');

      assert.equal(received.length, 1);
    });

    it('should handle subscriber errors gracefully', () => {
      const received: SupervisorLogEntry[] = [];

      logger.subscribe({
        onLog() {
          throw new Error('Subscriber error');
        },
      });
      logger.subscribe({
        onLog: e => received.push(e),
      });

      // Should not throw
      logger.log('info', 'TASK_TYPE_DETECTION', 'Test message');
      assert.equal(received.length, 1);
    });

    it('should report subscriber count', () => {
      assert.equal(logger.getSubscriberCount(), 0);

      const unsub1 = logger.subscribe({ onLog: () => {} });
      const unsub2 = logger.subscribe({ onLog: () => {} });
      assert.equal(logger.getSubscriberCount(), 2);

      unsub1();
      assert.equal(logger.getSubscriberCount(), 1);
    });
  });
});

describe('Singleton Logger', () => {
  beforeEach(() => {
    resetSupervisorLogger();
  });

  it('getSupervisorLogger() should return same instance', () => {
    const logger1 = getSupervisorLogger();
    const logger2 = getSupervisorLogger();
    assert.equal(logger1, logger2);
  });

  it('resetSupervisorLogger() should clear singleton', () => {
    const logger1 = getSupervisorLogger();
    logger1.log('info', 'TASK_TYPE_DETECTION', 'Test');

    resetSupervisorLogger();

    const logger2 = getSupervisorLogger();
    assert.notEqual(logger2, logger1);
    assert.equal(logger2.getAll().length, 0);
  });
});
