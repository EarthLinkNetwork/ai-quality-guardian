"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskPlanner = exports.DEFAULT_TASK_PLANNER_CONFIG = void 0;
exports.estimateTaskSize = estimateTaskSize;
exports.determineChunking = determineChunking;
exports.analyzeDependencies = analyzeDependencies;
exports.generateExecutionPlan = generateExecutionPlan;
// ============================================================================
// Default Configuration
// ============================================================================
/**
 * Default task planner configuration
 */
exports.DEFAULT_TASK_PLANNER_CONFIG = {
    auto_chunk: true,
    chunk_token_threshold: 8000,
    chunk_complexity_threshold: 6,
    max_subtasks: 10,
    min_subtasks: 2,
    enable_dependency_analysis: true,
};
/**
 * Size category thresholds
 */
const SIZE_THRESHOLDS = {
    XS: { maxComplexity: 2, maxTokens: 1000, maxFiles: 1 },
    S: { maxComplexity: 4, maxTokens: 3000, maxFiles: 3 },
    M: { maxComplexity: 6, maxTokens: 6000, maxFiles: 6 },
    L: { maxComplexity: 8, maxTokens: 10000, maxFiles: 10 },
    XL: { maxComplexity: 10, maxTokens: Infinity, maxFiles: Infinity },
};
// ============================================================================
// Size Estimation
// ============================================================================
/**
 * Complexity indicators and their weights
 */
const COMPLEXITY_INDICATORS = [
    { pattern: /\b(?:implement|create|build|develop)\s+(?:full|complete|entire|whole)/i, weight: 3 },
    { pattern: /\b(?:refactor|rewrite|redesign|overhaul)/i, weight: 2 },
    { pattern: /\b(?:integrate|connect|combine|merge)/i, weight: 2 },
    { pattern: /\b(?:test|testing|unittest|e2e)/i, weight: 1 },
    { pattern: /\b(?:database|db|sql|mongodb|postgres)/i, weight: 2 },
    { pattern: /\b(?:api|endpoint|rest|graphql)/i, weight: 2 },
    { pattern: /\b(?:auth|authentication|authorization|security)/i, weight: 2 },
    { pattern: /\b(?:optimize|performance|speed|cache)/i, weight: 1 },
    { pattern: /\b(?:fix|bug|issue|error)/i, weight: 1 },
    { pattern: /\b(?:add|update|modify|change)/i, weight: 1 },
];
/**
 * File count indicators
 */
const FILE_COUNT_INDICATORS = [
    { pattern: /\b(\d+)\s*(?:files?|components?|modules?)/i, extractor: (m) => parseInt(m[1], 10) },
    { pattern: /\b(?:multiple|several|various)\s+(?:files?|components?)/i, estimate: 5 },
    { pattern: /\b(?:all|every|each)\s+(?:files?|components?)/i, estimate: 10 },
    { pattern: /\b(?:single|one|a)\s+(?:file|component)/i, estimate: 1 },
];
/**
 * Estimate task size
 * Per spec/29_TASK_PLANNING.md Section 4.1
 */
function estimateTaskSize(prompt) {
    const reasons = [];
    // Calculate complexity score
    let complexityScore = 1;
    for (const indicator of COMPLEXITY_INDICATORS) {
        if (indicator.pattern.test(prompt)) {
            complexityScore += indicator.weight;
            reasons.push(`Complexity: ${indicator.pattern.source.slice(0, 30)}...`);
        }
    }
    complexityScore = Math.min(10, complexityScore);
    // Estimate file count
    let fileCount = 1;
    for (const indicator of FILE_COUNT_INDICATORS) {
        const match = prompt.match(indicator.pattern);
        if (match) {
            if ('extractor' in indicator && indicator.extractor) {
                fileCount = Math.max(fileCount, indicator.extractor(match));
            }
            else if ('estimate' in indicator) {
                fileCount = Math.max(fileCount, indicator.estimate);
            }
            reasons.push(`Files: matched ${indicator.pattern.source.slice(0, 20)}...`);
        }
    }
    // Estimate tokens (based on prompt length and complexity)
    const baseTokens = prompt.split(/\s+/).length * 2;
    const estimatedTokens = baseTokens * (1 + complexityScore * 0.5) * fileCount;
    reasons.push(`Token estimate: ${Math.round(estimatedTokens)}`);
    // Determine size category
    let sizeCategory = 'XL';
    for (const [category, thresholds] of Object.entries(SIZE_THRESHOLDS)) {
        if (complexityScore <= thresholds.maxComplexity &&
            estimatedTokens <= thresholds.maxTokens &&
            fileCount <= thresholds.maxFiles) {
            sizeCategory = category;
            break;
        }
    }
    return {
        complexity_score: complexityScore,
        estimated_file_count: fileCount,
        estimated_tokens: Math.round(estimatedTokens),
        size_category: sizeCategory,
        estimation_reasons: reasons,
    };
}
// ============================================================================
// Chunking Decision
// ============================================================================
/**
 * Subtask extraction patterns
 */
const SUBTASK_PATTERNS = [
    // Numbered list: 1. Do X, 2. Do Y
    { pattern: /(?:^|\n)\s*(\d+)\.\s+(.+?)(?=\n\s*\d+\.|$)/gs, type: 'numbered' },
    // Bullet list: - Do X, * Do Y
    { pattern: /(?:^|\n)\s*[-*]\s+(.+?)(?=\n\s*[-*]|$)/gs, type: 'bullet' },
    // Then/After patterns: First X, then Y, finally Z
    { pattern: /\b(?:first|then|after that|finally|next|lastly)\s+(.+?)(?=\.|,|$)/gi, type: 'sequential' },
];
/**
 * Determine if task should be chunked
 * Per spec/29_TASK_PLANNING.md Section 4.2
 */
function determineChunking(prompt, sizeEstimation, config = exports.DEFAULT_TASK_PLANNER_CONFIG) {
    if (!config.auto_chunk) {
        return {
            should_chunk: false,
            reason: 'Auto-chunking disabled',
            subtasks: [],
        };
    }
    // Check thresholds
    const exceedsTokens = sizeEstimation.estimated_tokens > config.chunk_token_threshold;
    const exceedsComplexity = sizeEstimation.complexity_score >= config.chunk_complexity_threshold;
    if (!exceedsTokens && !exceedsComplexity) {
        return {
            should_chunk: false,
            reason: `Size within thresholds (tokens: ${sizeEstimation.estimated_tokens}, complexity: ${sizeEstimation.complexity_score})`,
            subtasks: [],
        };
    }
    // Extract subtasks
    const subtasks = extractSubtasks(prompt, config);
    if (subtasks.length < config.min_subtasks) {
        return {
            should_chunk: false,
            reason: `Extracted subtasks (${subtasks.length}) below minimum (${config.min_subtasks})`,
            subtasks: [],
        };
    }
    if (subtasks.length > config.max_subtasks) {
        // Limit subtasks
        subtasks.splice(config.max_subtasks);
    }
    // Determine execution mode based on dependencies
    const hasDependencies = subtasks.some(s => s.dependencies.length > 0);
    const executionMode = hasDependencies ? 'sequential' : 'parallel';
    return {
        should_chunk: true,
        reason: exceedsTokens
            ? `Token estimate (${sizeEstimation.estimated_tokens}) exceeds threshold (${config.chunk_token_threshold})`
            : `Complexity (${sizeEstimation.complexity_score}) exceeds threshold (${config.chunk_complexity_threshold})`,
        subtasks,
        execution_mode: executionMode,
    };
}
/**
 * Extract subtasks from prompt
 */
function extractSubtasks(prompt, config) {
    const subtasks = [];
    let order = 1;
    // Try numbered list first
    const numberedPattern = /(?:^|\n)\s*(\d+)\.\s+(.+?)(?=\n\s*\d+\.|$)/gs;
    let match;
    while ((match = numberedPattern.exec(prompt)) !== null) {
        subtasks.push({
            id: `subtask-${order}`,
            description: match[2].trim(),
            dependencies: order > 1 ? [`subtask-${order - 1}`] : [],
            estimated_complexity: 3,
            execution_order: parseInt(match[1], 10),
        });
        order++;
    }
    if (subtasks.length > 0) {
        return subtasks.slice(0, config.max_subtasks);
    }
    // Try bullet list
    const bulletPattern = /(?:^|\n)\s*[-*]\s+(.+?)(?=\n\s*[-*]|$)/gs;
    while ((match = bulletPattern.exec(prompt)) !== null) {
        subtasks.push({
            id: `subtask-${order}`,
            description: match[1].trim(),
            dependencies: [],
            estimated_complexity: 3,
            execution_order: order,
        });
        order++;
    }
    if (subtasks.length > 0) {
        return subtasks.slice(0, config.max_subtasks);
    }
    // Try sequential keywords
    const sequentialPattern = /\b(?:first|then|after that|finally|next|lastly)\s+(.+?)(?=\.|,|$)/gi;
    const seqOrder = {
        first: 1,
        then: 2,
        next: 3,
        'after that': 4,
        finally: 5,
        lastly: 5,
    };
    while ((match = sequentialPattern.exec(prompt)) !== null) {
        const keyword = match[0].split(' ')[0].toLowerCase();
        const execOrder = seqOrder[keyword] || order;
        subtasks.push({
            id: `subtask-${order}`,
            description: match[1].trim(),
            dependencies: order > 1 ? [`subtask-${order - 1}`] : [],
            estimated_complexity: 3,
            execution_order: execOrder,
        });
        order++;
    }
    return subtasks.slice(0, config.max_subtasks);
}
// ============================================================================
// Dependency Analysis
// ============================================================================
/**
 * Analyze dependencies between subtasks
 * Per spec/29_TASK_PLANNING.md Section 4.3
 */
function analyzeDependencies(subtasks) {
    const edges = [];
    // Build edges from explicit dependencies
    for (const subtask of subtasks) {
        for (const dep of subtask.dependencies) {
            edges.push({
                from: dep,
                to: subtask.id,
                type: 'hard',
            });
        }
    }
    // Detect implicit dependencies based on keywords
    for (let i = 0; i < subtasks.length; i++) {
        for (let j = i + 1; j < subtasks.length; j++) {
            const implicitDep = detectImplicitDependency(subtasks[i], subtasks[j]);
            if (implicitDep) {
                edges.push({
                    from: subtasks[i].id,
                    to: subtasks[j].id,
                    type: 'soft',
                });
            }
        }
    }
    // Topological sort
    const { order, hasCycles } = topologicalSort(subtasks, edges);
    // Find parallelizable groups
    const parallelizableGroups = findParallelizableGroups(subtasks, edges);
    return {
        edges,
        topological_order: order,
        has_cycles: hasCycles,
        parallelizable_groups: parallelizableGroups,
    };
}
/**
 * Detect implicit dependency between two subtasks
 */
function detectImplicitDependency(task1, task2) {
    const dependencyKeywords = ['after', 'once', 'when', 'following', 'based on', 'using', 'with'];
    const desc2Lower = task2.description.toLowerCase();
    const desc1Words = task1.description.toLowerCase().split(/\s+/);
    // Check if task2 references task1's key terms
    for (const keyword of dependencyKeywords) {
        if (desc2Lower.includes(keyword)) {
            for (const word of desc1Words) {
                if (word.length > 3 && desc2Lower.includes(word)) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Topological sort using Kahn's algorithm
 */
function topologicalSort(subtasks, edges) {
    const inDegree = new Map();
    const adj = new Map();
    // Initialize
    for (const subtask of subtasks) {
        inDegree.set(subtask.id, 0);
        adj.set(subtask.id, []);
    }
    // Build adjacency list
    for (const edge of edges) {
        const neighbors = adj.get(edge.from);
        if (neighbors) {
            neighbors.push(edge.to);
        }
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
    // Kahn's algorithm
    const queue = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) {
            queue.push(id);
        }
    }
    const order = [];
    while (queue.length > 0) {
        const node = queue.shift();
        order.push(node);
        for (const neighbor of adj.get(node) || []) {
            const newDegree = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
            }
        }
    }
    const hasCycles = order.length !== subtasks.length;
    return { order, hasCycles };
}
/**
 * Find groups of subtasks that can be executed in parallel
 */
function findParallelizableGroups(subtasks, edges) {
    const groups = [];
    const processed = new Set();
    // Group by execution order if no complex dependencies
    const byOrder = new Map();
    for (const subtask of subtasks) {
        const order = subtask.execution_order;
        if (!byOrder.has(order)) {
            byOrder.set(order, []);
        }
        byOrder.get(order).push(subtask.id);
    }
    // Check each order group for parallelizability
    const hardDeps = new Set(edges.filter(e => e.type === 'hard').map(e => `${e.from}->${e.to}`));
    for (const [_order, ids] of Array.from(byOrder.entries()).sort((a, b) => a[0] - b[0])) {
        const parallelGroup = [];
        for (const id of ids) {
            if (processed.has(id))
                continue;
            // Check if this task has hard dependencies on any unprocessed task
            let canParallelize = true;
            for (const depId of ids) {
                if (depId !== id && hardDeps.has(`${depId}->${id}`)) {
                    canParallelize = false;
                    break;
                }
            }
            if (canParallelize) {
                parallelGroup.push(id);
                processed.add(id);
            }
        }
        if (parallelGroup.length > 0) {
            groups.push(parallelGroup);
        }
    }
    return groups;
}
// ============================================================================
// Execution Plan Generation
// ============================================================================
/**
 * Generate execution plan from analysis
 * Per spec/29_TASK_PLANNING.md Section 4.4
 */
function generateExecutionPlan(taskId, prompt, config = exports.DEFAULT_TASK_PLANNER_CONFIG) {
    // Step 1: Size estimation
    const sizeEstimation = estimateTaskSize(prompt);
    // Step 2: Chunking decision
    const chunkingRecommendation = determineChunking(prompt, sizeEstimation, config);
    // Step 3: Dependency analysis (if chunking)
    let dependencyAnalysis;
    if (chunkingRecommendation.should_chunk && config.enable_dependency_analysis) {
        dependencyAnalysis = analyzeDependencies(chunkingRecommendation.subtasks);
    }
    // Step 4: Determine execution strategy
    let executionStrategy = 'single';
    if (chunkingRecommendation.should_chunk) {
        if (dependencyAnalysis?.has_cycles) {
            executionStrategy = 'sequential';
        }
        else if (dependencyAnalysis?.parallelizable_groups.every(g => g.length === 1)) {
            executionStrategy = 'sequential';
        }
        else if (dependencyAnalysis?.parallelizable_groups.some(g => g.length > 1)) {
            executionStrategy = 'mixed';
        }
        else {
            executionStrategy = chunkingRecommendation.execution_mode === 'parallel' ? 'parallel' : 'sequential';
        }
    }
    // Estimate total duration (rough estimate based on complexity)
    const baseDurationMs = 30000; // 30 seconds base
    const estimatedTotalDurationMs = chunkingRecommendation.should_chunk
        ? baseDurationMs * chunkingRecommendation.subtasks.length * 0.7 // Parallelism factor
        : baseDurationMs * sizeEstimation.complexity_score * 0.5;
    return {
        plan_id: `plan-${Date.now()}`,
        task_id: taskId,
        created_at: new Date().toISOString(),
        size_estimation: sizeEstimation,
        chunking_recommendation: chunkingRecommendation,
        dependency_analysis: dependencyAnalysis,
        execution_strategy: executionStrategy,
        estimated_total_duration_ms: Math.round(estimatedTotalDurationMs),
    };
}
// ============================================================================
// Task Planner Class
// ============================================================================
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
class TaskPlanner {
    config;
    eventCallback;
    conversationTracer;
    constructor(config = {}, eventCallback, conversationTracer) {
        this.config = { ...exports.DEFAULT_TASK_PLANNER_CONFIG, ...config };
        this.eventCallback = eventCallback;
        this.conversationTracer = conversationTracer;
    }
    /**
     * Plan task execution
     *
     * @param taskId - Task ID
     * @param prompt - Task prompt
     * @returns Execution plan
     */
    plan(taskId, prompt) {
        // Emit PLANNING_START event
        this.emitEvent('PLANNING_START', {
            task_id: taskId,
            prompt_length: prompt.length,
        });
        // Generate plan
        const plan = generateExecutionPlan(taskId, prompt, this.config);
        // Emit SIZE_ESTIMATION event
        this.emitEvent('SIZE_ESTIMATION', {
            task_id: taskId,
            size_estimation: plan.size_estimation,
        });
        // Emit CHUNKING_DECISION event
        this.emitEvent('CHUNKING_DECISION', {
            task_id: taskId,
            should_chunk: plan.chunking_recommendation.should_chunk,
            reason: plan.chunking_recommendation.reason,
            subtask_count: plan.chunking_recommendation.subtasks.length,
        });
        // Emit DEPENDENCY_ANALYSIS event (if applicable)
        if (plan.dependency_analysis) {
            this.emitEvent('DEPENDENCY_ANALYSIS', {
                task_id: taskId,
                edge_count: plan.dependency_analysis.edges.length,
                has_cycles: plan.dependency_analysis.has_cycles,
                parallel_groups: plan.dependency_analysis.parallelizable_groups.length,
            });
        }
        // Emit EXECUTION_PLAN event
        this.emitEvent('EXECUTION_PLAN', {
            task_id: taskId,
            plan_id: plan.plan_id,
            execution_strategy: plan.execution_strategy,
            estimated_duration_ms: plan.estimated_total_duration_ms,
        });
        // Log to ConversationTracer
        if (this.conversationTracer && plan.chunking_recommendation.should_chunk) {
            const subtaskPlans = plan.chunking_recommendation.subtasks.map(s => ({
                id: s.id,
                description: s.description,
                dependencies: s.dependencies,
            }));
            this.conversationTracer.logChunkingPlan(subtaskPlans);
        }
        // Emit PLANNING_END event
        this.emitEvent('PLANNING_END', {
            task_id: taskId,
            plan_id: plan.plan_id,
            success: true,
        });
        return plan;
    }
    /**
     * Quick size check without full planning
     */
    quickSizeCheck(prompt) {
        return estimateTaskSize(prompt);
    }
    /**
     * Check if chunking is recommended
     */
    shouldChunk(prompt) {
        const sizeEstimation = estimateTaskSize(prompt);
        const recommendation = determineChunking(prompt, sizeEstimation, this.config);
        return recommendation.should_chunk;
    }
    /**
     * Emit event through callback
     */
    emitEvent(eventType, content) {
        if (this.eventCallback) {
            this.eventCallback(eventType, content);
        }
    }
}
exports.TaskPlanner = TaskPlanner;
//# sourceMappingURL=task-planner.js.map