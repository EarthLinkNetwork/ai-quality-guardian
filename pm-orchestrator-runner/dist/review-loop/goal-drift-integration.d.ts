/**
 * Goal Drift Guard Integration with Review Loop
 *
 * Per spec 32_TEMPLATE_INJECTION.md Section 2.4
 *
 * This module provides integration between the Goal Drift Guard evaluator
 * and the existing Review Loop quality judgment system.
 *
 * Key principle: Only run Goal Drift Guard when activeTemplateId === 'goal_drift_guard'
 * Zero overhead when template not selected.
 */
import type { ExecutorResult } from '../executor/claude-code-executor';
import type { CriteriaResult, IssueDetail, QualityCriteriaId } from './review-loop';
import { type GoalDriftEvaluatorResult, type GoalDriftCriteriaId } from './goal-drift-evaluator';
/**
 * Extended issue types for Goal Drift Guard
 */
export type ExtendedIssueType = IssueDetail['type'] | 'escape_phrase' | 'premature_completion' | 'missing_checklist' | 'invalid_completion_statement' | 'scope_reduction';
/**
 * Extended issue detail including Goal Drift Guard violations
 */
export interface ExtendedIssueDetail {
    type: ExtendedIssueType;
    location?: string;
    description: string;
    suggestion?: string;
}
/**
 * Goal Drift Guard integration result
 */
export interface GoalDriftIntegrationResult {
    /** Whether Goal Drift Guard was run */
    ran: boolean;
    /** Whether Goal Drift Guard passed (true if not run) */
    passed: boolean;
    /** Goal Drift Guard specific results (null if not run) */
    goalDriftResult: GoalDriftEvaluatorResult | null;
    /** Criteria results mapped to Q-style format */
    mappedCriteriaResults: CriteriaResult[];
    /** Issues mapped to extended format */
    mappedIssues: ExtendedIssueDetail[];
    /** Human-readable summary */
    summary: string;
}
/**
 * Map Goal Drift criteria ID to Q-style criteria ID
 *
 * GD1 (escape phrases) -> Q2 (No TODO/FIXME style - problematic language)
 * GD2 (premature completion) -> Q5 (Evidence Present style - incomplete work)
 * GD3 (missing checklist) -> Q5 (Evidence Present style - no verification)
 * GD4 (invalid completion) -> Q5 (Evidence Present style - false claims)
 * GD5 (scope reduction) -> Q3 (Omission Markers style - hidden reduction)
 */
export declare function mapGoalDriftToQCriteria(gdId: GoalDriftCriteriaId): QualityCriteriaId;
/**
 * Get human-readable name for Goal Drift criteria
 */
export declare function getGoalDriftCriteriaName(gdId: GoalDriftCriteriaId): string;
/**
 * Map Goal Drift evaluator result to Review Loop compatible format
 */
export declare function mapGoalDriftResultToReviewLoop(gdResult: GoalDriftEvaluatorResult): {
    criteria: CriteriaResult[];
    issues: ExtendedIssueDetail[];
};
/**
 * Run Goal Drift Guard integration if applicable
 *
 * @param result - Executor result to evaluate
 * @param activeTemplateId - Currently active template ID
 * @returns Integration result with mapped criteria and issues
 */
export declare function runGoalDriftIntegration(result: ExecutorResult, activeTemplateId: string | null | undefined): GoalDriftIntegrationResult;
/**
 * Generate modification prompt section for Goal Drift Guard failures
 *
 * @param gdResult - Goal Drift Guard evaluation result
 * @returns Modification prompt section
 */
export declare function generateGoalDriftModificationSection(gdResult: GoalDriftEvaluatorResult): string;
//# sourceMappingURL=goal-drift-integration.d.ts.map