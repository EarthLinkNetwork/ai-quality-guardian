/**
 * Task Size Estimator
 *
 * AC C: Dynamic Control - LLM estimates task size to select monitoring profile
 *
 * This module analyzes task prompts to estimate complexity and select
 * appropriate timeout profiles. The estimation is rule-based (not LLM-based)
 * to ensure fast, deterministic results.
 */

import {
  TimeoutProfile,
  STANDARD_PROFILE,
  LONG_PROFILE,
  EXTENDED_PROFILE,
  createCustomProfile,
} from './timeout-profile';

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
  score: number; // -1 to +1 (negative = smaller, positive = larger)
  reason: string;
}

/**
 * Keywords indicating small/quick tasks
 */
const SMALL_TASK_KEYWORDS = [
  // Simple read operations
  'read', 'show', 'display', 'print', 'list', 'get', 'check',
  // Simple modifications
  'fix typo', 'rename', 'update comment', 'change name',
  // Quick tasks
  'hello', 'test', 'echo', 'version', 'help',
  // Small scope
  'one file', 'single file', 'this file', 'line', 'few lines',
];

/**
 * Keywords indicating medium tasks
 */
const MEDIUM_TASK_KEYWORDS = [
  // Standard development
  'implement', 'create', 'add', 'write', 'modify', 'update',
  // Feature work
  'feature', 'function', 'method', 'class', 'component',
  // Testing
  'test', 'unit test', 'spec',
  // Debugging
  'fix bug', 'debug', 'investigate',
];

/**
 * Keywords indicating large tasks
 */
const LARGE_TASK_KEYWORDS = [
  // Comprehensive operations
  'refactor', 'restructure', 'redesign', 'migrate',
  // Multi-file operations
  'multiple files', 'across', 'all files', 'entire',
  // Build/Deploy
  'build', 'deploy', 'package', 'bundle',
  // Testing
  'integration test', 'e2e test', 'full test',
  // Documentation
  'document all', 'comprehensive', 'complete',
];

/**
 * Keywords indicating extra-large tasks
 */
const XLARGE_TASK_KEYWORDS = [
  // Full system operations
  'entire codebase', 'whole project', 'all modules',
  // Major changes
  'rewrite', 'complete overhaul', 'full migration',
  // Auto-dev loop indicators
  'auto', 'continuous', 'iterative', 'loop',
  // Long-running operations
  'bulk', 'batch', 'mass', 'thousands',
];

/**
 * TaskType indicators that affect sizing
 */
const TASK_TYPE_MODIFIERS: Record<string, number> = {
  'READ_INFO': -2,      // Read-only tasks are smaller
  'REPORT': -1,         // Reports are smaller
  'LIGHT_EDIT': -1,     // Light edits are smaller
  'IMPLEMENTATION': 0,  // Standard
  'REVIEW_RESPONSE': 0, // Standard
  'CONFIG_CI_CHANGE': 1, // CI changes can be complex
  'DANGEROUS_OP': 1,    // Dangerous ops need more time
};

/**
 * Estimates task size based on prompt content
 *
 * @param prompt - Task prompt to analyze
 * @param taskType - Optional task type for additional context
 * @returns Task size estimate with recommended timeout profile
 */
export function estimateTaskSize(
  prompt: string,
  taskType?: string
): TaskSizeEstimate {
  const factors: TaskSizeFactor[] = [];
  let totalScore = 0;

  const lowerPrompt = prompt.toLowerCase();

  // Factor 1: Keyword analysis
  const smallMatches = countKeywordMatches(lowerPrompt, SMALL_TASK_KEYWORDS);
  const mediumMatches = countKeywordMatches(lowerPrompt, MEDIUM_TASK_KEYWORDS);
  const largeMatches = countKeywordMatches(lowerPrompt, LARGE_TASK_KEYWORDS);
  const xlargeMatches = countKeywordMatches(lowerPrompt, XLARGE_TASK_KEYWORDS);

  if (smallMatches > 0) {
    const score = -0.3 * Math.min(smallMatches, 3);
    factors.push({
      name: 'small_keywords',
      score,
      reason: `Found ${smallMatches} small-task indicators`,
    });
    totalScore += score;
  }

  if (mediumMatches > 0) {
    // Medium is neutral, but many matches might indicate larger scope
    const score = 0.1 * Math.min(mediumMatches, 3);
    factors.push({
      name: 'medium_keywords',
      score,
      reason: `Found ${mediumMatches} medium-task indicators`,
    });
    totalScore += score;
  }

  if (largeMatches > 0) {
    const score = 0.4 * Math.min(largeMatches, 3);
    factors.push({
      name: 'large_keywords',
      score,
      reason: `Found ${largeMatches} large-task indicators`,
    });
    totalScore += score;
  }

  if (xlargeMatches > 0) {
    const score = 0.6 * Math.min(xlargeMatches, 3);
    factors.push({
      name: 'xlarge_keywords',
      score,
      reason: `Found ${xlargeMatches} x-large-task indicators`,
    });
    totalScore += score;
  }

  // Factor 2: Prompt length (longer prompts often mean more complex tasks)
  const promptLength = prompt.length;
  let lengthScore = 0;
  if (promptLength < 50) {
    lengthScore = -0.2;
    factors.push({ name: 'prompt_length', score: lengthScore, reason: 'Very short prompt (<50 chars)' });
  } else if (promptLength < 200) {
    lengthScore = -0.1;
    factors.push({ name: 'prompt_length', score: lengthScore, reason: 'Short prompt (<200 chars)' });
  } else if (promptLength > 1000) {
    lengthScore = 0.3;
    factors.push({ name: 'prompt_length', score: lengthScore, reason: 'Long prompt (>1000 chars)' });
  } else if (promptLength > 500) {
    lengthScore = 0.1;
    factors.push({ name: 'prompt_length', score: lengthScore, reason: 'Medium-long prompt (>500 chars)' });
  }
  totalScore += lengthScore;

  // Factor 3: File count mentions
  const fileCountMatch = prompt.match(/(\d+)\s*(files?|components?|modules?)/i);
  if (fileCountMatch) {
    const count = parseInt(fileCountMatch[1], 10);
    if (count > 10) {
      factors.push({ name: 'file_count', score: 0.5, reason: `Mentions ${count}+ files/components` });
      totalScore += 0.5;
    } else if (count > 5) {
      factors.push({ name: 'file_count', score: 0.3, reason: `Mentions ${count} files/components` });
      totalScore += 0.3;
    } else if (count > 1) {
      factors.push({ name: 'file_count', score: 0.1, reason: `Mentions ${count} files/components` });
      totalScore += 0.1;
    }
  }

  // Factor 4: Task type modifier
  if (taskType && taskType in TASK_TYPE_MODIFIERS) {
    const modifier = TASK_TYPE_MODIFIERS[taskType];
    if (modifier !== 0) {
      const score = modifier * 0.15;
      factors.push({
        name: 'task_type',
        score,
        reason: `TaskType ${taskType} typically ${modifier > 0 ? 'longer' : 'shorter'}`,
      });
      totalScore += score;
    }
  }

  // Factor 5: Iteration/loop indicators
  if (lowerPrompt.includes('until') || lowerPrompt.includes('iterate') || lowerPrompt.includes('repeat')) {
    factors.push({ name: 'iteration', score: 0.3, reason: 'Contains iteration/loop indicators' });
    totalScore += 0.3;
  }

  // Determine category and profile
  const { category, confidence, profile, explanation } = categorizeScore(totalScore, factors);

  return {
    category,
    confidence,
    factors,
    recommendedProfile: profile,
    explanation,
  };
}

/**
 * Count keyword matches in text
 */
function countKeywordMatches(text: string, keywords: string[]): number {
  return keywords.filter(kw => text.includes(kw.toLowerCase())).length;
}

/**
 * Categorize total score into size category
 */
function categorizeScore(
  score: number,
  factors: TaskSizeFactor[]
): { category: TaskSizeCategory; confidence: number; profile: TimeoutProfile; explanation: string } {
  // Score ranges:
  // < -0.3: small
  // -0.3 to 0.2: medium
  // 0.2 to 0.6: large
  // > 0.6: x-large

  let category: TaskSizeCategory;
  let profile: TimeoutProfile;
  let explanation: string;

  if (score < -0.3) {
    category = 'small';
    profile = STANDARD_PROFILE;
    explanation = 'Quick task - using standard timeout profile';
  } else if (score < 0.2) {
    category = 'medium';
    profile = STANDARD_PROFILE;
    explanation = 'Standard task - using standard timeout profile';
  } else if (score < 0.6) {
    category = 'large';
    profile = LONG_PROFILE;
    explanation = 'Complex task - using long timeout profile';
  } else {
    category = 'x-large';
    profile = EXTENDED_PROFILE;
    explanation = 'Very complex task - using extended timeout profile';
  }

  // Confidence based on factor agreement
  const positiveFactors = factors.filter(f => f.score > 0).length;
  const negativeFactors = factors.filter(f => f.score < 0).length;
  const totalFactors = factors.length;

  // Higher confidence if factors agree (all positive or all negative)
  let confidence = 0.5;
  if (totalFactors > 0) {
    const agreement = Math.max(positiveFactors, negativeFactors) / totalFactors;
    confidence = 0.4 + (agreement * 0.5); // Range: 0.4 to 0.9
  }

  return { category, confidence, profile, explanation };
}

/**
 * Gets a custom timeout profile for specific task characteristics
 *
 * @param estimate - Task size estimate
 * @param overrides - Optional overrides for specific timeouts
 * @returns Customized timeout profile
 */
export function getCustomProfileForTask(
  estimate: TaskSizeEstimate,
  overrides?: { idle_timeout_ms?: number; hard_timeout_ms?: number }
): TimeoutProfile {
  const baseProfile = estimate.recommendedProfile;

  if (!overrides?.idle_timeout_ms && !overrides?.hard_timeout_ms) {
    return baseProfile;
  }

  return createCustomProfile(
    overrides.idle_timeout_ms ?? baseProfile.idle_timeout_ms,
    overrides.hard_timeout_ms ?? baseProfile.hard_timeout_ms
  );
}

/**
 * Quick estimate - returns just the recommended profile
 *
 * @param prompt - Task prompt
 * @param taskType - Optional task type
 * @returns Recommended timeout profile
 */
export function quickEstimateProfile(prompt: string, taskType?: string): TimeoutProfile {
  const estimate = estimateTaskSize(prompt, taskType);
  return estimate.recommendedProfile;
}
