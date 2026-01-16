/**
 * Lifecycle Controller
 * Based on 04_COMPONENTS.md L34-81
 *
 * Responsible for:
 * - 7-phase lifecycle management
 * - Phase transitions with gate validation
 * - Fail-closed behavior
 * - Overall status determination
 * - Event emission (observable pattern)
 * - State persistence
 * - Parallel execution control
 * - Error recovery with retry
 */

import { EventEmitter } from 'events';
import {
  LifecyclePhase,
  PhaseStatus,
  OverallStatus,
  TaskStatus,
  Phase,
  getAllPhases as getAllPhasesFromEnum,
  getNextPhase,
  isValidPhaseTransition,
  getPhaseIndex,
  isLastPhase,
} from '../models/enums';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';

/**
 * Lifecycle Controller Error
 */
export class LifecycleError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'LifecycleError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Phase completion input
 */
interface PhaseCompletionInput {
  evidence: Record<string, unknown> | null;
  status: PhaseStatus;
}

/**
 * Phase info
 */
interface PhaseInfo {
  phase: LifecyclePhase;
  status: PhaseStatus;
  started_at?: string;
  completed_at?: string;
  duration_seconds: number;
  retry_count: number;
  evidence?: Record<string, unknown>;
}

/**
 * Gate validation result
 */
interface GateResult {
  passed: boolean;
  failures: string[];
}

/**
 * Task update input
 */
interface TaskUpdate {
  task_id: string;
  status: TaskStatus;
  started_at?: string;
  completed_at?: string;
  evidence?: Record<string, unknown>;
}

/**
 * Task info
 */
interface TaskInfo {
  task_id: string;
  status: TaskStatus;
  started_at?: string;
  completed_at?: string;
  evidence?: Record<string, unknown>;
}

/**
 * Parallel task completion input
 */
interface ParallelTaskCompletion {
  status: TaskStatus;
  evidence: Record<string, unknown>;
}

/**
 * Parallel execution info
 */
interface ParallelExecutionInfo {
  active_count: number;
  active_tasks: string[];
  max_parallel: number;
}

/**
 * Final report structure
 */
interface FinalReport {
  session_id: string;
  phases: Array<{
    name: string;
    status: PhaseStatus;
    started_at?: string;
    completed_at?: string;
    duration_seconds: number;
  }>;
  overall_status: OverallStatus;
  completed_at: string;
}

/**
 * Serialized lifecycle state
 */
interface SerializedState {
  session_id: string;
  current_phase: LifecyclePhase;
  phases: Record<string, PhaseInfo>;
  overall_status: OverallStatus;
  tasks: Record<string, TaskInfo>;
  parallel_tasks: string[];
  status_flags: {
    is_error: boolean;
    is_incomplete: boolean;
    is_no_evidence: boolean;
    is_invalid: boolean;
  };
}

/**
 * Default executor limit for parallel tasks
 */
const DEFAULT_EXECUTOR_LIMIT = 4;

/**
 * Default max retries for recoverable errors
 */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Lifecycle Controller class
 */
export class LifecycleController extends EventEmitter {
  private sessionId: string = '';
  private currentPhase: LifecyclePhase = LifecyclePhase.REQUIREMENT_ANALYSIS;
  private phases: Map<LifecyclePhase, PhaseInfo> = new Map();
  private tasks: Map<string, TaskInfo> = new Map();
  private registeredTasks: string[] = [];
  private parallelTasks: Set<string> = new Set();
  private phaseTimeouts: Map<LifecyclePhase, number> = new Map();
  private phaseStartTimes: Map<LifecyclePhase, number> = new Map();
  private executorLimit: number = DEFAULT_EXECUTOR_LIMIT;
  private maxRetries: number = DEFAULT_MAX_RETRIES;

  // Status flags (for priority-based status determination)
  private isError: boolean = false;
  private isIncomplete: boolean = false;
  private isNoEvidence: boolean = false;
  private isInvalid: boolean = false;
  private isCompleted: boolean = false;

  /**
   * Create a new LifecycleController
   */
  constructor() {
    super();
  }

  /**
   * Get all lifecycle phases
   */
  getAllPhases(): LifecyclePhase[] {
    return getAllPhasesFromEnum() as LifecyclePhase[];
  }

  /**
   * Initialize the lifecycle with a session ID
   */
  initialize(sessionId: string): void {
    this.sessionId = sessionId;
    this.currentPhase = LifecyclePhase.REQUIREMENT_ANALYSIS;
    this.phases.clear();
    this.tasks.clear();
    this.registeredTasks = [];
    this.parallelTasks.clear();
    this.isError = false;
    this.isIncomplete = false;
    this.isNoEvidence = false;
    this.isInvalid = false;
    this.isCompleted = false;

    // Initialize all phases as pending
    for (const phase of this.getAllPhases()) {
      this.phases.set(phase, {
        phase,
        status: PhaseStatus.PENDING,
        duration_seconds: 0,
        retry_count: 0,
      });
    }

    // Start the first phase
    const firstPhase = this.phases.get(LifecyclePhase.REQUIREMENT_ANALYSIS)!;
    firstPhase.status = PhaseStatus.IN_PROGRESS;
    firstPhase.started_at = new Date().toISOString();
    this.phaseStartTimes.set(LifecyclePhase.REQUIREMENT_ANALYSIS, Date.now());

    this.emit('phase_started', {
      phase: LifecyclePhase.REQUIREMENT_ANALYSIS,
      session_id: sessionId,
    });
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): LifecyclePhase {
    return this.currentPhase;
  }

  /**
   * Get phase status
   */
  getPhaseStatus(phase: LifecyclePhase): PhaseStatus {
    const phaseInfo = this.phases.get(phase);
    return phaseInfo?.status ?? PhaseStatus.PENDING;
  }

  /**
   * Get phase info
   */
  getPhaseInfo(phase: LifecyclePhase): PhaseInfo {
    const phaseInfo = this.phases.get(phase);
    if (!phaseInfo) {
      return {
        phase,
        status: PhaseStatus.PENDING,
        duration_seconds: 0,
        retry_count: 0,
      };
    }
    return { ...phaseInfo };
  }

  /**
   * Complete current phase and transition to next
   * @throws LifecycleError if evidence is missing or invalid
   */
  completeCurrentPhase(input: PhaseCompletionInput): void {
    // Check if in error state
    if (this.isError || this.isInvalid) {
      throw new LifecycleError(
        ErrorCode.E204_LIFECYCLE_VIOLATION,
        'Cannot complete phase: lifecycle is in error or invalid state',
        { current_status: this.getOverallStatus() }
      );
    }

    // Validate evidence
    if (input.evidence === null || input.evidence === undefined) {
      throw new LifecycleError(
        ErrorCode.E301_EVIDENCE_MISSING,
        'Cannot complete phase: evidence is required',
        { phase: this.currentPhase }
      );
    }

    // Validate gate conditions
    const gateResult = this.validateGate(this.currentPhase, { evidence: input.evidence });
    if (!gateResult.passed) {
      throw new LifecycleError(
        ErrorCode.E302_EVIDENCE_VALIDATION_FAILURE,
        `Gate validation failed: ${gateResult.failures.join(', ')}`,
        { phase: this.currentPhase, failures: gateResult.failures }
      );
    }

    // For EXECUTION phase, check all tasks are complete
    if (this.currentPhase === LifecyclePhase.EXECUTION) {
      const incompleteTasks = this.getIncompleteTasks();
      if (incompleteTasks.length > 0) {
        throw new LifecycleError(
          ErrorCode.E204_LIFECYCLE_VIOLATION,
          'Cannot complete EXECUTION phase: tasks are not complete',
          { incomplete_tasks: incompleteTasks }
        );
      }
    }

    // Mark current phase as completed
    const currentPhaseInfo = this.phases.get(this.currentPhase)!;
    currentPhaseInfo.status = PhaseStatus.COMPLETED;
    currentPhaseInfo.completed_at = new Date().toISOString();
    currentPhaseInfo.evidence = input.evidence;

    // Calculate duration
    const startTime = this.phaseStartTimes.get(this.currentPhase);
    if (startTime) {
      currentPhaseInfo.duration_seconds = Math.round((Date.now() - startTime) / 1000);
    }

    this.emit('phase_completed', {
      phase: this.currentPhase,
      evidence: input.evidence,
      session_id: this.sessionId,
    });

    // Check if this was the last phase
    if (isLastPhase(this.currentPhase)) {
      this.isCompleted = true;
      this.emit('lifecycle_completed', {
        status: OverallStatus.COMPLETE,
        session_id: this.sessionId,
      });
      return;
    }

    // Transition to next phase
    const nextPhase = getNextPhase(this.currentPhase);
    if (nextPhase) {
      this.currentPhase = nextPhase as LifecyclePhase;
      const nextPhaseInfo = this.phases.get(this.currentPhase)!;
      nextPhaseInfo.status = PhaseStatus.IN_PROGRESS;
      nextPhaseInfo.started_at = new Date().toISOString();
      this.phaseStartTimes.set(this.currentPhase, Date.now());

      this.emit('phase_started', {
        phase: this.currentPhase,
        session_id: this.sessionId,
      });
    }
  }

  /**
   * Transition to a specific phase
   * @throws LifecycleError if transition is invalid
   */
  transitionTo(targetPhase: LifecyclePhase): void {
    // Check if transition is valid (must be next phase)
    if (!isValidPhaseTransition(this.currentPhase, targetPhase)) {
      const currentIndex = getPhaseIndex(this.currentPhase);
      const targetIndex = getPhaseIndex(targetPhase);

      if (targetIndex < currentIndex) {
        throw new LifecycleError(
          ErrorCode.E202_PHASE_TRANSITION_INVALID,
          'Backward transitions are not allowed',
          { from: this.currentPhase, to: targetPhase }
        );
      }

      throw new LifecycleError(
        ErrorCode.E202_PHASE_TRANSITION_INVALID,
        'Cannot skip phases - must transition to immediate next phase',
        { from: this.currentPhase, to: targetPhase }
      );
    }

    // Perform transition
    this.currentPhase = targetPhase;
    const phaseInfo = this.phases.get(targetPhase)!;
    phaseInfo.status = PhaseStatus.IN_PROGRESS;
    phaseInfo.started_at = new Date().toISOString();
    this.phaseStartTimes.set(targetPhase, Date.now());

    this.emit('phase_started', {
      phase: targetPhase,
      session_id: this.sessionId,
    });
  }

  /**
   * Validate gate conditions for a phase
   */
  validateGate(phase: LifecyclePhase, input: { evidence: Record<string, unknown> }): GateResult {
    const failures: string[] = [];

    switch (phase) {
      case LifecyclePhase.REQUIREMENT_ANALYSIS:
        if (!input.evidence.requirements ||
            (Array.isArray(input.evidence.requirements) &&
             (input.evidence.requirements as unknown[]).length === 0)) {
          failures.push('requirements are required');
        }
        break;

      case LifecyclePhase.TASK_DECOMPOSITION:
        if (!input.evidence.tasks ||
            (Array.isArray(input.evidence.tasks) &&
             (input.evidence.tasks as unknown[]).length === 0)) {
          failures.push('tasks are required');
        }
        break;

      case LifecyclePhase.PLANNING:
        if (!input.evidence.plan) {
          failures.push('plan is required');
        }
        break;

      case LifecyclePhase.EXECUTION:
        if (!input.evidence.execution_results) {
          failures.push('execution_results are required');
        }
        break;

      case LifecyclePhase.QA:
        const qaResults = input.evidence.qa_results as {
          lint_passed?: boolean;
          tests_passed?: boolean;
          type_check_passed?: boolean;
          build_passed?: boolean;
        } | undefined;

        if (!qaResults) {
          failures.push('qa_results are required');
        } else {
          if (!qaResults.lint_passed) failures.push('lint check failed');
          if (!qaResults.tests_passed) failures.push('tests failed');
          if (!qaResults.type_check_passed) failures.push('type check failed');
          if (!qaResults.build_passed) failures.push('build failed');
        }
        break;

      case LifecyclePhase.COMPLETION_VALIDATION:
        const evidenceInventory = input.evidence.evidence_inventory as {
          verified?: boolean;
        } | undefined;

        if (!evidenceInventory) {
          failures.push('evidence_inventory is required');
        } else if (!evidenceInventory.verified) {
          failures.push('evidence not verified');
        }
        break;

      case LifecyclePhase.REPORT:
        if (!input.evidence.report_generated) {
          failures.push('report_generated is required');
        }
        break;
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * Handle critical error
   */
  handleCriticalError(error: Error): void {
    this.isError = true;

    // Mark current phase as failed
    const currentPhaseInfo = this.phases.get(this.currentPhase);
    if (currentPhaseInfo) {
      currentPhaseInfo.status = PhaseStatus.FAILED;
    }

    // Only emit error if there are listeners (avoid unhandled error exception)
    if (this.listenerCount('error') > 0) {
      this.emit('error', {
        error,
        phase: this.currentPhase,
        session_id: this.sessionId,
      });
    }
  }

  /**
   * Handle recoverable error (with retry)
   * @throws LifecycleError if max retries exceeded
   */
  handleRecoverableError(phase: LifecyclePhase, error: Error): void {
    const phaseInfo = this.phases.get(phase);
    if (!phaseInfo) {
      throw new LifecycleError(
        ErrorCode.E204_LIFECYCLE_VIOLATION,
        'Phase not found',
        { phase }
      );
    }

    phaseInfo.retry_count++;

    if (phaseInfo.retry_count > this.maxRetries) {
      this.isError = true;
      throw new LifecycleError(
        ErrorCode.E201_PHASE_EXECUTION_FAILURE,
        `Max retries (${this.maxRetries}) exceeded for phase ${phase}`,
        { phase, retry_count: phaseInfo.retry_count, error: error.message }
      );
    }

    this.emit('phase_retry', {
      phase,
      retry_count: phaseInfo.retry_count,
      error,
      session_id: this.sessionId,
    });
  }

  /**
   * Set max retries for recoverable errors
   */
  setMaxRetries(count: number): void {
    this.maxRetries = count;
  }

  /**
   * Get overall status
   */
  getOverallStatus(): OverallStatus {
    // Priority: INVALID > ERROR > NO_EVIDENCE > INCOMPLETE > COMPLETE
    if (this.isInvalid) return OverallStatus.INVALID;
    if (this.isError) return OverallStatus.ERROR;
    if (this.isNoEvidence) return OverallStatus.NO_EVIDENCE;
    if (this.isIncomplete) return OverallStatus.INCOMPLETE;
    if (this.isCompleted) return OverallStatus.COMPLETE;

    // Default to INCOMPLETE if not explicitly completed
    return OverallStatus.INCOMPLETE;
  }

  /**
   * Check if lifecycle is complete
   */
  isComplete(): boolean {
    return this.isCompleted;
  }

  /**
   * Mark lifecycle as incomplete
   */
  markIncomplete(reason: string): void {
    this.isIncomplete = true;
    this.emit('lifecycle_incomplete', {
      reason,
      session_id: this.sessionId,
    });
  }

  /**
   * Mark lifecycle as no evidence
   */
  markNoEvidence(reason: string): void {
    this.isNoEvidence = true;
    this.emit('lifecycle_no_evidence', {
      reason,
      session_id: this.sessionId,
    });
  }

  /**
   * Mark lifecycle as invalid
   */
  markInvalid(reason: string): void {
    this.isInvalid = true;
    this.emit('lifecycle_invalid', {
      reason,
      session_id: this.sessionId,
    });
  }

  /**
   * Update task status (for EXECUTION phase)
   */
  updateTaskStatus(update: TaskUpdate): void {
    let taskInfo = this.tasks.get(update.task_id);

    if (!taskInfo) {
      taskInfo = {
        task_id: update.task_id,
        status: update.status,
        started_at: update.started_at,
      };
      this.tasks.set(update.task_id, taskInfo);

      // Register task if not already registered
      if (!this.registeredTasks.includes(update.task_id)) {
        this.registeredTasks.push(update.task_id);
      }
    }

    taskInfo.status = update.status;
    if (update.started_at) taskInfo.started_at = update.started_at;
    if (update.completed_at) taskInfo.completed_at = update.completed_at;
    if (update.evidence) taskInfo.evidence = update.evidence;

    this.emit('task_updated', {
      task_id: update.task_id,
      status: update.status,
      session_id: this.sessionId,
    });
  }

  /**
   * Get task info
   */
  getTaskInfo(taskId: string): TaskInfo {
    const taskInfo = this.tasks.get(taskId);
    if (!taskInfo) {
      return {
        task_id: taskId,
        status: TaskStatus.PENDING,
      };
    }
    return { ...taskInfo };
  }

  /**
   * Get incomplete tasks
   */
  private getIncompleteTasks(): string[] {
    const incomplete: string[] = [];

    for (const [taskId, taskInfo] of this.tasks) {
      if (taskInfo.status !== TaskStatus.COMPLETED &&
          taskInfo.status !== TaskStatus.COMPLETE) {
        incomplete.push(taskId);
      }
    }

    return incomplete;
  }

  /**
   * Generate final report
   */
  generateFinalReport(): FinalReport {
    const phases = this.getAllPhases().map(phase => {
      const info = this.getPhaseInfo(phase);
      return {
        name: phase,
        status: info.status,
        started_at: info.started_at,
        completed_at: info.completed_at,
        duration_seconds: info.duration_seconds,
      };
    });

    return {
      session_id: this.sessionId,
      phases,
      overall_status: this.getOverallStatus(),
      completed_at: new Date().toISOString(),
    };
  }

  /**
   * Set phase timeout
   */
  setPhaseTimeout(phase: LifecyclePhase, seconds: number): void {
    this.phaseTimeouts.set(phase, seconds * 1000);
  }

  /**
   * Set phase start time (for testing)
   */
  setPhaseStartTimeForTesting(phase: LifecyclePhase, timestamp: number): void {
    this.phaseStartTimes.set(phase, timestamp);
  }

  /**
   * Check if phase is timed out
   */
  isPhaseTimedOut(phase: LifecyclePhase): boolean {
    const timeout = this.phaseTimeouts.get(phase);
    const startTime = this.phaseStartTimes.get(phase);

    if (!timeout || !startTime) {
      return false;
    }

    return Date.now() - startTime > timeout;
  }

  /**
   * Check and handle timeout
   */
  checkAndHandleTimeout(): void {
    if (this.isPhaseTimedOut(this.currentPhase)) {
      this.markIncomplete(`Phase ${this.currentPhase} timed out`);
    }
  }

  /**
   * Start parallel tasks
   */
  startParallelTasks(taskIds: string[]): void {
    for (const taskId of taskIds) {
      this.startParallelTask(taskId);
    }
  }

  /**
   * Start a single parallel task
   * @throws LifecycleError if executor limit exceeded
   */
  startParallelTask(taskId: string): void {
    if (this.parallelTasks.size >= this.executorLimit) {
      throw new LifecycleError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor limit (${this.executorLimit}) exceeded`,
        { current: this.parallelTasks.size, limit: this.executorLimit }
      );
    }

    this.parallelTasks.add(taskId);

    // Update task status
    this.updateTaskStatus({
      task_id: taskId,
      status: TaskStatus.IN_PROGRESS,
      started_at: new Date().toISOString(),
    });
  }

  /**
   * Complete a parallel task
   */
  completeParallelTask(taskId: string, completion: ParallelTaskCompletion): void {
    this.parallelTasks.delete(taskId);

    this.updateTaskStatus({
      task_id: taskId,
      status: completion.status,
      completed_at: new Date().toISOString(),
      evidence: completion.evidence,
    });
  }

  /**
   * Get parallel execution info
   */
  getParallelExecutionInfo(): ParallelExecutionInfo {
    return {
      active_count: this.parallelTasks.size,
      active_tasks: Array.from(this.parallelTasks),
      max_parallel: this.executorLimit,
    };
  }

  /**
   * Serialize lifecycle state
   */
  serialize(): SerializedState {
    const phasesRecord: Record<string, PhaseInfo> = {};
    for (const [phase, info] of this.phases) {
      phasesRecord[phase] = info;
    }

    const tasksRecord: Record<string, TaskInfo> = {};
    for (const [taskId, info] of this.tasks) {
      tasksRecord[taskId] = info;
    }

    return {
      session_id: this.sessionId,
      current_phase: this.currentPhase,
      phases: phasesRecord,
      overall_status: this.getOverallStatus(),
      tasks: tasksRecord,
      parallel_tasks: Array.from(this.parallelTasks),
      status_flags: {
        is_error: this.isError,
        is_incomplete: this.isIncomplete,
        is_no_evidence: this.isNoEvidence,
        is_invalid: this.isInvalid,
      },
    };
  }

  /**
   * Deserialize lifecycle state
   */
  static deserialize(state: SerializedState): LifecycleController {
    const controller = new LifecycleController();

    controller.sessionId = state.session_id;
    controller.currentPhase = state.current_phase;

    controller.phases.clear();
    for (const [phase, info] of Object.entries(state.phases)) {
      controller.phases.set(phase as LifecyclePhase, info);
    }

    controller.tasks.clear();
    for (const [taskId, info] of Object.entries(state.tasks)) {
      controller.tasks.set(taskId, info);
    }

    controller.parallelTasks = new Set(state.parallel_tasks);

    controller.isError = state.status_flags.is_error;
    controller.isIncomplete = state.status_flags.is_incomplete;
    controller.isNoEvidence = state.status_flags.is_no_evidence;
    controller.isInvalid = state.status_flags.is_invalid;

    return controller;
  }
}
