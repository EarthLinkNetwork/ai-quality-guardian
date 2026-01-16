"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LifecycleController = exports.LifecycleError = void 0;
const events_1 = require("events");
const enums_1 = require("../models/enums");
const error_codes_1 = require("../errors/error-codes");
/**
 * Lifecycle Controller Error
 */
class LifecycleError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'LifecycleError';
        this.code = code;
        this.details = details;
    }
}
exports.LifecycleError = LifecycleError;
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
class LifecycleController extends events_1.EventEmitter {
    sessionId = '';
    currentPhase = enums_1.LifecyclePhase.REQUIREMENT_ANALYSIS;
    phases = new Map();
    tasks = new Map();
    registeredTasks = [];
    parallelTasks = new Set();
    phaseTimeouts = new Map();
    phaseStartTimes = new Map();
    executorLimit = DEFAULT_EXECUTOR_LIMIT;
    maxRetries = DEFAULT_MAX_RETRIES;
    // Status flags (for priority-based status determination)
    isError = false;
    isIncomplete = false;
    isNoEvidence = false;
    isInvalid = false;
    isCompleted = false;
    /**
     * Create a new LifecycleController
     */
    constructor() {
        super();
    }
    /**
     * Get all lifecycle phases
     */
    getAllPhases() {
        return (0, enums_1.getAllPhases)();
    }
    /**
     * Initialize the lifecycle with a session ID
     */
    initialize(sessionId) {
        this.sessionId = sessionId;
        this.currentPhase = enums_1.LifecyclePhase.REQUIREMENT_ANALYSIS;
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
                status: enums_1.PhaseStatus.PENDING,
                duration_seconds: 0,
                retry_count: 0,
            });
        }
        // Start the first phase
        const firstPhase = this.phases.get(enums_1.LifecyclePhase.REQUIREMENT_ANALYSIS);
        firstPhase.status = enums_1.PhaseStatus.IN_PROGRESS;
        firstPhase.started_at = new Date().toISOString();
        this.phaseStartTimes.set(enums_1.LifecyclePhase.REQUIREMENT_ANALYSIS, Date.now());
        this.emit('phase_started', {
            phase: enums_1.LifecyclePhase.REQUIREMENT_ANALYSIS,
            session_id: sessionId,
        });
    }
    /**
     * Get current phase
     */
    getCurrentPhase() {
        return this.currentPhase;
    }
    /**
     * Get phase status
     */
    getPhaseStatus(phase) {
        const phaseInfo = this.phases.get(phase);
        return phaseInfo?.status ?? enums_1.PhaseStatus.PENDING;
    }
    /**
     * Get phase info
     */
    getPhaseInfo(phase) {
        const phaseInfo = this.phases.get(phase);
        if (!phaseInfo) {
            return {
                phase,
                status: enums_1.PhaseStatus.PENDING,
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
    completeCurrentPhase(input) {
        // Check if in error state
        if (this.isError || this.isInvalid) {
            throw new LifecycleError(error_codes_1.ErrorCode.E204_LIFECYCLE_VIOLATION, 'Cannot complete phase: lifecycle is in error or invalid state', { current_status: this.getOverallStatus() });
        }
        // Validate evidence
        if (input.evidence === null || input.evidence === undefined) {
            throw new LifecycleError(error_codes_1.ErrorCode.E301_EVIDENCE_MISSING, 'Cannot complete phase: evidence is required', { phase: this.currentPhase });
        }
        // Validate gate conditions
        const gateResult = this.validateGate(this.currentPhase, { evidence: input.evidence });
        if (!gateResult.passed) {
            throw new LifecycleError(error_codes_1.ErrorCode.E302_EVIDENCE_VALIDATION_FAILURE, `Gate validation failed: ${gateResult.failures.join(', ')}`, { phase: this.currentPhase, failures: gateResult.failures });
        }
        // For EXECUTION phase, check all tasks are complete
        if (this.currentPhase === enums_1.LifecyclePhase.EXECUTION) {
            const incompleteTasks = this.getIncompleteTasks();
            if (incompleteTasks.length > 0) {
                throw new LifecycleError(error_codes_1.ErrorCode.E204_LIFECYCLE_VIOLATION, 'Cannot complete EXECUTION phase: tasks are not complete', { incomplete_tasks: incompleteTasks });
            }
        }
        // Mark current phase as completed
        const currentPhaseInfo = this.phases.get(this.currentPhase);
        currentPhaseInfo.status = enums_1.PhaseStatus.COMPLETED;
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
        if ((0, enums_1.isLastPhase)(this.currentPhase)) {
            this.isCompleted = true;
            this.emit('lifecycle_completed', {
                status: enums_1.OverallStatus.COMPLETE,
                session_id: this.sessionId,
            });
            return;
        }
        // Transition to next phase
        const nextPhase = (0, enums_1.getNextPhase)(this.currentPhase);
        if (nextPhase) {
            this.currentPhase = nextPhase;
            const nextPhaseInfo = this.phases.get(this.currentPhase);
            nextPhaseInfo.status = enums_1.PhaseStatus.IN_PROGRESS;
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
    transitionTo(targetPhase) {
        // Check if transition is valid (must be next phase)
        if (!(0, enums_1.isValidPhaseTransition)(this.currentPhase, targetPhase)) {
            const currentIndex = (0, enums_1.getPhaseIndex)(this.currentPhase);
            const targetIndex = (0, enums_1.getPhaseIndex)(targetPhase);
            if (targetIndex < currentIndex) {
                throw new LifecycleError(error_codes_1.ErrorCode.E202_PHASE_TRANSITION_INVALID, 'Backward transitions are not allowed', { from: this.currentPhase, to: targetPhase });
            }
            throw new LifecycleError(error_codes_1.ErrorCode.E202_PHASE_TRANSITION_INVALID, 'Cannot skip phases - must transition to immediate next phase', { from: this.currentPhase, to: targetPhase });
        }
        // Perform transition
        this.currentPhase = targetPhase;
        const phaseInfo = this.phases.get(targetPhase);
        phaseInfo.status = enums_1.PhaseStatus.IN_PROGRESS;
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
    validateGate(phase, input) {
        const failures = [];
        switch (phase) {
            case enums_1.LifecyclePhase.REQUIREMENT_ANALYSIS:
                if (!input.evidence.requirements ||
                    (Array.isArray(input.evidence.requirements) &&
                        input.evidence.requirements.length === 0)) {
                    failures.push('requirements are required');
                }
                break;
            case enums_1.LifecyclePhase.TASK_DECOMPOSITION:
                if (!input.evidence.tasks ||
                    (Array.isArray(input.evidence.tasks) &&
                        input.evidence.tasks.length === 0)) {
                    failures.push('tasks are required');
                }
                break;
            case enums_1.LifecyclePhase.PLANNING:
                if (!input.evidence.plan) {
                    failures.push('plan is required');
                }
                break;
            case enums_1.LifecyclePhase.EXECUTION:
                if (!input.evidence.execution_results) {
                    failures.push('execution_results are required');
                }
                break;
            case enums_1.LifecyclePhase.QA:
                const qaResults = input.evidence.qa_results;
                if (!qaResults) {
                    failures.push('qa_results are required');
                }
                else {
                    if (!qaResults.lint_passed)
                        failures.push('lint check failed');
                    if (!qaResults.tests_passed)
                        failures.push('tests failed');
                    if (!qaResults.type_check_passed)
                        failures.push('type check failed');
                    if (!qaResults.build_passed)
                        failures.push('build failed');
                }
                break;
            case enums_1.LifecyclePhase.COMPLETION_VALIDATION:
                const evidenceInventory = input.evidence.evidence_inventory;
                if (!evidenceInventory) {
                    failures.push('evidence_inventory is required');
                }
                else if (!evidenceInventory.verified) {
                    failures.push('evidence not verified');
                }
                break;
            case enums_1.LifecyclePhase.REPORT:
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
    handleCriticalError(error) {
        this.isError = true;
        // Mark current phase as failed
        const currentPhaseInfo = this.phases.get(this.currentPhase);
        if (currentPhaseInfo) {
            currentPhaseInfo.status = enums_1.PhaseStatus.FAILED;
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
    handleRecoverableError(phase, error) {
        const phaseInfo = this.phases.get(phase);
        if (!phaseInfo) {
            throw new LifecycleError(error_codes_1.ErrorCode.E204_LIFECYCLE_VIOLATION, 'Phase not found', { phase });
        }
        phaseInfo.retry_count++;
        if (phaseInfo.retry_count > this.maxRetries) {
            this.isError = true;
            throw new LifecycleError(error_codes_1.ErrorCode.E201_PHASE_EXECUTION_FAILURE, `Max retries (${this.maxRetries}) exceeded for phase ${phase}`, { phase, retry_count: phaseInfo.retry_count, error: error.message });
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
    setMaxRetries(count) {
        this.maxRetries = count;
    }
    /**
     * Get overall status
     */
    getOverallStatus() {
        // Priority: INVALID > ERROR > NO_EVIDENCE > INCOMPLETE > COMPLETE
        if (this.isInvalid)
            return enums_1.OverallStatus.INVALID;
        if (this.isError)
            return enums_1.OverallStatus.ERROR;
        if (this.isNoEvidence)
            return enums_1.OverallStatus.NO_EVIDENCE;
        if (this.isIncomplete)
            return enums_1.OverallStatus.INCOMPLETE;
        if (this.isCompleted)
            return enums_1.OverallStatus.COMPLETE;
        // Default to INCOMPLETE if not explicitly completed
        return enums_1.OverallStatus.INCOMPLETE;
    }
    /**
     * Check if lifecycle is complete
     */
    isComplete() {
        return this.isCompleted;
    }
    /**
     * Mark lifecycle as incomplete
     */
    markIncomplete(reason) {
        this.isIncomplete = true;
        this.emit('lifecycle_incomplete', {
            reason,
            session_id: this.sessionId,
        });
    }
    /**
     * Mark lifecycle as no evidence
     */
    markNoEvidence(reason) {
        this.isNoEvidence = true;
        this.emit('lifecycle_no_evidence', {
            reason,
            session_id: this.sessionId,
        });
    }
    /**
     * Mark lifecycle as invalid
     */
    markInvalid(reason) {
        this.isInvalid = true;
        this.emit('lifecycle_invalid', {
            reason,
            session_id: this.sessionId,
        });
    }
    /**
     * Update task status (for EXECUTION phase)
     */
    updateTaskStatus(update) {
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
        if (update.started_at)
            taskInfo.started_at = update.started_at;
        if (update.completed_at)
            taskInfo.completed_at = update.completed_at;
        if (update.evidence)
            taskInfo.evidence = update.evidence;
        this.emit('task_updated', {
            task_id: update.task_id,
            status: update.status,
            session_id: this.sessionId,
        });
    }
    /**
     * Get task info
     */
    getTaskInfo(taskId) {
        const taskInfo = this.tasks.get(taskId);
        if (!taskInfo) {
            return {
                task_id: taskId,
                status: enums_1.TaskStatus.PENDING,
            };
        }
        return { ...taskInfo };
    }
    /**
     * Get incomplete tasks
     */
    getIncompleteTasks() {
        const incomplete = [];
        for (const [taskId, taskInfo] of this.tasks) {
            if (taskInfo.status !== enums_1.TaskStatus.COMPLETED &&
                taskInfo.status !== enums_1.TaskStatus.COMPLETE) {
                incomplete.push(taskId);
            }
        }
        return incomplete;
    }
    /**
     * Generate final report
     */
    generateFinalReport() {
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
    setPhaseTimeout(phase, seconds) {
        this.phaseTimeouts.set(phase, seconds * 1000);
    }
    /**
     * Set phase start time (for testing)
     */
    setPhaseStartTimeForTesting(phase, timestamp) {
        this.phaseStartTimes.set(phase, timestamp);
    }
    /**
     * Check if phase is timed out
     */
    isPhaseTimedOut(phase) {
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
    checkAndHandleTimeout() {
        if (this.isPhaseTimedOut(this.currentPhase)) {
            this.markIncomplete(`Phase ${this.currentPhase} timed out`);
        }
    }
    /**
     * Start parallel tasks
     */
    startParallelTasks(taskIds) {
        for (const taskId of taskIds) {
            this.startParallelTask(taskId);
        }
    }
    /**
     * Start a single parallel task
     * @throws LifecycleError if executor limit exceeded
     */
    startParallelTask(taskId) {
        if (this.parallelTasks.size >= this.executorLimit) {
            throw new LifecycleError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor limit (${this.executorLimit}) exceeded`, { current: this.parallelTasks.size, limit: this.executorLimit });
        }
        this.parallelTasks.add(taskId);
        // Update task status
        this.updateTaskStatus({
            task_id: taskId,
            status: enums_1.TaskStatus.IN_PROGRESS,
            started_at: new Date().toISOString(),
        });
    }
    /**
     * Complete a parallel task
     */
    completeParallelTask(taskId, completion) {
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
    getParallelExecutionInfo() {
        return {
            active_count: this.parallelTasks.size,
            active_tasks: Array.from(this.parallelTasks),
            max_parallel: this.executorLimit,
        };
    }
    /**
     * Serialize lifecycle state
     */
    serialize() {
        const phasesRecord = {};
        for (const [phase, info] of this.phases) {
            phasesRecord[phase] = info;
        }
        const tasksRecord = {};
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
    static deserialize(state) {
        const controller = new LifecycleController();
        controller.sessionId = state.session_id;
        controller.currentPhase = state.current_phase;
        controller.phases.clear();
        for (const [phase, info] of Object.entries(state.phases)) {
            controller.phases.set(phase, info);
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
exports.LifecycleController = LifecycleController;
//# sourceMappingURL=lifecycle-controller.js.map