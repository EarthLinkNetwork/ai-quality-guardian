/**
 * PR Review Dashboard Integration Tests
 *
 * Tests for Phase 4 (Dashboard UI) and Phase 5 (server.ts mount).
 * Verifies:
 * - PR Review routes are accessible through server mount
 * - Dashboard API endpoints return correct data for UI rendering
 * - Registration, list, detail, actions all work end-to-end
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 11
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import request from "supertest";
import express from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NoDynamoDALWithConversations } from "../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../src/web/dal/dal-interface";
import type {
  IGitHubAdapter,
  GitHubReviewComment,
} from "../../../src/web/dal/pr-review-types";
import type { ReviewJudgeLLMClient } from "../../../src/pr-review/review-judge";
import { createPRReviewRoutes } from "../../../src/web/routes/pr-review";

// ==================== Constants ====================

const ORG_ID = "dash-org";
const PROJECT_ID = "proj_dashboard";
const PR_NUMBER = 100;
const REPO = "dash-owner/dash-repo";

// ==================== Helpers ====================

function createMockGitHub(overrides: Partial<IGitHubAdapter> = {}): IGitHubAdapter {
  return {
    getPullRequest: async () => ({
      number: PR_NUMBER,
      title: "feat: Dashboard",
      url: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
      baseBranch: "main",
      headBranch: "feature/dashboard",
      state: "open" as const,
      repository: REPO,
      author: "dash-user",
      createdAt: new Date().toISOString(),
    }),
    listPRReviewComments: async () => [],
    listPRIssueComments: async () => [],
    replyToComment: async () => {},
    createIssueComment: async () => {},
    ...overrides,
  };
}

function createMockLLM(): ReviewJudgeLLMClient {
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
    id: 5000 + i,
    body: `Review comment ${i + 1}: fix this issue`,
    path: `src/file-${i}.ts`,
    line: 10 + i,
    user: "coderabbit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

// ==================== Tests ====================

describe("PR Review Dashboard (Phase 4+5)", () => {
  let dal: IDataAccessLayer;
  let tmpDir: string;
  let app: express.Express;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-dash-"));
    dal = new NoDynamoDALWithConversations({ stateDir: tmpDir, orgId: ORG_ID });
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==================== Phase 5: Server Mount ====================

  describe("Phase 5: Route Mount at /api/pr-reviews", () => {
    it("should mount PR review routes and respond to register", async () => {
      const github = createMockGitHub();
      const llm = createMockLLM();
      const routes = createPRReviewRoutes({ dal, github, llmClient: llm, orgId: ORG_ID });
      app.use("/api/pr-reviews", routes);

      const res = await request(app)
        .post("/api/pr-reviews/register")
        .send({
          projectId: PROJECT_ID,
          orgId: ORG_ID,
          prNumber: PR_NUMBER,
          prTitle: "feat: Dashboard",
          prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
          baseBranch: "main",
          headBranch: "feature/dashboard",
          repository: REPO,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.prNumber, PR_NUMBER);
      assert.equal(res.body.status, "REVIEW_PENDING");
    });

    it("should list PRs for project after registration", async () => {
      const github = createMockGitHub();
      const llm = createMockLLM();
      const routes = createPRReviewRoutes({ dal, github, llmClient: llm, orgId: ORG_ID });
      app.use("/api/pr-reviews", routes);

      // Register 2 PRs
      await request(app).post("/api/pr-reviews/register").send({
        projectId: PROJECT_ID, orgId: ORG_ID, prNumber: 100,
        prTitle: "PR 100", prUrl: "https://github.com/x/y/pull/100",
        baseBranch: "main", headBranch: "f/100", repository: REPO,
      });
      await request(app).post("/api/pr-reviews/register").send({
        projectId: PROJECT_ID, orgId: ORG_ID, prNumber: 101,
        prTitle: "PR 101", prUrl: "https://github.com/x/y/pull/101",
        baseBranch: "main", headBranch: "f/101", repository: REPO,
      });

      const res = await request(app).get(`/api/pr-reviews/${PROJECT_ID}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.reviews));
      assert.equal(res.body.reviews.length, 2);
    });

    it("should get PR detail with summary", async () => {
      const github = createMockGitHub();
      const llm = createMockLLM();
      const routes = createPRReviewRoutes({ dal, github, llmClient: llm, orgId: ORG_ID });
      app.use("/api/pr-reviews", routes);

      // Register
      await request(app).post("/api/pr-reviews/register").send({
        projectId: PROJECT_ID, orgId: ORG_ID, prNumber: PR_NUMBER,
        prTitle: "feat: Detail", prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main", headBranch: "feature/detail", repository: REPO,
      });

      const res = await request(app).get(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.state);
      assert.equal(res.body.state.prNumber, PR_NUMBER);
      assert.ok(Array.isArray(res.body.comments));
      assert.ok(Array.isArray(res.body.cycles));
    });
  });

  // ==================== Phase 4: Dashboard Data Flow ====================

  describe("Phase 4: Dashboard Data Flow", () => {
    it("should support the full dashboard workflow: register -> list -> detail -> start-cycle -> mark-arrived", async () => {
      const comments = createTestComments(3);
      const github = createMockGitHub({
        listPRReviewComments: async () => comments,
      });
      const llm = createMockLLM();
      const routes = createPRReviewRoutes({ dal, github, llmClient: llm, orgId: ORG_ID });
      app.use("/api/pr-reviews", routes);

      // Step 1: Register PR (from registration form)
      const regRes = await request(app).post("/api/pr-reviews/register").send({
        projectId: PROJECT_ID, orgId: ORG_ID, prNumber: PR_NUMBER,
        prTitle: "feat: Full Flow", prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main", headBranch: "feature/flow", repository: REPO,
      });
      assert.equal(regRes.status, 201);

      // Step 2: Mark review arrived (from "Mark Review Arrived" button)
      const markRes = await request(app)
        .post(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/mark-review-arrived`)
        .send({});
      assert.equal(markRes.status, 200);
      assert.equal(markRes.body.status, "REVIEW_ARRIVED");

      // Step 3: Start cycle (from "Start Review Cycle" button)
      const cycleRes = await request(app)
        .post(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/start-cycle`)
        .send({});
      assert.equal(cycleRes.status, 200);
      assert.ok(cycleRes.body.cycleNumber);

      // Step 4: Check detail with comments
      const detailRes = await request(app)
        .get(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}`);
      assert.equal(detailRes.status, 200);
      assert.ok(detailRes.body.comments.length > 0);

      // Step 5: Override a comment judgment (from override buttons)
      const firstComment = detailRes.body.comments[0];
      if (firstComment) {
        const overrideRes = await request(app)
          .patch(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/comments/${firstComment.commentId}`)
          .send({ action: "REJECT", reason: "Not relevant" });
        assert.equal(overrideRes.status, 200);
        assert.equal(overrideRes.body.userOverride.action, "REJECT");
      }

      // Step 6: Complete without fix (from "Complete" button)
      const completeRes = await request(app)
        .post(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/complete`)
        .send({});
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.status, "REVIEW_COMPLETE");
    });

    it("should list cycles for dashboard cycle history", async () => {
      const comments = createTestComments(2);
      const github = createMockGitHub({
        listPRReviewComments: async () => comments,
      });
      const llm = createMockLLM();
      const routes = createPRReviewRoutes({ dal, github, llmClient: llm, orgId: ORG_ID });
      app.use("/api/pr-reviews", routes);

      // Register + mark arrived + start cycle
      await request(app).post("/api/pr-reviews/register").send({
        projectId: PROJECT_ID, orgId: ORG_ID, prNumber: PR_NUMBER,
        prTitle: "Cycles", prUrl: `https://github.com/${REPO}/pull/${PR_NUMBER}`,
        baseBranch: "main", headBranch: "f/cycles", repository: REPO,
      });
      await request(app).post(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/mark-review-arrived`).send({});
      await request(app).post(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/start-cycle`).send({});

      const cyclesRes = await request(app)
        .get(`/api/pr-reviews/${PROJECT_ID}/${PR_NUMBER}/cycles`);
      assert.equal(cyclesRes.status, 200);
      assert.ok(Array.isArray(cyclesRes.body.cycles));
      assert.ok(cyclesRes.body.cycles.length >= 1);
    });

    it("should filter PRs by status for dashboard filtering", async () => {
      const github = createMockGitHub();
      const llm = createMockLLM();
      const routes = createPRReviewRoutes({ dal, github, llmClient: llm, orgId: ORG_ID });
      app.use("/api/pr-reviews", routes);

      // Register a PR
      await request(app).post("/api/pr-reviews/register").send({
        projectId: PROJECT_ID, orgId: ORG_ID, prNumber: 200,
        prTitle: "Filter Test", prUrl: "https://github.com/x/y/pull/200",
        baseBranch: "main", headBranch: "f/filter", repository: REPO,
      });

      // Filter by REVIEW_PENDING (should find it)
      const res1 = await request(app).get(`/api/pr-reviews/${PROJECT_ID}?status=REVIEW_PENDING`);
      assert.equal(res1.status, 200);
      assert.ok(res1.body.reviews.length >= 1);

      // Filter by REVIEW_COMPLETE (should not find it)
      const res2 = await request(app).get(`/api/pr-reviews/${PROJECT_ID}?status=REVIEW_COMPLETE`);
      assert.equal(res2.status, 200);
      assert.equal(res2.body.reviews.length, 0);
    });
  });

  // ==================== Dashboard HTML Content ====================

  describe("Dashboard HTML Verification", () => {
    it("should serve index.html with PR Reviews navigation", async () => {
      // Verify the index.html contains PR Reviews navigation
      const indexPath = path.join(__dirname, "../../../src/web/public/index.html");
      const html = fs.readFileSync(indexPath, "utf-8");

      assert.ok(html.includes('data-nav="pr-reviews"'), "Sidebar should have PR Reviews nav link");
      assert.ok(html.includes("PR Reviews"), "Sidebar should show 'PR Reviews' label");
      assert.ok(html.includes("renderPRReviewsPage"), "Should have renderPRReviewsPage function");
      assert.ok(html.includes("renderPRReviewDetailPage"), "Should have renderPRReviewDetailPage function");
      assert.ok(html.includes("/pr-reviews"), "Router should handle /pr-reviews path");
    });

    it("should have PR review registration form function", () => {
      const indexPath = path.join(__dirname, "../../../src/web/public/index.html");
      const html = fs.readFileSync(indexPath, "utf-8");

      assert.ok(html.includes("prReviewRegister"), "Should have PR register function");
      assert.ok(html.includes("/pr-reviews/register"), "Should call register API");
    });

    it("should have PR review action functions", () => {
      const indexPath = path.join(__dirname, "../../../src/web/public/index.html");
      const html = fs.readFileSync(indexPath, "utf-8");

      assert.ok(html.includes("prReviewStartCycle"), "Should have start cycle function");
      assert.ok(html.includes("prReviewMarkArrived"), "Should have mark arrived function");
      assert.ok(html.includes("prReviewComplete"), "Should have complete function");
      assert.ok(html.includes("prReviewOverride"), "Should have override function");
    });
  });

  // ==================== Server Mount Verification ====================

  describe("server.ts import verification", () => {
    it("should have PR review routes import in server.ts", () => {
      const serverPath = path.join(__dirname, "../../../src/web/server.ts");
      const serverCode = fs.readFileSync(serverPath, "utf-8");

      assert.ok(
        serverCode.includes("createPRReviewRoutes"),
        "server.ts should import createPRReviewRoutes"
      );
      assert.ok(
        serverCode.includes("/api/pr-reviews"),
        "server.ts should mount PR review routes at /api/pr-reviews"
      );
      assert.ok(
        serverCode.includes("GhCliGitHubAdapter"),
        "server.ts should import GhCliGitHubAdapter"
      );
    });
  });
});
