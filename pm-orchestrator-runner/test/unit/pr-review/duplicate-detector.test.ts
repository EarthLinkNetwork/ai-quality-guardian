/**
 * Unit tests for DuplicateDetector — detects repeated review comments across cycles
 *
 * Tests:
 * - No previous comments → not duplicate
 * - Same file + nearby line + similar content → duplicate
 * - Same file but different line range → not duplicate
 * - Different file → not duplicate (fast path)
 * - LLM similarity check for ambiguous cases
 * - LLM failure → conservative (not duplicate)
 *
 * TDD: Red phase — tests written before implementation.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 5.4
 */

import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import {
  DuplicateDetector,
  type DuplicateDetectorLLMClient,
  type DuplicateCheckResult,
} from "../../../src/pr-review/duplicate-detector";
import type {
  PRReviewComment,
  GitHubReviewComment,
} from "../../../src/web/dal/pr-review-types";

// ==================== Test Helpers ====================

function createPrevComment(overrides?: Partial<PRReviewComment>): PRReviewComment {
  const now = new Date().toISOString();
  return {
    PK: "ORG#test-org",
    SK: "PRCOMMENT#proj1#42#prev-100",
    commentId: "prev-100",
    projectId: "proj1",
    orgId: "test-org",
    prNumber: 42,
    filePath: "src/utils/parser.ts",
    lineRange: { start: 40, end: 45 },
    body: "Missing error handling for null input",
    category: "ERROR_HANDLING",
    severity: "HIGH",
    judgment: "ACCEPT",
    judgmentReason: "Real issue",
    judgmentConfidence: 0.9,
    suggestedFix: "Add null check",
    llmModel: "claude-sonnet-4-20250514",
    fixApplied: true,
    fixCommitHash: "abc123",
    detectedInCycle: 1,
    lastSeenInCycle: 1,
    isDuplicate: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createNewComment(overrides?: Partial<GitHubReviewComment>): GitHubReviewComment {
  return {
    id: 2001,
    body: "Missing error handling for null input",
    path: "src/utils/parser.ts",
    line: 42,
    startLine: undefined,
    user: "coderabbitai[bot]",
    createdAt: "2026-03-30T12:00:00Z",
    updatedAt: "2026-03-30T12:00:00Z",
    inReplyToId: undefined,
    ...overrides,
  };
}

function createMockLLMClient(
  isDuplicate: boolean = true,
  confidence: number = 0.95
): DuplicateDetectorLLMClient {
  return {
    generate: async (opts) => ({
      content: JSON.stringify({
        isDuplicate,
        confidence,
        reason: isDuplicate ? "Same issue about null handling" : "Different issues",
      }),
      model: "claude-haiku-4-20250514",
    }),
  };
}

// ==================== Tests ====================

describe("DuplicateDetector", () => {
  let detector: DuplicateDetector;
  let mockLLM: DuplicateDetectorLLMClient;

  beforeEach(() => {
    mockLLM = createMockLLMClient(true);
    detector = new DuplicateDetector(mockLLM);
  });

  describe("checkDuplicate", () => {
    it("should return not duplicate when no previous comments exist", async () => {
      const result = await detector.checkDuplicate(
        createNewComment(),
        []
      );

      assert.equal(result.isDuplicate, false);
      assert.ok(result.confidence >= 0.9, "High confidence for no-previous-comments case");
      assert.equal(result.duplicateOfCommentId, undefined);
    });

    it("should return not duplicate when previous comments are on different files", async () => {
      const prevComments = [
        createPrevComment({ filePath: "src/other/file.ts", commentId: "prev-200" }),
      ];

      const result = await detector.checkDuplicate(
        createNewComment({ path: "src/utils/parser.ts" }),
        prevComments
      );

      assert.equal(result.isDuplicate, false);
      assert.ok(result.confidence >= 0.9);
    });

    it("should detect duplicate when same file + nearby line + LLM confirms", async () => {
      const prevComments = [
        createPrevComment({
          filePath: "src/utils/parser.ts",
          lineRange: { start: 40, end: 45 },
          body: "Missing null check for input parameter",
          commentId: "prev-100",
        }),
      ];

      const result = await detector.checkDuplicate(
        createNewComment({
          path: "src/utils/parser.ts",
          line: 42,
          body: "Missing error handling for null input",
        }),
        prevComments
      );

      assert.equal(result.isDuplicate, true);
      assert.equal(result.duplicateOfCommentId, "prev-100");
      assert.ok(result.confidence > 0);
    });

    it("should return not duplicate when same file but lines are far apart", async () => {
      const prevComments = [
        createPrevComment({
          filePath: "src/utils/parser.ts",
          lineRange: { start: 100, end: 105 },
          commentId: "prev-300",
        }),
      ];

      // Line 42 vs lines 100-105 — too far apart (>5 lines)
      const result = await detector.checkDuplicate(
        createNewComment({ path: "src/utils/parser.ts", line: 42 }),
        prevComments
      );

      assert.equal(result.isDuplicate, false);
    });

    it("should handle LLM failure gracefully (conservative: not duplicate)", async () => {
      const failingLLM: DuplicateDetectorLLMClient = {
        generate: async () => { throw new Error("LLM timeout"); },
      };
      detector = new DuplicateDetector(failingLLM);

      const prevComments = [
        createPrevComment({
          filePath: "src/utils/parser.ts",
          lineRange: { start: 40, end: 45 },
        }),
      ];

      const result = await detector.checkDuplicate(
        createNewComment({ path: "src/utils/parser.ts", line: 42 }),
        prevComments
      );

      // On LLM failure, be conservative — treat as not duplicate
      assert.equal(result.isDuplicate, false);
      assert.ok(result.confidence < 0.5, "Low confidence on LLM failure");
    });

    it("should use the closest matching comment when multiple candidates exist", async () => {
      const prevComments = [
        createPrevComment({
          filePath: "src/utils/parser.ts",
          lineRange: { start: 40, end: 45 },
          body: "Null check missing here",
          commentId: "prev-100",
        }),
        createPrevComment({
          filePath: "src/utils/parser.ts",
          lineRange: { start: 41, end: 43 },
          body: "Error handling needed for null",
          commentId: "prev-101",
        }),
      ];

      mockLLM = createMockLLMClient(true, 0.95);
      detector = new DuplicateDetector(mockLLM);

      const result = await detector.checkDuplicate(
        createNewComment({ path: "src/utils/parser.ts", line: 42 }),
        prevComments
      );

      assert.equal(result.isDuplicate, true);
      // Should match one of the nearby comments
      assert.ok(
        result.duplicateOfCommentId === "prev-100" || result.duplicateOfCommentId === "prev-101"
      );
    });

    it("should handle comments without line information", async () => {
      const prevComments = [
        createPrevComment({
          filePath: "src/utils/parser.ts",
          lineRange: undefined,
          body: "General comment about error handling",
          commentId: "prev-400",
        }),
      ];

      const result = await detector.checkDuplicate(
        createNewComment({
          path: "src/utils/parser.ts",
          line: undefined,
          body: "This file needs error handling",
        }),
        prevComments
      );

      // Without line info, cannot determine proximity — not duplicate by fast path
      assert.equal(result.isDuplicate, false);
    });
  });
});
