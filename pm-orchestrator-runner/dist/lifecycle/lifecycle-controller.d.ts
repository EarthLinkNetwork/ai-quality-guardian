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
import { LifecyclePhase, PhaseStatus, OverallStatus, TaskStatus } from '../models/enums';
import { ErrorCode } from '../errors/error-codes';
/**
 * Lifecycle Controller Error
 */
export declare class LifecycleError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
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
 * Lifecycle Controller class
 */
export declare class LifecycleController extends EventEmitter {
    private sessionId;
    private currentPhase;
    private phases;
    private tasks;
    private registeredTasks;
    private parallelTasks;
    private phaseTimeouts;
    private phaseStartTimes;
    private executorLimit;
    private maxRetries;
    private isError;
    private isIncomplete;
    private isNoEvidence;
    private isInvalid;
    private isCompleted;
    /**
     * Create a new LifecycleController
     */
    constructor();
    /**
     * Get all lifecycle phases
     */
    getAllPhases(): LifecyclePhase[];
    /**
     * Initialize the lifecycle with a session ID
     */
    initialize(sessionId: string): void;
    /**
     * Get current phase
     */
    getCurrentPhase(): LifecyclePhase;
    /**
     * Get phase status
     */
    getPhaseStatus(phase: LifecyclePhase): PhaseStatus;
    /**
     * Get phase info
     */
    getPhaseInfo(phase: LifecyclePhase): PhaseInfo;
    /**
     * Complete current phase and transition to next
     * @throws LifecycleError if evidence is missing or invalid
     */
    completeCurrentPhase(input: PhaseCompletionInput): void;
    /**
     * Transition to a specific phase
     * @throws LifecycleError if transition is invalid
     */
    transitionTo(targetPhase: LifecyclePhase): void;
    /**
     * Validate gate conditions for a phase
     */
    validateGate(phase: LifecyclePhase, input: {
        evidence: Record<string, unknown>;
    }): GateResult;
    /**
     * Handle critical error
     */
    handleCriticalError(error: Error): void;
    /**
     * Handle recoverable error (with retry)
     * @throws LifecycleError if max retries exceeded
     */
    handleRecoverableError(phase: LifecyclePhase, error: Error): void;
    /**
     * Set max retries for recoverable errors
     */
    setMaxRetries(count: number): void;
    /**
     * Get overall status
     */
    getOverallStatus(): OverallStatus;
    /**
     * Check if lifecycle is complete
     */
    isComplete(): boolean;
    /**
     * Mark lifecycle as incomplete
     */
    markIncomplete(reason: string): void;
    /**
     * Mark lifecycle as no evidence
     */
    markNoEvidence(reason: string): void;
    /**
     * Mark lifecycle as invalid
     */
    markInvalid(reason: string): void;
    /**
     * Update task status (for EXECUTION phase)
     */
    updateTaskStatus(update: TaskUpdate): void;
    /**
     * Get task info
     */
    getTaskInfo(taskId: string): TaskInfo;
    /**
     * Get incomplete tasks
     */
    private getIncompleteTasks;
    /**
     * Generate final report
     */
    generateFinalReport(): FinalReport;
    /**
     * Set phase timeout
     */
    setPhaseTimeout(phase: LifecyclePhase, seconds: number): void;
    /**
     * Set phase start time (for testing)
     */
    setPhaseStartTimeForTesting(phase: LifecyclePhase, timestamp: number): void;
    /**
     * Check if phase is timed out
     */
    isPhaseTimedOut(phase: LifecyclePhase): boolean;
    /**
     * Check and handle timeout
     */
    checkAndHandleTimeout(): void;
    /**
     * Start parallel tasks
     */
    startParallelTasks(taskIds: string[]): void;
    /**
     * Start a single parallel task
     * @throws LifecycleError if executor limit exceeded
     */
    startParallelTask(taskId: string): void;
    /**
     * Complete a parallel task
     */
    completeParallelTask(taskId: string, completion: ParallelTaskCompletion): void;
    /**
     * Get parallel execution info
     */
    getParallelExecutionInfo(): ParallelExecutionInfo;
    /**
     * Serialize lifecycle state
     */
    serialize(): SerializedState;
    /**
     * Deserialize lifecycle state
     */
    static deserialize(state: SerializedState): LifecycleController;
}
export {};
//# sourceMappingURL=lifecycle-controller.d.ts.map