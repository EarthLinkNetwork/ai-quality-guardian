/**
 * Review Loop Module
 *
 * Per spec 25_REVIEW_LOOP.md: Automatic quality judgment with PASS/REJECT/RETRY
 *
 * Exports:
 * - ReviewLoopExecutorWrapper: Main class for wrapping IExecutor
 * - Quality criteria checkers (Q1-Q6)
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
