/**
 * DuplicateDetector — detects repeated review comments across cycles
 *
 * Uses a two-step approach:
 * 1. Fast filter: same file + nearby lines (within 5 lines)
 * 2. LLM similarity check: for candidates that pass the fast filter
 *
 * Design:
 * - LLM client injected as interface (DI for testability)
 * - Conservative on LLM failure: treats as NOT duplicate
 * - Fast path: different file → immediately not duplicate
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 5.4
 */

import type {
  GitHubReviewComment,
  PRReviewComment,
} from "../web/dal/pr-review-types";

// ==================== Types ====================

/**
 * Minimal LLM client interface for duplicate detection.
 * Uses low-cost model (haiku/mini) for cost efficiency.
 */
export interface DuplicateDetectorLLMClient {
  generate(opts: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<{ content: string; model: string }>;
}

/**
 * Result of duplicate detection for a single comment.
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOfCommentId?: string;
  confidence: number;
}

// ==================== Constants ====================

const LINE_PROXIMITY_THRESHOLD = 5;
const MAX_DUPLICATE_TOKENS = 200;

const DUPLICATE_DETECTION_SYSTEM_PROMPT =
  'Compare two review comments. Are they pointing out the same issue? Output JSON: { "isDuplicate": boolean, "confidence": 0.0-1.0, "reason": "string" }. Respond ONLY with valid JSON.';

// ==================== Implementation ====================

export class DuplicateDetector {
  private client: DuplicateDetectorLLMClient;

  constructor(client: DuplicateDetectorLLMClient) {
    this.client = client;
  }

  /**
   * Check if a new comment is a duplicate of any previous comment.
   *
   * Steps:
   * 1. If no previous comments → not duplicate
   * 2. Filter to same-file comments
   * 3. Filter to nearby-line comments (within 5 lines)
   * 4. If candidates found, use LLM to compare content
   * 5. On LLM failure, conservatively treat as not duplicate
   */
  async checkDuplicate(
    newComment: GitHubReviewComment,
    previousComments: PRReviewComment[]
  ): Promise<DuplicateCheckResult> {
    // Step 1: No previous comments → definitely not duplicate
    if (previousComments.length === 0) {
      return { isDuplicate: false, confidence: 1.0 };
    }

    // Step 2: Filter to same-file comments
    const sameFileComments = previousComments.filter(
      (prev) => prev.filePath === newComment.path
    );

    if (sameFileComments.length === 0) {
      return { isDuplicate: false, confidence: 1.0 };
    }

    // Step 3: Filter to nearby-line comments
    const nearbyComments = this.findNearbyComments(newComment, sameFileComments);

    if (nearbyComments.length === 0) {
      return { isDuplicate: false, confidence: 0.9 };
    }

    // Step 4: LLM similarity check with the closest candidate
    const closest = this.findClosestComment(newComment, nearbyComments);
    return this.llmSimilarityCheck(newComment, closest);
  }

  // ==================== Fast Filters ====================

  private findNearbyComments(
    newComment: GitHubReviewComment,
    sameFileComments: PRReviewComment[]
  ): PRReviewComment[] {
    // If new comment has no line info, we cannot determine proximity
    if (newComment.line == null && newComment.startLine == null) {
      return [];
    }

    const newLine = newComment.startLine ?? newComment.line!;

    return sameFileComments.filter((prev) => {
      if (!prev.lineRange) return false;
      const distance = Math.abs(prev.lineRange.start - newLine);
      return distance <= LINE_PROXIMITY_THRESHOLD;
    });
  }

  private findClosestComment(
    newComment: GitHubReviewComment,
    candidates: PRReviewComment[]
  ): PRReviewComment {
    const newLine = newComment.startLine ?? newComment.line!;

    let closest = candidates[0];
    let minDistance = Infinity;

    for (const candidate of candidates) {
      if (candidate.lineRange) {
        const distance = Math.abs(candidate.lineRange.start - newLine);
        if (distance < minDistance) {
          minDistance = distance;
          closest = candidate;
        }
      }
    }

    return closest;
  }

  // ==================== LLM Similarity Check ====================

  private async llmSimilarityCheck(
    newComment: GitHubReviewComment,
    previousComment: PRReviewComment
  ): Promise<DuplicateCheckResult> {
    try {
      const response = await this.client.generate({
        systemPrompt: DUPLICATE_DETECTION_SYSTEM_PROMPT,
        userPrompt: `New comment: ${newComment.body}\n\nPrevious comment: ${previousComment.body}`,
        maxTokens: MAX_DUPLICATE_TOKENS,
      });

      const parsed = JSON.parse(response.content);
      return {
        isDuplicate: Boolean(parsed.isDuplicate),
        duplicateOfCommentId: parsed.isDuplicate ? previousComment.commentId : undefined,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      };
    } catch {
      // On LLM failure, be conservative — treat as not duplicate
      return {
        isDuplicate: false,
        confidence: 0.3,
      };
    }
  }
}
