/**
 * CycleManager — determines whether to continue review cycles
 *
 * Evaluates the current cycle's comment analysis results and decides:
 * - CONTINUE: New valid comments need fixing
 * - COMPLETE: No actionable comments remain
 * - ESCALATE: Human judgment needed
 * - CYCLE_LIMIT: Maximum cycles reached
 *
 * Design:
 * - Heuristic-first: simple rules checked before LLM
 * - LLM provides nuanced analysis for ambiguous cases
 * - Graceful fallback: heuristic decision if LLM fails
 * - Follows LLMSummarizerClient pattern
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 5.3, Section 7
 */

import type { CycleDecision, CommentJudgment } from "../web/dal/pr-review-types";

// ==================== Types ====================

/**
 * Minimal LLM client interface for cycle decisions.
 */
export interface CycleManagerLLMClient {
  generate(opts: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<{ content: string; model: string }>;
}

/**
 * Summary of a comment's analysis result for cycle decision.
 */
export interface CommentSummaryForCycle {
  commentId: string;
  judgment: CommentJudgment;
  isDuplicate: boolean;
  category: string;
  severity: string;
}

/**
 * Input for cycle decision.
 */
export interface CycleAnalysisInput {
  currentCycle: number;
  maxCycles: number;
  commentSummaries: CommentSummaryForCycle[];
  previousCycleSummaries: string[];
}

/**
 * Result of cycle analysis.
 */
export interface CycleAnalysisResult {
  decision: CycleDecision;
  reason: string;
  summary: string;
  newValidCommentCount: number;
  duplicateCommentCount: number;
  styleOnlyCommentCount: number;
}

// ==================== Constants ====================

const MAX_CYCLE_DECISION_TOKENS = 500;

const STYLE_CATEGORIES = new Set(["STYLE", "NAMING", "DOCUMENTATION"]);

const CYCLE_DECISION_SYSTEM_PROMPT = `You are deciding whether another review cycle is needed for a pull request.

You are given:
- The current cycle number and max cycles
- New comments from the latest review
- History of previous cycles
- Which comments are duplicates of previous cycles

Decision criteria:
- CONTINUE: There are new, valid comments that should be addressed (not duplicates, not style-only)
- COMPLETE: All new comments are either: zero comments, style/preference only, or duplicates of previously addressed/rejected comments
- ESCALATE: There are new comments that require human judgment (architecture, business logic)
- CYCLE_LIMIT: Current cycle equals max cycles

Output JSON:
{
  "decision": "CONTINUE|COMPLETE|ESCALATE|CYCLE_LIMIT",
  "reason": "string (200 chars max)",
  "summary": "string (500 chars max) - Summary of this cycle for the dashboard",
  "newValidCommentCount": number,
  "duplicateCommentCount": number,
  "styleOnlyCommentCount": number
}

Respond ONLY with valid JSON. No markdown, no explanation.`;

// ==================== Implementation ====================

export class CycleManager {
  private client: CycleManagerLLMClient;

  constructor(client: CycleManagerLLMClient) {
    this.client = client;
  }

  /**
   * Decide whether to continue the review cycle.
   *
   * Priority order:
   * 1. Cycle limit → CYCLE_LIMIT (hard stop)
   * 2. Zero comments → COMPLETE (no work)
   * 3. All REJECT or all duplicates → COMPLETE
   * 4. Any ESCALATE → ESCALATE
   * 5. LLM analysis for nuanced decision
   * 6. Heuristic fallback on LLM failure
   */
  async decideCycle(input: CycleAnalysisInput): Promise<CycleAnalysisResult> {
    const stats = this.computeStats(input.commentSummaries);

    // Rule 1: Cycle limit check (hard stop)
    if (input.currentCycle >= input.maxCycles) {
      return {
        decision: "CYCLE_LIMIT",
        reason: `Cycle limit reached (${input.currentCycle}/${input.maxCycles})`,
        summary: `Reached maximum cycle limit of ${input.maxCycles}. Remaining issues require human review.`,
        ...stats,
      };
    }

    // Rule 2: Zero comments → COMPLETE
    if (input.commentSummaries.length === 0) {
      return {
        decision: "COMPLETE",
        reason: "No new comments in this cycle",
        summary: "No new review comments. All previous issues have been resolved.",
        ...stats,
      };
    }

    // Rule 3: All REJECT or all duplicates → COMPLETE
    if (stats.newValidCommentCount === 0) {
      return {
        decision: "COMPLETE",
        reason: "All comments are rejected, duplicates, or style-only",
        summary: `All ${input.commentSummaries.length} comments are either duplicates, style-only, or rejected. No actionable issues remain.`,
        ...stats,
      };
    }

    // Rule 4: Any ESCALATE → ESCALATE
    const hasEscalate = input.commentSummaries.some(
      (c) => c.judgment === "ESCALATE" && !c.isDuplicate
    );
    if (hasEscalate) {
      return {
        decision: "ESCALATE",
        reason: "Comments requiring human judgment detected",
        summary: `Found comments that require human judgment (architecture/business decisions). Escalating for review.`,
        ...stats,
      };
    }

    // Rule 5: LLM analysis for nuanced decision
    try {
      return await this.llmDecision(input, stats);
    } catch {
      // Rule 6: Heuristic fallback
      return this.heuristicFallback(input, stats);
    }
  }

  // ==================== Statistics ====================

  private computeStats(commentSummaries: CommentSummaryForCycle[]): {
    newValidCommentCount: number;
    duplicateCommentCount: number;
    styleOnlyCommentCount: number;
  } {
    let duplicateCount = 0;
    let styleOnlyCount = 0;
    let validCount = 0;

    for (const comment of commentSummaries) {
      if (comment.isDuplicate) {
        duplicateCount++;
      } else if (
        comment.judgment === "REJECT" ||
        STYLE_CATEGORIES.has(comment.category)
      ) {
        styleOnlyCount++;
      } else if (comment.judgment === "ACCEPT" || comment.judgment === "ESCALATE") {
        validCount++;
      }
    }

    return {
      newValidCommentCount: validCount,
      duplicateCommentCount: duplicateCount,
      styleOnlyCommentCount: styleOnlyCount,
    };
  }

  // ==================== LLM Decision ====================

  private async llmDecision(
    input: CycleAnalysisInput,
    stats: { newValidCommentCount: number; duplicateCommentCount: number; styleOnlyCommentCount: number }
  ): Promise<CycleAnalysisResult> {
    const userPrompt = this.buildUserPrompt(input);

    const response = await this.client.generate({
      systemPrompt: CYCLE_DECISION_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: MAX_CYCLE_DECISION_TOKENS,
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        decision: this.validateDecision(parsed.decision),
        reason: String(parsed.reason ?? ""),
        summary: String(parsed.summary ?? ""),
        newValidCommentCount: typeof parsed.newValidCommentCount === "number"
          ? parsed.newValidCommentCount
          : stats.newValidCommentCount,
        duplicateCommentCount: typeof parsed.duplicateCommentCount === "number"
          ? parsed.duplicateCommentCount
          : stats.duplicateCommentCount,
        styleOnlyCommentCount: typeof parsed.styleOnlyCommentCount === "number"
          ? parsed.styleOnlyCommentCount
          : stats.styleOnlyCommentCount,
      };
    } catch {
      // Malformed JSON from LLM → use heuristic
      return this.heuristicFallback(input, stats);
    }
  }

  private buildUserPrompt(input: CycleAnalysisInput): string {
    const parts: string[] = [];
    parts.push(`Current cycle: ${input.currentCycle}/${input.maxCycles}`);
    parts.push(`Total comments this cycle: ${input.commentSummaries.length}`);
    parts.push("");

    if (input.previousCycleSummaries.length > 0) {
      parts.push("Previous cycle summaries:");
      for (const summary of input.previousCycleSummaries) {
        parts.push(`  - ${summary}`);
      }
      parts.push("");
    }

    parts.push("Comments in this cycle:");
    for (const comment of input.commentSummaries) {
      parts.push(
        `  - [${comment.judgment}] ${comment.category}/${comment.severity}` +
        `${comment.isDuplicate ? " (DUPLICATE)" : ""}`
      );
    }

    return parts.join("\n");
  }

  private validateDecision(value: unknown): CycleDecision {
    const valid: CycleDecision[] = ["CONTINUE", "COMPLETE", "ESCALATE", "CYCLE_LIMIT"];
    return valid.includes(value as CycleDecision) ? (value as CycleDecision) : "CONTINUE";
  }

  // ==================== Heuristic Fallback ====================

  private heuristicFallback(
    input: CycleAnalysisInput,
    stats: { newValidCommentCount: number; duplicateCommentCount: number; styleOnlyCommentCount: number }
  ): CycleAnalysisResult {
    if (input.commentSummaries.length === 0 || stats.newValidCommentCount === 0) {
      return {
        decision: "COMPLETE",
        reason: "Heuristic fallback: no actionable comments",
        summary: "LLM unavailable. Heuristic: no new actionable comments found.",
        ...stats,
      };
    }

    return {
      decision: "CONTINUE",
      reason: `Heuristic fallback: ${stats.newValidCommentCount} new valid comments detected`,
      summary: `LLM unavailable. Heuristic: ${stats.newValidCommentCount} new comments need attention.`,
      ...stats,
    };
  }
}
