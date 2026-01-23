/**
 * Task Planning Module
 *
 * Per spec 29_TASK_PLANNING.md
 *
 * Exports:
 * - TaskPlanner class
 * - Size estimation functions
 * - Chunking decision functions
 * - Dependency analysis functions
 * - Execution plan generation
 */

export {
  // Types
  type SizeCategory,
  type SizeEstimation,
  type PlanningSubtask,
  type ChunkingRecommendation,
  type DependencyEdge,
  type DependencyAnalysis,
  type ExecutionPlan,
  type TaskPlannerConfig,
  type PlanningEventCallback,

  // Constants
  DEFAULT_TASK_PLANNER_CONFIG,

  // Functions
  estimateTaskSize,
  determineChunking,
  analyzeDependencies,
  generateExecutionPlan,

  // Class
  TaskPlanner,
} from './task-planner';
