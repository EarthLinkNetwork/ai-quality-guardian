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
import {
  TaskPlanner,
  type TaskPlannerConfig,
  type SizeEstimation,
  type ChunkingRecommendation,
  type ExecutionPlan,
  type PlanningSubtask,
  DEFAULT_TASK_PLANNER_CONFIG,
} from '../planning';
import {
  RetryManager,
  type RetryManagerConfig,
  type RetryDecision,
  type EscalationReport,
  type RecoveryStrategy,
  type FailureType,
  type TaskResult,
  DEFAULT_RETRY_MANAGER_CONFIG,
} from '../retry';
import {
  ModelPolicyManager,
  type ModelPolicyManagerConfig,
  type ModelSelection,
  type TaskPhase,
  type UsageSummary,
  type CostLimitCheck,
  DEFAULT_MODEL_POLICY_CONFIG,
} from '../model-policy';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Task orchestration status
 */
export type OrchestrationStatus =
  | 'PLANNING'
  | 'EXECUTING'
  | 'RETRYING'
  | 'ESCALATED'
  | 'COMPLETED'
  | 'FAILED';

/**
 * Orchestration event types
 */
export type OrchestrationEventType =
  | 'ORCHESTRATION_STARTED'
  | 'PLANNING_STARTED'
  | 'PLANNING_COMPLETED'
  | 'MODEL_SELECTED'
  | 'SUBTASK_STARTED'
  | 'SUBTASK_COMPLETED'
  | 'SUBTASK_FAILED'
  | 'RETRY_TRIGGERED'
  | 'ESCALATION_TRIGGERED'
  | 'RECOVERY_STARTED'
  | 'RECOVERY_COMPLETED'
  | 'ORCHESTRATION_COMPLETED'
  | 'COST_LIMIT_WARNING';

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
export type SubtaskExecutor = (
  subtask: PlanningSubtask,
  model: ModelSelection
) => Promise<SubtaskExecutionResult>;

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
export const DEFAULT_ORCHESTRATOR_CONFIG: TaskOrchestratorConfig = {
  max_parallel_subtasks: 3,
  auto_chunking: true,
  auto_model_escalation: true,
  cost_warning_threshold: 80,
};

// ============================================================
// Task Orchestrator Class
// ============================================================

/**
 * Task Orchestrator
 *
 * Coordinates TaskPlanner, RetryManager, and ModelPolicyManager
 * to provide intelligent task execution with automatic planning,
 * model selection, and retry handling.
 */
export class TaskOrchestrator {
  private readonly config: TaskOrchestratorConfig;
  private readonly planner: TaskPlanner;
  private readonly retryManager: RetryManager;
  private readonly modelPolicy: ModelPolicyManager;
  private readonly eventCallback?: OrchestrationEventCallback;
  private readonly tracer?: ConversationTracer;

  // State tracking
  private currentTaskId: string | null = null;
  private currentStatus: OrchestrationStatus = 'PLANNING';
  private orchestrationStartTime: number = 0;

  constructor(
    config: Partial<TaskOrchestratorConfig> = {},
    eventCallback?: OrchestrationEventCallback,
    tracer?: ConversationTracer
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.eventCallback = eventCallback;
    this.tracer = tracer;

    // Initialize sub-components with event forwarding
    this.planner = new TaskPlanner(
      { ...DEFAULT_TASK_PLANNER_CONFIG, ...config.planner },
      (eventType, content) => this.forwardPlannerEvent(eventType, content),
      tracer
    );

    this.retryManager = new RetryManager(
      { ...DEFAULT_RETRY_MANAGER_CONFIG, ...config.retry },
      (event) => this.forwardRetryEvent(event),
      tracer
    );

    this.modelPolicy = new ModelPolicyManager(
      { ...DEFAULT_MODEL_POLICY_CONFIG, ...config.model_policy },
      (event) => this.forwardModelPolicyEvent(event),
      tracer
    );
  }

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
  async orchestrate(
    input: TaskInput,
    executor: SubtaskExecutor
  ): Promise<OrchestratedTaskResult> {
    this.orchestrationStartTime = Date.now();
    this.currentTaskId = input.task_id;
    this.currentStatus = 'PLANNING';

    const result: OrchestratedTaskResult = {
      task_id: input.task_id,
      status: 'PLANNING',
      subtask_results: [],
      model_selections: [],
      retry_decisions: [],
      total_duration_ms: 0,
      total_cost: 0,
      completed_at: '',
    };

    this.emitEvent('ORCHESTRATION_STARTED', input.task_id, {
      description: input.description,
      estimated_tokens: input.estimated_tokens,
      estimated_files: input.estimated_files,
    });

    try {
      // Phase 1: Planning
      this.emitEvent('PLANNING_STARTED', input.task_id, {});
      const plan = this.planTask(input);
      result.plan = plan;
      this.emitEvent('PLANNING_COMPLETED', input.task_id, {
        size_category: plan.size_estimation.size_category,
        subtask_count: plan.chunking_recommendation.subtasks.length,
        should_chunk: plan.chunking_recommendation.should_chunk,
      });

      // Phase 2: Model Selection for initial execution
      const initialModel = this.selectModelForPhase(
        input,
        'IMPLEMENTATION',
        result.model_selections
      );

      // Phase 3: Execute subtasks
      this.currentStatus = 'EXECUTING';
      await this.executeSubtasks(
        input,
        plan,
        initialModel,
        executor,
        result
      );

      // Phase 4: Determine final status
      this.currentStatus = this.determineFinalStatus(result);
      result.status = this.currentStatus;

    } catch (error) {
      this.currentStatus = 'FAILED';
      result.status = 'FAILED';
      result.subtask_results.push({
        subtask_id: 'orchestration_error',
        status: 'FAILURE',
        error_message: error instanceof Error ? error.message : String(error),
      });
    }

    // Finalize result
    result.total_duration_ms = Date.now() - this.orchestrationStartTime;
    result.completed_at = new Date().toISOString();
    result.total_cost = this.calculateTotalCost();

    this.emitEvent('ORCHESTRATION_COMPLETED', input.task_id, {
      status: result.status,
      subtask_count: result.subtask_results.length,
      retry_count: result.retry_decisions.length,
      total_duration_ms: result.total_duration_ms,
      total_cost: result.total_cost,
    });

    // Check cost limit
    this.checkCostWarning(input.task_id);

    return result;
  }

  /**
   * Plan a task using the TaskPlanner
   */
  private planTask(input: TaskInput): ExecutionPlan {
    return this.planner.plan(input.task_id, input.description);
  }

  /**
   * Select model for a phase
   */
  private selectModelForPhase(
    input: TaskInput,
    phase: TaskPhase,
    selections: ModelSelection[]
  ): ModelSelection {
    const selection = this.modelPolicy.select(phase, {
      task_id: input.task_id,
      retry_count: input.retry_context?.retry_count ?? 0,
    });

    selections.push(selection);

    this.emitEvent('MODEL_SELECTED', input.task_id, {
      phase,
      model_id: selection.model_id,
      provider: selection.provider,
      reason: selection.reason,
    });

    return selection;
  }

  /**
   * Execute subtasks with retry handling
   */
  private async executeSubtasks(
    input: TaskInput,
    plan: ExecutionPlan,
    initialModel: ModelSelection,
    executor: SubtaskExecutor,
    result: OrchestratedTaskResult
  ): Promise<void> {
    const subtasks = plan.chunking_recommendation.subtasks;

    // Track completed subtasks for dependency resolution
    const completedSubtasks = new Set<string>();
    const failedSubtasks: string[] = [];

    // Execute in order (respecting dependencies)
    for (const subtask of subtasks) {
      // Check dependencies
      const dependenciesMet = subtask.dependencies.every(
        dep => completedSubtasks.has(dep)
      );
      if (!dependenciesMet) {
        // Skip if dependencies not met (failed dependency)
        result.subtask_results.push({
          subtask_id: subtask.id,
          status: 'FAILURE',
          error_message: 'Dependencies not met (dependency failed)',
        });
        failedSubtasks.push(subtask.id);
        continue;
      }

      // Execute subtask with retry handling
      const subtaskResult = await this.executeSubtaskWithRetry(
        input,
        subtask,
        initialModel,
        executor,
        result
      );

      result.subtask_results.push(subtaskResult);

      if (subtaskResult.status === 'SUCCESS') {
        completedSubtasks.add(subtask.id);
      } else {
        failedSubtasks.push(subtask.id);
      }
    }

    // Handle partial failure recovery if needed
    if (failedSubtasks.length > 0 && completedSubtasks.size > 0) {
      // Convert dependency edges to Map<string, string[]>
      // where key = subtask id, value = array of subtask ids it depends on
      const dependencyMap = new Map<string, string[]>();
      if (plan.dependency_analysis?.edges) {
        for (const edge of plan.dependency_analysis.edges) {
          // edge.to depends on edge.from
          const existing = dependencyMap.get(edge.to) ?? [];
          existing.push(edge.from);
          dependencyMap.set(edge.to, existing);
        }
      }
      const recovery = this.retryManager.startRecovery(
        input.task_id,
        failedSubtasks,
        Array.from(completedSubtasks),
        dependencyMap
      );
      result.recovery_strategy = recovery.strategy;
    }
  }

  /**
   * Execute a single subtask with retry handling
   */
  private async executeSubtaskWithRetry(
    input: TaskInput,
    subtask: PlanningSubtask,
    currentModel: ModelSelection,
    executor: SubtaskExecutor,
    result: OrchestratedTaskResult
  ): Promise<SubtaskExecutionResult> {
    const maxRetries = this.retryManager.getConfig().retryConfig.max_retries;
    let retryCount = 0;
    let lastResult: SubtaskExecutionResult | null = null;

    while (retryCount <= maxRetries) {
      this.emitEvent('SUBTASK_STARTED', input.task_id, {
        subtask_id: subtask.id,
        retry_count: retryCount,
        model: currentModel.model_id,
      });

      const startTime = Date.now();

      try {
        // Execute the subtask
        lastResult = await executor(subtask, currentModel);
        lastResult.duration_ms = Date.now() - startTime;

        // Record usage
        if (lastResult.tokens_used) {
          this.modelPolicy.recordUsage(
            input.task_id,
            subtask.id,
            currentModel,
            lastResult.tokens_used.input,
            lastResult.tokens_used.output,
            lastResult.duration_ms ?? 0,
            lastResult.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE'
          );
        }

        // Record retry attempt
        this.retryManager.recordAttempt(
          input.task_id,
          subtask.id,
          lastResult.status === 'SUCCESS' ? 'PASS' : 'FAIL',
          lastResult.failure_type,
          lastResult.error_message,
          lastResult.duration_ms
        );

        if (lastResult.status === 'SUCCESS') {
          this.emitEvent('SUBTASK_COMPLETED', input.task_id, {
            subtask_id: subtask.id,
            duration_ms: lastResult.duration_ms,
          });
          return lastResult;
        }

        // Handle failure - get retry decision
        const taskResult: TaskResult = {
          status: lastResult.status === 'FAILURE' ? 'FAIL' : 'PASS',
          output: lastResult.output,
          error: lastResult.error_message,
          duration_ms: lastResult.duration_ms,
        };

        const decision = this.retryManager.decide(
          input.task_id,
          subtask.id,
          taskResult
        );
        result.retry_decisions.push(decision);

        if (decision.decision === 'PASS') {
          // Task passed despite failure (e.g., acceptable partial success)
          return lastResult;
        }

        if (decision.decision === 'ESCALATE') {
          // Escalation required
          this.currentStatus = 'ESCALATED';
          this.emitEvent('ESCALATION_TRIGGERED', input.task_id, {
            subtask_id: subtask.id,
            reason: decision.escalate_reason,
            retry_count: retryCount,
          });

          const escalationReport = this.retryManager.escalate(
            input.task_id,
            subtask.id,
            {
              type: 'MAX_RETRIES',
              description: decision.escalate_reason || 'Max retries exceeded',
            }
          );
          result.escalation_report = escalationReport;

          lastResult.error_message = `Escalated: ${escalationReport.failure_summary.last_failure.message}`;
          return lastResult;
        }

        // Retry decision
        this.currentStatus = 'RETRYING';
        this.emitEvent('RETRY_TRIGGERED', input.task_id, {
          subtask_id: subtask.id,
          retry_count: retryCount + 1,
          delay_ms: decision.delay_ms,
          modification_hint: decision.modification_hint,
        });

        // Model escalation on retry if enabled
        if (this.config.auto_model_escalation && retryCount > 0) {
          const escalatedModel = this.selectModelForPhase(
            {
              ...input,
              retry_context: {
                retry_count: retryCount,
                last_failure_type: lastResult.failure_type,
              },
            },
            'RETRY',
            result.model_selections
          );
          currentModel = escalatedModel;
        }

        // Wait before retry
        if (decision.delay_ms && decision.delay_ms > 0) {
          await this.delay(decision.delay_ms);
        }

        retryCount++;

      } catch (error) {
        lastResult = {
          subtask_id: subtask.id,
          status: 'FAILURE',
          error_message: error instanceof Error ? error.message : String(error),
          failure_type: 'FATAL_ERROR',
          duration_ms: Date.now() - startTime,
        };

        this.emitEvent('SUBTASK_FAILED', input.task_id, {
          subtask_id: subtask.id,
          error: lastResult.error_message,
        });

        break;
      }
    }

    return lastResult || {
      subtask_id: subtask.id,
      status: 'FAILURE',
      error_message: 'Unknown error',
    };
  }

  /**
   * Determine final orchestration status
   */
  private determineFinalStatus(result: OrchestratedTaskResult): OrchestrationStatus {
    if (result.escalation_report) {
      return 'ESCALATED';
    }

    const allSuccess = result.subtask_results.every(r => r.status === 'SUCCESS');
    const allFailed = result.subtask_results.every(r => r.status === 'FAILURE');

    if (allSuccess) {
      return 'COMPLETED';
    } else if (allFailed) {
      return 'FAILED';
    } else {
      // Partial success - depends on recovery strategy
      return result.recovery_strategy ? 'COMPLETED' : 'FAILED';
    }
  }

  /**
   * Calculate total cost from model usage
   */
  private calculateTotalCost(): number {
    const summary = this.modelPolicy.getTodayUsage();
    return summary.total_cost;
  }

  /**
   * Check cost warning threshold
   */
  private checkCostWarning(taskId: string): void {
    const check = this.modelPolicy.checkCostLimit();
    const threshold = this.config.cost_warning_threshold || 80;

    // Calculate percentage
    const percentageUsed = check.daily_limit > 0
      ? (check.current_cost / check.daily_limit) * 100
      : 0;

    if (percentageUsed >= threshold && !check.exceeded) {
      this.emitEvent('COST_LIMIT_WARNING', taskId, {
        percentage_used: percentageUsed,
        current_cost: check.current_cost,
        daily_limit: check.daily_limit,
      });
    }
  }

  /**
   * Emit orchestration event
   */
  private emitEvent(
    type: OrchestrationEventType,
    taskId: string,
    details: Record<string, unknown>
  ): void {
    const event: OrchestrationEvent = {
      type,
      timestamp: new Date().toISOString(),
      task_id: taskId,
      details,
    };

    if (this.eventCallback) {
      this.eventCallback(event);
    }

    // ConversationTracer doesn't have a generic logEvent method,
    // so we don't log orchestration events there
  }

  /**
   * Forward planner events
   */
  private forwardPlannerEvent(eventType: string, content: Record<string, unknown>): void {
    if (this.currentTaskId && this.eventCallback) {
      this.emitEvent(
        eventType as OrchestrationEventType,
        this.currentTaskId,
        content
      );
    }
  }

  /**
   * Forward retry events
   */
  private forwardRetryEvent(event: unknown): void {
    if (this.currentTaskId && this.eventCallback) {
      const retryEvent = event as { type: string; task_id?: string; [key: string]: unknown };
      this.emitEvent(
        retryEvent.type as OrchestrationEventType,
        this.currentTaskId,
        retryEvent as Record<string, unknown>
      );
    }
  }

  /**
   * Forward model policy events
   */
  private forwardModelPolicyEvent(event: unknown): void {
    if (this.currentTaskId && this.eventCallback) {
      const policyEvent = event as { type: string; [key: string]: unknown };
      this.emitEvent(
        policyEvent.type as OrchestrationEventType,
        this.currentTaskId,
        policyEvent as Record<string, unknown>
      );
    }
  }

  /**
   * Utility: delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // Public API for Direct Access to Sub-Components
  // ============================================================

  /**
   * Get the task planner instance
   */
  getPlanner(): TaskPlanner {
    return this.planner;
  }

  /**
   * Get the retry manager instance
   */
  getRetryManager(): RetryManager {
    return this.retryManager;
  }

  /**
   * Get the model policy manager instance
   */
  getModelPolicy(): ModelPolicyManager {
    return this.modelPolicy;
  }

  /**
   * Get usage summary
   */
  getUsageSummary(startDate?: Date, endDate?: Date): UsageSummary {
    return this.modelPolicy.getUsageSummary(startDate, endDate);
  }

  /**
   * Check cost limit status
   */
  checkCostLimit(): CostLimitCheck {
    return this.modelPolicy.checkCostLimit();
  }

  /**
   * Set model profile
   */
  setModelProfile(profileName: string): boolean {
    return this.modelPolicy.setProfile(profileName);
  }
}
