/**
 * Unit tests for ReviewJudge — LLM-based review comment analysis
 *
 * Tests:
 * - analyzeComments: sends comments to LLM and parses judgment results
 * - Category/severity classification
 * - ACCEPT/REJECT/ESCALATE judgment
 * - Confidence threshold handling (low confidence → ESCALATE)
 * - Error handling: LLM failure → graceful degradation
 * - Prompt construction: PR context included
 * - Batch analysis: multiple comments in single LLM call
 *
 * TDD: Red phase — tests written before implementation.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 5.2
 */

import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import {
  ReviewJudge,
  type ReviewJudgeLLMClient,
  type CommentAnalysisInput,
  type CommentAnalysisResult,
} from "../../../src/pr-review/review-judge";
import type {
  GitHubReviewComment,
  CommentJudgment,
} from "../../../src/web/dal/pr-review-types";

// ==================== Test Helpers ====================

function createMockComment(overrides?: Partial<GitHubReviewComment>): GitHubReviewComment {
  return {
    id: 1001,
    body: "This function is missing error handling for null input",
    path: "src/utils/parser.ts",
    line: 42,
    startLine: undefined,
    user: "coderabbitai[bot]",
    createdAt: "2026-03-30T10:00:00Z",
    updatedAt: "2026-03-30T10:00:00Z",
    inReplyToId: undefined,
    ...overrides,
  };
}

function createMockLLMClient(
  responseOverride?: string
): ReviewJudgeLLMClient {
  const defaultResponse = JSON.stringify([
    {
      commentId: "1001",
      category: "ERROR_HANDLING",
      severity: "HIGH",
      judgment: "ACCEPT",
      judgmentReason: "Missing null check could cause runtime error",
      judgmentConfidence: 0.92,
      suggestedFix: "Add null guard at function entry",
    },
  ]);

  return {
    generate: async (opts) => ({
      content: responseOverride ?? defaultResponse,
      model: "claude-sonnet-4-20250514",
    }),
  };
}

// ==================== Tests ====================

describe("ReviewJudge", () => {
  let judge: ReviewJudge;
  let mockClient: ReviewJudgeLLMClient;

  beforeEach(() => {
    mockClient = createMockLLMClient();
    judge = new ReviewJudge(mockClient);
  });

  describe("analyzeComments", () => {
    it("should analyze a single comment and return structured judgment", async () => {
      const comments = [createMockComment()];
      const input: CommentAnalysisInput = {
        prTitle: "feat: Add parser utility",
        prUrl: "https://github.com/org/repo/pull/42",
        repository: "org/repo",
        comments,
      };

      const results = await judge.analyzeComments(input);

      assert.equal(results.length, 1);
      assert.equal(results[0].commentId, "1001");
      assert.equal(results[0].category, "ERROR_HANDLING");
      assert.equal(results[0].severity, "HIGH");
      assert.equal(results[0].judgment, "ACCEPT");
      assert.ok(results[0].judgmentReason.length > 0);
      assert.ok(results[0].judgmentConfidence >= 0 && results[0].judgmentConfidence <= 1);
      assert.ok(results[0].suggestedFix);
    });

    it("should analyze multiple comments in a single batch", async () => {
      const multiResponse = JSON.stringify([
        {
          commentId: "1001",
          category: "ERROR_HANDLING",
          severity: "HIGH",
          judgment: "ACCEPT",
          judgmentReason: "Missing null check",
          judgmentConfidence: 0.9,
          suggestedFix: "Add null guard",
        },
        {
          commentId: "1002",
          category: "STYLE",
          severity: "LOW",
          judgment: "REJECT",
          judgmentReason: "Stylistic preference, not a real issue",
          judgmentConfidence: 0.95,
          suggestedFix: null,
        },
      ]);
      mockClient = createMockLLMClient(multiResponse);
      judge = new ReviewJudge(mockClient);

      const comments = [
        createMockComment({ id: 1001 }),
        createMockComment({ id: 1002, body: "Consider using camelCase here", path: "src/index.ts" }),
      ];

      const results = await judge.analyzeComments({
        prTitle: "feat: Add parser",
        prUrl: "https://github.com/org/repo/pull/42",
        repository: "org/repo",
        comments,
      });

      assert.equal(results.length, 2);
      assert.equal(results[0].judgment, "ACCEPT");
      assert.equal(results[1].judgment, "REJECT");
    });

    it("should escalate when confidence is below threshold", async () => {
      const lowConfResponse = JSON.stringify([
        {
          commentId: "1001",
          category: "ARCHITECTURE",
          severity: "MEDIUM",
          judgment: "ACCEPT",
          judgmentReason: "May need refactoring",
          judgmentConfidence: 0.55,
          suggestedFix: "Consider restructuring",
        },
      ]);
      mockClient = createMockLLMClient(lowConfResponse);
      judge = new ReviewJudge(mockClient, { confidenceThreshold: 0.7 });

      const results = await judge.analyzeComments({
        prTitle: "feat: Refactor",
        prUrl: "https://github.com/org/repo/pull/10",
        repository: "org/repo",
        comments: [createMockComment()],
      });

      assert.equal(results.length, 1);
      // Low confidence should override to ESCALATE
      assert.equal(results[0].judgment, "ESCALATE");
    });

    it("should return fallback results on LLM failure", async () => {
      const failingClient: ReviewJudgeLLMClient = {
        generate: async () => { throw new Error("LLM API timeout"); },
      };
      judge = new ReviewJudge(failingClient);

      const results = await judge.analyzeComments({
        prTitle: "feat: Something",
        prUrl: "https://github.com/org/repo/pull/1",
        repository: "org/repo",
        comments: [createMockComment()],
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].judgment, "ESCALATE");
      assert.ok(results[0].judgmentReason.includes("LLM"));
      assert.equal(results[0].judgmentConfidence, 0);
    });

    it("should handle malformed LLM JSON gracefully", async () => {
      mockClient = createMockLLMClient("This is not valid JSON");
      judge = new ReviewJudge(mockClient);

      const results = await judge.analyzeComments({
        prTitle: "feat: Test",
        prUrl: "https://github.com/org/repo/pull/5",
        repository: "org/repo",
        comments: [createMockComment()],
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].judgment, "ESCALATE");
    });

    it("should record the LLM model name used", async () => {
      const results = await judge.analyzeComments({
        prTitle: "feat: Test",
        prUrl: "https://github.com/org/repo/pull/5",
        repository: "org/repo",
        comments: [createMockComment()],
      });

      assert.equal(results[0].llmModel, "claude-sonnet-4-20250514");
    });

    it("should pass PR context in the prompt", async () => {
      let capturedPrompt = "";
      const capturingClient: ReviewJudgeLLMClient = {
        generate: async (opts) => {
          capturedPrompt = opts.userPrompt;
          return {
            content: JSON.stringify([{
              commentId: "1001",
              category: "BUG",
              severity: "HIGH",
              judgment: "ACCEPT",
              judgmentReason: "Bug found",
              judgmentConfidence: 0.9,
              suggestedFix: "Fix it",
            }]),
            model: "claude-sonnet-4-20250514",
          };
        },
      };
      judge = new ReviewJudge(capturingClient);

      await judge.analyzeComments({
        prTitle: "feat: My PR Title",
        prUrl: "https://github.com/org/repo/pull/42",
        repository: "org/repo",
        comments: [createMockComment()],
      });

      assert.ok(capturedPrompt.includes("feat: My PR Title"), "Should include PR title");
      assert.ok(capturedPrompt.includes("org/repo"), "Should include repository");
    });

    it("should return empty array for empty comments input", async () => {
      const results = await judge.analyzeComments({
        prTitle: "feat: Empty",
        prUrl: "https://github.com/org/repo/pull/1",
        repository: "org/repo",
        comments: [],
      });

      assert.deepEqual(results, []);
    });
  });
});
