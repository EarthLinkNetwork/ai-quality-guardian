import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  RunnerCore,
  RunnerCoreError,
} from '../../../src/core/runner-core';
import {
  OverallStatus,
  LifecyclePhase,
  TaskStatus,
} from '../../../src/models/enums';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Runner Core (04_COMPONENTS.md L196-240)', () => {
  let runner: RunnerCore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-core-test-'));
    runner = new RunnerCore({
      evidenceDir: tempDir,
    });
  });

  afterEach(() => {
    runner.shutdown();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Initialization (04_COMPONENTS.md L202-210)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'target-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should initialize with target project', async () => {
      const session = await runner.initialize(projectDir);

      assert.ok(session.session_id);
      assert.ok(session.started_at);
      assert.equal(session.target_project, projectDir);
    });

    it('should create evidence directory on initialization', async () => {
      await runner.initialize(projectDir);

      const sessionDir = runner.getSessionDirectory();
      assert.ok(fs.existsSync(sessionDir));
    });

    it('should initialize lifecycle controller', async () => {
      await runner.initialize(projectDir);

      const phase = runner.getCurrentPhase();
      assert.equal(phase, LifecyclePhase.REQUIREMENT_ANALYSIS);
    });

    it('should initialize L1/L2 pools', async () => {
      await runner.initialize(projectDir);

      const l1Stats = runner.getL1PoolStats();
      const l2Stats = runner.getL2PoolStats();

      assert.equal(l1Stats.total_capacity, 9);
      assert.equal(l2Stats.total_capacity, 4);
    });

    it('should fail initialization if project path invalid', async () => {
      await assert.rejects(
        () => runner.initialize('/nonexistent/project'),
        (err: Error) => {
          return err instanceof RunnerCoreError &&
            (err as RunnerCoreError).code === ErrorCode.E102_PROJECT_PATH_INVALID;
        }
      );
    });
  });

  describe('Full Lifecycle Execution (04_COMPONENTS.md L211-220)', () => {
    it('should execute complete lifecycle', async () => {
      // Create a mock project
      const projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), `
tasks:
  - id: task-1
    description: Test task
limits:
  max_files: 5
  max_tests: 10
  max_seconds: 300
`);

      await runner.initialize(projectDir);

      const result = await runner.execute({
        tasks: [{ id: 'task-1', description: 'Test task' }],
      });

      assert.ok(result.session_id);
      assert.ok([OverallStatus.COMPLETE, OverallStatus.INCOMPLETE].includes(result.overall_status));
    });

    it('should track phase progression', async () => {
      const projectDir = path.join(tempDir, 'test-project-2');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');

      // Register listener before initialize to capture first phase
      const phases: LifecyclePhase[] = [];
      runner.on('phase_started', (event) => {
        phases.push(event.phase);
      });

      await runner.initialize(projectDir);
      await runner.execute({ tasks: [{ id: 'task-1', description: 'Test' }] });

      // Should have started the first phase
      assert.ok(phases.includes(LifecyclePhase.REQUIREMENT_ANALYSIS));
    });
  });

  describe('Task Orchestration (04_COMPONENTS.md L221-230)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should orchestrate task execution', async () => {
      await runner.initialize(projectDir);

      const tasks = [
        { id: 'task-1', description: 'Task 1' },
        { id: 'task-2', description: 'Task 2' },
      ];

      await runner.executeTasksSequentially(tasks);

      const results = runner.getTaskResults();
      assert.equal(results.length, 2);
    });

    it('should execute independent tasks in parallel', async () => {
      await runner.initialize(projectDir);

      const tasks = [
        { id: 'task-1', description: 'Task 1', dependencies: [] },
        { id: 'task-2', description: 'Task 2', dependencies: [] },
        { id: 'task-3', description: 'Task 3', dependencies: [] },
      ];

      const startTime = Date.now();
      await runner.executeTasksParallel(tasks);
      const duration = Date.now() - startTime;

      // Parallel execution should be faster than sequential
      const results = runner.getTaskResults();
      assert.equal(results.length, 3);
    });

    it('should respect task dependencies', async () => {
      await runner.initialize(projectDir);

      const tasks = [
        { id: 'task-1', description: 'Task 1', dependencies: [] },
        { id: 'task-2', description: 'Task 2', dependencies: ['task-1'] },
        { id: 'task-3', description: 'Task 3', dependencies: ['task-2'] },
      ];

      const completionOrder: string[] = [];
      runner.on('task_completed', (event) => {
        completionOrder.push(event.task_id);
      });

      await runner.executeTasksWithDependencies(tasks);

      // task-1 must complete before task-2, task-2 before task-3
      const idx1 = completionOrder.indexOf('task-1');
      const idx2 = completionOrder.indexOf('task-2');
      const idx3 = completionOrder.indexOf('task-3');

      assert.ok(idx1 < idx2);
      assert.ok(idx2 < idx3);
    });
  });

  describe('Error Handling (04_COMPONENTS.md L231-235)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should handle task failure gracefully', async () => {
      await runner.initialize(projectDir);

      const tasks = [
        { id: 'task-1', description: 'Task 1', willFail: true },
      ];

      const result = await runner.execute({ tasks });

      assert.equal(result.overall_status, OverallStatus.ERROR);
      assert.ok(result.error);
    });

    it('should continue with other tasks after failure (if configured)', async () => {
      runner = new RunnerCore({
        evidenceDir: tempDir,
        continueOnTaskFailure: true,
      });

      await runner.initialize(projectDir);

      const tasks = [
        { id: 'task-1', description: 'Task 1', willFail: true },
        { id: 'task-2', description: 'Task 2' },
      ];

      await runner.execute({ tasks });

      const results = runner.getTaskResults();
      const task2Result = results.find(r => r.task_id === 'task-2');
      assert.ok(task2Result);
      assert.equal(task2Result.status, TaskStatus.COMPLETED);
    });

    it('should fail-fast on critical error', async () => {
      await runner.initialize(projectDir);

      runner.triggerCriticalError(new Error('Critical error'));

      assert.equal(runner.getOverallStatus(), OverallStatus.ERROR);
    });

    it('should collect error evidence', async () => {
      await runner.initialize(projectDir);

      const tasks = [{ id: 'task-1', willFail: true }];
      await runner.execute({ tasks });

      const evidence = runner.getErrorEvidence();
      assert.ok(evidence.length > 0);
      assert.ok(evidence[0].error);
    });
  });

  describe('Resource Limits Enforcement (04_COMPONENTS.md L236-238)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), `
limits:
  max_files: 2
  max_tests: 5
  max_seconds: 60
`);
    });

    it('should enforce file limit', async () => {
      await runner.initialize(projectDir);

      // Try to process more files than limit
      runner.recordFileOperation('/file1.ts');
      runner.recordFileOperation('/file2.ts');

      const result = runner.checkAndRecordFileOperation('/file3.ts');
      assert.ok(!result.allowed);
      assert.equal(result.violation?.limit_type, 'max_files');
    });

    it('should enforce time limit', async () => {
      await runner.initialize(projectDir);

      // Simulate time passing
      runner.setElapsedTimeForTesting(61);

      const result = runner.checkTimeLimit();
      assert.ok(result.exceeded);
    });

    it('should enforce executor limit', async () => {
      await runner.initialize(projectDir);

      // Acquire 4 executors (max)
      for (let i = 1; i <= 4; i++) {
        await runner.acquireExecutor(`exec-${i}`);
      }

      // 5th should fail
      await assert.rejects(
        () => runner.acquireExecutor('exec-5'),
        (err: Error) => err instanceof RunnerCoreError
      );
    });
  });

  describe('Evidence Collection (04_COMPONENTS.md L239-240)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should collect evidence for each phase', async () => {
      await runner.initialize(projectDir);

      await runner.execute({ tasks: [] });

      const evidenceFiles = runner.getEvidenceFiles();
      assert.ok(evidenceFiles.includes('session.json'));
    });

    it('should generate evidence index', async () => {
      await runner.initialize(projectDir);

      await runner.execute({ tasks: [{ id: 'task-1', description: 'Test' }] });

      const indexPath = path.join(runner.getSessionDirectory(), 'evidence_index.json');
      assert.ok(fs.existsSync(indexPath));
    });

    it('should generate evidence index hash (only evidence_index.json)', async () => {
      await runner.initialize(projectDir);

      await runner.execute({ tasks: [{ id: 'task-1', description: 'Test' }] });

      const hashPath = path.join(runner.getSessionDirectory(), 'evidence_index.sha256');
      assert.ok(fs.existsSync(hashPath));

      // Hash should be of evidence_index.json only
      const hashContent = fs.readFileSync(hashPath, 'utf-8');
      assert.ok(hashContent.length > 0);
    });
  });

  describe('Session Resume (04_COMPONENTS.md L241-245)', () => {
    let projectDir: string;
    let sessionId: string;

    beforeEach(async () => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');

      await runner.initialize(projectDir);
      sessionId = runner.getSessionId();
    });

    it('should save session state for resume', async () => {
      await runner.saveState();

      const statePath = path.join(runner.getSessionDirectory(), 'session.json');
      assert.ok(fs.existsSync(statePath));
    });

    it('should resume from saved state', async () => {
      // Complete some work
      await runner.advancePhase({ evidence: { requirements: ['req-1'] } });
      await runner.saveState();

      // Create new runner and resume
      const newRunner = new RunnerCore({ evidenceDir: tempDir });
      await newRunner.resume(sessionId);

      assert.equal(newRunner.getCurrentPhase(), LifecyclePhase.TASK_DECOMPOSITION);
    });

    it('should fail to resume completed session', async () => {
      await runner.execute({ tasks: [] });
      await runner.saveState();

      const newRunner = new RunnerCore({ evidenceDir: tempDir });

      await assert.rejects(
        () => newRunner.resume(sessionId),
        (err: Error) => {
          return err instanceof RunnerCoreError &&
            (err as RunnerCoreError).code === ErrorCode.E205_SESSION_RESUME_FAILURE;
        }
      );
    });
  });

  describe('Output Generation', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should generate final output', async () => {
      await runner.initialize(projectDir);

      const result = await runner.execute({ tasks: [] });

      assert.ok(result.session_id);
      assert.ok(result.overall_status);
      assert.ok(result.next_action !== undefined);
    });

    it('should include next_action field', async () => {
      await runner.initialize(projectDir);

      const result = await runner.execute({ tasks: [] });

      // COMPLETE status should have next_action=true
      if (result.overall_status === OverallStatus.COMPLETE) {
        assert.equal(result.next_action, true);
      }
    });

    it('should include incomplete_task_reasons when applicable', async () => {
      await runner.initialize(projectDir);

      // Mark as incomplete
      runner.markIncomplete('Timeout');

      const output = runner.generateOutput();

      assert.ok(output.incomplete_task_reasons);
    });
  });

  describe('Component Integration', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should integrate with all managers', async () => {
      await runner.initialize(projectDir);

      // Verify all components are accessible
      assert.ok(runner.getConfigManager());
      assert.ok(runner.getSessionManager());
      assert.ok(runner.getEvidenceManager());
      assert.ok(runner.getLockManager());
      assert.ok(runner.getResourceLimitManager());
      assert.ok(runner.getContinuationManager());
      assert.ok(runner.getOutputManager());
      assert.ok(runner.getLifecycleController());
      assert.ok(runner.getL1Pool());
      assert.ok(runner.getL2Pool());
    });

    it('should propagate events from components', (done) => {
      runner.initialize(projectDir).then(() => {
        runner.on('phase_started', (event) => {
          assert.equal(event.phase, LifecyclePhase.TASK_DECOMPOSITION);
          done();
        });

        runner.advancePhase({ evidence: { requirements: ['req-1'] } });
      });
    });
  });

  describe('Shutdown and Cleanup', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should release all resources on shutdown', async () => {
      await runner.initialize(projectDir);

      // Acquire some resources
      await runner.acquireExecutor('exec-1');

      // Shutdown
      await runner.shutdown();

      // L2 pool should be empty
      assert.equal(runner.getL2PoolStats().active_count, 0);
    });

    it('should save state before shutdown', async () => {
      await runner.initialize(projectDir);

      await runner.shutdown();

      const statePath = path.join(runner.getSessionDirectory(), 'session.json');
      assert.ok(fs.existsSync(statePath));
    });

    it('should release all locks on shutdown', async () => {
      await runner.initialize(projectDir);

      const { LockType } = await import('../../../src/models/enums');
      runner.getLockManager().acquireLock('/path/to/file', 'executor-001', LockType.WRITE);

      await runner.shutdown();

      const isLocked = runner.getLockManager().isFileLocked('/path/to/file');
      assert.ok(!isLocked);
    });
  });

  describe('Property-Based Tests (Invariants)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should maintain status priority invariant', async () => {
      await runner.initialize(projectDir);

      // Set multiple status issues
      runner.markIncomplete('Timeout');
      runner.markNoEvidence('Missing evidence');

      // NO_EVIDENCE should take priority
      assert.equal(runner.getOverallStatus(), OverallStatus.NO_EVIDENCE);

      runner.triggerCriticalError(new Error('Error'));

      // ERROR should take priority
      assert.equal(runner.getOverallStatus(), OverallStatus.ERROR);

      runner.markInvalid('Invalid state');

      // INVALID should take priority
      assert.equal(runner.getOverallStatus(), OverallStatus.INVALID);
    });

    it('should never exceed resource limits', async () => {
      await runner.initialize(projectDir);

      const limits = runner.getResourceLimits();

      // Try to exceed file limit
      for (let i = 0; i < limits.max_files + 5; i++) {
        runner.recordFileOperation(`/file${i}.ts`);
      }

      // Should not exceed limit
      const stats = runner.getResourceStats();
      assert.ok(stats.files_used <= limits.max_files);
    });

    it('should always have valid session state', async () => {
      await runner.initialize(projectDir);

      // At any point, session should be valid
      const state = runner.getSessionState();

      assert.ok(state.session_id);
      assert.ok(state.status);
      assert.ok(state.current_phase);
    });
  });

  describe('Property 8: Completion based on verified_files (not files_modified)', () => {
    let projectDir: string;

    beforeEach(() => {
      projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');
    });

    it('should return COMPLETE when verified_files has exists=true, even if files_modified=0', async function() {
      this.timeout(10000);

      // Create mock executor that returns files_modified=[] but verified_files with exists=true
      const mockExecutor = {
        async isClaudeCodeAvailable() { return true; },
        async checkAuthStatus() { return { available: true, loggedIn: true }; },
        async execute() {
          // Create the file on disk (simulating Claude Code behavior)
          fs.writeFileSync(path.join(projectDir, 'README.md'), '# Test README');

          return {
            executed: true,
            output: 'Created README.md',
            files_modified: [], // Empty - timing issue simulation
            duration_ms: 100,
            status: 'COMPLETE' as const,
            cwd: projectDir,
            verified_files: [{ path: 'README.md', exists: true, size: 13 }],
            unverified_files: [],
          };
        },
      };

      // Create runner with injected mock executor
      const testRunner = new RunnerCore({
        evidenceDir: tempDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await testRunner.initialize(projectDir);

      const tasks = [{
        id: 'test-task',
        description: 'Create README',
        naturalLanguageTask: 'Create README.md',
      }];

      // Should NOT throw, should complete successfully
      await testRunner.executeTasksSequentially(tasks);

      const results = testRunner.getTaskResults();
      assert.ok(results.length > 0, 'Should have task results');
      assert.equal(results[0].status, TaskStatus.COMPLETED,
        'Task should be COMPLETED when verified_files.exists=true');

      // Verify file actually exists
      assert.ok(fs.existsSync(path.join(projectDir, 'README.md')),
        'README.md should exist on disk');

      testRunner.shutdown();
    });

    it('should return NO_EVIDENCE when files_modified=0 and verified_files is empty', async function() {
      this.timeout(10000);

      // Create mock executor that returns files_modified=[] and verified_files=[]
      const mockExecutor = {
        async isClaudeCodeAvailable() { return true; },
        async checkAuthStatus() { return { available: true, loggedIn: true }; },
        async execute() {
          return {
            executed: true,
            output: 'No files created',
            files_modified: [],
            duration_ms: 100,
            status: 'NO_EVIDENCE' as const, // Executor returns NO_EVIDENCE
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        },
      };

      const testRunner = new RunnerCore({
        evidenceDir: tempDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await testRunner.initialize(projectDir);

      const tasks = [{
        id: 'test-task',
        description: 'Create README',
        naturalLanguageTask: 'Create README.md',
      }];

      // Should NOT throw - should handle gracefully and mark as NO_EVIDENCE
      try {
        await testRunner.executeTasksSequentially(tasks);
      } catch (e) {
        // Old behavior throws - we want this to NOT throw
        assert.fail(`Should NOT throw when files_modified=0 and verified_files empty. Got: ${(e as Error).message}`);
      }

      const status = testRunner.getOverallStatus();
      // NO_EVIDENCE is acceptable (fail-closed), but NOT an exception throw
      assert.ok(
        status === OverallStatus.NO_EVIDENCE || status === OverallStatus.INCOMPLETE,
        `Status should be NO_EVIDENCE or INCOMPLETE, got: ${status}`
      );

      testRunner.shutdown();
    });

    it('should return ERROR when executor fails', async function() {
      this.timeout(10000);

      // Create mock executor that returns ERROR
      const mockExecutor = {
        async isClaudeCodeAvailable() { return true; },
        async checkAuthStatus() { return { available: true, loggedIn: true }; },
        async execute() {
          return {
            executed: false,
            output: '',
            error: 'Execution failed',
            files_modified: [],
            duration_ms: 100,
            status: 'ERROR' as const,
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        },
      };

      const testRunner = new RunnerCore({
        evidenceDir: tempDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });

      await testRunner.initialize(projectDir);

      const tasks = [{
        id: 'test-task',
        description: 'Create README',
        naturalLanguageTask: 'Create README.md',
      }];

      // ERROR from executor should result in ERROR status
      try {
        await testRunner.executeTasksSequentially(tasks);
      } catch {
        // This is expected for ERROR status
      }

      const status = testRunner.getOverallStatus();
      assert.equal(status, OverallStatus.ERROR, 'Status should be ERROR when executor fails');

      testRunner.shutdown();
    });
  });
});
