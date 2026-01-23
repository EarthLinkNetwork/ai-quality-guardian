/**
 * Orchestration Module
 *
 * Provides unified task orchestration by integrating:
 * - TaskPlanner (spec/29_TASK_PLANNING.md)
 * - RetryManager (spec/30_RETRY_AND_RECOVERY.md)
 * - ModelPolicyManager (spec/31_PROVIDER_MODEL_POLICY.md)
 *
 * Exports:
 * - TaskOrchestrator class
 * - Orchestration types and events
 * - Configuration options
 */

export {
  // Types - Status and Events
  type OrchestrationStatus,
  type OrchestrationEventType,
  type OrchestrationEvent,
  type OrchestrationEventCallback,

  // Types - Task Input and Output
  type TaskInput,
  type SubtaskExecutionResult,
  type OrchestratedTaskResult,

  // Types - Executor
  type SubtaskExecutor,

  // Types - Configuration
  type TaskOrchestratorConfig,

  // Constants
  DEFAULT_ORCHESTRATOR_CONFIG,

  // Class
  TaskOrchestrator,
} from './task-orchestrator';

// Re-export from sub-modules for convenience
export {
  TaskPlanner,
  type SizeCategory,
  type SizeEstimation,
  type PlanningSubtask,
  type ChunkingRecommendation,
  type ExecutionPlan,
  type TaskPlannerConfig,
  DEFAULT_TASK_PLANNER_CONFIG,
} from '../planning';

export {
  RetryManager,
  type FailureType,
  type RetryDecision,
  type EscalationReport,
  type RecoveryStrategy,
  type RetryConfig,
  type RetryManagerConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_RETRY_MANAGER_CONFIG,
} from '../retry';

export {
  ModelPolicyManager,
  type Provider,
  type ModelCategory,
  type TaskPhase,
  type ModelSelection,
  type ModelProfile,
  type ModelPolicyManagerConfig,
  STABLE_PROFILE,
  CHEAP_PROFILE,
  FAST_PROFILE,
  DEFAULT_MODEL_POLICY_CONFIG,
} from '../model-policy';
