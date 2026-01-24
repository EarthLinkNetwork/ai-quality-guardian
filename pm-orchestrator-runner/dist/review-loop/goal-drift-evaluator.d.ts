/**
 * Goal Drift Guard Evaluator
 *
 * Per spec 32_TEMPLATE_INJECTION.md Section 2.4 and enforcement requirements
 *
 * This evaluator runs ONLY when activeTemplateId === 'goal_drift_guard'
 * and maps Goal Drift violations to existing Q1-Q6 style judgments.
 *
 * GD1: No Escape Phrases (maps to Q2-style)
 * GD2: No Premature Completion (maps to Q5-style)
 * GD3: Requirement Checklist Present (maps to Q5-style)
 * GD4: Completion Statement Valid (maps to Q5-style)
 * GD5: No Scope Reduction (maps to Q3-style)
 *
 * Design Principle:
 * - Fail-Closed: Evaluator errors result in REJECT
 * - Deterministic: No LLM calls, pattern-based detection
 * - Zero overhead when template not selected
 */
import type { ExecutorResult } from '../executor/claude-code-executor';
/**
 * Goal Drift Criteria IDs
 */
export type GoalDriftCriteriaId = 'GD1' | 'GD2' | 'GD3' | 'GD4' | 'GD5';
/**
 * Escape phrase violation detail
 */
export interface EscapePhraseViolation {
    phrase: string;
    context: string;
    lineNumber?: number;
    line?: number;
}
/**
 * Premature completion violation detail
 */
export interface PrematureCompletionViolation {
    pattern: string;
    context: string;
    lineNumber?: number;
}
/**
 * Scope reduction violation detail
 */
export interface ScopeReductionViolation {
    pattern: string;
    context: string;
    lineNumber?: number;
}
/**
 * Generic violation for backward compat with tests
 */
export interface GenericViolation {
    phrase?: string;
    pattern?: string;
    context?: string;
    lineNumber?: number;
    line?: number;
    criteria_id?: GoalDriftCriteriaId;
}
/**
 * Individual criteria check result
 */
export interface GoalDriftCriteriaResult {
    criteria_id: GoalDriftCriteriaId;
    passed: boolean;
    details?: string;
    violations: GenericViolation[];
}
/**
 * Structured reason for machine-readable output
 */
export interface StructuredReason {
    criteria_id: GoalDriftCriteriaId;
    violation_type: 'escape_phrase' | 'premature_completion' | 'missing_checklist' | 'invalid_completion_statement' | 'scope_reduction';
    description: string;
    evidence: string[];
}
/**
 * Goal Drift Evaluator result
 */
export interface GoalDriftEvaluatorResult {
    passed: boolean;
    criteriaResults: GoalDriftCriteriaResult[];
    criteria_results: GoalDriftCriteriaResult[];
    failed_criteria: GoalDriftCriteriaId[];
    structured_reasons: StructuredReason[];
    violations: GenericViolation[];
    summary: string;
    error?: string;
}
/**
 * Goal Drift Guard template ID
 */
export declare const GOAL_DRIFT_GUARD_TEMPLATE_ID = "goal_drift_guard";
/**
 * Escape phrases to detect (per spec 32_TEMPLATE_INJECTION.md Section 2.4)
 * Case-insensitive matching
 */
export declare const ESCAPE_PHRASES: readonly string[];
/**
 * Premature completion patterns (per spec 32_TEMPLATE_INJECTION.md Section 2.4)
 * Case-insensitive matching
 */
export declare const PREMATURE_COMPLETION_PATTERNS: readonly string[];
/**
 * Scope reduction patterns
 * Case-insensitive matching
 */
export declare const SCOPE_REDUCTION_PATTERNS: readonly string[];
/**
 * Valid completion statement patterns
 * Must contain one of these to be valid
 */
export declare const VALID_COMPLETION_PATTERNS: readonly RegExp[];
/**
 * Requirement checklist patterns
 * Must contain checkbox-style items
 */
export declare const CHECKLIST_PATTERNS: readonly RegExp[];
/**
 * GD1: Check for escape phrases in output
 *
 * @param output - Executor output to check
 * @returns Criteria result with violations
 */
export declare function checkGD1NoEscapePhrases(output: string): GoalDriftCriteriaResult;
/**
 * GD2: Check for premature completion language
 *
 * @param output - Executor output to check
 * @returns Criteria result with violations
 */
export declare function checkGD2NoPrematureCompletion(output: string): GoalDriftCriteriaResult;
/**
 * GD3: Check for requirement checklist presence
 *
 * @param output - Executor output to check
 * @returns Criteria result
 */
export declare function checkGD3RequirementChecklistPresent(output: string): GoalDriftCriteriaResult;
/**
 * GD4: Check for valid completion statement
 *
 * @param output - Executor output to check
 * @returns Criteria result
 */
export declare function checkGD4CompletionStatementValid(output: string): GoalDriftCriteriaResult;
/**
 * GD5: Check for scope reduction language
 *
 * @param output - Executor output to check
 * @returns Criteria result with violations
 */
export declare function checkGD5NoScopeReduction(output: string): GoalDriftCriteriaResult;
/**
 * Evaluate Goal Drift Guard criteria on output
 *
 * @param input - Output string or ExecutorResult to evaluate
 * @returns Goal Drift evaluation result
 */
export declare function evaluateGoalDrift(input: string | ExecutorResult): GoalDriftEvaluatorResult;
/**
 * Check if Goal Drift Guard evaluator should run
 *
 * @param activeTemplateId - Currently active template ID
 * @returns true if evaluator should run
 */
export declare function shouldRunGoalDriftEvaluator(activeTemplateId: string | null | undefined): boolean;
/**
 * Fail-closed wrapper for Goal Drift evaluation
 *
 * @param input - Executor result or output string to evaluate
 * @returns Goal Drift evaluation result
 * @throws Never - Returns REJECT-equivalent on error (fail-closed)
 */
export declare function safeEvaluateGoalDrift(input: ExecutorResult | string | null | undefined): GoalDriftEvaluatorResult;
//# sourceMappingURL=goal-drift-evaluator.d.ts.map