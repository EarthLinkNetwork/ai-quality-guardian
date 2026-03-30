/**
 * GhCliGitHubAdapter - GitHub API adapter using gh CLI
 *
 * Implements IGitHubAdapter using `gh api` commands via child_process.execFile.
 * This is the Phase 1 implementation; Phase 2 may migrate to @octokit/rest.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import type {
  IGitHubAdapter,
  PullRequestInfo,
  GitHubReviewComment,
  GitHubIssueComment,
} from "../dal/pr-review-types";

const execFileAsync = promisify(execFileCb);

/**
 * Executor function type for dependency injection (testing).
 * Accepts (file, args) and returns stdout as string.
 */
export type GhExecutor = (file: string, args: string[]) => Promise<string>;

/**
 * Default executor that uses child_process.execFile
 */
async function defaultExecutor(file: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    maxBuffer: 10 * 1024 * 1024, // 10MB
    timeout: 30_000, // 30s
  });
  return stdout;
}

/**
 * GhCliGitHubAdapter - gh CLI-based GitHub adapter
 *
 * Uses `gh api` to communicate with GitHub API.
 * Supports dependency injection of the executor for testing.
 */
export class GhCliGitHubAdapter implements IGitHubAdapter {
  private readonly exec: GhExecutor;

  constructor(executor?: GhExecutor) {
    this.exec = executor ?? defaultExecutor;
  }

  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestInfo> {
    const stdout = await this.exec("gh", [
      "api",
      `repos/${owner}/${repo}/pulls/${prNumber}`,
    ]);

    const data = JSON.parse(stdout);
    return {
      number: data.number,
      title: data.title,
      url: data.html_url,
      baseBranch: data.base.ref,
      headBranch: data.head.ref,
      state: data.state as "open" | "closed" | "merged",
      repository: `${owner}/${repo}`,
      author: data.user.login,
      createdAt: data.created_at,
    };
  }

  async listPRReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubReviewComment[]> {
    const stdout = await this.exec("gh", [
      "api",
      `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      "--paginate",
    ]);

    const data = JSON.parse(stdout);
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: Record<string, unknown>) => ({
      id: item.id as number,
      body: item.body as string,
      path: item.path as string,
      line: (item.line as number) ?? undefined,
      startLine: (item.start_line as number | null) ?? undefined,
      user: (item.user as { login: string }).login,
      createdAt: item.created_at as string,
      updatedAt: item.updated_at as string,
      inReplyToId: (item.in_reply_to_id as number | null) ?? undefined,
    }));
  }

  async listPRIssueComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubIssueComment[]> {
    const stdout = await this.exec("gh", [
      "api",
      `repos/${owner}/${repo}/issues/${prNumber}/comments`,
      "--paginate",
    ]);

    const data = JSON.parse(stdout);
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: Record<string, unknown>) => ({
      id: item.id as number,
      body: item.body as string,
      user: (item.user as { login: string }).login,
      createdAt: item.created_at as string,
      updatedAt: item.updated_at as string,
    }));
  }

  async replyToComment(
    owner: string,
    repo: string,
    prNumber: number,
    commentId: number,
    body: string
  ): Promise<void> {
    await this.exec("gh", [
      "api",
      `repos/${owner}/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
      "--method",
      "POST",
      "--field",
      `body=${body}`,
    ]);
  }

  async createIssueComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<void> {
    await this.exec("gh", [
      "api",
      `repos/${owner}/${repo}/issues/${prNumber}/comments`,
      "--method",
      "POST",
      "--field",
      `body=${body}`,
    ]);
  }
}
