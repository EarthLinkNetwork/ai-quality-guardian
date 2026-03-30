/**
 * PR Review Automation — Full Module Exports
 *
 * Phase 1: Types, DAL, GitHub Adapter
 * Phase 2: LLM Judgment Layer (ReviewJudge, DuplicateDetector, CycleManager)
 * Phase 3: PRReviewService (main orchestrator)
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md
 */

// Phase 2: LLM Judgment Layer
export { ReviewJudge } from "./review-judge";
export type {
  ReviewJudgeLLMClient,
  CommentAnalysisInput,
  CommentAnalysisResult,
  ReviewJudgeOptions,
} from "./review-judge";

export { DuplicateDetector } from "./duplicate-detector";
export type {
  DuplicateDetectorLLMClient,
  DuplicateCheckResult,
} from "./duplicate-detector";

export { CycleManager } from "./cycle-manager";
export type {
  CycleManagerLLMClient,
  CommentSummaryForCycle,
  CycleAnalysisInput,
  CycleAnalysisResult,
} from "./cycle-manager";

// Phase 3: Main Orchestrator
export { PRReviewService } from "./pr-review-service";
export type {
  ReviewSummaryForDashboard,
  FullPRReviewInfo,
} from "./pr-review-service";
