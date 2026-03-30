/**
 * Unit tests for PR Review DAL operations
 *
 * Tests CRUD operations for PRReviewState, PRReviewComment, and PRReviewCycle
 * using the NoDynamo (file-based) implementation.
 *
 * TDD: Red phase — write tests first, then implement.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NoDynamoDALWithConversations } from "../../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../../src/web/dal/dal-interface";
import type {
  PRReviewState,
  PRReviewComment,
  PRReviewCycle,
  CreatePRReviewStateInput,
} from "../../../../src/web/dal/pr-review-types";

describe("PR Review DAL - NoDynamo Implementation", () => {
  let dal: IDataAccessLayer;
  let tmpDir: string;
  const ORG_ID = "test-org";
  const PROJECT_ID = "proj_abc123";
  const PR_NUMBER = 42;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-review-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==================== PRReviewState CRUD ====================

  describe("createPRReviewState", () => {
    it("creates a new PR review state with defaults", async () => {
      const input: CreatePRReviewStateInput = {
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: add new feature",
        prUrl: "https://github.com/owner/repo/pull/42",
        baseBranch: "main",
        headBranch: "feature/new-feature",
        repository: "owner/repo",
      };

      const result = await dal.createPRReviewState(input);

      assert.equal(result.projectId, PROJECT_ID);
      assert.equal(result.orgId, ORG_ID);
      assert.equal(result.prNumber, PR_NUMBER);
      assert.equal(result.prTitle, "feat: add new feature");
      assert.equal(result.prUrl, "https://github.com/owner/repo/pull/42");
      assert.equal(result.baseBranch, "main");
      assert.equal(result.headBranch, "feature/new-feature");
      assert.equal(result.repository, "owner/repo");
      assert.equal(result.status, "REVIEW_PENDING");
      assert.equal(result.currentCycle, 0);
      assert.equal(result.maxCycles, 5);
      assert.equal(result.totalComments, 0);
      assert.equal(result.pendingComments, 0);
      assert.equal(result.acceptedComments, 0);
      assert.equal(result.rejectedComments, 0);
      assert.equal(result.escalatedComments, 0);
      assert.equal(result.lastReviewArrivedAt, null);
      assert.equal(result.lastFixPushedAt, null);
      assert.equal(result.version, 1);
      assert.ok(result.createdAt);
      assert.ok(result.updatedAt);
      assert.equal(result.PK, `ORG#${ORG_ID}`);
      assert.equal(result.SK, `PR#${PROJECT_ID}#${PR_NUMBER}`);
    });

    it("respects custom maxCycles", async () => {
      const input: CreatePRReviewStateInput = {
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "test",
        prUrl: "https://github.com/owner/repo/pull/42",
        baseBranch: "main",
        headBranch: "feature/test",
        repository: "owner/repo",
        maxCycles: 10,
      };

      const result = await dal.createPRReviewState(input);
      assert.equal(result.maxCycles, 10);
    });
  });

  describe("getPRReviewState", () => {
    it("returns null when state does not exist", async () => {
      const result = await dal.getPRReviewState(PROJECT_ID, 999);
      assert.equal(result, null);
    });

    it("returns state after creation", async () => {
      await dal.createPRReviewState(createMinimalInput());

      const result = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.notEqual(result, null);
      assert.equal(result!.prNumber, PR_NUMBER);
      assert.equal(result!.projectId, PROJECT_ID);
    });
  });

  describe("updatePRReviewState", () => {
    it("updates status with correct version", async () => {
      await dal.createPRReviewState(createMinimalInput());

      const result = await dal.updatePRReviewState(PROJECT_ID, PR_NUMBER, {
        status: "REVIEW_ARRIVED",
        version: 1,
      });

      assert.equal(result.status, "REVIEW_ARRIVED");
      assert.equal(result.version, 2);
    });

    it("updates multiple fields", async () => {
      await dal.createPRReviewState(createMinimalInput());

      const result = await dal.updatePRReviewState(PROJECT_ID, PR_NUMBER, {
        status: "ANALYZING",
        currentCycle: 1,
        totalComments: 5,
        pendingComments: 3,
        acceptedComments: 2,
        lastReviewArrivedAt: "2026-03-30T10:00:00Z",
        version: 1,
      });

      assert.equal(result.status, "ANALYZING");
      assert.equal(result.currentCycle, 1);
      assert.equal(result.totalComments, 5);
      assert.equal(result.pendingComments, 3);
      assert.equal(result.acceptedComments, 2);
      assert.equal(result.lastReviewArrivedAt, "2026-03-30T10:00:00Z");
      assert.equal(result.version, 2);
    });

    it("throws on version mismatch", async () => {
      await dal.createPRReviewState(createMinimalInput());

      await assert.rejects(
        () =>
          dal.updatePRReviewState(PROJECT_ID, PR_NUMBER, {
            status: "REVIEW_ARRIVED",
            version: 99,
          }),
        /version/i
      );
    });

    it("throws when state does not exist", async () => {
      await assert.rejects(
        () =>
          dal.updatePRReviewState(PROJECT_ID, 999, {
            status: "REVIEW_ARRIVED",
            version: 1,
          }),
        /not found/i
      );
    });
  });

  describe("listPRReviewStates", () => {
    it("returns empty array when no states exist", async () => {
      const result = await dal.listPRReviewStates(PROJECT_ID);
      assert.deepEqual(result, []);
    });

    it("returns all states for a project", async () => {
      await dal.createPRReviewState(createMinimalInput());
      await dal.createPRReviewState({
        ...createMinimalInput(),
        prNumber: 43,
        prTitle: "second PR",
      });

      const result = await dal.listPRReviewStates(PROJECT_ID);
      assert.equal(result.length, 2);
    });

    it("filters by status", async () => {
      await dal.createPRReviewState(createMinimalInput());
      const input2 = { ...createMinimalInput(), prNumber: 43 };
      await dal.createPRReviewState(input2);
      await dal.updatePRReviewState(PROJECT_ID, 43, {
        status: "REVIEW_ARRIVED",
        version: 1,
      });

      const result = await dal.listPRReviewStates(PROJECT_ID, {
        status: "REVIEW_ARRIVED",
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].prNumber, 43);
    });

    it("respects limit", async () => {
      for (let i = 0; i < 5; i++) {
        await dal.createPRReviewState({
          ...createMinimalInput(),
          prNumber: PR_NUMBER + i,
        });
      }

      const result = await dal.listPRReviewStates(PROJECT_ID, { limit: 3 });
      assert.equal(result.length, 3);
    });

    it("does not return states from other projects", async () => {
      await dal.createPRReviewState(createMinimalInput());
      await dal.createPRReviewState({
        ...createMinimalInput(),
        projectId: "proj_other",
      });

      const result = await dal.listPRReviewStates(PROJECT_ID);
      assert.equal(result.length, 1);
      assert.equal(result[0].projectId, PROJECT_ID);
    });
  });

  describe("deletePRReviewState", () => {
    it("deletes an existing state", async () => {
      await dal.createPRReviewState(createMinimalInput());

      await dal.deletePRReviewState(PROJECT_ID, PR_NUMBER);

      const result = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.equal(result, null);
    });

    it("does not throw when deleting non-existent state", async () => {
      await dal.deletePRReviewState(PROJECT_ID, 999);
      // Should not throw
    });
  });

  // ==================== PRReviewComment CRUD ====================

  describe("batchCreatePRReviewComments", () => {
    it("creates multiple comments at once", async () => {
      const comments: PRReviewComment[] = [
        createMinimalComment("c1"),
        createMinimalComment("c2"),
        createMinimalComment("c3"),
      ];

      await dal.batchCreatePRReviewComments(comments);

      const result = await dal.listPRReviewComments(PROJECT_ID, PR_NUMBER);
      assert.equal(result.length, 3);
    });
  });

  describe("getPRReviewComment", () => {
    it("returns null when comment does not exist", async () => {
      const result = await dal.getPRReviewComment(
        PROJECT_ID,
        PR_NUMBER,
        "nonexistent"
      );
      assert.equal(result, null);
    });

    it("returns comment after batch creation", async () => {
      await dal.batchCreatePRReviewComments([createMinimalComment("c1")]);

      const result = await dal.getPRReviewComment(
        PROJECT_ID,
        PR_NUMBER,
        "c1"
      );
      assert.notEqual(result, null);
      assert.equal(result!.commentId, "c1");
      assert.equal(result!.projectId, PROJECT_ID);
      assert.equal(result!.prNumber, PR_NUMBER);
    });
  });

  describe("listPRReviewComments", () => {
    it("returns empty array when no comments exist", async () => {
      const result = await dal.listPRReviewComments(PROJECT_ID, PR_NUMBER);
      assert.deepEqual(result, []);
    });

    it("filters by judgment", async () => {
      const comments: PRReviewComment[] = [
        { ...createMinimalComment("c1"), judgment: "ACCEPT" },
        { ...createMinimalComment("c2"), judgment: "REJECT" },
        { ...createMinimalComment("c3"), judgment: "ACCEPT" },
      ];
      await dal.batchCreatePRReviewComments(comments);

      const result = await dal.listPRReviewComments(PROJECT_ID, PR_NUMBER, {
        judgment: "ACCEPT",
      });
      assert.equal(result.length, 2);
      assert.ok(result.every((c) => c.judgment === "ACCEPT"));
    });

    it("filters by fixApplied", async () => {
      const comments: PRReviewComment[] = [
        { ...createMinimalComment("c1"), fixApplied: true },
        { ...createMinimalComment("c2"), fixApplied: false },
      ];
      await dal.batchCreatePRReviewComments(comments);

      const result = await dal.listPRReviewComments(PROJECT_ID, PR_NUMBER, {
        fixApplied: false,
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].commentId, "c2");
    });

    it("filters by cycle", async () => {
      const comments: PRReviewComment[] = [
        { ...createMinimalComment("c1"), detectedInCycle: 1 },
        { ...createMinimalComment("c2"), detectedInCycle: 2 },
        { ...createMinimalComment("c3"), detectedInCycle: 1 },
      ];
      await dal.batchCreatePRReviewComments(comments);

      const result = await dal.listPRReviewComments(PROJECT_ID, PR_NUMBER, {
        cycle: 1,
      });
      assert.equal(result.length, 2);
    });

    it("does not return comments from other PRs", async () => {
      await dal.batchCreatePRReviewComments([createMinimalComment("c1")]);
      await dal.batchCreatePRReviewComments([
        { ...createMinimalComment("c2"), prNumber: 999, SK: `PRCOMMENT#${PROJECT_ID}#999#c2` },
      ]);

      const result = await dal.listPRReviewComments(PROJECT_ID, PR_NUMBER);
      assert.equal(result.length, 1);
      assert.equal(result[0].commentId, "c1");
    });
  });

  describe("updatePRReviewComment", () => {
    it("updates judgment fields", async () => {
      await dal.batchCreatePRReviewComments([createMinimalComment("c1")]);

      const result = await dal.updatePRReviewComment(
        PROJECT_ID,
        PR_NUMBER,
        "c1",
        {
          judgment: "REJECT",
          judgmentReason: "Style only, not worth fixing",
        }
      );

      assert.equal(result.judgment, "REJECT");
      assert.equal(result.judgmentReason, "Style only, not worth fixing");
    });

    it("updates fix fields", async () => {
      await dal.batchCreatePRReviewComments([createMinimalComment("c1")]);

      const result = await dal.updatePRReviewComment(
        PROJECT_ID,
        PR_NUMBER,
        "c1",
        {
          fixApplied: true,
          fixCommitHash: "abc123",
          fixDescription: "Added null check",
        }
      );

      assert.equal(result.fixApplied, true);
      assert.equal(result.fixCommitHash, "abc123");
      assert.equal(result.fixDescription, "Added null check");
    });

    it("updates userOverride", async () => {
      await dal.batchCreatePRReviewComments([createMinimalComment("c1")]);

      const result = await dal.updatePRReviewComment(
        PROJECT_ID,
        PR_NUMBER,
        "c1",
        {
          userOverride: {
            action: "REJECT",
            reason: "Not applicable",
            overriddenAt: "2026-03-30T12:00:00Z",
          },
        }
      );

      assert.notEqual(result.userOverride, undefined);
      assert.equal(result.userOverride!.action, "REJECT");
      assert.equal(result.userOverride!.reason, "Not applicable");
    });

    it("throws when comment does not exist", async () => {
      await assert.rejects(
        () =>
          dal.updatePRReviewComment(PROJECT_ID, PR_NUMBER, "nonexistent", {
            judgment: "REJECT",
          }),
        /not found/i
      );
    });
  });

  // ==================== PRReviewCycle CRUD ====================

  describe("createPRReviewCycle", () => {
    it("creates a cycle record", async () => {
      const cycle = createMinimalCycle(1);

      const result = await dal.createPRReviewCycle(cycle);

      assert.equal(result.projectId, PROJECT_ID);
      assert.equal(result.prNumber, PR_NUMBER);
      assert.equal(result.cycleNumber, 1);
      assert.equal(result.newCommentCount, 3);
      assert.equal(result.llmContinueDecision, "CONTINUE");
      assert.ok(result.createdAt);
    });
  });

  describe("getPRReviewCycle", () => {
    it("returns null when cycle does not exist", async () => {
      const result = await dal.getPRReviewCycle(PROJECT_ID, PR_NUMBER, 99);
      assert.equal(result, null);
    });

    it("returns cycle after creation", async () => {
      await dal.createPRReviewCycle(createMinimalCycle(1));

      const result = await dal.getPRReviewCycle(PROJECT_ID, PR_NUMBER, 1);
      assert.notEqual(result, null);
      assert.equal(result!.cycleNumber, 1);
    });
  });

  describe("listPRReviewCycles", () => {
    it("returns empty array when no cycles exist", async () => {
      const result = await dal.listPRReviewCycles(PROJECT_ID, PR_NUMBER);
      assert.deepEqual(result, []);
    });

    it("returns cycles sorted by cycleNumber ascending", async () => {
      await dal.createPRReviewCycle(createMinimalCycle(2));
      await dal.createPRReviewCycle(createMinimalCycle(1));
      await dal.createPRReviewCycle(createMinimalCycle(3));

      const result = await dal.listPRReviewCycles(PROJECT_ID, PR_NUMBER);
      assert.equal(result.length, 3);
      assert.equal(result[0].cycleNumber, 1);
      assert.equal(result[1].cycleNumber, 2);
      assert.equal(result[2].cycleNumber, 3);
    });

    it("does not return cycles from other PRs", async () => {
      await dal.createPRReviewCycle(createMinimalCycle(1));
      await dal.createPRReviewCycle({
        ...createMinimalCycle(1),
        prNumber: 999,
        SK: `PRCYCLE#${PROJECT_ID}#999#1`,
      });

      const result = await dal.listPRReviewCycles(PROJECT_ID, PR_NUMBER);
      assert.equal(result.length, 1);
    });
  });

  describe("updatePRReviewCycle", () => {
    it("updates cycle fields", async () => {
      await dal.createPRReviewCycle(createMinimalCycle(1));

      const result = await dal.updatePRReviewCycle(
        PROJECT_ID,
        PR_NUMBER,
        1,
        {
          fixCommitHash: "def456",
          filesModified: ["src/index.ts", "src/utils.ts"],
          fixPushedAt: "2026-03-30T14:00:00Z",
          analysisCompletedAt: "2026-03-30T13:00:00Z",
        }
      );

      assert.equal(result.fixCommitHash, "def456");
      assert.deepEqual(result.filesModified, ["src/index.ts", "src/utils.ts"]);
      assert.equal(result.fixPushedAt, "2026-03-30T14:00:00Z");
    });

    it("throws when cycle does not exist", async () => {
      await assert.rejects(
        () =>
          dal.updatePRReviewCycle(PROJECT_ID, PR_NUMBER, 99, {
            fixCommitHash: "abc",
          }),
        /not found/i
      );
    });
  });

  // ==================== Helper Functions ====================

  function createMinimalInput(): CreatePRReviewStateInput {
    return {
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      prNumber: PR_NUMBER,
      prTitle: "feat: test PR",
      prUrl: `https://github.com/owner/repo/pull/${PR_NUMBER}`,
      baseBranch: "main",
      headBranch: "feature/test",
      repository: "owner/repo",
    };
  }

  function createMinimalComment(commentId: string): PRReviewComment {
    const now = new Date().toISOString();
    return {
      PK: `ORG#${ORG_ID}`,
      SK: `PRCOMMENT#${PROJECT_ID}#${PR_NUMBER}#${commentId}`,
      commentId,
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      prNumber: PR_NUMBER,
      filePath: "src/index.ts",
      body: "Consider adding a null check here",
      category: "ERROR_HANDLING",
      severity: "MEDIUM",
      judgment: "ACCEPT",
      judgmentReason: "Valid error handling improvement",
      judgmentConfidence: 0.85,
      llmModel: "claude-sonnet-4-20250514",
      fixApplied: false,
      detectedInCycle: 1,
      lastSeenInCycle: 1,
      isDuplicate: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  function createMinimalCycle(cycleNumber: number): PRReviewCycle {
    const now = new Date().toISOString();
    return {
      PK: `ORG#${ORG_ID}`,
      SK: `PRCYCLE#${PROJECT_ID}#${PR_NUMBER}#${cycleNumber}`,
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      prNumber: PR_NUMBER,
      cycleNumber,
      reviewCommentIds: ["c1", "c2", "c3"],
      newCommentCount: 3,
      resolvedCommentCount: 0,
      duplicateCommentCount: 0,
      llmCycleSummary: `Cycle ${cycleNumber}: 3 new comments found`,
      llmContinueDecision: "CONTINUE",
      llmDecisionReason: "New valid comments need addressing",
      filesModified: [],
      reviewArrivedAt: now,
      createdAt: now,
    };
  }
});
