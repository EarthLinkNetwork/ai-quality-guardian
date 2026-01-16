/**
 * Tests for REAL task execution verification
 *
 * Spec: 06_CORRECTNESS_PROPERTIES.md Property 7 & 8
 * Property 7: "All operations MUST generate Evidence"
 * Property 8: "COMPLETE status ONLY when [...] Evidence collected"
 *
 * These tests MUST FAIL until implementation is fixed.
 * Current violation: executeTask() marks tasks COMPLETE without actual execution.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  RunnerCore,
} from '../../../src/core/runner-core';
import {
  TaskStatus,
} from '../../../src/models/enums';

describe('Task Execution Reality Check (06_CORRECTNESS_PROPERTIES.md Property 7 & 8)', () => {
  let runner: RunnerCore;
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-execution-real-test-'));
    projectDir = path.join(tempDir, 'target-project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');

    runner = new RunnerCore({
      evidenceDir: tempDir,
    });
  });

  afterEach(() => {
    runner.shutdown();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * CRITICAL TEST: Task "Create README.md" MUST actually create README.md
   *
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 7:
   * "All operations MUST generate Evidence"
   *
   * A task that says "Create README.md" must create the file.
   * If it doesn't create the file, it has NOT completed the task.
   */
  it('should actually create README.md when task is "Create README.md"', async () => {
    await runner.initialize(projectDir);

    // Precondition: README.md does not exist
    const readmePath = path.join(projectDir, 'README.md');
    assert.ok(!fs.existsSync(readmePath), 'Precondition: README.md should not exist');

    // Execute task to create README.md
    const tasks = [
      {
        id: 'task-create-readme',
        description: 'Create README.md file',
        naturalLanguageTask: 'Create a README.md file that explains this is a demo project',
      },
    ];

    await runner.executeTasksSequentially(tasks);

    // Postcondition: README.md MUST exist (real evidence)
    assert.ok(fs.existsSync(readmePath),
      'README.md should exist after task "Create README.md" completes - SPEC VIOLATION: Task marked COMPLETE without creating file');
  });

  /**
   * CRITICAL TEST: Task status must NOT be COMPLETED if file was not created
   *
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 8:
   * "COMPLETE status ONLY when:
   *  - All tasks completed
   *  - All tests pass
   *  - Evidence collected
   *  - QA verified"
   *
   * If README.md is not created, task MUST be ERROR or INVALID, NOT COMPLETED.
   */
  it('should NOT mark task as COMPLETED if README.md was not actually created', async () => {
    await runner.initialize(projectDir);

    // Precondition: README.md does not exist
    const readmePath = path.join(projectDir, 'README.md');
    assert.ok(!fs.existsSync(readmePath), 'Precondition: README.md should not exist');

    // Execute task to create README.md
    const tasks = [
      {
        id: 'task-create-readme',
        description: 'Create README.md file',
        naturalLanguageTask: 'Create a README.md file that explains this is a demo project',
      },
    ];

    await runner.executeTasksSequentially(tasks);

    const results = runner.getTaskResults();
    const readmeTaskResult = results.find(r => r.task_id === 'task-create-readme');

    // Check if file was actually created
    const fileWasCreated = fs.existsSync(readmePath);

    if (!fileWasCreated) {
      // If file was NOT created, task MUST NOT be COMPLETED
      assert.notEqual(readmeTaskResult?.status, TaskStatus.COMPLETED,
        'SPEC VIOLATION: Task marked COMPLETED but README.md was NOT created. ' +
        'Property 8: COMPLETE only when Evidence collected. No file = No evidence.');
    }

    // If we get here and file exists, that's the expected behavior
    assert.ok(fileWasCreated,
      'README.md must be created for task to be valid');
  });

  /**
   * CRITICAL TEST: Evidence must contain real filesystem changes
   *
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 7:
   * "All operations MUST generate Evidence"
   *
   * Evidence should contain proof that the file was created.
   */
  it('should include evidence of file creation when task creates a file', async () => {
    await runner.initialize(projectDir);

    const readmePath = path.join(projectDir, 'README.md');

    const tasks = [
      {
        id: 'task-create-readme',
        description: 'Create README.md file',
        naturalLanguageTask: 'Create a README.md file that explains this is a demo project',
      },
    ];

    await runner.executeTasksSequentially(tasks);

    const results = runner.getTaskResults();
    const readmeTaskResult = results.find(r => r.task_id === 'task-create-readme');

    // Evidence should contain proof of file creation
    assert.ok(readmeTaskResult?.evidence,
      'Task result must have evidence');

    // Evidence should list files created
    const evidence = readmeTaskResult?.evidence as Record<string, unknown>;
    const filesCreated = (evidence?.files_created as string[]) || [];
    const hasFileEvidence = filesCreated.some((f: string) =>
      f.includes(readmePath) || f.includes('README.md')
    );
    assert.ok(hasFileEvidence,
      'SPEC VIOLATION: Evidence does not contain proof of README.md creation. ' +
      'Property 7: All operations MUST generate Evidence.');
  });

  /**
   * CRITICAL TEST: Task with file operation must verify file exists after completion
   *
   * This test ensures that the runner verifies outcomes, not just "executed" tasks.
   */
  it('should verify file exists before marking file-creation task as COMPLETED', async () => {
    await runner.initialize(projectDir);

    // A task that requires creating a file
    const testFilePath = path.join(projectDir, 'test-file.txt');
    const tasks = [
      {
        id: 'task-create-test-file',
        description: 'Create test-file.txt',
        naturalLanguageTask: 'Create a file named test-file.txt with content "Hello World"',
        expectedOutcome: {
          type: 'file_created',
          path: testFilePath,
        },
      },
    ];

    await runner.executeTasksSequentially(tasks);

    const results = runner.getTaskResults();
    const taskResult = results.find(r => r.task_id === 'task-create-test-file');

    // If task is COMPLETED, file MUST exist
    if (taskResult?.status === TaskStatus.COMPLETED) {
      assert.ok(fs.existsSync(testFilePath),
        'SPEC VIOLATION: Task marked COMPLETED but expected file does not exist. ' +
        'Runner must verify outcomes, not just mark tasks complete.');
    }
  });

  /**
   * CRITICAL TEST: Stub implementations are FORBIDDEN
   *
   * The current executeTask() implementation is a stub that marks tasks COMPLETE
   * without doing anything. This test verifies that real work is done.
   */
  it('should NOT be a stub implementation (must do real work)', async () => {
    await runner.initialize(projectDir);

    // Create a task that requires side effects
    const markerFile = path.join(projectDir, '.task-executed-marker');
    const tasks = [
      {
        id: 'task-with-side-effect',
        description: 'Task that must create a marker file',
        naturalLanguageTask: `Create a file at ${markerFile} to prove this task was actually executed`,
        sideEffectVerification: {
          type: 'file_exists',
          path: markerFile,
        },
      },
    ];

    await runner.executeTasksSequentially(tasks);

    const results = runner.getTaskResults();
    const taskResult = results.find(r => r.task_id === 'task-with-side-effect');

    // This is the critical assertion:
    // If the task is marked COMPLETE, it should have actually done something
    if (taskResult?.status === TaskStatus.COMPLETED) {
      // Either the marker file exists (real execution)
      // OR the evidence shows why the file wasn't created
      const fileExists = fs.existsSync(markerFile);
      const evidence = taskResult?.evidence as Record<string, unknown>;
      const executionLog = evidence?.execution_log as unknown[];
      const hasValidEvidence = executionLog && executionLog.length > 0;

      assert.ok(fileExists || hasValidEvidence,
        'SPEC VIOLATION: Task marked COMPLETED but no evidence of execution. ' +
        'This appears to be a stub implementation. ' +
        'Per Property 8: COMPLETE only when Evidence collected.');
    }
  });
});

describe('Task Execution Evidence Requirements (06_CORRECTNESS_PROPERTIES.md)', () => {
  let runner: RunnerCore;
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-req-test-'));
    projectDir = path.join(tempDir, 'target-project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');

    runner = new RunnerCore({
      evidenceDir: tempDir,
    });
  });

  afterEach(() => {
    runner.shutdown();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Test that evidence contains execution timestamps
   */
  it('should record execution start and end timestamps in evidence', async () => {
    await runner.initialize(projectDir);

    const tasks = [
      { id: 'task-1', description: 'Test task' },
    ];

    await runner.executeTasksSequentially(tasks);

    const results = runner.getTaskResults();
    const taskResult = results[0];

    assert.ok(taskResult?.evidence?.started_at,
      'Evidence must contain started_at timestamp');
    assert.ok(taskResult?.evidence?.completed_at,
      'Evidence must contain completed_at timestamp');
  });

  /**
   * Test that evidence contains execution logs
   */
  it('should record execution logs in evidence', async () => {
    await runner.initialize(projectDir);

    const tasks = [
      {
        id: 'task-1',
        description: 'Task with logging',
        naturalLanguageTask: 'Do something and log it',
      },
    ];

    await runner.executeTasksSequentially(tasks);

    const results = runner.getTaskResults();
    const taskResult = results[0];

    // Real execution should have logs
    // Stub implementation would have empty or missing logs
    if (taskResult?.status === TaskStatus.COMPLETED) {
      const evidence = taskResult?.evidence as Record<string, unknown>;
      const executionLog = evidence?.execution_log as unknown[];
      assert.ok(
        executionLog && executionLog.length > 0,
        'SPEC VIOLATION: Task marked COMPLETED but no execution logs. ' +
        'Property 7: All operations MUST generate Evidence.'
      );
    }
  });
});
