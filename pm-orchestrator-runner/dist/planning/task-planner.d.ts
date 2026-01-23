/**
 * Task Planner Implementation
 *
 * Per spec 29_TASK_PLANNING.md: Task sizing, chunking decision, and execution planning
 *
 * Features:
 * - Size estimation (complexity, file count, token estimate)
 * - Chunking decision (should_chunk, reason, subtasks)
 * - Dependency analysis between subtasks
 * - Execution plan generation
 * - Integration with ConversationTracer for PLANNING_* events
 *
 * Design Principle:
 * - Evidence-based: Size estimation is based on heuristics and patterns
 * - Fail-closed: Unknown patterns result in conservative estimates
 * - Trace-integrated: All planning events are logged to ConversationTracer
 */
import type { ConversationTracer } from '../trace/conversation-tracer';
/**
 * Size category for tasks
 * Per spec/29_TASK_PLANNING.md Section 3.1
 */
export type SizeCategory = 'XS' | 'S' | 'M' | 'L' | 'XL';
/**
 * Size estimation result
 * Per spec/29_TASK_PLANNING.md Section 3.1
 */
export interface SizeEstimation {
    /** Complexity score 1-10 */
    complexity_score: number;
    /** Estimated number of files to modify */
    estimated_file_count: number;
    /** Estimated input/output tokens */
    estimated_tokens: number;
    /** Size category */
    size_category: SizeCategory;
    /** Reasons for the estimation */
    estimation_reasons: string[];
}
/**
 * Subtask definition for chunking
 * Per spec/29_TASK_PLANNING.md Section 3.2
 */
export interface PlanningSubtask {
    id: string;
    description: string;
    dependencies: string[];
    estimated_complexity: number;
    execution_order: number;
}
/**
 * Chunking recommendation
 * Per spec/29_TASK_PLANNING.md Section 3.2
 */
export interface ChunkingRecommendation {
    should_chunk: boolean;
    reason: string;
    subtasks: PlanningSubtask[];
    execution_mode?: 'parallel' | 'sequential';
}
/**
 * Dependency edge for graph analysis
 */
export interface DependencyEdge {
    from: string;
    to: string;
    type: 'hard' | 'soft';
}
/**
 * Dependency analysis result
 * Per spec/29_TASK_PLANNING.md Section 3.3
 */
export interface DependencyAnalysis {
    edges: DependencyEdge[];
    topological_order: string[];
    has_cycles: boolean;
    parallelizable_groups: string[][];
}
/**
 * Execution plan
 * Per spec/29_TASK_PLANNING.md Section 3.4
 */
export interface ExecutionPlan {
    plan_id: string;
    task_id: string;
    created_at: string;
    size_estimation: SizeEstimation;
    chunking_recommendation: ChunkingRecommendation;
    dependency_analysis?: DependencyAnalysis;
    execution_strategy: 'single' | 'sequential' | 'parallel' | 'mixed';
    estimated_total_duration_ms?: number;
}
/**
 * Task planner configuration
 * Per spec/29_TASK_PLANNING.md Section 10.1
 */
export interface TaskPlannerConfig {
    /** Enable automatic chunking */
    auto_chunk: boolean;
    /** Token threshold for chunking */
    chunk_token_threshold: number;
    /** Complexity threshold for chunking */
    chunk_complexity_threshold: number;
    /** Maximum subtasks */
    max_subtasks: number;
    /** Minimum subtasks */
    min_subtasks: number;
    /** Enable dependency analysis */
    enable_dependency_analysis: boolean;
}
/**
 * Event callback for planning events
 */
export type PlanningEventCallback = (eventType: string, content: Record<string, unknown>) => void;
/**
 * Default task planner configuration
 */
export declare const DEFAULT_TASK_PLANNER_CONFIG: TaskPlannerConfig;
/**
 * Estimate task size
 * Per spec/29_TASK_PLANNING.md Section 4.1
 */
export declare function estimateTaskSize(prompt: string): SizeEstimation;
/**
 * Determine if task should be chunked
 * Per spec/29_TASK_PLANNING.md Section 4.2
 */
export declare function determineChunking(prompt: string, sizeEstimation: SizeEstimation, config?: TaskPlannerConfig): ChunkingRecommendation;
/**
 * Analyze dependencies between subtasks
 * Per spec/29_TASK_PLANNING.md Section 4.3
 */
export declare function analyzeDependencies(subtasks: PlanningSubtask[]): DependencyAnalysis;
/**
 * Generate execution plan from analysis
 * Per spec/29_TASK_PLANNING.md Section 4.4
 */
export declare function generateExecutionPlan(taskId: string, prompt: string, config?: TaskPlannerConfig): ExecutionPlan;
/**
 * TaskPlanner
 *
 * Main class for task planning functionality.
 * Per spec/29_TASK_PLANNING.md
 *
 * Features:
 * - Analyzes task size and complexity
 * - Determines if chunking is needed
 * - Generates execution plans
 * - Logs PLANNING_* events to ConversationTracer
 */
export declare class TaskPlanner {
    private readonly config;
    private readonly eventCallback?;
    private readonly conversationTracer?;
    constructor(config?: Partial<TaskPlannerConfig>, eventCallback?: PlanningEventCallback, conversationTracer?: ConversationTracer);
    /**
     * Plan task execution
     *
     * @param taskId - Task ID
     * @param prompt - Task prompt
     * @returns Execution plan
     */
    plan(taskId: string, prompt: string): ExecutionPlan;
    /**
     * Quick size check without full planning
     */
    quickSizeCheck(prompt: string): SizeEstimation;
    /**
     * Check if chunking is recommended
     */
    shouldChunk(prompt: string): boolean;
    /**
     * Emit event through callback
     */
    private emitEvent;
}
//# sourceMappingURL=task-planner.d.ts.map