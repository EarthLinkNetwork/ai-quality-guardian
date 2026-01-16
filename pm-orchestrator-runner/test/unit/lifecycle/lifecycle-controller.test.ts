import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  LifecycleController,
  LifecycleError,
} from '../../../src/lifecycle/lifecycle-controller';
import {
  LifecyclePhase,
  PhaseStatus,
  OverallStatus,
  TaskStatus,
} from '../../../src/models/enums';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Lifecycle Controller (04_COMPONENTS.md L34-81)', () => {
  let controller: LifecycleController;

  beforeEach(() => {
    controller = new LifecycleController();
  });

  describe('7-Phase Lifecycle (04_COMPONENTS.md L40-48)', () => {
    it('should support all 7 phases', () => {
      const phases = controller.getAllPhases();

      assert.equal(phases.length, 7);
      assert.deepEqual(phases, [
        LifecyclePhase.REQUIREMENT_ANALYSIS,
        LifecyclePhase.TASK_DECOMPOSITION,
        LifecyclePhase.PLANNING,
        LifecyclePhase.EXECUTION,
        LifecyclePhase.QA,
        LifecyclePhase.COMPLETION_VALIDATION,
        LifecyclePhase.REPORT,
      ]);
    });

    it('should start in REQUIREMENT_ANALYSIS phase', () => {
      controller.initialize('session-001');
      assert.equal(controller.getCurrentPhase(), LifecyclePhase.REQUIREMENT_ANALYSIS);
    });

    it('should track phase status', () => {
      controller.initialize('session-001');
      const status = controller.getPhaseStatus(LifecyclePhase.REQUIREMENT_ANALYSIS);
      assert.equal(status, PhaseStatus.IN_PROGRESS);
    });
  });

  describe('Phase Transitions (04_COMPONENTS.md L50-55)', () => {
    it('should transition to next phase when gate passes', () => {
      controller.initialize('session-001');

      // Complete requirement analysis with evidence
      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1', 'req-2'] },
        status: PhaseStatus.COMPLETED,
      });

      assert.equal(controller.getCurrentPhase(), LifecyclePhase.TASK_DECOMPOSITION);
    });

    it('should follow strict phase ordering', () => {
      controller.initialize('session-001');

      // Cannot skip to EXECUTION from REQUIREMENT_ANALYSIS
      assert.throws(
        () => controller.transitionTo(LifecyclePhase.EXECUTION),
        (err: Error) => {
          return err instanceof LifecycleError &&
            (err as LifecycleError).code === ErrorCode.E202_PHASE_TRANSITION_INVALID;
        }
      );
    });

    it('should record phase completion time', () => {
      controller.initialize('session-001');

      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });

      const phaseInfo = controller.getPhaseInfo(LifecyclePhase.REQUIREMENT_ANALYSIS);
      assert.ok(phaseInfo.completed_at);
      assert.ok(phaseInfo.duration_seconds >= 0);
    });

    it('should not allow backward transitions', () => {
      controller.initialize('session-001');

      // Move to TASK_DECOMPOSITION
      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });

      // Cannot go back to REQUIREMENT_ANALYSIS
      assert.throws(
        () => controller.transitionTo(LifecyclePhase.REQUIREMENT_ANALYSIS),
        (err: Error) => err instanceof LifecycleError
      );
    });
  });

  describe('Fail-Closed Behavior (04_COMPONENTS.md L60-65)', () => {
    it('should fail-closed on missing evidence', () => {
      controller.initialize('session-001');

      // Try to complete without evidence
      assert.throws(
        () => controller.completeCurrentPhase({
          evidence: null,
          status: PhaseStatus.COMPLETED,
        }),
        (err: Error) => {
          return err instanceof LifecycleError &&
            (err as LifecycleError).code === ErrorCode.E301_EVIDENCE_MISSING;
        }
      );
    });

    it('should fail-closed on invalid evidence', () => {
      controller.initialize('session-001');

      // Evidence that fails validation
      assert.throws(
        () => controller.completeCurrentPhase({
          evidence: { requirements: [] }, // Empty requirements
          status: PhaseStatus.COMPLETED,
        }),
        (err: Error) => err instanceof LifecycleError
      );
    });

    it('should transition to ERROR state on critical failure', () => {
      controller.initialize('session-001');

      controller.handleCriticalError(new Error('Critical failure'));

      assert.equal(controller.getOverallStatus(), OverallStatus.ERROR);
    });

    it('should not allow phase transition after ERROR state', () => {
      controller.initialize('session-001');
      controller.handleCriticalError(new Error('Critical failure'));

      assert.throws(
        () => controller.completeCurrentPhase({
          evidence: { requirements: ['req-1'] },
          status: PhaseStatus.COMPLETED,
        }),
        (err: Error) => err instanceof LifecycleError
      );
    });
  });

  describe('Gate Validation (04_COMPONENTS.md L66-70)', () => {
    it('should validate gate conditions before transition', () => {
      controller.initialize('session-001');

      // Gate validation should happen
      const gateResult = controller.validateGate(LifecyclePhase.REQUIREMENT_ANALYSIS, {
        evidence: { requirements: ['req-1'] },
      });

      assert.ok(gateResult.passed);
    });

    it('should fail gate on insufficient evidence', () => {
      controller.initialize('session-001');

      const gateResult = controller.validateGate(LifecyclePhase.REQUIREMENT_ANALYSIS, {
        evidence: {},
      });

      assert.ok(!gateResult.passed);
      assert.ok(gateResult.failures.length > 0);
    });

    it('should require task list for TASK_DECOMPOSITION gate', () => {
      controller.initialize('session-001');

      // Complete requirement analysis
      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });

      // Now in TASK_DECOMPOSITION
      const gateResult = controller.validateGate(LifecyclePhase.TASK_DECOMPOSITION, {
        evidence: {}, // Missing tasks
      });

      assert.ok(!gateResult.passed);
      assert.ok(gateResult.failures.some(f => f.includes('tasks')));
    });

    it('should require plan for PLANNING gate', () => {
      controller.initialize('session-001');

      // Move to PLANNING
      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });
      controller.completeCurrentPhase({
        evidence: { tasks: [{ id: 'task-1', description: 'Task 1' }] },
        status: PhaseStatus.COMPLETED,
      });

      // Now in PLANNING
      const gateResult = controller.validateGate(LifecyclePhase.PLANNING, {
        evidence: {}, // Missing plan
      });

      assert.ok(!gateResult.passed);
    });
  });

  describe('Execution Phase (04_COMPONENTS.md L71-75)', () => {
    beforeEach(() => {
      controller.initialize('session-001');
      // Move to EXECUTION phase
      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });
      controller.completeCurrentPhase({
        evidence: { tasks: [{ id: 'task-1' }] },
        status: PhaseStatus.COMPLETED,
      });
      controller.completeCurrentPhase({
        evidence: { plan: { task_order: ['task-1'] } },
        status: PhaseStatus.COMPLETED,
      });
    });

    it('should track task execution in EXECUTION phase', () => {
      const taskUpdate = {
        task_id: 'task-1',
        status: TaskStatus.IN_PROGRESS,
        started_at: new Date().toISOString(),
      };

      controller.updateTaskStatus(taskUpdate);

      const taskInfo = controller.getTaskInfo('task-1');
      assert.equal(taskInfo.status, TaskStatus.IN_PROGRESS);
    });

    it('should require all tasks complete before leaving EXECUTION', () => {
      controller.updateTaskStatus({
        task_id: 'task-1',
        status: TaskStatus.IN_PROGRESS,
      });

      // Try to complete EXECUTION with incomplete tasks
      assert.throws(
        () => controller.completeCurrentPhase({
          evidence: { execution_results: [] },
          status: PhaseStatus.COMPLETED,
        }),
        (err: Error) => err instanceof LifecycleError
      );
    });

    it('should allow EXECUTION completion when all tasks done', () => {
      controller.updateTaskStatus({
        task_id: 'task-1',
        status: TaskStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        evidence: { output: 'result' },
      });

      // Should not throw
      controller.completeCurrentPhase({
        evidence: {
          execution_results: [{ task_id: 'task-1', status: 'completed' }],
        },
        status: PhaseStatus.COMPLETED,
      });

      assert.equal(controller.getCurrentPhase(), LifecyclePhase.QA);
    });
  });

  describe('QA Phase (04_COMPONENTS.md L76-77)', () => {
    beforeEach(() => {
      controller.initialize('session-001');
      // Move to QA phase
      advanceToPhase(controller, LifecyclePhase.QA);
    });

    it('should validate QA checks passed', () => {
      const gateResult = controller.validateGate(LifecyclePhase.QA, {
        evidence: {
          qa_results: {
            lint_passed: true,
            tests_passed: true,
            type_check_passed: true,
            build_passed: true,
          },
        },
      });

      assert.ok(gateResult.passed);
    });

    it('should fail gate on QA failures', () => {
      const gateResult = controller.validateGate(LifecyclePhase.QA, {
        evidence: {
          qa_results: {
            lint_passed: true,
            tests_passed: false, // Tests failed
            type_check_passed: true,
            build_passed: true,
          },
        },
      });

      assert.ok(!gateResult.passed);
    });
  });

  describe('Completion Validation Phase (04_COMPONENTS.md L78-79)', () => {
    beforeEach(() => {
      controller.initialize('session-001');
      advanceToPhase(controller, LifecyclePhase.COMPLETION_VALIDATION);
    });

    it('should validate all evidence collected', () => {
      const gateResult = controller.validateGate(LifecyclePhase.COMPLETION_VALIDATION, {
        evidence: {
          evidence_inventory: {
            total_files: 10,
            verified: true,
            hash: 'abc123',
          },
        },
      });

      assert.ok(gateResult.passed);
    });

    it('should fail if evidence not verified', () => {
      const gateResult = controller.validateGate(LifecyclePhase.COMPLETION_VALIDATION, {
        evidence: {
          evidence_inventory: {
            total_files: 10,
            verified: false,
          },
        },
      });

      assert.ok(!gateResult.passed);
    });
  });

  describe('Report Phase (04_COMPONENTS.md L80-81)', () => {
    beforeEach(() => {
      controller.initialize('session-001');
      advanceToPhase(controller, LifecyclePhase.REPORT);
    });

    it('should generate final report in REPORT phase', () => {
      const report = controller.generateFinalReport();

      assert.ok(report.session_id);
      assert.ok(report.phases);
      assert.ok(report.overall_status);
    });

    it('should include all phase information in report', () => {
      const report = controller.generateFinalReport();

      assert.equal(report.phases.length, 7);
      report.phases.forEach((phase: any) => {
        assert.ok(phase.name);
        assert.ok(phase.status);
      });
    });

    it('should complete lifecycle after REPORT phase', () => {
      controller.completeCurrentPhase({
        evidence: { report_generated: true },
        status: PhaseStatus.COMPLETED,
      });

      assert.equal(controller.getOverallStatus(), OverallStatus.COMPLETE);
      assert.ok(controller.isComplete());
    });
  });

  describe('Overall Status Determination (Property 10)', () => {
    it('should set COMPLETE when all phases succeed', () => {
      controller.initialize('session-001');
      advanceToPhase(controller, LifecyclePhase.REPORT);

      controller.completeCurrentPhase({
        evidence: { report_generated: true },
        status: PhaseStatus.COMPLETED,
      });

      assert.equal(controller.getOverallStatus(), OverallStatus.COMPLETE);
    });

    it('should set ERROR on critical failure', () => {
      controller.initialize('session-001');
      controller.handleCriticalError(new Error('Critical'));

      assert.equal(controller.getOverallStatus(), OverallStatus.ERROR);
    });

    it('should set INCOMPLETE when tasks not finished', () => {
      controller.initialize('session-001');

      // Move to EXECUTION
      advanceToPhase(controller, LifecyclePhase.EXECUTION);

      // Mark lifecycle as incomplete (e.g., timeout)
      controller.markIncomplete('Timeout reached');

      assert.equal(controller.getOverallStatus(), OverallStatus.INCOMPLETE);
    });

    it('should set NO_EVIDENCE when evidence missing', () => {
      controller.initialize('session-001');

      controller.markNoEvidence('Required evidence not collected');

      assert.equal(controller.getOverallStatus(), OverallStatus.NO_EVIDENCE);
    });

    it('should set INVALID on validation failure', () => {
      controller.initialize('session-001');

      controller.markInvalid('Invalid session state detected');

      assert.equal(controller.getOverallStatus(), OverallStatus.INVALID);
    });

    it('should follow status priority: INVALID > ERROR > NO_EVIDENCE > INCOMPLETE > COMPLETE', () => {
      controller.initialize('session-001');

      // Set multiple issues
      controller.markIncomplete('Task timeout');
      controller.markNoEvidence('Missing evidence');

      // NO_EVIDENCE takes priority over INCOMPLETE
      assert.equal(controller.getOverallStatus(), OverallStatus.NO_EVIDENCE);

      controller.handleCriticalError(new Error('Critical error'));

      // ERROR takes priority over NO_EVIDENCE
      assert.equal(controller.getOverallStatus(), OverallStatus.ERROR);

      controller.markInvalid('Invalid state');

      // INVALID takes priority over everything
      assert.equal(controller.getOverallStatus(), OverallStatus.INVALID);
    });
  });

  describe('Phase Timeout Handling (04_COMPONENTS.md L56-59)', () => {
    it('should track phase start time', () => {
      controller.initialize('session-001');

      const phaseInfo = controller.getPhaseInfo(LifecyclePhase.REQUIREMENT_ANALYSIS);
      assert.ok(phaseInfo.started_at);
    });

    it('should detect phase timeout', () => {
      controller.initialize('session-001');
      controller.setPhaseTimeout(LifecyclePhase.REQUIREMENT_ANALYSIS, 1); // 1 second

      // Simulate time passing
      controller.setPhaseStartTimeForTesting(
        LifecyclePhase.REQUIREMENT_ANALYSIS,
        Date.now() - 2000 // 2 seconds ago
      );

      assert.ok(controller.isPhaseTimedOut(LifecyclePhase.REQUIREMENT_ANALYSIS));
    });

    it('should transition to INCOMPLETE on timeout', () => {
      controller.initialize('session-001');
      controller.setPhaseTimeout(LifecyclePhase.REQUIREMENT_ANALYSIS, 1);

      controller.setPhaseStartTimeForTesting(
        LifecyclePhase.REQUIREMENT_ANALYSIS,
        Date.now() - 2000
      );

      controller.checkAndHandleTimeout();

      assert.equal(controller.getOverallStatus(), OverallStatus.INCOMPLETE);
    });
  });

  describe('Lifecycle Events (Observable)', () => {
    it('should emit phase_started event', (done) => {
      controller.on('phase_started', (event) => {
        assert.equal(event.phase, LifecyclePhase.REQUIREMENT_ANALYSIS);
        done();
      });

      controller.initialize('session-001');
    });

    it('should emit phase_completed event', (done) => {
      controller.initialize('session-001');

      controller.on('phase_completed', (event) => {
        assert.equal(event.phase, LifecyclePhase.REQUIREMENT_ANALYSIS);
        assert.ok(event.evidence);
        done();
      });

      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });
    });

    it('should emit lifecycle_completed event', (done) => {
      controller.initialize('session-001');

      controller.on('lifecycle_completed', (event) => {
        assert.equal(event.status, OverallStatus.COMPLETE);
        done();
      });

      advanceToPhase(controller, LifecyclePhase.REPORT);
      controller.completeCurrentPhase({
        evidence: { report_generated: true },
        status: PhaseStatus.COMPLETED,
      });
    });

    it('should emit error event on failure', (done) => {
      controller.on('error', (event) => {
        assert.ok(event.error);
        done();
      });

      controller.initialize('session-001');
      controller.handleCriticalError(new Error('Test error'));
    });
  });

  describe('Lifecycle State Persistence', () => {
    it('should serialize lifecycle state', () => {
      controller.initialize('session-001');

      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });

      const serialized = controller.serialize();

      assert.ok(serialized.session_id);
      assert.ok(serialized.current_phase);
      assert.ok(serialized.phases);
      assert.ok(serialized.overall_status);
    });

    it('should deserialize lifecycle state', () => {
      controller.initialize('session-001');

      controller.completeCurrentPhase({
        evidence: { requirements: ['req-1'] },
        status: PhaseStatus.COMPLETED,
      });

      const serialized = controller.serialize();

      const restored = LifecycleController.deserialize(serialized);

      assert.equal(restored.getCurrentPhase(), LifecyclePhase.TASK_DECOMPOSITION);
      assert.equal(
        restored.getPhaseStatus(LifecyclePhase.REQUIREMENT_ANALYSIS),
        PhaseStatus.COMPLETED
      );
    });
  });

  describe('Parallel Execution Control', () => {
    beforeEach(() => {
      controller.initialize('session-001');
      advanceToPhase(controller, LifecyclePhase.EXECUTION);
    });

    it('should track parallel task execution', () => {
      controller.startParallelTasks(['task-1', 'task-2', 'task-3']);

      const parallelInfo = controller.getParallelExecutionInfo();
      assert.equal(parallelInfo.active_count, 3);
    });

    it('should enforce executor limit', () => {
      // Start 4 tasks (max allowed)
      controller.startParallelTasks(['task-1', 'task-2', 'task-3', 'task-4']);

      // Should throw when trying to start 5th
      assert.throws(
        () => controller.startParallelTask('task-5'),
        (err: Error) => {
          return err instanceof LifecycleError &&
            (err as LifecycleError).code === ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED;
        }
      );
    });

    it('should release slot when task completes', () => {
      controller.startParallelTasks(['task-1', 'task-2', 'task-3', 'task-4']);

      controller.completeParallelTask('task-1', {
        status: TaskStatus.COMPLETED,
        evidence: {},
      });

      // Should now be able to start another
      controller.startParallelTask('task-5');

      const parallelInfo = controller.getParallelExecutionInfo();
      assert.equal(parallelInfo.active_count, 4);
    });
  });

  describe('Error Recovery', () => {
    it('should support phase retry on recoverable error', () => {
      controller.initialize('session-001');

      // Simulate recoverable error
      controller.handleRecoverableError(
        LifecyclePhase.REQUIREMENT_ANALYSIS,
        new Error('Temporary failure')
      );

      // Should still be in same phase
      assert.equal(controller.getCurrentPhase(), LifecyclePhase.REQUIREMENT_ANALYSIS);

      // Retry count should increase
      const phaseInfo = controller.getPhaseInfo(LifecyclePhase.REQUIREMENT_ANALYSIS);
      assert.equal(phaseInfo.retry_count, 1);
    });

    it('should fail after max retries', () => {
      controller.initialize('session-001');
      controller.setMaxRetries(3);

      // Retry 3 times
      for (let i = 0; i < 3; i++) {
        controller.handleRecoverableError(
          LifecyclePhase.REQUIREMENT_ANALYSIS,
          new Error('Temporary failure')
        );
      }

      // 4th retry should fail
      assert.throws(
        () => controller.handleRecoverableError(
          LifecyclePhase.REQUIREMENT_ANALYSIS,
          new Error('Temporary failure')
        ),
        (err: Error) => err instanceof LifecycleError
      );

      assert.equal(controller.getOverallStatus(), OverallStatus.ERROR);
    });
  });
});

// Helper function to advance lifecycle to a specific phase
function advanceToPhase(controller: LifecycleController, targetPhase: LifecyclePhase): void {
  const phases = controller.getAllPhases();
  const targetIndex = phases.indexOf(targetPhase);

  const evidenceByPhase: Record<LifecyclePhase, any> = {
    [LifecyclePhase.REQUIREMENT_ANALYSIS]: { requirements: ['req-1'] },
    [LifecyclePhase.TASK_DECOMPOSITION]: { tasks: [{ id: 'task-1' }] },
    [LifecyclePhase.PLANNING]: { plan: { task_order: ['task-1'] } },
    [LifecyclePhase.EXECUTION]: {
      execution_results: [{ task_id: 'task-1', status: 'completed' }],
    },
    [LifecyclePhase.QA]: {
      qa_results: {
        lint_passed: true,
        tests_passed: true,
        type_check_passed: true,
        build_passed: true,
      },
    },
    [LifecyclePhase.COMPLETION_VALIDATION]: {
      evidence_inventory: { total_files: 10, verified: true, hash: 'abc123' },
    },
    [LifecyclePhase.REPORT]: { report_generated: true },
  };

  for (let i = 0; i < targetIndex; i++) {
    const currentPhase = phases[i];

    // For EXECUTION phase, also complete the task
    if (currentPhase === LifecyclePhase.EXECUTION) {
      controller.updateTaskStatus({
        task_id: 'task-1',
        status: TaskStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        evidence: { output: 'result' },
      });
    }

    controller.completeCurrentPhase({
      evidence: evidenceByPhase[currentPhase],
      status: PhaseStatus.COMPLETED,
    });
  }
}
