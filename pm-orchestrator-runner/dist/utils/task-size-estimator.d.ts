/**
 * Task Size Estimator
 *
 * AC C: Dynamic Control - LLM estimates task size to select monitoring profile
 *
 * This module analyzes task prompts to estimate complexity and select
 * appropriate timeout profiles. The estimation is rule-based (not LLM-based)
 * to ensure fast, deterministic results.
 */
import { TimeoutProfile } from './timeout-profile';
/**
 * Task size categories
 */
export type TaskSizeCategory = 'small' | 'medium' | 'large' | 'x-large';
/**
 * Task size estimation result
 */
export interface TaskSizeEstimate {
    /** Estimated category */
    category: TaskSizeCategory;
    /** Confidence level (0-1) */
    confidence: number;
    /** Factors that contributed to the estimate */
    factors: TaskSizeFactor[];
    /** Recommended timeout profile */
    recommendedProfile: TimeoutProfile;
    /** Explanation of the estimate */
    explanation: string;
}
/**
 * Factor that contributed to size estimate
 */
export interface TaskSizeFactor {
    name: string;
    score: number;
    reason: string;
}
/**
 * Estimates task size based on prompt content
 *
 * @param prompt - Task prompt to analyze
 * @param taskType - Optional task type for additional context
 * @returns Task size estimate with recommended timeout profile
 */
export declare function estimateTaskSize(prompt: string, taskType?: string): TaskSizeEstimate;
/**
 * Gets a custom timeout profile for specific task characteristics
 *
 * @param estimate - Task size estimate
 * @param overrides - Optional overrides for specific timeouts
 * @returns Customized timeout profile
 */
export declare function getCustomProfileForTask(estimate: TaskSizeEstimate, overrides?: {
    idle_timeout_ms?: number;
    hard_timeout_ms?: number;
}): TimeoutProfile;
/**
 * Quick estimate - returns just the recommended profile
 *
 * @param prompt - Task prompt
 * @param taskType - Optional task type
 * @returns Recommended timeout profile
 */
export declare function quickEstimateProfile(prompt: string, taskType?: string): TimeoutProfile;
//# sourceMappingURL=task-size-estimator.d.ts.map