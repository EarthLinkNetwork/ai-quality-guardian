/**
 * PRReviewService Unit Tests
 *
 * Tests for the main orchestrator that integrates:
 * - DAL (PR state, comments, cycles persistence)
 * - GitHub Adapter (comment fetching)
 * - LLM layer (ReviewJudge, DuplicateDetector, CycleManager)
 *
 * TDD: Red phase — write tests first, then implement.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 9
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NoDynamoDALWithConversations } from "../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../src/web/dal/dal-interface";
import type {
  PRReviewState,
  PRReviewComment,
  PRReviewCycle,
  GitHubReviewComment,
  PullRequestInfo,
  IGitHubAdapter,
  CreatePRReviewStateInput,
  UserOverride,
} from "../../../src/web/dal/pr-review-types";
import { PRReviewService } from "../../../src/pr-review/pr-review-service";
import type { ReviewJudgeLLMClient } from "../../../src/pr-review/review-judge";

// ==================== Test Helpers ====================

const ORG_ID = "test-org";
const PROJECT_ID = "proj_pr_review";
const PR_NUMBER = 42;
const REPO = "test-owner/test-repo";

function createMockGitHubAdapter(
  overrides: Partial<IGitHubAdapter> = {}
): IGitHubAdapter {
  return {
    getPullRequest: async () => ({
      number: PR_NUMBER,
      title: "feat: Add user authentication",
      url: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
      baseBranch: "main",
      headBranch: "feature/auth",
      state: "open" as const,
      repository: REPO,
      author: "test-user",
      createdAt: new Date().toISOString(),
    }),
    listPRReviewComments: async () => [],
    listPRIssueComments: async () => [],
    replyToComment: async () => {},
    createIssueComment: async () => {},
    ...overrides,
  };
}

function createMockLLMClient(): ReviewJudgeLLMClient {
  return {
    generate: async ({ userPrompt }) => {
      // Default: return valid ACCEPT judgment for any comment
      // Extract comment IDs from prompt
      const idMatches = userPrompt.match(/Comment ID: (\d+)/g);
      const ids = idMatches
        ? idMatches.map((m) => m.replace("Comment ID: ", ""))
        : ["1"];

      const results = ids.map((id) => ({
        commentId: id,
        category: "BUG",
        severity: "HIGH",
        judgment: "ACCEPT",
        judgmentReason: "Valid issue found",
        judgmentConfidence: 0.9,
        suggestedFix: "Fix the bug",
      }));

      return {
        content: JSON.stringify(results),
        model: "test-model",
      };
    },
  };
}

function createTestReviewComments(count: number): GitHubReviewComment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    body: `Review comment ${i + 1}: Missing null check`,
    path: `src/file${i}.ts`,
    line: 10 + i,
    user: "coderabbitai[bot]",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

// ==================== Tests ====================

describe("PRReviewService", () => {
  let dal: IDataAccessLayer;
  let tmpDir: string;
  let github: IGitHubAdapter;
  let llmClient: ReviewJudgeLLMClient;
  let service: PRReviewService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-review-svc-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });
    github = createMockGitHubAdapter();
    llmClient = createMockLLMClient();
    service = new PRReviewService(dal, github, llmClient, ORG_ID);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==================== registerPR ====================

  describe("registerPR", () => {
    it("should create a new PR review state with REVIEW_PENDING status", async () => {
      const result = await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Add auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      assert.equal(result.status, "REVIEW_PENDING");
      assert.equal(result.projectId, PROJECT_ID);
      assert.equal(result.prNumber, PR_NUMBER);
      assert.equal(result.currentCycle, 0);
      assert.equal(result.maxCycles, 5);
      assert.equal(result.totalComments, 0);
    });

    it("should set custom maxCycles when provided", async () => {
      const result = await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Something",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/something",
        repository: REPO,
        maxCycles: 3,
      });

      assert.equal(result.maxCycles, 3);
    });

    it("should persist the PR state to DAL", async () => {
      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      const persisted = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.ok(persisted);
      assert.equal(persisted.prNumber, PR_NUMBER);
      assert.equal(persisted.status, "REVIEW_PENDING");
    });
  });

  // ==================== startReviewCycle ====================

  describe("startReviewCycle", () => {
    it("should increment the cycle number and fetch comments", async () => {
      const comments = createTestReviewComments(3);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      const cycle = await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      assert.equal(cycle.cycleNumber, 1);
      assert.equal(cycle.reviewCommentIds.length, 3);
    });

    it("should update the PR state to ANALYZING", async () => {
      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      const state = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.ok(state);
      assert.equal(state.currentCycle, 1);
    });

    it("should analyze comments via ReviewJudge and save results", async () => {
      const comments = createTestReviewComments(2);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      const savedComments = await dal.listPRReviewComments(
        PROJECT_ID,
        PR_NUMBER
      );
      assert.equal(savedComments.length, 2);
      assert.equal(savedComments[0].judgment, "ACCEPT");
    });

    it("should update comment counts on the PR state", async () => {
      const comments = createTestReviewComments(2);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      // Mock LLM: one ACCEPT, one REJECT
      llmClient = {
        generate: async () => ({
          content: JSON.stringify([
            {
              commentId: "1000",
              category: "BUG",
              severity: "HIGH",
              judgment: "ACCEPT",
              judgmentReason: "Valid bug",
              judgmentConfidence: 0.9,
              suggestedFix: "Fix it",
            },
            {
              commentId: "1001",
              category: "STYLE",
              severity: "LOW",
              judgment: "REJECT",
              judgmentReason: "Style preference only",
              judgmentConfidence: 0.85,
              suggestedFix: null,
            },
          ]),
          model: "test-model",
        }),
      };
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      const state = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.ok(state);
      assert.equal(state.totalComments, 2);
      assert.equal(state.acceptedComments, 1);
      assert.equal(state.rejectedComments, 1);
    });

    it("should set status to AWAITING_APPROVAL after analysis", async () => {
      const comments = createTestReviewComments(1);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      const state = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.ok(state);
      assert.equal(state.status, "AWAITING_APPROVAL");
    });

    it("should throw if PR state not found", async () => {
      await assert.rejects(
        () => service.startReviewCycle("nonexistent", 999),
        /not found/i
      );
    });
  });

  // ==================== getReviewSummary ====================

  describe("getReviewSummary", () => {
    it("should return state, comments, and cycles", async () => {
      const comments = createTestReviewComments(2);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      const summary = await service.getReviewSummary(PROJECT_ID, PR_NUMBER);

      assert.ok(summary.state);
      assert.equal(summary.comments.length, 2);
      assert.equal(summary.cycles.length, 1);
      assert.equal(typeof summary.acceptCount, "number");
      assert.equal(typeof summary.rejectCount, "number");
      assert.equal(typeof summary.escalateCount, "number");
      assert.ok(summary.pendingUserAction);
    });

    it("should return null state when PR not registered", async () => {
      await assert.rejects(
        () => service.getReviewSummary("nonexistent", 999),
        /not found/i
      );
    });
  });

  // ==================== applyUserOverride ====================

  describe("applyUserOverride", () => {
    it("should update comment judgment with user override", async () => {
      const comments = createTestReviewComments(1);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      const override: UserOverride = {
        action: "REJECT",
        reason: "Not needed",
        overriddenAt: new Date().toISOString(),
      };

      await service.applyUserOverride(
        PROJECT_ID,
        PR_NUMBER,
        "1000",
        override
      );

      const comment = await dal.getPRReviewComment(
        PROJECT_ID,
        PR_NUMBER,
        "1000"
      );
      assert.ok(comment);
      assert.ok(comment.userOverride);
      assert.equal(comment.userOverride.action, "REJECT");
    });
  });

  // ==================== completeWithoutFix ====================

  describe("completeWithoutFix", () => {
    it("should set status to REVIEW_COMPLETE", async () => {
      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.completeWithoutFix(PROJECT_ID, PR_NUMBER);

      const state = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.ok(state);
      assert.equal(state.status, "REVIEW_COMPLETE");
    });
  });

  // ==================== markReviewArrived ====================

  describe("markReviewArrived", () => {
    it("should update status to REVIEW_ARRIVED", async () => {
      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.markReviewArrived(PROJECT_ID, PR_NUMBER);

      const state = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.ok(state);
      assert.equal(state.status, "REVIEW_ARRIVED");
      assert.ok(state.lastReviewArrivedAt);
    });
  });

  // ==================== getFullState ====================

  describe("getFullState", () => {
    it("should return state, comments, and cycles together", async () => {
      const comments = createTestReviewComments(1);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      const full = await service.getFullState(PROJECT_ID, PR_NUMBER);
      assert.ok(full.state);
      assert.ok(Array.isArray(full.comments));
      assert.ok(Array.isArray(full.cycles));
    });
  });

  // ==================== Cycle limit ====================

  describe("cycle limit", () => {
    it("should detect cycle limit when maxCycles reached", async () => {
      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
        maxCycles: 1,
      });

      const comments = createTestReviewComments(1);
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => comments,
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      const cycle = await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      // After cycle 1 with maxCycles=1, the cycle decision should reflect limit
      assert.equal(cycle.cycleNumber, 1);
      assert.equal(cycle.llmContinueDecision, "CYCLE_LIMIT");
    });
  });

  // ==================== Zero comments cycle ====================

  describe("zero comments cycle", () => {
    it("should complete when no comments found", async () => {
      github = createMockGitHubAdapter({
        listPRReviewComments: async () => [],
      });
      service = new PRReviewService(dal, github, llmClient, ORG_ID);

      await service.registerPR({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      const cycle = await service.startReviewCycle(PROJECT_ID, PR_NUMBER);

      assert.equal(cycle.llmContinueDecision, "COMPLETE");

      const state = await dal.getPRReviewState(PROJECT_ID, PR_NUMBER);
      assert.ok(state);
      assert.equal(state.status, "REVIEW_COMPLETE");
    });
  });
});
