/**
 * Task Orchestrator Module
 *
 * Integrates TaskPlanner, RetryManager, and ModelPolicyManager
 * to provide unified task orchestration with:
 * - Automatic task sizing and chunking
 * - Phase-based model selection
 * - Intelligent retry and escalation
 *
 * Per specs:
 * - 29_TASK_PLANNING.md (Task Planning)
 * - 30_RETRY_AND_RECOVERY.md (Retry and Recovery)
 * - 31_PROVIDER_MODEL_POLICY.md (Model Policy)
 */
import type { ConversationTracer } from '../trace/conversation-tracer';
import { TaskPlanner, type TaskPlannerConfig, type ExecutionPlan, type PlanningSubtask } from '../planning';
import { RetryManager, type RetryManagerConfig, type RetryDecision, type EscalationReport, type RecoveryStrategy, type FailureType } from '../retry';
import { ModelPolicyManager, type ModelPolicyManagerConfig, type ModelSelection, type UsageSummary, type CostLimitCheck } from '../model-policy';
/**
 * Task orchestration status
 */
export type OrchestrationStatus = 'PLANNING' | 'EXECUTING' | 'RETRYING' | 'ESCALATED' | 'COMPLETED' | 'FAILED';
/**
 * Orchestration event types
 */
export type OrchestrationEventType = 'ORCHESTRATION_STARTED' | 'PLANNING_STARTED' | 'PLANNING_COMPLETED' | 'MODEL_SELECTED' | 'SUBTASK_STARTED' | 'SUBTASK_COMPLETED' | 'SUBTASK_FAILED' | 'RETRY_TRIGGERED' | 'ESCALATION_TRIGGERED' | 'RECOVERY_STARTED' | 'RECOVERY_COMPLETED' | 'ORCHESTRATION_COMPLETED' | 'COST_LIMIT_WARNING';
/**
 * Orchestration event
 */
export interface OrchestrationEvent {
    type: OrchestrationEventType;
    timestamp: string;
    task_id: string;
    details: Record<string, unknown>;
}
/**
 * Orchestration event callback
 */
export type OrchestrationEventCallback = (event: OrchestrationEvent) => void;
/**
 * Task input for orchestration
 */
export interface TaskInput {
    /** Task identifier */
    task_id: string;
    /** Natural language task description */
    description: string;
    /** Optional token count estimate */
    estimated_tokens?: number;
    /** Optional file count estimate */
    estimated_files?: number;
    /** Optional complexity indicator */
    complexity?: 'low' | 'medium' | 'high';
    /** Optional user override for model */
    model_override?: string;
    /** Optional retry context */
    retry_context?: {
        retry_count: number;
        last_failure_type?: FailureType;
    };
}
/**
 * Subtask execution result
 */
export interface SubtaskExecutionResult {
    subtask_id: string;
    status: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
    output?: string;
    error_message?: string;
    failure_type?: FailureType;
    duration_ms?: number;
    tokens_used?: {
        input: number;
        output: number;
    };
}
/**
 * Orchestrated task result
 */
export interface OrchestratedTaskResult {
    task_id: string;
    status: OrchestrationStatus;
    plan?: ExecutionPlan;
    subtask_results: SubtaskExecutionResult[];
    model_selections: ModelSelection[];
    retry_decisions: RetryDecision[];
    escalation_report?: EscalationReport;
    recovery_strategy?: RecoveryStrategy;
    total_duration_ms: number;
    total_cost: number;
    completed_at: string;
}
/**
 * Subtask executor function type
 * Provided by the caller to execute individual subtasks
 */
export type SubtaskExecutor = (subtask: PlanningSubtask, model: ModelSelection) => Promise<SubtaskExecutionResult>;
/**
 * Task orchestrator configuration
 */
export interface TaskOrchestratorConfig {
    /** Task planner configuration */
    planner?: Partial<TaskPlannerConfig>;
    /** Retry manager configuration */
    retry?: Partial<RetryManagerConfig>;
    /** Model policy configuration */
    model_policy?: Partial<ModelPolicyManagerConfig>;
    /** Maximum parallel subtasks */
    max_parallel_subtasks?: number;
    /** Enable automatic chunking */
    auto_chunking?: boolean;
    /** Enable automatic model escalation on retry */
    auto_model_escalation?: boolean;
    /** Cost limit warning threshold (percentage) */
    cost_warning_threshold?: number;
}
/**
 * Default orchestrator configuration
 */
export declare const DEFAULT_ORCHESTRATOR_CONFIG: TaskOrchestratorConfig;
/**
 * Task Orchestrator
 *
 * Coordinates TaskPlanner, RetryManager, and ModelPolicyManager
 * to provide intelligent task execution with automatic planning,
 * model selection, and retry handling.
 */
export declare class TaskOrchestrator {
    private readonly config;
    private readonly planner;
    private readonly retryManager;
    private readonly modelPolicy;
    private readonly eventCallback?;
    private readonly tracer?;
    private currentTaskId;
    private currentStatus;
    private orchestrationStartTime;
    constructor(config?: Partial<TaskOrchestratorConfig>, eventCallback?: OrchestrationEventCallback, tracer?: ConversationTracer);
    /**
     * Orchestrate task execution
     *
     * Main entry point for task orchestration:
     * 1. Plan the task (size estimation, chunking)
     * 2. Select models for each phase
     * 3. Execute subtasks with retry handling
     * 4. Handle escalation if needed
     * 5. Return comprehensive result
     */
    orchestrate(input: TaskInput, executor: SubtaskExecutor): Promise<OrchestratedTaskResult>;
    /**
     * Plan a task using the TaskPlanner
     */
    private planTask;
    /**
     * Select model for a phase
     */
    private selectModelForPhase;
    /**
     * Execute subtasks with retry handling
     */
    private executeSubtasks;
    /**
     * Execute a single subtask with retry handling
     */
    private executeSubtaskWithRetry;
    /**
     * Determine final orchestration status
     */
    private determineFinalStatus;
    /**
     * Calculate total cost from model usage
     */
    private calculateTotalCost;
    /**
     * Check cost warning threshold
     */
    private checkCostWarning;
    /**
     * Emit orchestration event
     */
    private emitEvent;
    /**
     * Forward planner events
     */
    private forwardPlannerEvent;
    /**
     * Forward retry events
     */
    private forwardRetryEvent;
    /**
     * Forward model policy events
     */
    private forwardModelPolicyEvent;
    /**
     * Utility: delay execution
     */
    private delay;
    /**
     * Get the task planner instance
     */
    getPlanner(): TaskPlanner;
    /**
     * Get the retry manager instance
     */
    getRetryManager(): RetryManager;
    /**
     * Get the model policy manager instance
     */
    getModelPolicy(): ModelPolicyManager;
    /**
     * Get usage summary
     */
    getUsageSummary(startDate?: Date, endDate?: Date): UsageSummary;
    /**
     * Check cost limit status
     */
    checkCostLimit(): CostLimitCheck;
    /**
     * Set model profile
     */
    setModelProfile(profileName: string): boolean;
}
//# sourceMappingURL=task-orchestrator.d.ts.map