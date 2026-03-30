/**
 * Unit tests for CycleManager — determines whether to continue review cycles
 *
 * Tests:
 * - Zero new comments → COMPLETE
 * - All new comments are REJECT → COMPLETE
 * - All new comments are duplicates → COMPLETE
 * - New ACCEPT comments → CONTINUE
 * - ESCALATE comments present → ESCALATE
 * - Cycle limit reached → CYCLE_LIMIT
 * - LLM-based cycle decision
 * - LLM failure → fallback heuristic
 *
 * TDD: Red phase — tests written before implementation.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 5.3, Section 7
 */

import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import {
  CycleManager,
  type CycleManagerLLMClient,
  type CycleAnalysisInput,
  type CycleAnalysisResult,
} from "../../../src/pr-review/cycle-manager";
import type {
  CycleDecision,
  CommentJudgment,
} from "../../../src/web/dal/pr-review-types";

// ==================== Test Helpers ====================

interface CommentSummary {
  commentId: string;
  judgment: CommentJudgment;
  isDuplicate: boolean;
  category: string;
  severity: string;
}

function createMockLLMClient(
  decision: CycleDecision = "CONTINUE"
): CycleManagerLLMClient {
  return {
    generate: async (opts) => ({
      content: JSON.stringify({
        decision,
        reason: `LLM decided: ${decision}`,
        summary: `Cycle analysis complete. Decision: ${decision}`,
        newValidCommentCount: 2,
        duplicateCommentCount: 1,
        styleOnlyCommentCount: 0,
      }),
      model: "claude-sonnet-4-20250514",
    }),
  };
}

// ==================== Tests ====================

describe("CycleManager", () => {
  let manager: CycleManager;
  let mockLLM: CycleManagerLLMClient;

  beforeEach(() => {
    mockLLM = createMockLLMClient("CONTINUE");
    manager = new CycleManager(mockLLM);
  });

  describe("decideCycle", () => {
    it("should return COMPLETE when there are zero new comments", async () => {
      const input: CycleAnalysisInput = {
        currentCycle: 2,
        maxCycles: 5,
        commentSummaries: [],
        previousCycleSummaries: ["Cycle 1: Fixed 3 issues"],
      };

      const result = await manager.decideCycle(input);

      assert.equal(result.decision, "COMPLETE");
      assert.ok(result.reason.length > 0);
    });

    it("should return COMPLETE when all comments are REJECT", async () => {
      const input: CycleAnalysisInput = {
        currentCycle: 2,
        maxCycles: 5,
        commentSummaries: [
          { commentId: "c1", judgment: "REJECT", isDuplicate: false, category: "STYLE", severity: "LOW" },
          { commentId: "c2", judgment: "REJECT", isDuplicate: false, category: "NAMING", severity: "LOW" },
        ],
        previousCycleSummaries: ["Cycle 1: Fixed 3 issues"],
      };

      const result = await manager.decideCycle(input);

      assert.equal(result.decision, "COMPLETE");
    });

    it("should return COMPLETE when all comments are duplicates", async () => {
      const input: CycleAnalysisInput = {
        currentCycle: 3,
        maxCycles: 5,
        commentSummaries: [
          { commentId: "c1", judgment: "ACCEPT", isDuplicate: true, category: "BUG", severity: "HIGH" },
          { commentId: "c2", judgment: "ACCEPT", isDuplicate: true, category: "ERROR_HANDLING", severity: "MEDIUM" },
        ],
        previousCycleSummaries: [],
      };

      const result = await manager.decideCycle(input);

      assert.equal(result.decision, "COMPLETE");
    });

    it("should return CYCLE_LIMIT when current cycle equals max cycles", async () => {
      const input: CycleAnalysisInput = {
        currentCycle: 5,
        maxCycles: 5,
        commentSummaries: [
          { commentId: "c1", judgment: "ACCEPT", isDuplicate: false, category: "BUG", severity: "HIGH" },
        ],
        previousCycleSummaries: [],
      };

      const result = await manager.decideCycle(input);

      assert.equal(result.decision, "CYCLE_LIMIT");
    });

    it("should return CONTINUE when there are new ACCEPT (non-duplicate) comments", async () => {
      mockLLM = createMockLLMClient("CONTINUE");
      manager = new CycleManager(mockLLM);

      const input: CycleAnalysisInput = {
        currentCycle: 2,
        maxCycles: 5,
        commentSummaries: [
          { commentId: "c1", judgment: "ACCEPT", isDuplicate: false, category: "BUG", severity: "HIGH" },
          { commentId: "c2", judgment: "REJECT", isDuplicate: false, category: "STYLE", severity: "LOW" },
        ],
        previousCycleSummaries: ["Cycle 1: Fixed 2 issues"],
      };

      const result = await manager.decideCycle(input);

      assert.equal(result.decision, "CONTINUE");
    });

    it("should return ESCALATE when there are ESCALATE comments", async () => {
      const input: CycleAnalysisInput = {
        currentCycle: 2,
        maxCycles: 5,
        commentSummaries: [
          { commentId: "c1", judgment: "ESCALATE", isDuplicate: false, category: "ARCHITECTURE", severity: "HIGH" },
          { commentId: "c2", judgment: "ACCEPT", isDuplicate: false, category: "BUG", severity: "MEDIUM" },
        ],
        previousCycleSummaries: [],
      };

      const result = await manager.decideCycle(input);

      assert.equal(result.decision, "ESCALATE");
    });

    it("should include summary and statistics in result", async () => {
      const input: CycleAnalysisInput = {
        currentCycle: 2,
        maxCycles: 5,
        commentSummaries: [
          { commentId: "c1", judgment: "ACCEPT", isDuplicate: false, category: "BUG", severity: "HIGH" },
        ],
        previousCycleSummaries: [],
      };

      const result = await manager.decideCycle(input);

      assert.ok(result.summary.length > 0);
      assert.ok(typeof result.newValidCommentCount === "number");
      assert.ok(typeof result.duplicateCommentCount === "number");
      assert.ok(typeof result.styleOnlyCommentCount === "number");
    });

    it("should use heuristic fallback on LLM failure", async () => {
      const failingLLM: CycleManagerLLMClient = {
        generate: async () => { throw new Error("LLM timeout"); },
      };
      manager = new CycleManager(failingLLM);

      const input: CycleAnalysisInput = {
        currentCycle: 2,
        maxCycles: 5,
        commentSummaries: [
          { commentId: "c1", judgment: "ACCEPT", isDuplicate: false, category: "BUG", severity: "HIGH" },
        ],
        previousCycleSummaries: [],
      };

      const result = await manager.decideCycle(input);

      // Fallback heuristic: new ACCEPT non-duplicate comments → CONTINUE
      assert.equal(result.decision, "CONTINUE");
      assert.ok(result.reason.includes("fallback") || result.reason.includes("heuristic"));
    });

    it("should use heuristic fallback: zero comments → COMPLETE", async () => {
      const failingLLM: CycleManagerLLMClient = {
        generate: async () => { throw new Error("LLM timeout"); },
      };
      manager = new CycleManager(failingLLM);

      const input: CycleAnalysisInput = {
        currentCycle: 2,
        maxCycles: 5,
        commentSummaries: [],
        previousCycleSummaries: [],
      };

      const result = await manager.decideCycle(input);

      assert.equal(result.decision, "COMPLETE");
    });
  });
});
