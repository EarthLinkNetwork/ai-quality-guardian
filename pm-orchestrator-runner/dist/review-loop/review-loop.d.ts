/**
 * Review Loop Implementation
 *
 * Per spec 25_REVIEW_LOOP.md: Automatic quality judgment with PASS/REJECT/RETRY
 *
 * This is the core LLM Layer component that:
 * - Wraps the existing IExecutor
 * - Performs Q1-Q6 quality checks on ExecutorResult
 * - Generates modification prompts for REJECT cases
 * - Logs all REVIEW_LOOP_* events
 * - Controls iteration with max_iterations
 *
 * Design Principle:
 * - Runner is the sole completion authority (not Claude Code)
 * - Evidence-Based: File verification and output validation
 * - Fail-Closed: Unknown situations result in REJECT
 */
import type { IExecutor, ExecutorTask, ExecutorResult } from '../executor/claude-code-executor';
import { PromptAssembler } from '../prompt';
import { ConversationTracer } from '../trace/conversation-tracer';
/**
 * Quality Criteria IDs (per spec 25_REVIEW_LOOP.md Section 3)
 */
export type QualityCriteriaId = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7' | 'Q8' | 'Q9';
/**
 * Review Loop configuration
 * Per spec 25_REVIEW_LOOP.md Section 5.1
 */
export interface ReviewLoopConfig {
    /** Maximum number of iterations (default: 3) */
    max_iterations: number;
    /** Delay between RETRY attempts in ms (default: 1000) */
    retry_delay_ms: number;
    /** Escalate to user when max_iterations reached (default: true) */
    escalate_on_max: boolean;
    /** Mandatory criteria IDs to check (default: Q1-Q6) */
    mandatory_criteria: QualityCriteriaId[];
    /** Optional criteria IDs to check (default: empty) */
    optional_criteria: QualityCriteriaId[];
    /** Patterns to detect omission markers */
    omission_patterns: RegExp[];
    /** Patterns to detect early termination */
    early_termination_patterns: RegExp[];
}
/**
 * Quality judgment result
 * Per spec 25_REVIEW_LOOP.md Section 2.2
 */
export type JudgmentResult = 'PASS' | 'REJECT' | 'RETRY';
/**
 * Individual criteria check result
 */
export interface CriteriaResult {
    criteria_id: QualityCriteriaId;
    passed: boolean;
    details?: string;
}
/**
 * Issue detected during quality check
 */
export interface IssueDetail {
    type: 'omission' | 'incomplete' | 'missing_file' | 'early_termination' | 'syntax_error' | 'todo_left';
    location?: string;
    description: string;
    suggestion?: string;
}
/**
 * Rejection details when REJECT is returned
 * Per spec 25_REVIEW_LOOP.md Section 4.1
 */
export interface RejectionDetails {
    criteria_failed: QualityCriteriaId[];
    issues_detected: IssueDetail[];
    modification_prompt: string;
    iteration: number;
}
/**
 * Iteration record for history tracking
 * Per spec 25_REVIEW_LOOP.md Section 5.3
 */
export interface IterationRecord {
    iteration: number;
    started_at: string;
    ended_at: string;
    judgment: JudgmentResult;
    criteria_results: CriteriaResult[];
    rejection_details?: RejectionDetails;
    executor_output_ref?: string;
}
/**
 * Review Loop result
 * Per spec 25_REVIEW_LOOP.md Section 7.1
 */
export interface ReviewLoopResult {
    final_status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR';
    total_iterations: number;
    iteration_history: IterationRecord[];
    final_output: ExecutorResult;
}
/**
 * Event emitter callback for logging
 */
export type ReviewLoopEventCallback = (eventType: string, content: Record<string, unknown>) => void;
/**
 * Default Review Loop configuration
 */
export declare const DEFAULT_REVIEW_LOOP_CONFIG: ReviewLoopConfig;
/**
 * Q1: Files Verified - Check that expected files exist on disk
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
export declare function checkQ1FilesVerified(result: ExecutorResult): CriteriaResult;
/**
 * Q2: No TODO/FIXME Left - Check for TODO markers in output
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
export declare function checkQ2NoTodoLeft(result: ExecutorResult): CriteriaResult;
/**
 * Q3: No Omission Markers - Check for ... or similar patterns
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
export declare function checkQ3NoOmissionMarkers(result: ExecutorResult, patterns: RegExp[]): CriteriaResult;
/**
 * Q4: No Incomplete Syntax - Check for syntax errors
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 *
 * This is a heuristic check for common incomplete syntax patterns.
 */
export declare function checkQ4NoIncompleteSyntax(result: ExecutorResult): CriteriaResult;
/**
 * Q5: Evidence Present - Check that completion evidence exists
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
export declare function checkQ5EvidencePresent(result: ExecutorResult): CriteriaResult;
/**
 * Q6: No Early Termination - Check for premature completion claims
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 *
 * Claude Code should not claim completion - Runner decides.
 */
export declare function checkQ6NoEarlyTermination(result: ExecutorResult, patterns: RegExp[]): CriteriaResult;
/**
 * Perform quality judgment on execution result
 * Per spec 25_REVIEW_LOOP.md Section 3
 *
 * @param result - Executor result to judge
 * @param config - Review Loop configuration
 * @returns Judgment result with criteria details
 */
export declare function performQualityJudgment(result: ExecutorResult, config: ReviewLoopConfig): {
    judgment: JudgmentResult;
    criteria_results: CriteriaResult[];
    failed_criteria: QualityCriteriaId[];
};
/**
 * Generate modification prompt for REJECT case
 * Per spec 25_REVIEW_LOOP.md Section 4.2
 *
 * @param originalPrompt - Original user prompt
 * @param criteriaResults - Failed criteria results
 * @param issues - Detected issues
 * @returns Modification prompt to re-submit
 */
export declare function generateModificationPrompt(originalPrompt: string, criteriaResults: CriteriaResult[], issues: IssueDetail[]): string;
/**
 * Generate issues from criteria results
 */
export declare function generateIssuesFromCriteria(criteriaResults: CriteriaResult[]): IssueDetail[];
/**
 * Review Loop Executor Wrapper
 *
 * Wraps an IExecutor to add Review Loop functionality.
 * Per spec 25_REVIEW_LOOP.md Section 7.1
 *
 * Integrates with PromptAssembler for:
 * - Template-based modification prompts (per spec/17_PROMPT_TEMPLATE.md L102-124)
 * - Customizable modification templates
 */
export declare class ReviewLoopExecutorWrapper {
    private readonly executor;
    private readonly config;
    private readonly eventCallback?;
    private readonly promptAssembler?;
    private readonly conversationTracer?;
    constructor(executor: IExecutor, config?: Partial<ReviewLoopConfig>, eventCallback?: ReviewLoopEventCallback, promptAssembler?: PromptAssembler, conversationTracer?: ConversationTracer);
    /**
     * Execute task with Review Loop
     *
     * @param task - Task to execute
     * @returns Review Loop result with iteration history
     */
    executeWithReview(task: ExecutorTask): Promise<ReviewLoopResult>;
    /**
     * Build modification prompt using PromptAssembler or fallback
     * Per spec/17_PROMPT_TEMPLATE.md L102-124
     *
     * @param originalPrompt - Original user prompt
     * @param criteriaResults - Failed criteria results
     * @param issues - Detected issues
     * @returns Modification prompt to re-submit
     */
    private buildModificationPromptInternal;
    /**
     * Emit event through callback
     */
    private emitEvent;
    /**
     * Delay helper for retry
     */
    private delay;
}
//# sourceMappingURL=review-loop.d.ts.map