/**
 * SupervisorLogger Unit Tests
 *
 * AC A.1: Supervisor Log: TaskType判定、write許可、ガード判定、再試行/再開理由、採用したテンプレ
 */

import { expect } from 'chai';
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

      expect(entry.timestamp).to.be.a('string');
      expect(entry.level).to.equal('info');
      expect(entry.category).to.equal('TASK_TYPE_DETECTION');
      expect(entry.message).to.equal('Test message');
    });

    it('should include details when provided', () => {
      const entry = logger.log('info', 'TASK_TYPE_DETECTION', 'Test message', {
        details: { taskType: 'READ_INFO', inputLength: 100 },
      });

      expect(entry.details).to.deep.equal({ taskType: 'READ_INFO', inputLength: 100 });
    });

    it('should include taskId and projectId when provided', () => {
      const entry = logger.log('info', 'EXECUTION_START', 'Starting', {
        taskId: 'task-123',
        projectId: 'project-456',
      });

      expect(entry.taskId).to.equal('task-123');
      expect(entry.projectId).to.equal('project-456');
    });

    it('should trim entries when over maxEntries limit', () => {
      const smallLogger = new SupervisorLogger({ maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        smallLogger.log('info', 'TASK_TYPE_DETECTION', `Message ${i}`);
      }

      const entries = smallLogger.getAll();
      expect(entries.length).to.equal(5);
      expect(entries[0].message).to.equal('Message 5'); // First 5 trimmed
    });
  });

  describe('logTaskTypeDetection()', () => {
    it('should log task type detection with input preview', () => {
      const input = 'What is the status of the project?';
      const entry = logger.logTaskTypeDetection('READ_INFO', input, {
        taskId: 'task-123',
      });

      expect(entry.category).to.equal('TASK_TYPE_DETECTION');
      expect(entry.message).to.include('READ_INFO');
      expect(entry.details?.taskType).to.equal('READ_INFO');
      expect(entry.details?.inputPreview).to.include('What is the status');
      expect(entry.details?.inputLength).to.equal(input.length);
    });

    it('should truncate long input previews', () => {
      const longInput = 'A'.repeat(200);
      const entry = logger.logTaskTypeDetection('IMPLEMENTATION', longInput);

      expect(entry.details?.inputPreview).to.include('...');
      expect((entry.details?.inputPreview as string).length).to.be.lessThan(110);
    });
  });

  describe('logWritePermission()', () => {
    it('should log allowed permission with info level', () => {
      const entry = logger.logWritePermission(true, 'TaskType is IMPLEMENTATION', {
        taskId: 'task-123',
        taskType: 'IMPLEMENTATION',
      });

      expect(entry.level).to.equal('info');
      expect(entry.category).to.equal('WRITE_PERMISSION');
      expect(entry.message).to.include('ALLOWED');
      expect(entry.details?.allowed).to.equal(true);
    });

    it('should log denied permission with warn level', () => {
      const entry = logger.logWritePermission(false, 'TaskType is READ_INFO', {
        taskId: 'task-123',
        taskType: 'READ_INFO',
      });

      expect(entry.level).to.equal('warn');
      expect(entry.message).to.include('DENIED');
      expect(entry.details?.allowed).to.equal(false);
    });
  });

  describe('logGuardDecision()', () => {
    it('should log passed guard with info level', () => {
      const entry = logger.logGuardDecision('API_KEY_CHECK', true, 'API key is valid', {
        taskId: 'task-123',
      });

      expect(entry.level).to.equal('info');
      expect(entry.category).to.equal('GUARD_DECISION');
      expect(entry.message).to.include('PASSED');
      expect(entry.details?.guardName).to.equal('API_KEY_CHECK');
    });

    it('should log blocked guard with warn level', () => {
      const entry = logger.logGuardDecision('DANGEROUS_OP', false, 'Operation too risky', {
        taskId: 'task-123',
        details: { riskLevel: 'high' },
      });

      expect(entry.level).to.equal('warn');
      expect(entry.message).to.include('BLOCKED');
      expect(entry.details?.riskLevel).to.equal('high');
    });
  });

  describe('logRetryResume()', () => {
    it('should log retry action with attempt info', () => {
      const entry = logger.logRetryResume('retry', 'Execution failed, retrying', {
        taskId: 'task-123',
        attempt: 2,
        maxAttempts: 3,
      });

      expect(entry.category).to.equal('RETRY_RESUME');
      expect(entry.message).to.include('RETRY');
      expect(entry.details?.attempt).to.equal(2);
      expect(entry.details?.maxAttempts).to.equal(3);
    });

    it('should log resume action', () => {
      const entry = logger.logRetryResume('resume', 'Task is awaiting response', {
        taskId: 'task-123',
      });

      expect(entry.message).to.include('RESUME');
    });

    it('should log rollback action', () => {
      const entry = logger.logRetryResume('rollback', 'Stale task without artifacts', {
        taskId: 'task-123',
      });

      expect(entry.message).to.include('ROLLBACK');
    });
  });

  describe('logTemplateSelection()', () => {
    it('should log template selection with source', () => {
      const entry = logger.logTemplateSelection('default-output-template', {
        taskId: 'task-123',
        templateType: 'output',
        source: 'global',
      });

      expect(entry.category).to.equal('TEMPLATE_SELECTION');
      expect(entry.message).to.include('default-output-template');
      expect(entry.details?.templateType).to.equal('output');
      expect(entry.details?.source).to.equal('global');
    });
  });

  describe('logExecutionStart/End()', () => {
    it('should log execution start', () => {
      const entry = logger.logExecutionStart('task-123', {
        projectId: 'project-456',
        taskType: 'IMPLEMENTATION',
        prompt: 'Create a new feature',
      });

      expect(entry.category).to.equal('EXECUTION_START');
      expect(entry.taskId).to.equal('task-123');
      expect(entry.details?.taskType).to.equal('IMPLEMENTATION');
    });

    it('should log successful execution end', () => {
      const entry = logger.logExecutionEnd('task-123', true, {
        projectId: 'project-456',
        durationMs: 5000,
      });

      expect(entry.level).to.equal('info');
      expect(entry.category).to.equal('EXECUTION_END');
      expect(entry.message).to.include('completed');
      expect(entry.details?.durationMs).to.equal(5000);
    });

    it('should log failed execution end', () => {
      const entry = logger.logExecutionEnd('task-123', false, {
        durationMs: 3000,
        error: 'Timeout exceeded',
      });

      expect(entry.level).to.equal('error');
      expect(entry.message).to.include('failed');
      expect(entry.details?.error).to.equal('Timeout exceeded');
    });
  });

  describe('logValidation()', () => {
    it('should log valid output', () => {
      const entry = logger.logValidation(true, [], { taskId: 'task-123' });

      expect(entry.level).to.equal('info');
      expect(entry.category).to.equal('VALIDATION');
      expect(entry.message).to.include('PASSED');
    });

    it('should log invalid output with violations', () => {
      const violations = [
        { type: 'missing_required_section', message: 'Output is empty' },
        { type: 'skipped_validation', message: 'Validation skip marker found' },
      ];

      const entry = logger.logValidation(false, violations, { taskId: 'task-123' });

      expect(entry.level).to.equal('warn');
      expect(entry.message).to.include('FAILED');
      expect(entry.details?.violationCount).to.equal(2);
    });
  });

  describe('logError()', () => {
    it('should log error with message and stack', () => {
      const error = new Error('Something went wrong');
      const entry = logger.logError('Execution failed', error, { taskId: 'task-123' });

      expect(entry.level).to.equal('error');
      expect(entry.category).to.equal('ERROR');
      expect(entry.details?.error).to.equal('Something went wrong');
      expect(entry.details?.stack).to.be.a('string');
    });

    it('should handle non-Error objects', () => {
      const entry = logger.logError('Execution failed', 'String error');

      expect(entry.details?.error).to.equal('String error');
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
      expect(entries.length).to.equal(4);
    });

    it('getByTaskId() should filter by task', () => {
      const entries = logger.getByTaskId('task-1');
      expect(entries.length).to.equal(2);
      expect(entries.every(e => e.taskId === 'task-1')).to.be.true;
    });

    it('getByCategory() should filter by category', () => {
      const entries = logger.getByCategory('TASK_TYPE_DETECTION');
      expect(entries.length).to.equal(2);
      expect(entries.every(e => e.category === 'TASK_TYPE_DETECTION')).to.be.true;
    });

    it('getRecent() should return last N entries', () => {
      const entries = logger.getRecent(2);
      expect(entries.length).to.equal(2);
      expect(entries[0].message).to.equal('Msg 3');
      expect(entries[1].message).to.equal('Msg 4');
    });

    it('getSince() should filter by timestamp', () => {
      // Create a timestamp before all entries
      const beforeAllTimestamp = new Date(Date.now() - 1000).toISOString();
      const filtered = logger.getSince(beforeAllTimestamp);
      // All 4 entries should be returned (since they were created after beforeAllTimestamp)
      expect(filtered.length).to.equal(4);

      // Create a timestamp after all entries
      const afterAllTimestamp = new Date(Date.now() + 1000).toISOString();
      const filteredNone = logger.getSince(afterAllTimestamp);
      expect(filteredNone.length).to.equal(0);
    });

    it('clear() should remove all entries', () => {
      logger.clear();
      expect(logger.getAll().length).to.equal(0);
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

      expect(received.length).to.equal(1);
      expect(received[0].message).to.equal('Test message');
    });

    it('should support multiple subscribers', () => {
      const received1: SupervisorLogEntry[] = [];
      const received2: SupervisorLogEntry[] = [];

      logger.subscribe({ onLog: e => received1.push(e) });
      logger.subscribe({ onLog: e => received2.push(e) });
      logger.log('info', 'TASK_TYPE_DETECTION', 'Test message');

      expect(received1.length).to.equal(1);
      expect(received2.length).to.equal(1);
    });

    it('should allow unsubscription', () => {
      const received: SupervisorLogEntry[] = [];
      const unsubscribe = logger.subscribe({
        onLog: e => received.push(e),
      });

      logger.log('info', 'TASK_TYPE_DETECTION', 'Before unsubscribe');
      unsubscribe();
      logger.log('info', 'TASK_TYPE_DETECTION', 'After unsubscribe');

      expect(received.length).to.equal(1);
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
      expect(received.length).to.equal(1);
    });

    it('should report subscriber count', () => {
      expect(logger.getSubscriberCount()).to.equal(0);

      const unsub1 = logger.subscribe({ onLog: () => {} });
      const unsub2 = logger.subscribe({ onLog: () => {} });
      expect(logger.getSubscriberCount()).to.equal(2);

      unsub1();
      expect(logger.getSubscriberCount()).to.equal(1);
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
    expect(logger1).to.equal(logger2);
  });

  it('resetSupervisorLogger() should clear singleton', () => {
    const logger1 = getSupervisorLogger();
    logger1.log('info', 'TASK_TYPE_DETECTION', 'Test');

    resetSupervisorLogger();

    const logger2 = getSupervisorLogger();
    expect(logger2).to.not.equal(logger1);
    expect(logger2.getAll().length).to.equal(0);
  });
});
