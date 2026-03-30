/**
 * PR Review Routes Unit Tests
 *
 * Tests for /api/pr-reviews/* endpoints.
 * Uses NoDynamo DAL + mock GitHub Adapter + mock LLM for testing.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 10
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import request from "supertest";
import express from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NoDynamoDALWithConversations } from "../../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../../src/web/dal/dal-interface";
import type {
  IGitHubAdapter,
  GitHubReviewComment,
} from "../../../../src/web/dal/pr-review-types";
import type { ReviewJudgeLLMClient } from "../../../../src/pr-review/review-judge";
import { createPRReviewRoutes } from "../../../../src/web/routes/pr-review";

// ==================== Test Helpers ====================

const ORG_ID = "test-org";
const PROJECT_ID = "proj_routes";
const PR_NUMBER = 42;
const REPO = "test-owner/test-repo";

function createMockGitHubAdapter(
  overrides: Partial<IGitHubAdapter> = {}
): IGitHubAdapter {
  return {
    getPullRequest: async () => ({
      number: PR_NUMBER,
      title: "feat: Auth",
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
      const idMatches = userPrompt.match(/Comment ID: (\d+)/g);
      const ids = idMatches
        ? idMatches.map((m) => m.replace("Comment ID: ", ""))
        : ["1"];

      const results = ids.map((id) => ({
        commentId: id,
        category: "BUG",
        severity: "HIGH",
        judgment: "ACCEPT",
        judgmentReason: "Valid issue",
        judgmentConfidence: 0.9,
        suggestedFix: "Fix it",
      }));

      return { content: JSON.stringify(results), model: "test-model" };
    },
  };
}

function createTestComments(count: number): GitHubReviewComment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: 2000 + i,
    body: `Review comment ${i + 1}`,
    path: `src/file${i}.ts`,
    line: 10 + i,
    user: "coderabbitai[bot]",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

// ==================== Tests ====================

describe("PR Review Routes", () => {
  let app: express.Express;
  let dal: IDataAccessLayer;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-review-routes-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });

    const github = createMockGitHubAdapter();
    const llmClient = createMockLLMClient();

    app = express();
    app.use(express.json());
    app.use(
      "/api/pr-reviews",
      createPRReviewRoutes({ dal, github, llmClient, orgId: ORG_ID })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper: register a PR
  async function registerPR(): Promise<request.Response> {
    return request(app).post("/api/pr-reviews/register").send({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      prNumber: PR_NUMBER,
      prTitle: "feat: Auth",
      prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
      baseBranch: "main",
      headBranch: "feature/auth",
      repository: REPO,
    });
  }

  // ==================== POST /register ====================

  describe("POST /register", () => {
    it("should register a new PR and return 201", async () => {
      const res = await registerPR();

      assert.equal(res.status, 201);
      assert.equal(res.body.status, "REVIEW_PENDING");
      assert.equal(res.body.prNumber, PR_NUMBER);
    });

    it("should return 400 if required fields missing", async () => {
      const res = await request(app)
        .post("/api/pr-reviews/register")
        .send({ projectId: PROJECT_ID });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "VALIDATION_ERROR");
    });
  });

  // ==================== GET /:projectId ====================

  describe("GET /:projectId", () => {
    it("should return list of PR reviews for a project", async () => {
      await registerPR();

      const res = await request(app).get(
        `/api/pr-reviews/${PROJECT_ID}`
      );

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.reviews));
      assert.equal(res.body.reviews.length, 1);
    });

    it("should return empty list for unknown project", async () => {
      const res = await request(app).get(
        "/api/pr-reviews/nonexistent"
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.reviews.length, 0);
    });
  });

  // ==================== GET /:projectId/:prNumber ====================

  describe("GET /:projectId/:prNumber", () => {
    it("should return PR review detail", async () => {
      await registerPR();

      const res = await request(app).get(
        `/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}`
      );

      assert.equal(res.status, 200);
      assert.ok(res.body.state);
      assert.equal(res.body.state.prNumber, PR_NUMBER);
      assert.ok(Array.isArray(res.body.comments));
      assert.ok(typeof res.body.pendingUserAction === "string");
    });

    it("should return 404 for unknown PR", async () => {
      const res = await request(app).get(
        `/api/pr-reviews/${PROJECT_ID}/999`
      );

      assert.equal(res.status, 404);
    });
  });

  // ==================== POST /:projectId/:prNumber/start-cycle ====================

  describe("POST /:projectId/:prNumber/start-cycle", () => {
    it("should start a review cycle and return cycle data", async () => {
      await registerPR();

      const res = await request(app).post(
        `/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/start-cycle`
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.cycleNumber, 1);
      assert.ok(res.body.llmContinueDecision);
    });

    it("should return 404 for unknown PR", async () => {
      const res = await request(app).post(
        `/api/pr-reviews/nonexistent/999/start-cycle`
      );

      assert.equal(res.status, 404);
    });
  });

  // ==================== GET /:projectId/:prNumber/comments ====================

  describe("GET /:projectId/:prNumber/comments", () => {
    it("should return comments list", async () => {
      await registerPR();

      const res = await request(app).get(
        `/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/comments`
      );

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.comments));
    });
  });

  // ==================== PATCH /:projectId/:prNumber/comments/:commentId ====================

  describe("PATCH /:projectId/:prNumber/comments/:commentId", () => {
    it("should update comment with user override", async () => {
      // First register and run a cycle with comments
      const github = createMockGitHubAdapter({
        listPRReviewComments: async () => createTestComments(1),
      });
      const llmClient = createMockLLMClient();

      const appWithComments = express();
      appWithComments.use(express.json());
      appWithComments.use(
        "/api/pr-reviews",
        createPRReviewRoutes({ dal, github, llmClient, orgId: ORG_ID })
      );

      // Register
      await request(appWithComments).post("/api/pr-reviews/register").send({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        prNumber: PR_NUMBER,
        prTitle: "feat: Auth",
        prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main",
        headBranch: "feature/auth",
        repository: REPO,
      });

      // Start cycle to get comments
      await request(appWithComments).post(
        `/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/start-cycle`
      );

      // Override comment
      const res = await request(appWithComments)
        .patch(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/comments/2000`)
        .send({
          action: "REJECT",
          reason: "Not needed",
        });

      assert.equal(res.status, 200);
      assert.ok(res.body.userOverride);
      assert.equal(res.body.userOverride.action, "REJECT");
    });
  });

  // ==================== POST /:projectId/:prNumber/complete ====================

  describe("POST /:projectId/:prNumber/complete", () => {
    it("should mark PR review as complete", async () => {
      await registerPR();

      const res = await request(app).post(
        `/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/complete`
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.status, "REVIEW_COMPLETE");
    });

    it("should return 404 for unknown PR", async () => {
      const res = await request(app).post(
        `/api/pr-reviews/nonexistent/999/complete`
      );

      assert.equal(res.status, 404);
    });
  });

  // ==================== GET /:projectId/:prNumber/cycles ====================

  describe("GET /:projectId/:prNumber/cycles", () => {
    it("should return cycles list", async () => {
      await registerPR();

      const res = await request(app).get(
        `/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/cycles`
      );

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.cycles));
    });
  });

  // ==================== POST /:projectId/:prNumber/mark-review-arrived ====================

  describe("POST /:projectId/:prNumber/mark-review-arrived", () => {
    it("should mark review as arrived", async () => {
      await registerPR();

      const res = await request(app).post(
        `/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/mark-review-arrived`
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.status, "REVIEW_ARRIVED");
    });

    it("should return 404 for unknown PR", async () => {
      const res = await request(app).post(
        `/api/pr-reviews/nonexistent/999/mark-review-arrived`
      );

      assert.equal(res.status, 404);
    });
  });
});
