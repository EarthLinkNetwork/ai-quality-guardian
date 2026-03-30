/**
 * Unit tests for GhCliGitHubAdapter
 *
 * Tests the gh CLI-based GitHub adapter implementation.
 * Uses a custom executor function injection to avoid actual gh CLI calls.
 *
 * TDD: Red phase — write tests first, then implement.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md
 */

import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import { GhCliGitHubAdapter } from "../../../../src/web/github/gh-cli-adapter";
import type { GhExecutor } from "../../../../src/web/github/gh-cli-adapter";

describe("GhCliGitHubAdapter", () => {
  let adapter: GhCliGitHubAdapter;
  let executedCalls: Array<{ file: string; args: string[] }>;

  const OWNER = "test-owner";
  const REPO = "test-repo";
  const PR_NUMBER = 42;

  function createMockExecutor(stdout: string): GhExecutor {
    return async (file: string, args: string[]) => {
      executedCalls.push({ file, args });
      return stdout;
    };
  }

  function createErrorExecutor(message: string): GhExecutor {
    return async () => {
      throw new Error(message);
    };
  }

  beforeEach(() => {
    executedCalls = [];
  });

  // ==================== getPullRequest ====================

  describe("getPullRequest", () => {
    it("returns parsed PR info from gh api output", async () => {
      const ghOutput = JSON.stringify({
        number: 42,
        title: "feat: add feature",
        html_url: "https://github.com/test-owner/test-repo/pull/42",
        base: { ref: "main" },
        head: { ref: "feature/test" },
        state: "open",
        user: { login: "author1" },
        created_at: "2026-03-30T10:00:00Z",
      });

      adapter = new GhCliGitHubAdapter(createMockExecutor(ghOutput));

      const result = await adapter.getPullRequest(OWNER, REPO, PR_NUMBER);

      assert.equal(result.number, 42);
      assert.equal(result.title, "feat: add feature");
      assert.equal(result.url, "https://github.com/test-owner/test-repo/pull/42");
      assert.equal(result.baseBranch, "main");
      assert.equal(result.headBranch, "feature/test");
      assert.equal(result.state, "open");
      assert.equal(result.repository, "test-owner/test-repo");
      assert.equal(result.author, "author1");
    });

    it("calls gh api with correct endpoint", async () => {
      const ghOutput = JSON.stringify({
        number: 42,
        title: "test",
        html_url: "https://github.com/o/r/pull/42",
        base: { ref: "main" },
        head: { ref: "feature" },
        state: "open",
        user: { login: "u" },
        created_at: "2026-01-01T00:00:00Z",
      });

      adapter = new GhCliGitHubAdapter(createMockExecutor(ghOutput));
      await adapter.getPullRequest(OWNER, REPO, PR_NUMBER);

      assert.equal(executedCalls.length, 1);
      assert.equal(executedCalls[0].file, "gh");
      assert.ok(executedCalls[0].args.includes("api"));
      assert.ok(
        executedCalls[0].args.some((a) =>
          a.includes(`repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}`)
        )
      );
    });

    it("throws on gh cli error", async () => {
      adapter = new GhCliGitHubAdapter(
        createErrorExecutor("gh: command not found")
      );

      await assert.rejects(
        () => adapter.getPullRequest(OWNER, REPO, PR_NUMBER),
        /gh.*command|error/i
      );
    });
  });

  // ==================== listPRReviewComments ====================

  describe("listPRReviewComments", () => {
    it("returns parsed review comments", async () => {
      const ghOutput = JSON.stringify([
        {
          id: 1001,
          body: "Add null check",
          path: "src/index.ts",
          line: 42,
          start_line: null,
          user: { login: "coderabbit" },
          created_at: "2026-03-30T10:00:00Z",
          updated_at: "2026-03-30T10:00:00Z",
          in_reply_to_id: null,
        },
        {
          id: 1002,
          body: "Consider using const",
          path: "src/utils.ts",
          line: 10,
          start_line: 8,
          user: { login: "coderabbit" },
          created_at: "2026-03-30T10:01:00Z",
          updated_at: "2026-03-30T10:01:00Z",
          in_reply_to_id: 1001,
        },
      ]);

      adapter = new GhCliGitHubAdapter(createMockExecutor(ghOutput));

      const result = await adapter.listPRReviewComments(OWNER, REPO, PR_NUMBER);

      assert.equal(result.length, 2);
      assert.equal(result[0].id, 1001);
      assert.equal(result[0].body, "Add null check");
      assert.equal(result[0].path, "src/index.ts");
      assert.equal(result[0].line, 42);
      assert.equal(result[0].startLine, undefined);
      assert.equal(result[0].user, "coderabbit");
      assert.equal(result[1].startLine, 8);
      assert.equal(result[1].inReplyToId, 1001);
    });

    it("returns empty array when no comments", async () => {
      adapter = new GhCliGitHubAdapter(createMockExecutor("[]"));

      const result = await adapter.listPRReviewComments(OWNER, REPO, PR_NUMBER);
      assert.deepEqual(result, []);
    });
  });

  // ==================== listPRIssueComments ====================

  describe("listPRIssueComments", () => {
    it("returns parsed issue comments", async () => {
      const ghOutput = JSON.stringify([
        {
          id: 2001,
          body: "CodeRabbit summary",
          user: { login: "coderabbit[bot]" },
          created_at: "2026-03-30T10:00:00Z",
          updated_at: "2026-03-30T10:05:00Z",
        },
      ]);

      adapter = new GhCliGitHubAdapter(createMockExecutor(ghOutput));

      const result = await adapter.listPRIssueComments(OWNER, REPO, PR_NUMBER);

      assert.equal(result.length, 1);
      assert.equal(result[0].id, 2001);
      assert.equal(result[0].body, "CodeRabbit summary");
      assert.equal(result[0].user, "coderabbit[bot]");
    });
  });

  // ==================== replyToComment ====================

  describe("replyToComment", () => {
    it("calls gh api to create a reply", async () => {
      adapter = new GhCliGitHubAdapter(createMockExecutor("{}"));

      await adapter.replyToComment(OWNER, REPO, PR_NUMBER, 1001, "Thanks, fixed!");

      assert.equal(executedCalls.length, 1);
      assert.equal(executedCalls[0].file, "gh");
      assert.ok(executedCalls[0].args.includes("api"));
    });

    it("throws on error", async () => {
      adapter = new GhCliGitHubAdapter(
        createErrorExecutor("403 Forbidden")
      );

      await assert.rejects(
        () => adapter.replyToComment(OWNER, REPO, PR_NUMBER, 1001, "test"),
        /403|error/i
      );
    });
  });

  // ==================== createIssueComment ====================

  describe("createIssueComment", () => {
    it("calls gh api to create an issue comment", async () => {
      adapter = new GhCliGitHubAdapter(
        createMockExecutor(JSON.stringify({ id: 3001 }))
      );

      await adapter.createIssueComment(
        OWNER,
        REPO,
        PR_NUMBER,
        "Review cycle complete"
      );

      assert.equal(executedCalls.length, 1);
      assert.equal(executedCalls[0].file, "gh");
      assert.ok(executedCalls[0].args.includes("api"));
    });
  });
});
