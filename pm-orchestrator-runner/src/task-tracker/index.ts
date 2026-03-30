/**
 * Task Tracker Module
 *
 * Exports the service layer for task tracking, context recovery,
 * snapshot management, and LLM summarization.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md
 */

export { TaskTrackerService } from "./task-tracker-service";
export type { RecoveryInfo, RecoveryResult } from "./task-tracker-service";
export { SnapshotManager } from "./snapshot-manager";
export { generateRecoveryPrompt } from "./context-recovery";
export { LLMSummarizer } from "./llm-summarizer";
export type {
  LLMSummarizerClient,
  ContextSummaryResult,
  TaskSummaryResult,
} from "./llm-summarizer";
