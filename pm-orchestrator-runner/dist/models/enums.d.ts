/**
 * Enumerations for PM Orchestrator Runner
 * Based on 05_DATA_MODELS.md and 03_LIFECYCLE.md specifications
 */
/**
 * Overall execution status
 * Priority order: INVALID > ERROR > NO_EVIDENCE > INCOMPLETE > COMPLETE
 */
export declare enum OverallStatus {
    COMPLETE = "COMPLETE",
    INCOMPLETE = "INCOMPLETE",
    ERROR = "ERROR",
    INVALID = "INVALID",
    NO_EVIDENCE = "NO_EVIDENCE"
}
/**
 * Task-level status
 */
export declare enum TaskStatus {
    PENDING = "PENDING",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETE = "COMPLETE",
    COMPLETED = "COMPLETED",
    INCOMPLETE = "INCOMPLETE",
    ERROR = "ERROR",
    INVALID = "INVALID",
    NO_EVIDENCE = "NO_EVIDENCE"
}
/**
 * Phase status
 */
export declare enum PhaseStatus {
    PENDING = "PENDING",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    SKIPPED = "SKIPPED"
}
/**
 * Agent types for L1/L2 pools
 */
export declare enum AgentType {
    READER = "READER",
    WRITER = "WRITER",
    EXECUTOR = "EXECUTOR"
}
/**
 * Lifecycle phases in execution order
 * 7-phase lifecycle based on 03_LIFECYCLE.md
 */
export declare enum Phase {
    REQUIREMENT_ANALYSIS = "REQUIREMENT_ANALYSIS",
    TASK_DECOMPOSITION = "TASK_DECOMPOSITION",
    PLANNING = "PLANNING",
    EXECUTION = "EXECUTION",
    QA = "QA",
    COMPLETION_VALIDATION = "COMPLETION_VALIDATION",
    REPORT = "REPORT"
}
/**
 * Alias for Phase for backward compatibility
 */
export declare const LifecyclePhase: typeof Phase;
export type LifecyclePhase = Phase;
/**
 * Lock types for resource locking
 */
export declare enum LockType {
    READ = "READ",
    WRITE = "WRITE"
}
/**
 * Evidence types
 */
export declare enum EvidenceType {
    FILE = "FILE",
    LOG = "LOG",
    SCREENSHOT = "SCREENSHOT",
    TEST_RESULT = "TEST_RESULT",
    COMMAND_OUTPUT = "COMMAND_OUTPUT",
    DIFF = "DIFF",
    METRIC = "METRIC"
}
/**
 * Get the priority value for a status
 * Higher values indicate more severe/important status
 */
export declare function getStatusPriority(status: OverallStatus): number;
/**
 * Aggregate multiple statuses into the highest priority status
 */
export declare function aggregateStatus(statuses: OverallStatus[]): OverallStatus;
/**
 * Check if a status is terminal (cannot be changed)
 */
export declare function isTerminalStatus(status: OverallStatus): boolean;
/**
 * Get the next phase in the lifecycle
 * Returns null if already at the final phase
 */
export declare function getNextPhase(currentPhase: Phase): Phase | null;
/**
 * Check if a phase transition is valid
 * Only allows moving to the immediate next phase
 */
export declare function isValidPhaseTransition(fromPhase: Phase, toPhase: Phase): boolean;
/**
 * Get the index of a phase in the lifecycle
 */
export declare function getPhaseIndex(phase: Phase): number;
/**
 * Get all phases
 */
export declare function getAllPhases(): Phase[];
/**
 * Check if phase is the first phase
 */
export declare function isFirstPhase(phase: Phase): boolean;
/**
 * Check if phase is the last phase
 */
export declare function isLastPhase(phase: Phase): boolean;
/**
 * Executor blocking reasons
 * Per spec 05_DATA_MODELS.md - Property 34-36 non-interactive guarantees
 */
export type BlockedReason = 'INTERACTIVE_PROMPT' | 'TIMEOUT' | 'STDIN_REQUIRED';
/**
 * Executor termination triggers
 * Per spec 05_DATA_MODELS.md - Property 34-36 non-interactive guarantees
 */
export type TerminatedBy = 'REPL_FAIL_CLOSED' | 'USER' | 'TIMEOUT';
/**
 * Thread types
 * Per spec 05_DATA_MODELS.md L59-66
 */
export declare enum ThreadType {
    /** Main conversation thread (user interaction) */
    MAIN = "main",
    /** Background execution thread (Executor processing) */
    BACKGROUND = "background",
    /** System internal thread */
    SYSTEM = "system"
}
/**
 * Run status
 * Per spec 05_DATA_MODELS.md L89-96
 */
export declare enum RunStatus {
    /** Currently executing */
    RUNNING = "RUNNING",
    /** Successfully completed */
    COMPLETED = "COMPLETED",
    /** Ended with error */
    FAILED = "FAILED",
    /** Cancelled by user or system */
    CANCELLED = "CANCELLED"
}
/**
 * Run trigger
 * Per spec 05_DATA_MODELS.md L98-104
 */
export declare enum RunTrigger {
    /** Started by user input */
    USER_INPUT = "USER_INPUT",
    /** Started by user response */
    USER_RESPONSE = "USER_RESPONSE",
    /** Started by auto-continuation */
    CONTINUATION = "CONTINUATION",
    /** Started by Executor processing */
    EXECUTOR = "EXECUTOR"
}
/**
 * Task Group context state
 * Per spec 16_TASK_GROUP.md L132-143
 */
export declare enum TaskGroupState {
    /** Task Group created but not yet active */
    CREATED = "created",
    /** Task Group is active and accepting tasks */
    ACTIVE = "active",
    /** Task Group is paused by user */
    PAUSED = "paused",
    /** Task Group is completed (read-only) */
    COMPLETED = "completed"
}
//# sourceMappingURL=enums.d.ts.map