/**
 * Review Loop Module
 *
 * Per spec 25_REVIEW_LOOP.md: Automatic quality judgment with PASS/REJECT/RETRY
 *
 * Exports:
 * - ReviewLoopExecutorWrapper: Main class for wrapping IExecutor
 * - Quality criteria checkers (Q1-Q6)
 * - Goal Drift Guard evaluator (GD1-GD5)
 * - Goal Drift Guard integration with Review Loop
 * - Types and interfaces
 * - Default configuration
 */
export { ReviewLoopExecutorWrapper, checkQ1FilesVerified, checkQ2NoTodoLeft, checkQ3NoOmissionMarkers, checkQ4NoIncompleteSyntax, checkQ5EvidencePresent, checkQ6NoEarlyTermination, performQualityJudgment, generateModificationPrompt, generateIssuesFromCriteria, DEFAULT_REVIEW_LOOP_CONFIG, type QualityCriteriaId, type ReviewLoopConfig, type JudgmentResult, type CriteriaResult, type IssueDetail, type RejectionDetails, type IterationRecord, type ReviewLoopResult, type ReviewLoopEventCallback, } from './review-loop';
export { checkGD1NoEscapePhrases, checkGD2NoPrematureCompletion, checkGD3RequirementChecklistPresent, checkGD4CompletionStatementValid, checkGD5NoScopeReduction, evaluateGoalDrift, shouldRunGoalDriftEvaluator, safeEvaluateGoalDrift, GOAL_DRIFT_GUARD_TEMPLATE_ID, ESCAPE_PHRASES, PREMATURE_COMPLETION_PATTERNS, SCOPE_REDUCTION_PATTERNS, VALID_COMPLETION_PATTERNS, CHECKLIST_PATTERNS, type GoalDriftCriteriaId, type EscapePhraseViolation, type PrematureCompletionViolation, type ScopeReductionViolation, type GoalDriftCriteriaResult, type StructuredReason, type GoalDriftEvaluatorResult, } from './goal-drift-evaluator';
export { runGoalDriftIntegration, generateGoalDriftModificationSection, mapGoalDriftToQCriteria, mapGoalDriftResultToReviewLoop, getGoalDriftCriteriaName, type ExtendedIssueType, type ExtendedIssueDetail, type GoalDriftIntegrationResult, } from './goal-drift-integration';
//# sourceMappingURL=index.d.ts.map