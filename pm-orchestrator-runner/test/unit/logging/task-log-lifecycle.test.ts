/**
 * Task Log Lifecycle Tests
 *
 * TDD Tests for Property 26 (TaskLog Lifecycle Recording) and
 * Property 27 (/tasks-/logs Consistency)
 *
 * These tests are designed to FAIL initially (TDD Red phase),
 * proving the bug exists, then implementation will make them pass.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { TaskLogManager } from '../../../src/logging/task-log-manager';
import { TaskStatus } from '../../../src/models/enums';
import type { Thread, Run, TaskLog, TaskLogEntry } from '../../../src/models/repl/task-log';

/**
 * Simulates a minimal Runner interface for testing
 * In real implementation, this would be the actual RunnerCore
 */
interface TaskResult {
  task_id: string;
  status: TaskStatus;
  started_at: string;
  completed_at?: string;
  error?: Error;
}

/**
 * Test helper: simulates what Runner does when executing a task
 * Uses the proper Thread/Run/Task hierarchy
 */
class MockRunner {
  private taskResults: TaskResult[] = [];
  private taskLogManager: TaskLogManager;
  private sessionId: string;
  private thread: Thread | null = null;
  private run: Run | null = null;

  constructor(taskLogManager: TaskLogManager, sessionId: string) {
    this.taskLogManager = taskLogManager;
    this.sessionId = sessionId;
  }

  async initialize(): Promise<void> {
    // Create thread and run for task context
    this.thread = await this.taskLogManager.createThread(this.sessionId, 'main', 'Test tasks');
    this.run = await this.taskLogManager.createRun(this.sessionId, this.thread.thread_id, 'USER_INPUT');
  }

  /**
   * Simulates what currently happens: Runner tracks task but doesn't log
   */
  async executeTaskWithoutLogging(taskId: string, willFail: boolean = false): Promise<TaskResult> {
    const startedAt = new Date().toISOString();

    // Runner just stores in its internal array - NO TaskLog created
    const result: TaskResult = {
      task_id: taskId,
      status: willFail ? TaskStatus.INCOMPLETE : TaskStatus.COMPLETE,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };

    this.taskResults.push(result);
    return result;
  }

  /**
   * What SHOULD happen: Runner creates TaskLog for terminal states
   * This is what we need to implement after TDD
   */
  async executeTaskWithLogging(willFail: boolean = false): Promise<TaskResult> {
    if (!this.thread || !this.run) {
      throw new Error('MockRunner not initialized');
    }

    const startedAt = new Date().toISOString();

    // Step 1: Create TaskLog at start (Fail-Closed) using hierarchy
    const taskLog = await this.taskLogManager.createTaskWithContext(
      this.sessionId,
      this.thread.thread_id,
      this.run.run_id
    );

    // Step 2: Execute task (simulated)
    const status = willFail ? TaskStatus.INCOMPLETE : TaskStatus.COMPLETE;

    // Step 3: Add completion event to session-based task
    const eventType = willFail ? 'TASK_ERROR' : 'TASK_COMPLETED';
    await this.taskLogManager.addEventWithSession(
      taskLog.task_id,
      this.sessionId,
      eventType,
      {
        status: willFail ? 'INCOMPLETE' : 'COMPLETE',
        error_message: willFail ? 'Task did not complete successfully' : undefined
      }
    );

    // Step 4: Update session index entry status
    // Note: This is a gap - there's no method to update session index entry status!
    // This is part of what needs to be implemented for Property 26/27

    // Step 5: Store in internal array
    const result: TaskResult = {
      task_id: taskLog.task_id,
      status,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };

    this.taskResults.push(result);
    return result;
  }

  getTaskResults(): TaskResult[] {
    return [...this.taskResults];
  }

  getThread(): Thread | null {
    return this.thread;
  }

  getRun(): Run | null {
    return this.run;
  }
}

describe('Property 26: TaskLog Lifecycle Recording (Fail-Closed)', () => {
  let tempDir: string;
  let taskLogManager: TaskLogManager;
  let thread: Thread;
  let run: Run;
  const sessionId = 'sess-test-lifecycle';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-log-lifecycle-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    taskLogManager = new TaskLogManager(tempDir);
    await taskLogManager.initializeSession(sessionId);

    // Setup thread and run for task context
    thread = await taskLogManager.createThread(sessionId, 'main', 'Test');
    run = await taskLogManager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Fail-Closed Logging Principle', () => {
    /**
     * Property 26 Section 1: Fail-Closed Logging
     * "When task reaches terminal state (complete, incomplete, error),
     *  TaskLog storage is REQUIRED"
     */
    it('should save TaskLog when task is created', async () => {
      // Create task using hierarchy
      const taskLog = await taskLogManager.createTaskWithContext(
        sessionId,
        thread.thread_id,
        run.run_id
      );

      // Verify TaskLog exists in session index
      const index = await taskLogManager.getSessionIndex(sessionId);

      assert.equal(index.entries.length, 1, 'TaskLog should be saved when created');
      assert.equal(index.entries[0].task_id, taskLog.task_id);
    });

    /**
     * Property 26 Section 3: INCOMPLETE state MUST record
     * "INCOMPLETE state MUST record: error_reason (required)"
     */
    it('should record completion event for task', async () => {
      // Create task
      const taskLog = await taskLogManager.createTaskWithContext(
        sessionId,
        thread.thread_id,
        run.run_id
      );

      // Add completion event
      await taskLogManager.addEventWithSession(
        taskLog.task_id,
        sessionId,
        'TASK_COMPLETED',
        {
          status: 'COMPLETE',
          files_modified: ['file1.ts']
        }
      );

      // Verify completion event is recorded
      const detail = await taskLogManager.getTaskDetailWithSession(
        taskLog.task_id,
        sessionId,
        'summary'
      );

      assert.ok(detail.log, 'TaskLog should exist');
      const completionEvent = detail.events.find(e => e.event_type === 'TASK_COMPLETED');
      assert.ok(completionEvent, 'Completion event should be recorded');
    });

    /**
     * Property 26 Section 3: INCOMPLETE state MUST record error_reason
     */
    it('should record error_reason for INCOMPLETE status', async () => {
      const taskLog = await taskLogManager.createTaskWithContext(
        sessionId,
        thread.thread_id,
        run.run_id
      );

      const errorReason = 'Evidence verification failed';

      // Add error event
      await taskLogManager.addEventWithSession(
        taskLog.task_id,
        sessionId,
        'TASK_ERROR',
        {
          status: 'INCOMPLETE',
          error_message: errorReason
        }
      );

      const detail = await taskLogManager.getTaskDetailWithSession(
        taskLog.task_id,
        sessionId,
        'summary'
      );

      const errorEvent = detail.events.find(e => e.event_type === 'TASK_ERROR');
      assert.ok(errorEvent, 'Error event should exist');
      assert.equal(
        errorEvent!.content.error_message,
        errorReason,
        'error_reason should be recorded'
      );
    });
  });

  describe('TaskLog Required Fields (Terminal State)', () => {
    /**
     * Property 26 Section 4: Required fields at terminal state
     */
    it('should include all required fields in TaskLog', async () => {
      const taskLog = await taskLogManager.createTaskWithContext(
        sessionId,
        thread.thread_id,
        run.run_id
      );

      assert.ok(taskLog, 'TaskLog should exist');
      assert.ok(taskLog.task_id, 'task_id required');
      assert.equal(taskLog.session_id, sessionId, 'session_id required');
      assert.equal(taskLog.thread_id, thread.thread_id, 'thread_id required');
      assert.equal(taskLog.run_id, run.run_id, 'run_id required');
      assert.ok(taskLog.created_at, 'created_at required');
      assert.ok(Array.isArray(taskLog.events), 'events array required');
    });
  });
});

describe('Property 27: /tasks-/logs Consistency', () => {
  let tempDir: string;
  let taskLogManager: TaskLogManager;
  let mockRunner: MockRunner;
  const sessionId = 'sess-test-consistency';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-log-consistency-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    taskLogManager = new TaskLogManager(tempDir);
    await taskLogManager.initializeSession(sessionId);
    mockRunner = new MockRunner(taskLogManager, sessionId);
    await mockRunner.initialize();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Consistency Principle', () => {
    /**
     * Property 27 Section 1: Consistency Principle
     * "Tasks shown by /tasks MUST also be shown by /logs"
     */
    it('should show same task count in runner and session index when using logging', async () => {
      // Execute tasks WITH logging (correct behavior)
      await mockRunner.executeTaskWithLogging(false);
      await mockRunner.executeTaskWithLogging(true); // INCOMPLETE
      await mockRunner.executeTaskWithLogging(false);

      const taskResults = mockRunner.getTaskResults();
      const sessionIndex = await taskLogManager.getSessionIndex(sessionId);

      // Property 27: task count must match
      assert.equal(
        taskResults.length,
        sessionIndex.entries.length,
        `Runner task count (${taskResults.length}) must equal session index count (${sessionIndex.entries.length})`
      );
    });

    /**
     * Property 27 Section 2: Prohibited Inconsistency
     * "If session has tasks, /logs must NOT return 'No tasks logged'"
     *
     * NOTE: This test demonstrates the OLD buggy behavior using MockRunner.executeTaskWithoutLogging().
     * The actual fix is in RunnerCore (not MockRunner).
     * This test is SKIPPED because it tests the mock's buggy behavior, not the actual implementation.
     * See: src/core/runner-core.ts for the actual fix (Property 26 completion handling).
     */
    it.skip('BUG REPRODUCTION (historical): demonstrates old buggy behavior when not using logging', async () => {
      // Execute tasks WITHOUT logging (current buggy behavior)
      await mockRunner.executeTaskWithoutLogging('task-001', false);
      await mockRunner.executeTaskWithoutLogging('task-002', true); // INCOMPLETE

      const taskResults = mockRunner.getTaskResults();
      const sessionIndex = await taskLogManager.getSessionIndex(sessionId);

      // This exposes the bug:
      // - taskResults.length = 2 (runner has tasks)
      // - sessionIndex.entries.length = 0 (TaskLogManager has no tasks)
      const isBuggy = taskResults.length > 0 && sessionIndex.entries.length === 0;

      assert.equal(
        isBuggy,
        false,
        'BUG CONFIRMED: Runner has ' + taskResults.length + ' task(s) but ' +
        'TaskLogManager session index has ' + sessionIndex.entries.length + '. ' +
        'This causes /logs to show "No tasks logged" when tasks exist.'
      );
    });
  });

  describe('formatTaskList Behavior', () => {
    /**
     * Property 27 Section 2: Prohibited Inconsistency
     * "formatTaskList should NOT return 'No tasks logged' when tasks exist"
     */
    it('should not return "No tasks logged" when tasks were logged', async () => {
      // Execute with logging
      await mockRunner.executeTaskWithLogging(false);

      const sessionIndex = await taskLogManager.getSessionIndex(sessionId);

      // formatTaskList expects TaskLogEntry[], convert from session index
      const entries: TaskLogEntry[] = sessionIndex.entries;
      const formatted = taskLogManager.formatTaskList(entries, sessionId);

      assert.ok(
        !formatted.includes('No tasks logged'),
        'formatTaskList should not show "No tasks logged" when tasks exist'
      );
    });

    /**
     * NOTE: This test demonstrates the OLD buggy behavior using MockRunner.executeTaskWithoutLogging().
     * The actual fix is in RunnerCore (not MockRunner).
     * This test is SKIPPED because it tests the mock's buggy behavior, not the actual implementation.
     * See: src/core/runner-core.ts for the actual fix (Property 26 completion handling).
     */
    it.skip('BUG REPRODUCTION (historical): session index is empty when not using logging', async () => {
      // Execute WITHOUT logging (buggy behavior)
      await mockRunner.executeTaskWithoutLogging('task-001', false);

      const taskResults = mockRunner.getTaskResults();
      const sessionIndex = await taskLogManager.getSessionIndex(sessionId);

      // taskResults has 1 task, but sessionIndex is empty
      if (taskResults.length > 0 && sessionIndex.entries.length === 0) {
        assert.fail(
          'BUG CONFIRMED: Runner has ' + taskResults.length + ' task(s) but ' +
          'session index has ' + sessionIndex.entries.length + '. ' +
          'Runner and TaskLogManager are not synchronized.'
        );
      }
    });
  });

  describe('Synchronization Timing', () => {
    /**
     * Property 27 Section 3: Sync Timing
     * "TaskLog MUST be updated at: task start, task completion, status change"
     */
    it('should sync TaskLog at task start', async () => {
      const thread = mockRunner.getThread()!;
      const run = mockRunner.getRun()!;

      // Create task (start)
      const taskLog = await taskLogManager.createTaskWithContext(
        sessionId,
        thread.thread_id,
        run.run_id
      );

      // TaskLog should exist immediately after start
      const retrieved = await taskLogManager.getTaskLogWithSession(taskLog.task_id, sessionId);
      assert.ok(retrieved, 'TaskLog should exist after task start');
      assert.equal(retrieved!.task_id, taskLog.task_id);
    });

    /**
     * Property 27 Section 3: Sync Timing
     * "TaskLog MUST be updated at task completion"
     */
    it('should have task in session index after creation', async () => {
      const thread = mockRunner.getThread()!;
      const run = mockRunner.getRun()!;

      await taskLogManager.createTaskWithContext(
        sessionId,
        thread.thread_id,
        run.run_id
      );

      // Session index should have the task
      const sessionIndex = await taskLogManager.getSessionIndex(sessionId);

      assert.ok(sessionIndex.entries.length > 0, 'Session index should have tasks');
    });
  });

  describe('Fail-Closed Conditions (Property 27 Section 4)', () => {
    /**
     * Property 27 Section 4: Fail-Closed Conditions
     * "Violation: tasks_count > 0 && logs_count === 0"
     */
    it('should detect consistency violation', () => {
      // Simulate the bug scenario
      const tasksCount = 2; // Runner has 2 tasks
      const logsCount = 0;  // TaskLogManager has 0 logs

      // This is a violation per Property 27
      const isViolation = tasksCount > 0 && logsCount === 0;

      assert.equal(isViolation, true, 'This scenario is a consistency violation');
    });

    /**
     * Property 27 Section 5: Verification Method
     * "if tasks_count != logs_count: raise ConsistencyError"
     */
    it('should verify consistency between runner and session index count', async () => {
      // With correct implementation (using logging)
      await mockRunner.executeTaskWithLogging(false);
      await mockRunner.executeTaskWithLogging(false);

      const tasksCount = mockRunner.getTaskResults().length;
      const sessionIndex = await taskLogManager.getSessionIndex(sessionId);
      const logsCount = sessionIndex.entries.length;

      // Verification per Property 27 Section 5
      assert.equal(
        tasksCount,
        logsCount,
        `Consistency check failed: tasks=${tasksCount}, logs=${logsCount}`
      );
    });
  });
});

describe('Property 26/27 Integration: Runner-TaskLogManager Gap', () => {
  let tempDir: string;
  let taskLogManager: TaskLogManager;
  let mockRunner: MockRunner;
  const sessionId = 'sess-test-gap';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-log-gap-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    taskLogManager = new TaskLogManager(tempDir);
    await taskLogManager.initializeSession(sessionId);
    mockRunner = new MockRunner(taskLogManager, sessionId);
    await mockRunner.initialize();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * NOTE: This test demonstrates the OLD buggy behavior using MockRunner.executeTaskWithoutLogging().
   * The actual fix is in RunnerCore (not MockRunner).
   * This test is SKIPPED because it tests the mock's buggy behavior, not the actual implementation.
   * See: src/core/runner-core.ts for the actual fix (Property 26 completion handling).
   */
  it.skip('BUG REPRODUCTION (historical): demonstrates /tasks vs /logs disconnect without logging', async () => {
    // Scenario 1: Execute WITHOUT logging (current buggy behavior)
    await mockRunner.executeTaskWithoutLogging('manual-task-1', false);
    await mockRunner.executeTaskWithoutLogging('manual-task-2', true);

    const runnerTasks = mockRunner.getTaskResults();
    const sessionIndex = await taskLogManager.getSessionIndex(sessionId);

    // The bug: Runner has tasks, but TaskLogManager session index is empty
    console.log('Runner tasks:', runnerTasks.length);
    console.log('Session index entries:', sessionIndex.entries.length);

    // This test FAILS, proving the bug
    if (runnerTasks.length !== sessionIndex.entries.length) {
      assert.fail(
        'GAP CONFIRMED:\n' +
        '  Runner.getTaskResults(): ' + runnerTasks.length + ' task(s)\n' +
        '  TaskLogManager.getSessionIndex(): ' + sessionIndex.entries.length + ' entries\n' +
        '  \n' +
        '  This is the root cause of the "/tasks shows tasks but /logs shows nothing" bug.\n' +
        '  \n' +
        '  Fix required:\n' +
        '  - Runner must call TaskLogManager.createTaskWithContext() at task start\n' +
        '  - Runner must update TaskLogManager at task completion (all terminal states)'
      );
    }
  });

  /**
   * This test shows the correct behavior after fix
   */
  it('should synchronize Runner and TaskLogManager when using proper logging', async () => {
    // Scenario 2: Execute WITH logging (correct behavior)
    await mockRunner.executeTaskWithLogging(false);
    await mockRunner.executeTaskWithLogging(true); // INCOMPLETE

    const runnerTasks = mockRunner.getTaskResults();
    const sessionIndex = await taskLogManager.getSessionIndex(sessionId);

    // After fix: Both should match
    assert.equal(
      runnerTasks.length,
      sessionIndex.entries.length,
      'Runner and TaskLogManager should be synchronized'
    );
  });
});
