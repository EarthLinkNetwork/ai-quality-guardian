"use strict";
/**
 * Enumerations for PM Orchestrator Runner
 * Based on 05_DATA_MODELS.md and 03_LIFECYCLE.md specifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskGroupState = exports.RunTrigger = exports.RunStatus = exports.ThreadType = exports.EvidenceType = exports.LockType = exports.LifecyclePhase = exports.Phase = exports.AgentType = exports.PhaseStatus = exports.TaskStatus = exports.OverallStatus = void 0;
exports.getStatusPriority = getStatusPriority;
exports.aggregateStatus = aggregateStatus;
exports.isTerminalStatus = isTerminalStatus;
exports.getNextPhase = getNextPhase;
exports.isValidPhaseTransition = isValidPhaseTransition;
exports.getPhaseIndex = getPhaseIndex;
exports.getAllPhases = getAllPhases;
exports.isFirstPhase = isFirstPhase;
exports.isLastPhase = isLastPhase;
/**
 * Overall execution status
 * Priority order: INVALID > ERROR > NO_EVIDENCE > INCOMPLETE > COMPLETE
 */
var OverallStatus;
(function (OverallStatus) {
    OverallStatus["COMPLETE"] = "COMPLETE";
    OverallStatus["INCOMPLETE"] = "INCOMPLETE";
    OverallStatus["ERROR"] = "ERROR";
    OverallStatus["INVALID"] = "INVALID";
    OverallStatus["NO_EVIDENCE"] = "NO_EVIDENCE";
})(OverallStatus || (exports.OverallStatus = OverallStatus = {}));
/**
 * Task-level status
 */
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "PENDING";
    TaskStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TaskStatus["COMPLETE"] = "COMPLETE";
    TaskStatus["COMPLETED"] = "COMPLETED";
    TaskStatus["INCOMPLETE"] = "INCOMPLETE";
    TaskStatus["ERROR"] = "ERROR";
    TaskStatus["INVALID"] = "INVALID";
    TaskStatus["NO_EVIDENCE"] = "NO_EVIDENCE";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
/**
 * Phase status
 */
var PhaseStatus;
(function (PhaseStatus) {
    PhaseStatus["PENDING"] = "PENDING";
    PhaseStatus["IN_PROGRESS"] = "IN_PROGRESS";
    PhaseStatus["COMPLETED"] = "COMPLETED";
    PhaseStatus["FAILED"] = "FAILED";
    PhaseStatus["SKIPPED"] = "SKIPPED";
})(PhaseStatus || (exports.PhaseStatus = PhaseStatus = {}));
/**
 * Agent types for L1/L2 pools
 */
var AgentType;
(function (AgentType) {
    AgentType["READER"] = "READER";
    AgentType["WRITER"] = "WRITER";
    AgentType["EXECUTOR"] = "EXECUTOR";
})(AgentType || (exports.AgentType = AgentType = {}));
/**
 * Lifecycle phases in execution order
 * 7-phase lifecycle based on 03_LIFECYCLE.md
 */
var Phase;
(function (Phase) {
    Phase["REQUIREMENT_ANALYSIS"] = "REQUIREMENT_ANALYSIS";
    Phase["TASK_DECOMPOSITION"] = "TASK_DECOMPOSITION";
    Phase["PLANNING"] = "PLANNING";
    Phase["EXECUTION"] = "EXECUTION";
    Phase["QA"] = "QA";
    Phase["COMPLETION_VALIDATION"] = "COMPLETION_VALIDATION";
    Phase["REPORT"] = "REPORT";
})(Phase || (exports.Phase = Phase = {}));
/**
 * Alias for Phase for backward compatibility
 */
exports.LifecyclePhase = Phase;
/**
 * Lock types for resource locking
 */
var LockType;
(function (LockType) {
    LockType["READ"] = "READ";
    LockType["WRITE"] = "WRITE";
})(LockType || (exports.LockType = LockType = {}));
/**
 * Evidence types
 */
var EvidenceType;
(function (EvidenceType) {
    EvidenceType["FILE"] = "FILE";
    EvidenceType["LOG"] = "LOG";
    EvidenceType["SCREENSHOT"] = "SCREENSHOT";
    EvidenceType["TEST_RESULT"] = "TEST_RESULT";
    EvidenceType["COMMAND_OUTPUT"] = "COMMAND_OUTPUT";
    EvidenceType["DIFF"] = "DIFF";
    EvidenceType["METRIC"] = "METRIC";
})(EvidenceType || (exports.EvidenceType = EvidenceType = {}));
/**
 * Status priority values (higher = more severe)
 */
const STATUS_PRIORITY = {
    [OverallStatus.COMPLETE]: 0,
    [OverallStatus.INCOMPLETE]: 1,
    [OverallStatus.NO_EVIDENCE]: 2,
    [OverallStatus.ERROR]: 3,
    [OverallStatus.INVALID]: 4,
};
/**
 * Get the priority value for a status
 * Higher values indicate more severe/important status
 */
function getStatusPriority(status) {
    return STATUS_PRIORITY[status];
}
/**
 * Aggregate multiple statuses into the highest priority status
 */
function aggregateStatus(statuses) {
    if (statuses.length === 0) {
        return OverallStatus.COMPLETE;
    }
    let highestStatus = OverallStatus.COMPLETE;
    let highestPriority = 0;
    for (const status of statuses) {
        const priority = getStatusPriority(status);
        if (priority > highestPriority) {
            highestPriority = priority;
            highestStatus = status;
        }
    }
    return highestStatus;
}
/**
 * Check if a status is terminal (cannot be changed)
 */
function isTerminalStatus(status) {
    return status === OverallStatus.COMPLETE ||
        status === OverallStatus.ERROR ||
        status === OverallStatus.INVALID ||
        status === OverallStatus.NO_EVIDENCE;
}
/**
 * Phase order for transitions
 */
const PHASE_ORDER = [
    Phase.REQUIREMENT_ANALYSIS,
    Phase.TASK_DECOMPOSITION,
    Phase.PLANNING,
    Phase.EXECUTION,
    Phase.QA,
    Phase.COMPLETION_VALIDATION,
    Phase.REPORT,
];
/**
 * Get the next phase in the lifecycle
 * Returns null if already at the final phase
 */
function getNextPhase(currentPhase) {
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
        return null;
    }
    return PHASE_ORDER[currentIndex + 1];
}
/**
 * Check if a phase transition is valid
 * Only allows moving to the immediate next phase
 */
function isValidPhaseTransition(fromPhase, toPhase) {
    const nextPhase = getNextPhase(fromPhase);
    return nextPhase === toPhase;
}
/**
 * Get the index of a phase in the lifecycle
 */
function getPhaseIndex(phase) {
    return PHASE_ORDER.indexOf(phase);
}
/**
 * Get all phases
 */
function getAllPhases() {
    return [...PHASE_ORDER];
}
/**
 * Check if phase is the first phase
 */
function isFirstPhase(phase) {
    return phase === Phase.REQUIREMENT_ANALYSIS;
}
/**
 * Check if phase is the last phase
 */
function isLastPhase(phase) {
    return phase === Phase.REPORT;
}
/**
 * Thread types
 * Per spec 05_DATA_MODELS.md L59-66
 */
var ThreadType;
(function (ThreadType) {
    /** Main conversation thread (user interaction) */
    ThreadType["MAIN"] = "main";
    /** Background execution thread (Executor processing) */
    ThreadType["BACKGROUND"] = "background";
    /** System internal thread */
    ThreadType["SYSTEM"] = "system";
})(ThreadType || (exports.ThreadType = ThreadType = {}));
/**
 * Run status
 * Per spec 05_DATA_MODELS.md L89-96
 */
var RunStatus;
(function (RunStatus) {
    /** Currently executing */
    RunStatus["RUNNING"] = "RUNNING";
    /** Successfully completed */
    RunStatus["COMPLETED"] = "COMPLETED";
    /** Ended with error */
    RunStatus["FAILED"] = "FAILED";
    /** Cancelled by user or system */
    RunStatus["CANCELLED"] = "CANCELLED";
})(RunStatus || (exports.RunStatus = RunStatus = {}));
/**
 * Run trigger
 * Per spec 05_DATA_MODELS.md L98-104
 */
var RunTrigger;
(function (RunTrigger) {
    /** Started by user input */
    RunTrigger["USER_INPUT"] = "USER_INPUT";
    /** Started by user response */
    RunTrigger["USER_RESPONSE"] = "USER_RESPONSE";
    /** Started by auto-continuation */
    RunTrigger["CONTINUATION"] = "CONTINUATION";
    /** Started by Executor processing */
    RunTrigger["EXECUTOR"] = "EXECUTOR";
})(RunTrigger || (exports.RunTrigger = RunTrigger = {}));
/**
 * Task Group context state
 * Per spec 16_TASK_GROUP.md L132-143
 */
var TaskGroupState;
(function (TaskGroupState) {
    /** Task Group created but not yet active */
    TaskGroupState["CREATED"] = "created";
    /** Task Group is active and accepting tasks */
    TaskGroupState["ACTIVE"] = "active";
    /** Task Group is paused by user */
    TaskGroupState["PAUSED"] = "paused";
    /** Task Group is completed (read-only) */
    TaskGroupState["COMPLETED"] = "completed";
})(TaskGroupState || (exports.TaskGroupState = TaskGroupState = {}));
//# sourceMappingURL=enums.js.map