/**
 * Task Log Manager Tests
 *
 * TDD Tests for spec 13_LOGGING_AND_OBSERVABILITY.md and 05_DATA_MODELS.md
 *
 * Tests Thread/Run/Task hierarchy, session-based directories, and visibility control.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { TaskLogManager } from '../../../src/logging/task-log-manager';

describe('TaskLogManager - Thread/Run/Task Hierarchy', () => {
  let tempDir: string;
  let manager: TaskLogManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-log-test-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    manager = new TaskLogManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Session-based Directory Structure', () => {
    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.1:
     * .claude/logs/sessions/<session_id>/tasks/<task_id>.json
     */
    it('should create session-based directory structure', async () => {
      const sessionId = 'sess-20250112-001';
      
      await manager.ensureSessionDirectories(sessionId);
      
      const sessionsDir = path.join(tempDir, '.claude', 'logs', 'sessions', sessionId);
      const tasksDir = path.join(sessionsDir, 'tasks');
      
      assert.ok(fs.existsSync(sessionsDir), 'Sessions directory should exist');
      assert.ok(fs.existsSync(tasksDir), 'Tasks directory should exist');
    });

    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.2:
     * Session metadata: sessions/<session_id>/session.json
     */
    it('should create session metadata file', async () => {
      const sessionId = 'sess-20250112-001';
      
      await manager.initializeSession(sessionId);
      
      const sessionMetaPath = path.join(
        tempDir, '.claude', 'logs', 'sessions', sessionId, 'session.json'
      );
      
      assert.ok(fs.existsSync(sessionMetaPath), 'Session metadata file should exist');
      
      const metadata = JSON.parse(fs.readFileSync(sessionMetaPath, 'utf-8'));
      assert.equal(metadata.session_id, sessionId);
      assert.ok(metadata.started_at, 'started_at should be set');
      assert.deepEqual(metadata.threads, [], 'threads should be empty array initially');
      assert.deepEqual(metadata.runs, [], 'runs should be empty array initially');
    });

    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.2:
     * Session index: sessions/<session_id>/index.json
     */
    it('should create session-level index file', async () => {
      const sessionId = 'sess-20250112-001';
      
      await manager.initializeSession(sessionId);
      
      const indexPath = path.join(
        tempDir, '.claude', 'logs', 'sessions', sessionId, 'index.json'
      );
      
      assert.ok(fs.existsSync(indexPath), 'Session index file should exist');
      
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      assert.equal(index.session_id, sessionId);
      assert.deepEqual(index.entries, [], 'entries should be empty array initially');
    });

    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 1.2:
     * Global index: index.json
     */
    it('should update global index when session is created', async () => {
      const sessionId = 'sess-20250112-001';
      
      await manager.initializeSession(sessionId);
      
      const globalIndexPath = path.join(tempDir, '.claude', 'logs', 'index.json');
      
      assert.ok(fs.existsSync(globalIndexPath), 'Global index file should exist');
      
      const globalIndex = JSON.parse(fs.readFileSync(globalIndexPath, 'utf-8'));
      assert.ok(globalIndex.sessions, 'sessions array should exist');
      assert.ok(
        globalIndex.sessions.some((s: { session_id: string }) => s.session_id === sessionId),
        'Session should be in global index'
      );
    });
  });

  describe('Thread Management', () => {
    /**
     * Per spec 05_DATA_MODELS.md Section "Thread":
     * thread_id format: thr_<連番>
     */
    it('should create thread with correct ID format', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      
      const thread = await manager.createThread(sessionId, 'main', 'Create TypeScript file');
      
      assert.ok(thread.thread_id.startsWith('thr-'), 'Thread ID should start with thr-');
      assert.equal(thread.session_id, sessionId);
      assert.equal(thread.thread_type, 'main');
      assert.equal(thread.description, 'Create TypeScript file');
      assert.ok(thread.created_at, 'created_at should be set');
    });

    /**
     * Per spec 05_DATA_MODELS.md Section "ThreadType":
     * main | background | system
     */
    it('should support all thread types', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      
      const mainThread = await manager.createThread(sessionId, 'main');
      const bgThread = await manager.createThread(sessionId, 'background');
      const sysThread = await manager.createThread(sessionId, 'system');
      
      assert.equal(mainThread.thread_type, 'main');
      assert.equal(bgThread.thread_type, 'background');
      assert.equal(sysThread.thread_type, 'system');
    });

    it('should add thread to session metadata', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      
      const thread = await manager.createThread(sessionId, 'main', 'Test');
      
      const sessionMeta = await manager.getSessionMetadata(sessionId);
      assert.ok(
        sessionMeta.threads.some((t: { thread_id: string }) => t.thread_id === thread.thread_id),
        'Thread should be in session metadata'
      );
    });
  });

  describe('Run Management', () => {
    /**
     * Per spec 05_DATA_MODELS.md Section "Run":
     * run_id format: run_<連番>
     */
    it('should create run with correct ID format', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      
      assert.ok(run.run_id.startsWith('run-'), 'Run ID should start with run-');
      assert.equal(run.thread_id, thread.thread_id);
      assert.equal(run.session_id, sessionId);
      assert.equal(run.trigger, 'USER_INPUT');
      assert.equal(run.status, 'RUNNING');
      assert.ok(run.started_at, 'started_at should be set');
      assert.equal(run.completed_at, null, 'completed_at should be null initially');
    });

    /**
     * Per spec 05_DATA_MODELS.md Section "RunTrigger":
     * USER_INPUT | USER_RESPONSE | CONTINUATION | EXECUTOR
     */
    it('should support all run triggers', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      
      const run1 = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      const run2 = await manager.createRun(sessionId, thread.thread_id, 'USER_RESPONSE');
      const run3 = await manager.createRun(sessionId, thread.thread_id, 'CONTINUATION');
      const run4 = await manager.createRun(sessionId, thread.thread_id, 'EXECUTOR');
      
      assert.equal(run1.trigger, 'USER_INPUT');
      assert.equal(run2.trigger, 'USER_RESPONSE');
      assert.equal(run3.trigger, 'CONTINUATION');
      assert.equal(run4.trigger, 'EXECUTOR');
    });

    /**
     * Per spec 05_DATA_MODELS.md Section "RunStatus":
     * RUNNING | COMPLETED | FAILED | CANCELLED
     */
    it('should update run status correctly', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      
      assert.equal(run.status, 'RUNNING');
      
      await manager.completeRun(sessionId, run.run_id, 'COMPLETED');
      const completedRun = await manager.getRun(sessionId, run.run_id);
      
      assert.equal(completedRun?.status, 'COMPLETED');
      assert.ok(completedRun?.completed_at, 'completed_at should be set after completion');
    });
  });

  describe('Task with Thread/Run Context', () => {
    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.3:
     * Tasks have parent_task_id, thread_id, run_id
     */
    it('should create task with thread and run context', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      
      const task = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      
      assert.ok(task.task_id.startsWith('task-'), 'Task ID should start with task-');
      assert.equal(task.session_id, sessionId);
      assert.equal(task.thread_id, thread.thread_id);
      assert.equal(task.run_id, run.run_id);
      assert.equal(task.parent_task_id, null, 'Root task should have null parent');
    });

    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.3:
     * parent_task_id references must be within same Thread
     */
    it('should create child task with parent reference', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      
      const parentTask = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      const childTask = await manager.createTaskWithContext(
        sessionId, thread.thread_id, run.run_id, parentTask.task_id
      );
      
      assert.equal(childTask.parent_task_id, parentTask.task_id);
    });

    /**
     * Per spec: parent_task_id must be within same Thread
     */
    it('should reject parent from different thread', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread1 = await manager.createThread(sessionId, 'main');
      const thread2 = await manager.createThread(sessionId, 'background');
      const run1 = await manager.createRun(sessionId, thread1.thread_id, 'USER_INPUT');
      const run2 = await manager.createRun(sessionId, thread2.thread_id, 'EXECUTOR');
      
      const parentTask = await manager.createTaskWithContext(sessionId, thread1.thread_id, run1.run_id);
      
      await assert.rejects(
        () => manager.createTaskWithContext(sessionId, thread2.thread_id, run2.run_id, parentTask.task_id),
        /parent_task_id must be within same thread/
      );
    });
  });

  describe('Task Log Entry with Hierarchy Fields', () => {
    /**
     * Per spec 05_DATA_MODELS.md Section "TaskLogEntry":
     * Includes thread_id, run_id, parent_task_id
     */
    it('should include hierarchy fields in task log entry', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      
      await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      
      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries[0];
      
      assert.equal(entry.thread_id, thread.thread_id, 'Entry should have thread_id');
      assert.equal(entry.run_id, run.run_id, 'Entry should have run_id');
      assert.equal(entry.parent_task_id, null, 'Root task should have null parent_task_id');
    });
  });

  describe('ID Generation', () => {
    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.4:
     * IDs should be sequential within session
     */
    it('should generate sequential task IDs within session', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      
      const task1 = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      const task2 = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      const task3 = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      
      // Extract numeric part and check sequential
      const extractNum = (id: string) => parseInt(id.replace('task-', ''), 10);
      
      assert.ok(extractNum(task2.task_id) > extractNum(task1.task_id));
      assert.ok(extractNum(task3.task_id) > extractNum(task2.task_id));
    });

    it('should generate sequential thread IDs within session', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      
      const thread1 = await manager.createThread(sessionId, 'main');
      const thread2 = await manager.createThread(sessionId, 'background');
      
      const extractNum = (id: string) => parseInt(id.replace('thr-', ''), 10);
      
      assert.ok(extractNum(thread2.thread_id) > extractNum(thread1.thread_id));
    });
  });

  describe('Visibility Control - Two-Layer Viewing', () => {
    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 3:
     * Default is summary level
     */
    it('should default to summary visibility level', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      const task = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      
      // Add both summary and full events
      await manager.addEventWithSession(task.task_id, sessionId, 'USER_INPUT', { text: 'Hello' });
      await manager.addEventWithSession(task.task_id, sessionId, 'EXECUTOR_OUTPUT', { output_summary: 'Done' });
      
      const detail = await manager.getTaskDetailWithSession(task.task_id, sessionId);
      
      // Default should only show summary events
      assert.ok(detail.events.some(e => e.event_type === 'USER_INPUT'));
      assert.ok(!detail.events.some(e => e.event_type === 'EXECUTOR_OUTPUT'));
    });

    it('should show all events with full visibility', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      const thread = await manager.createThread(sessionId, 'main');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      const task = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      
      await manager.addEventWithSession(task.task_id, sessionId, 'USER_INPUT', { text: 'Hello' });
      await manager.addEventWithSession(task.task_id, sessionId, 'EXECUTOR_OUTPUT', { output_summary: 'Done' });
      
      const detail = await manager.getTaskDetailWithSession(task.task_id, sessionId, 'full');
      
      assert.ok(detail.events.some(e => e.event_type === 'USER_INPUT'));
      assert.ok(detail.events.some(e => e.event_type === 'EXECUTOR_OUTPUT'));
    });
  });

  describe('Tree View Format', () => {
    /**
     * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 2.5:
     * /logs --tree shows Thread/Run/Task hierarchy
     */
    it('should format tree view correctly', async () => {
      const sessionId = 'sess-20250112-001';
      await manager.initializeSession(sessionId);
      
      // Create hierarchy: Thread -> Run -> Tasks
      const thread = await manager.createThread(sessionId, 'main', 'Create TypeScript file');
      const run = await manager.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      const task1 = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      const task2 = await manager.createTaskWithContext(sessionId, thread.thread_id, run.run_id);
      
      await manager.addEventWithSession(task1.task_id, sessionId, 'USER_INPUT', { 
        text: 'Create a new TypeScript file' 
      });
      await manager.addEventWithSession(task2.task_id, sessionId, 'RUNNER_CLARIFICATION', { 
        question: 'What should be the file name?' 
      });
      
      const treeOutput = await manager.formatTreeView(sessionId);
      
      // Verify tree structure elements
      assert.ok(treeOutput.includes('Session:'), 'Should show session');
      assert.ok(treeOutput.includes(thread.thread_id), 'Should show thread ID');
      assert.ok(treeOutput.includes(run.run_id), 'Should show run ID');
      assert.ok(treeOutput.includes(task1.task_id), 'Should show task IDs');
    });
  });
});

describe('TaskLogManager - Error Handling', () => {
  let tempDir: string;
  let manager: TaskLogManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-log-test-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    manager = new TaskLogManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 9.1:
   * Log write failures should not stop task execution
   */
  it('should handle corrupted session index gracefully', async () => {
    const sessionId = 'sess-20250112-001';
    await manager.initializeSession(sessionId);
    
    // Corrupt the index file
    const indexPath = path.join(
      tempDir, '.claude', 'logs', 'sessions', sessionId, 'index.json'
    );
    fs.writeFileSync(indexPath, 'not-valid-json');
    
    // Should return empty entries, not throw
    const index = await manager.getSessionIndex(sessionId);
    assert.deepEqual(index.entries, []);
  });

  it('should return null for non-existent task', async () => {
    const sessionId = 'sess-20250112-001';
    await manager.initializeSession(sessionId);

    const log = await manager.getTaskLogWithSession('non-existent-task', sessionId);
    assert.equal(log, null);
  });
});

/**
 * Redesign Visibility Tests
 *
 * Per redesign requirements:
 * - Auto-start: Natural language input = automatic task creation
 * - Visibility: Show executor mode, prompt, response, files modified
 * - /logs redesign: Show description and files in list view
 */
describe('TaskLogManager - Redesign Visibility Features', () => {
  let tempDir: string;
  let manager: TaskLogManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-log-visibility-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    manager = new TaskLogManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CompleteTaskOptions with visibility fields', () => {
    /**
     * Per redesign: Task completion should save description, executorMode, responseSummary
     */
    it('should save visibility fields when completing task', async () => {
      const sessionId = 'sess-visibility-001';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;

      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', ['src/app.ts', 'src/utils.ts'], undefined, undefined, {
        description: 'Add user authentication feature',
        executorMode: 'autonomous',
        responseSummary: 'Successfully implemented JWT authentication with login/logout endpoints',
      });

      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries.find(e => e.task_id === taskId);

      assert.ok(entry, 'Entry should exist');
      assert.equal(entry.description, 'Add user authentication feature');
      assert.equal(entry.executor_mode, 'autonomous');
      assert.equal(entry.response_summary, 'Successfully implemented JWT authentication with login/logout endpoints');
      assert.deepEqual(entry.files_modified, ['src/app.ts', 'src/utils.ts']);
    });

    it('should handle missing visibility fields gracefully', async () => {
      const sessionId = 'sess-visibility-002';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;

      // Complete without visibility fields
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', []);

      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries.find(e => e.task_id === taskId);

      assert.ok(entry, 'Entry should exist');
      assert.equal(entry.description, undefined);
      assert.equal(entry.executor_mode, undefined);
      assert.equal(entry.response_summary, undefined);
    });
  });

  describe('formatTaskList with visibility fields', () => {
    /**
     * Per redesign: Task list should show description and files
     */
    it('should show task description in list view', async () => {
      const sessionId = 'sess-format-001';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', ['src/app.ts'], undefined, undefined, {
        description: 'Implement login feature',
        executorMode: 'autonomous',
      });

      const entries = await manager.getTaskList(sessionId);
      const output = manager.formatTaskList(entries, sessionId);

      assert.ok(output.includes('Implement login feature'), 'Should show task description');
    });

    it('should show status icons correctly', async () => {
      const sessionId = 'sess-format-002';

      await manager.initializeSession(sessionId);

      // Create COMPLETE task
      const task1 = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      await manager.completeTaskWithSession(task1.task_id, sessionId, 'COMPLETE', []);

      // Create ERROR task
      const task2 = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      await manager.completeTaskWithSession(task2.task_id, sessionId, 'ERROR', []);

      const entries = await manager.getTaskList(sessionId);
      const output = manager.formatTaskList(entries, sessionId);

      assert.ok(output.includes('[OK]'), 'Should show [OK] for COMPLETE');
      assert.ok(output.includes('[ERR]'), 'Should show [ERR] for ERROR');
    });

    it('should show files modified count', async () => {
      const sessionId = 'sess-format-003';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', ['a.ts', 'b.ts', 'c.ts'], undefined, undefined, {
        description: 'Multi-file change',
      });

      const entries = await manager.getTaskList(sessionId);
      const output = manager.formatTaskList(entries, sessionId);

      assert.ok(output.includes('Files: 3'), 'Should show files count');
    });

    it('should show executor mode', async () => {
      const sessionId = 'sess-format-004';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', [], undefined, undefined, {
        description: 'Test task',
        executorMode: 'interactive',
      });

      const entries = await manager.getTaskList(sessionId);
      const output = manager.formatTaskList(entries, sessionId);

      assert.ok(output.includes('interactive'), 'Should show executor mode');
    });

    it('should truncate long descriptions', async () => {
      const sessionId = 'sess-format-005';
      const longDesc = 'A'.repeat(100);

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', [], undefined, undefined, {
        description: longDesc,
      });

      const entries = await manager.getTaskList(sessionId);
      const output = manager.formatTaskList(entries, sessionId);

      assert.ok(output.includes('...'), 'Should truncate with ...');
      assert.ok(!output.includes(longDesc), 'Should not include full long description');
    });
  });

  describe('formatTaskDetail with visibility fields', () => {
    /**
     * Per redesign: Task detail should show executor mode, prompt, response summary
     */
    it('should show Prompt section in detail view', async () => {
      const sessionId = 'sess-detail-001';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', [], undefined, undefined, {
        description: 'Create a REST API endpoint for users',
        executorMode: 'autonomous',
      });

      const { log, events } = await manager.getTaskDetailWithSession(taskId, sessionId, 'summary');
      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries.find(e => e.task_id === taskId);
      const output = manager.formatTaskDetail(taskId, log!, events, false, entry);

      assert.ok(output.includes('Prompt'), 'Should have Prompt section');
      assert.ok(output.includes('Create a REST API endpoint for users'), 'Should show description');
    });

    it('should show Response Summary section', async () => {
      const sessionId = 'sess-detail-002';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', [], undefined, undefined, {
        description: 'Fix login bug',
        responseSummary: 'Fixed the authentication issue by updating the JWT validation logic',
      });

      const { log, events } = await manager.getTaskDetailWithSession(taskId, sessionId, 'summary');
      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries.find(e => e.task_id === taskId);
      const output = manager.formatTaskDetail(taskId, log!, events, false, entry);

      assert.ok(output.includes('Response Summary'), 'Should have Response Summary section');
      assert.ok(output.includes('Fixed the authentication issue'), 'Should show response summary');
    });

    it('should show Files Modified section', async () => {
      const sessionId = 'sess-detail-003';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', ['src/auth.ts', 'src/middleware.ts'], undefined, undefined, {
        description: 'Update auth',
      });

      const { log, events } = await manager.getTaskDetailWithSession(taskId, sessionId, 'summary');
      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries.find(e => e.task_id === taskId);
      const output = manager.formatTaskDetail(taskId, log!, events, false, entry);

      assert.ok(output.includes('Files Modified'), 'Should have Files Modified section');
      assert.ok(output.includes('src/auth.ts'), 'Should show modified files');
      assert.ok(output.includes('src/middleware.ts'), 'Should show modified files');
    });

    it('should show Summary with executor mode', async () => {
      const sessionId = 'sess-detail-004';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', [], undefined, undefined, {
        description: 'Test task',
        executorMode: 'interactive',
      });

      const { log, events } = await manager.getTaskDetailWithSession(taskId, sessionId, 'summary');
      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries.find(e => e.task_id === taskId);
      const output = manager.formatTaskDetail(taskId, log!, events, false, entry);

      assert.ok(output.includes('Summary'), 'Should have Summary section');
      assert.ok(output.includes('interactive'), 'Should show executor mode');
    });

    it('should show executor blocking info when blocked', async () => {
      const sessionId = 'sess-detail-005';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'INCOMPLETE', [], undefined, undefined, {
        description: 'Blocked task',
        executorBlocked: true,
        blockedReason: 'INTERACTIVE_PROMPT',
        timeoutMs: 30000,
        terminatedBy: 'TIMEOUT',
      });

      const { log, events } = await manager.getTaskDetailWithSession(taskId, sessionId, 'summary');
      const index = await manager.getSessionIndex(sessionId);
      const entry = index.entries.find(e => e.task_id === taskId);
      const output = manager.formatTaskDetail(taskId, log!, events, false, entry);

      assert.ok(output.includes('=== BLOCKED ==='), 'Should have BLOCKED section');
      assert.ok(output.includes('INTERACTIVE_PROMPT'), 'Should show blocking reason');
    });
  });

  describe('No silent completion', () => {
    /**
     * Per redesign: Tasks must show visibility info, not complete silently
     */
    it('should always have status in formatted output', async () => {
      const sessionId = 'sess-silent-001';

      await manager.initializeSession(sessionId);
      const taskLog = await manager.createTaskWithContext(sessionId, 'main-thread', 'run-001');
      const taskId = taskLog.task_id;
      await manager.completeTaskWithSession(taskId, sessionId, 'COMPLETE', []);

      const entries = await manager.getTaskList(sessionId);
      const output = manager.formatTaskList(entries, sessionId);

      // Should always show status, not be empty or silent
      assert.ok(output.length > 0, 'Output should not be empty');
      assert.ok(output.includes('[OK]') || output.includes('[ERR]') || output.includes('[INC]') || output.includes('[...]'),
        'Should always show status indicator');
    });
  });
});

/**
 * Session Restoration Tests
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 8:
 * - Session recovery on restart
 * - Counter reconstruction from existing data
 */
describe('TaskLogManager - Session Restoration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-log-restore-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('sessionExists', () => {
    it('should return false for non-existent session', async () => {
      const manager = new TaskLogManager(tempDir);
      const exists = await manager.sessionExists('non-existent-session');
      assert.equal(exists, false);
    });

    it('should return true for existing session', async () => {
      const manager = new TaskLogManager(tempDir);
      const sessionId = 'sess-exists-001';
      await manager.initializeSession(sessionId);

      const exists = await manager.sessionExists(sessionId);
      assert.equal(exists, true);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', async () => {
      const manager = new TaskLogManager(tempDir);
      const sessions = await manager.listSessions();
      assert.deepEqual(sessions, []);
    });

    it('should list all existing sessions', async () => {
      const manager = new TaskLogManager(tempDir);

      await manager.initializeSession('sess-001');
      await manager.initializeSession('sess-002');
      await manager.initializeSession('sess-003');

      const sessions = await manager.listSessions();

      assert.equal(sessions.length, 3);
      assert.ok(sessions.some(s => s.session_id === 'sess-001'));
      assert.ok(sessions.some(s => s.session_id === 'sess-002'));
      assert.ok(sessions.some(s => s.session_id === 'sess-003'));
    });
  });

  describe('getMostRecentSession', () => {
    it('should return null when no sessions exist', async () => {
      const manager = new TaskLogManager(tempDir);
      const sessionId = await manager.getMostRecentSession();
      assert.equal(sessionId, null);
    });

    it('should return most recent session by started_at', async () => {
      const manager = new TaskLogManager(tempDir);

      // Create sessions with a small delay to ensure different timestamps
      await manager.initializeSession('sess-old');
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.initializeSession('sess-newer');
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.initializeSession('sess-newest');

      const sessionId = await manager.getMostRecentSession();
      assert.equal(sessionId, 'sess-newest');
    });
  });

  describe('restoreSession', () => {
    it('should return null for non-existent session', async () => {
      const manager = new TaskLogManager(tempDir);
      const metadata = await manager.restoreSession('non-existent');
      assert.equal(metadata, null);
    });

    it('should restore session metadata', async () => {
      // Create session with first manager instance
      const manager1 = new TaskLogManager(tempDir);
      const sessionId = 'sess-restore-001';
      await manager1.initializeSession(sessionId);

      // Create thread, run, and task
      const thread = await manager1.createThread(sessionId, 'main');
      const run = await manager1.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      await manager1.createTaskWithContext(sessionId, thread.thread_id, run.run_id);

      // Create new manager instance (simulates restart)
      const manager2 = new TaskLogManager(tempDir);
      const metadata = await manager2.restoreSession(sessionId);

      assert.ok(metadata, 'Metadata should be returned');
      assert.equal(metadata!.session_id, sessionId);
      assert.ok(metadata!.threads.length > 0, 'Should have threads');
      assert.ok(metadata!.runs.length > 0, 'Should have runs');
    });

    it('should reconstruct counters from existing data', async () => {
      // Create session with multiple threads/runs/tasks
      const manager1 = new TaskLogManager(tempDir);
      const sessionId = 'sess-counter-001';
      await manager1.initializeSession(sessionId);

      // Create multiple threads
      const thread1 = await manager1.createThread(sessionId, 'main');
      const thread2 = await manager1.createThread(sessionId, 'background');

      // Create multiple runs
      const run1 = await manager1.createRun(sessionId, thread1.thread_id, 'USER_INPUT');
      await manager1.createRun(sessionId, thread1.thread_id, 'CONTINUATION');

      // Create multiple tasks
      await manager1.createTaskWithContext(sessionId, thread1.thread_id, run1.run_id);
      await manager1.createTaskWithContext(sessionId, thread1.thread_id, run1.run_id);
      await manager1.createTaskWithContext(sessionId, thread1.thread_id, run1.run_id);

      // Restore with new manager
      const manager2 = new TaskLogManager(tempDir);
      await manager2.restoreSession(sessionId);

      // Create new thread - should get next sequential ID
      const newThread = await manager2.createThread(sessionId, 'system');
      const threadNum = parseInt(newThread.thread_id.replace('thr-', ''), 10);

      // Should be greater than thread2's number
      const thread2Num = parseInt(thread2.thread_id.replace('thr-', ''), 10);
      assert.ok(threadNum > thread2Num, 'New thread ID should be sequential');
    });

    it('should allow continued task creation after restore', async () => {
      // Setup initial session
      const manager1 = new TaskLogManager(tempDir);
      const sessionId = 'sess-continue-001';
      await manager1.initializeSession(sessionId);
      const thread = await manager1.createThread(sessionId, 'main');
      const run = await manager1.createRun(sessionId, thread.thread_id, 'USER_INPUT');
      const task1 = await manager1.createTaskWithContext(sessionId, thread.thread_id, run.run_id);

      // Restore with new manager
      const manager2 = new TaskLogManager(tempDir);
      await manager2.restoreSession(sessionId);

      // Should be able to create new task
      const task2 = await manager2.createTaskWithContext(sessionId, thread.thread_id, run.run_id);

      // New task should have incremented ID
      const task1Num = parseInt(task1.task_id.replace('task-', ''), 10);
      const task2Num = parseInt(task2.task_id.replace('task-', ''), 10);
      assert.ok(task2Num > task1Num, 'New task ID should be incremented');
    });
  });

  describe('flushAll', () => {
    it('should return empty array when no pending writes', async () => {
      const manager = new TaskLogManager(tempDir);
      const results = await manager.flushAll();
      assert.ok(Array.isArray(results), 'Should return array');
    });

    it('should return pending write count', async () => {
      const manager = new TaskLogManager(tempDir);
      const count = manager.getPendingWriteCount();
      assert.equal(typeof count, 'number');
    });
  });
});
