/**
 * ReviewJudge — LLM-based review comment analysis service
 *
 * Analyzes CodeRabbit review comments using an LLM to determine:
 * - Category (BUG, SECURITY, STYLE, etc.)
 * - Severity (CRITICAL, HIGH, MEDIUM, LOW, INFO)
 * - Judgment (ACCEPT, REJECT, ESCALATE)
 * - Suggested fix (if ACCEPT)
 *
 * Design:
 * - LLM client is injected as an interface (DI for testability)
 * - Low-confidence results are escalated to human review
 * - Graceful degradation on LLM failure (all comments → ESCALATE)
 * - Follows LLMSummarizerClient pattern from task-tracker
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 5.2
 */

import type {
  GitHubReviewComment,
  CommentCategory,
  CommentSeverity,
  CommentJudgment,
} from "../web/dal/pr-review-types";

// ==================== Types ====================

/**
 * Minimal LLM client interface for dependency injection.
 * Follows the same pattern as LLMSummarizerClient.
 */
export interface ReviewJudgeLLMClient {
  generate(opts: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<{ content: string; model: string }>;
}

/**
 * Input for batch comment analysis.
 */
export interface CommentAnalysisInput {
  prTitle: string;
  prUrl: string;
  repository: string;
  comments: GitHubReviewComment[];
}

/**
 * Result of analyzing a single comment.
 */
export interface CommentAnalysisResult {
  commentId: string;
  category: CommentCategory;
  severity: CommentSeverity;
  judgment: CommentJudgment;
  judgmentReason: string;
  judgmentConfidence: number;
  suggestedFix: string | null;
  llmModel: string;
}

export interface ReviewJudgeOptions {
  confidenceThreshold?: number;
}

// ==================== Constants ====================

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const MAX_ANALYSIS_TOKENS = 2000;

const COMMENT_ANALYSIS_SYSTEM_PROMPT = `You are a senior code reviewer analyzing automated review comments on a pull request.

For each comment, you must determine:
1. Category: What type of issue is this? (BUG, SECURITY, PERFORMANCE, TYPE_SAFETY, ERROR_HANDLING, STYLE, NAMING, DOCUMENTATION, BEST_PRACTICE, ARCHITECTURE, TEST, OTHER)
2. Severity: How critical is this? (CRITICAL, HIGH, MEDIUM, LOW, INFO)
3. Judgment: Should we fix this? (ACCEPT, REJECT, ESCALATE)
4. Reason: Why this judgment? (Clear explanation for the human reviewer)
5. Suggested fix: If ACCEPT, what should be done? (Brief description of the fix)

Judgment guidelines:
- ACCEPT: The comment identifies a real issue that should be fixed. This includes bugs, security issues, type safety problems, missing error handling.
- REJECT: The comment is about style preference, subjective naming, or the suggestion would introduce unnecessary complexity. Always provide a clear reason.
- ESCALATE: The comment touches on architecture decisions, trade-offs, or business logic that requires human judgment.

Be strict about ACCEPT - only accept comments that genuinely improve code quality.
Be honest about REJECT - stylistic preferences from automated tools are not worth fixing.

Output JSON array:
[{
  "commentId": "string",
  "category": "BUG|SECURITY|...",
  "severity": "CRITICAL|HIGH|...",
  "judgment": "ACCEPT|REJECT|ESCALATE",
  "judgmentReason": "string (100 chars max)",
  "judgmentConfidence": 0.0-1.0,
  "suggestedFix": "string or null"
}]

Respond ONLY with valid JSON. No markdown, no explanation.`;

// ==================== Implementation ====================

export class ReviewJudge {
  private client: ReviewJudgeLLMClient;
  private confidenceThreshold: number;

  constructor(client: ReviewJudgeLLMClient, options?: ReviewJudgeOptions) {
    this.client = client;
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  /**
   * Analyze a batch of review comments using the LLM.
   *
   * On LLM failure or malformed response, all comments are escalated
   * to human review as a safety measure.
   */
  async analyzeComments(input: CommentAnalysisInput): Promise<CommentAnalysisResult[]> {
    if (input.comments.length === 0) {
      return [];
    }

    const userPrompt = this.buildUserPrompt(input);

    try {
      const response = await this.client.generate({
        systemPrompt: COMMENT_ANALYSIS_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: MAX_ANALYSIS_TOKENS,
      });

      const parsed = this.parseResponse(response.content, input.comments, response.model);
      return this.applyConfidenceThreshold(parsed);
    } catch {
      return this.buildFallbackResults(input.comments);
    }
  }

  // ==================== Prompt Building ====================

  private buildUserPrompt(input: CommentAnalysisInput): string {
    const parts: string[] = [];
    parts.push(`PR: "${input.prTitle}"`);
    parts.push(`Repository: ${input.repository}`);
    parts.push(`URL: ${input.prUrl}`);
    parts.push("");
    parts.push("Review comments to analyze:");
    parts.push("");

    for (const comment of input.comments) {
      parts.push(`--- Comment ID: ${comment.id} ---`);
      parts.push(`File: ${comment.path}`);
      if (comment.line != null) {
        parts.push(`Line: ${comment.startLine ? `${comment.startLine}-${comment.line}` : String(comment.line)}`);
      }
      parts.push(`Body: ${comment.body}`);
      parts.push("");
    }

    return parts.join("\n");
  }

  // ==================== Parsing ====================

  private parseResponse(
    content: string,
    originalComments: GitHubReviewComment[],
    model: string
  ): CommentAnalysisResult[] {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        throw new Error("Expected JSON array");
      }

      return parsed.map((item: Record<string, unknown>) => ({
        commentId: String(item.commentId ?? ""),
        category: this.validateCategory(item.category),
        severity: this.validateSeverity(item.severity),
        judgment: this.validateJudgment(item.judgment),
        judgmentReason: String(item.judgmentReason ?? ""),
        judgmentConfidence: this.clampConfidence(item.judgmentConfidence),
        suggestedFix: item.suggestedFix != null ? String(item.suggestedFix) : null,
        llmModel: model,
      }));
    } catch {
      // Malformed JSON → escalate all
      return this.buildFallbackResults(originalComments);
    }
  }

  private validateCategory(value: unknown): CommentCategory {
    const valid: CommentCategory[] = [
      "BUG", "SECURITY", "PERFORMANCE", "TYPE_SAFETY", "ERROR_HANDLING",
      "STYLE", "NAMING", "DOCUMENTATION", "BEST_PRACTICE", "ARCHITECTURE",
      "TEST", "OTHER",
    ];
    return valid.includes(value as CommentCategory) ? (value as CommentCategory) : "OTHER";
  }

  private validateSeverity(value: unknown): CommentSeverity {
    const valid: CommentSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
    return valid.includes(value as CommentSeverity) ? (value as CommentSeverity) : "MEDIUM";
  }

  private validateJudgment(value: unknown): CommentJudgment {
    const valid: CommentJudgment[] = ["ACCEPT", "REJECT", "ESCALATE", "ALREADY_FIXED", "DUPLICATE"];
    return valid.includes(value as CommentJudgment) ? (value as CommentJudgment) : "ESCALATE";
  }

  private clampConfidence(value: unknown): number {
    const num = Number(value);
    if (isNaN(num)) return 0.5;
    return Math.max(0, Math.min(1, num));
  }

  // ==================== Confidence Threshold ====================

  private applyConfidenceThreshold(results: CommentAnalysisResult[]): CommentAnalysisResult[] {
    return results.map((result) => {
      if (result.judgmentConfidence < this.confidenceThreshold && result.judgment !== "ESCALATE") {
        return {
          ...result,
          judgment: "ESCALATE" as CommentJudgment,
          judgmentReason: `Low confidence (${result.judgmentConfidence.toFixed(2)}). Original: ${result.judgmentReason}`,
        };
      }
      return result;
    });
  }

  // ==================== Fallback ====================

  private buildFallbackResults(comments: GitHubReviewComment[]): CommentAnalysisResult[] {
    return comments.map((comment) => ({
      commentId: String(comment.id),
      category: "OTHER" as CommentCategory,
      severity: "MEDIUM" as CommentSeverity,
      judgment: "ESCALATE" as CommentJudgment,
      judgmentReason: "LLM analysis failed. Escalated for human review.",
      judgmentConfidence: 0,
      suggestedFix: null,
      llmModel: "fallback",
    }));
  }
}
