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

export {
  // Main class
  ReviewLoopExecutorWrapper,

  // Quality criteria checkers
  checkQ1FilesVerified,
  checkQ2NoTodoLeft,
  checkQ3NoOmissionMarkers,
  checkQ4NoIncompleteSyntax,
  checkQ5EvidencePresent,
  checkQ6NoEarlyTermination,

  // Core functions
  performQualityJudgment,
  generateModificationPrompt,
  generateIssuesFromCriteria,

  // Configuration
  DEFAULT_REVIEW_LOOP_CONFIG,

  // Types
  type QualityCriteriaId,
  type ReviewLoopConfig,
  type JudgmentResult,
  type CriteriaResult,
  type IssueDetail,
  type RejectionDetails,
  type IterationRecord,
  type ReviewLoopResult,
  type ReviewLoopEventCallback,
} from './review-loop';

// Goal Drift Guard Evaluator (per spec 32_TEMPLATE_INJECTION.md)
export {
  // Checker functions
  checkGD1NoEscapePhrases,
  checkGD2NoPrematureCompletion,
  checkGD3RequirementChecklistPresent,
  checkGD4CompletionStatementValid,
  checkGD5NoScopeReduction,

  // Main evaluator
  evaluateGoalDrift,
  shouldRunGoalDriftEvaluator,
  safeEvaluateGoalDrift,

  // Constants
  GOAL_DRIFT_GUARD_TEMPLATE_ID,
  ESCAPE_PHRASES,
  PREMATURE_COMPLETION_PATTERNS,
  SCOPE_REDUCTION_PATTERNS,
  VALID_COMPLETION_PATTERNS,
  CHECKLIST_PATTERNS,

  // Types
  type GoalDriftCriteriaId,
  type EscapePhraseViolation,
  type PrematureCompletionViolation,
  type ScopeReductionViolation,
  type GoalDriftCriteriaResult,
  type StructuredReason,
  type GoalDriftEvaluatorResult,
} from './goal-drift-evaluator';

// Goal Drift Guard Integration (connects evaluator to Review Loop)
export {
  // Integration functions
  runGoalDriftIntegration,
  generateGoalDriftModificationSection,
  mapGoalDriftToQCriteria,
  mapGoalDriftResultToReviewLoop,
  getGoalDriftCriteriaName,

  // Types
  type ExtendedIssueType,
  type ExtendedIssueDetail,
  type GoalDriftIntegrationResult,
} from './goal-drift-integration';
