/**
 * Runner Core
 * Based on 04_COMPONENTS.md L196-240
 *
 * Responsible for:
 * - Orchestrating all components
 * - Managing lifecycle execution
 * - Task coordination
 * - Resource management
 * - Error handling
 * - Evidence collection
 * - Session state management
 */
import { EventEmitter } from 'events';
import { ConfigurationManager } from '../config/configuration-manager';
import { SessionManager } from '../session/session-manager';
import { EvidenceManager } from '../evidence/evidence-manager';
import { LockManager } from '../locks/lock-manager';
import { ResourceLimitManager } from '../limits/resource-limit-manager';
import { ContinuationControlManager } from '../continuation/continuation-control-manager';
import { OutputControlManager } from '../output/output-control-manager';
import { LifecycleController } from '../lifecycle/lifecycle-controller';
import { L1SubagentPool, L2ExecutorPool } from '../pool/agent-pool';
import { OverallStatus, Phase, TaskStatus } from '../models/enums';
import { Session, SessionStatus } from '../models/session';
import { ErrorCode } from '../errors/error-codes';
import { IExecutor } from '../executor/claude-code-executor';
import { UserResponseHandler } from '../executor/auto-resolve-executor';
import { ClarificationReason } from '../mediation/llm-mediation-layer';
import { Template } from '../template';
/**
 * Runner Core Error
 */
export declare class RunnerCoreError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Runner options
 */
export interface RunnerOptions {
    evidenceDir: string;
    continueOnTaskFailure?: boolean;
    resourceLimits?: {
        max_files?: number;
        max_tests?: number;
        max_seconds?: number;
    };
    /** Enable Claude Code CLI execution for natural language tasks */
    useClaudeCode?: boolean;
    /** Timeout for Claude Code execution in milliseconds */
    claudeCodeTimeout?: number;
    /**
     * Enable LLM-based auto-resolution of clarification questions.
     * When enabled, uses AutoResolvingExecutor instead of ClaudeCodeExecutor.
     * Requires API keys (OPENAI_API_KEY or ANTHROPIC_API_KEY) to be set.
     */
    enableAutoResolve?: boolean;
    /** LLM provider for auto-resolution (default: openai) */
    autoResolveLLMProvider?: 'openai' | 'anthropic';
    /** Handler for clarification questions that LLM cannot auto-resolve */
    userResponseHandler?: UserResponseHandler;
    /**
     * Injected executor for dependency injection (testing).
     * If provided, this executor is used instead of creating ClaudeCodeExecutor.
     * Requires useClaudeCode: true.
     */
    executor?: IExecutor;
}
/**
 * Task definition
 */
interface Task {
    id: string;
    description?: string;
    dependencies?: string[];
    willFail?: boolean;
    naturalLanguageTask?: string;
    /**
     * Task type for completion judgment.
     * READ_INFO/REPORT tasks don't require file changes - response output becomes evidence.
     */
    taskType?: 'READ_INFO' | 'IMPLEMENTATION' | 'REPORT' | string;
    expectedOutcome?: {
        type: string;
        path?: string;
    };
    sideEffectVerification?: {
        type: string;
        path?: string;
    };
}
/**
 * Task result
 */
interface TaskResult {
    task_id: string;
    status: TaskStatus;
    started_at: string;
    completed_at?: string;
    error?: Error;
    evidence?: Record<string, unknown>;
    /** True if Runner needs clarification before proceeding */
    clarification_needed?: boolean;
    /** Structured reason code for clarification (LLM layer generates questions) */
    clarification_reason?: ClarificationReason;
    /** Target file if identified (fact, not conversation) */
    target_file?: string;
    /** Original prompt for context */
    original_prompt?: string;
}
/**
 * Execution config
 */
interface ExecutionConfig {
    tasks: Task[];
    /** Model to use for Claude Code execution (from REPL .claude/repl.json) */
    selectedModel?: string;
}
/**
 * Execution result
 */
/**
 * Executor mode for visibility
 * Per redesign: Users need to see which executor is being used
 */
type ExecutorMode = 'claude-code' | 'api' | 'stub' | 'recovery-stub' | 'deterministic' | 'none';
interface ExecutionResult {
    session_id: string;
    overall_status: OverallStatus;
    tasks_completed: number;
    tasks_total: number;
    next_action: boolean;
    /** Structured reason code when next_action=true (LLM layer generates questions) */
    clarification_reason?: ClarificationReason;
    /** Target file if identified (fact, not conversation) */
    target_file?: string;
    /** Original prompt for context */
    original_prompt?: string;
    error?: Error;
    incomplete_task_reasons?: Array<{
        task_id: string;
        reason: string;
    }>;
    /** Executor mode used for this execution (visibility) */
    executor_mode?: ExecutorMode;
    /** Summary of executor output (visibility) */
    executor_output_summary?: string;
    /** Files modified during execution (visibility) */
    files_modified?: string[];
    /** Execution duration in ms */
    duration_ms?: number;
}
/**
 * Check result for resource limits
 */
interface CheckResult {
    allowed: boolean;
    violation?: {
        limit_type: string;
        current: number;
        limit: number;
    };
}
/**
 * Time limit check result
 */
interface TimeLimitResult {
    exceeded: boolean;
}
/**
 * Resource limits
 */
interface ResourceLimits {
    max_files: number;
    max_tests: number;
    max_seconds: number;
}
/**
 * Resource statistics
 */
interface ResourceStats {
    files_used: number;
    tests_run: number;
    elapsed_seconds: number;
}
/**
 * Pool statistics
 */
interface PoolStats {
    total_capacity: number;
    active_count: number;
    available_slots: number;
}
/**
 * Session state for external access
 */
interface SessionState {
    session_id: string;
    status: SessionStatus;
    current_phase: Phase;
    started_at: string;
    target_project: string;
}
/**
 * Error evidence
 */
interface ErrorEvidence {
    error: Error;
    task_id?: string;
    timestamp: string;
}
/**
 * Advance phase options
 */
interface AdvancePhaseOptions {
    evidence: Record<string, unknown>;
}
/**
 * Output result
 */
interface OutputResult {
    session_id: string;
    overall_status: OverallStatus;
    next_action: boolean;
    incomplete_task_reasons?: Array<{
        task_id: string;
        reason: string;
    }>;
}
/**
 * Runner Core class
 */
export declare class RunnerCore extends EventEmitter {
    private readonly options;
    private readonly continueOnTaskFailure;
    private configManager;
    private sessionManager;
    private evidenceManager;
    private lockManager;
    private resourceLimitManager;
    private continuationManager;
    private outputManager;
    private lifecycleController;
    private l1Pool;
    private l2Pool;
    private session;
    private sessionDir;
    private taskResults;
    private errorEvidence;
    private overallStatus;
    private incompleteReasons;
    private resourceStats;
    private resourceLimits;
    private elapsedTimeOverride;
    private initialized;
    private claudeCodeExecutor;
    private currentExecutorMode;
    private lastExecutorOutput;
    private lastFilesModified;
    private lastExecutionDurationMs;
    private taskLogManager;
    private taskLogThread;
    private taskLogRun;
    private currentSelectedModel;
    private promptAssembler;
    private currentTaskGroupContext;
    private templateProvider;
    private stateDir;
    /**
     * Create a new RunnerCore
     */
    constructor(options: RunnerOptions);
    /**
     * Set the template provider callback
     *
     * Per spec 32_TEMPLATE_INJECTION.md:
     * This callback is invoked during prompt assembly to get the active template.
     * The template's rulesText and outputFormatText will be injected into prompts.
     *
     * @param provider - Function that returns the active template or null
     */
    setTemplateProvider(provider: () => Template | null): void;
    /**
     * Initialize the runner with a target project
     */
    initialize(targetProject: string): Promise<Session>;
    /**
     * Parse and apply configuration from YAML
     */
    private parseAndApplyConfig;
    /**
     * Execute the full lifecycle with tasks
     */
    execute(config: ExecutionConfig): Promise<ExecutionResult>;
    /**
     * Execute tasks sequentially
     */
    executeTasksSequentially(tasks: Task[]): Promise<void>;
    /**
     * Execute tasks in parallel
     */
    executeTasksParallel(tasks: Task[]): Promise<void>;
    /**
     * Execute tasks respecting dependencies
     */
    executeTasksWithDependencies(tasks: Task[]): Promise<void>;
    /**
     * Execute a single task
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 7 & 8:
     * - All operations MUST generate Evidence
     * - COMPLETE only when task completed + evidence collected
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 26: Fail-Closed Logging
     * - TaskLog MUST be saved for ALL terminal states (COMPLETE, INCOMPLETE, ERROR)
     */
    private executeTask;
    /**
     * Structured clarification result from Runner
     * Runner returns ONLY facts and structured reason codes.
     * LLM Mediation Layer is responsible for generating questions.
     */
    private ClarificationResult;
    /**
     * Check if a task needs clarification before execution.
     * Per spec Property 8: Runner is sole completion authority.
     * Runner may request clarification BEFORE calling Executor if task is ambiguous.
     *
     * ARCHITECTURAL RULE: Runner returns ONLY structured signals (facts).
     * LLM Mediation Layer generates all natural language questions.
     *
     * Trigger conditions:
     * - "create/add/update" type keywords + file exists → target_file_exists
     * - "create/add/update" type keywords + no identifiable target → target_file_ambiguous
     * - "fix/change/modify" type keywords + no identifiable target → target_action_ambiguous
     *
     * @param task - Task to check
     * @returns Structured clarification signal (no conversational text)
     */
    private needsClarification;
    /**
     * Check if prompt is truly ambiguous (no identifiable target at all).
     * Examples of truly ambiguous: "何か作成して", "create something"
     * Examples of not ambiguous: "configを作って" (mentions a recognizable name)
     */
    private isTrulyAmbiguous;
    /**
     * Extract target file/path from natural language prompt.
     * Returns the file path if identifiable, or null if ambiguous.
     *
     * @param prompt - Natural language prompt
     * @returns Extracted file path or null
     */
    private extractTargetFile;
    /**
     * Parse natural language task for file creation
     */
    private parseFileCreationTask;
    /**
     * Generate file content based on task
     */
    private generateFileContent;
    /**
     * Complete all lifecycle phases
     */
    private completeLifecycle;
    /**
     * Get evidence for a specific phase
     */
    private getPhaseEvidence;
    /**
     * Advance to the next phase
     */
    advancePhase(options: AdvancePhaseOptions): void;
    /**
     * Save session state
     */
    saveState(): Promise<void>;
    /**
     * Complete the session - update status to COMPLETED or FAILED
     * Must be called before saveState() to ensure correct status is persisted
     */
    completeSession(failed?: boolean): Promise<void>;
    /**
     * Resume from a saved session
     */
    resume(sessionId: string): Promise<void>;
    /**
     * Shutdown the runner
     */
    shutdown(): Promise<void>;
    /**
     * Generate output result
     */
    generateOutput(): OutputResult;
    /**
     * Record a file operation
     */
    recordFileOperation(filePath: string): void;
    /**
     * Check and record a file operation
     */
    checkAndRecordFileOperation(filePath: string): CheckResult;
    /**
     * Set elapsed time for testing
     */
    setElapsedTimeForTesting(seconds: number): void;
    /**
     * Check time limit
     */
    checkTimeLimit(): TimeLimitResult;
    /**
     * Acquire an executor
     */
    acquireExecutor(executorId: string): Promise<void>;
    /**
     * Mark status as incomplete
     */
    markIncomplete(reason: string): void;
    /**
     * Mark status as no evidence
     */
    markNoEvidence(reason: string): void;
    /**
     * Mark status as invalid
     */
    markInvalid(reason: string): void;
    /**
     * Trigger a critical error
     */
    triggerCriticalError(error: Error): void;
    /**
     * Get session directory
     */
    getSessionDirectory(): string;
    /**
     * Get current phase
     */
    getCurrentPhase(): Phase;
    /**
     * Get L1 pool statistics
     */
    getL1PoolStats(): PoolStats;
    /**
     * Get L2 pool statistics
     */
    getL2PoolStats(): PoolStats;
    /**
     * Get session ID
     */
    getSessionId(): string;
    /**
     * Get task results
     */
    getTaskResults(): TaskResult[];
    /**
     * Get overall status
     */
    getOverallStatus(): OverallStatus;
    /**
     * Get resource limits
     */
    getResourceLimits(): ResourceLimits;
    /**
     * Get resource statistics
     */
    getResourceStats(): ResourceStats;
    /**
     * Get session state
     */
    getSessionState(): SessionState;
    /**
     * Get error evidence
     */
    getErrorEvidence(): ErrorEvidence[];
    /**
     * Get evidence files
     */
    getEvidenceFiles(): string[];
    /**
     * Get configuration manager
     */
    getConfigManager(): ConfigurationManager;
    /**
     * Get session manager
     */
    getSessionManager(): SessionManager;
    /**
     * Get evidence manager
     */
    getEvidenceManager(): EvidenceManager;
    /**
     * Get lock manager
     */
    getLockManager(): LockManager;
    /**
     * Get resource limit manager
     */
    getResourceLimitManager(): ResourceLimitManager;
    /**
     * Get continuation manager
     */
    getContinuationManager(): ContinuationControlManager;
    /**
     * Get output manager
     */
    getOutputManager(): OutputControlManager;
    /**
     * Get lifecycle controller
     */
    getLifecycleController(): LifecycleController;
    /**
     * Get L1 pool
     */
    getL1Pool(): L1SubagentPool;
    /**
     * Get L2 pool
     */
    getL2Pool(): L2ExecutorPool;
}
export {};
//# sourceMappingURL=runner-core.d.ts.map