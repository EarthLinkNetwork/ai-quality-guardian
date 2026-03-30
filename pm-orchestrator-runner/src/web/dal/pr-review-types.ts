/**
 * PR Review Types
 *
 * Type definitions for PRReviewState, PRReviewComment, and PRReviewCycle entities.
 * Part of the Single-Table DynamoDB design in pm-project-indexes.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md
 */

// ==================== Enums / Union Types ====================

export type PRReviewStatus =
  | "REVIEW_PENDING"
  | "REVIEW_ARRIVED"
  | "ANALYZING"
  | "AWAITING_APPROVAL"
  | "FIXING"
  | "FIX_PUSHED"
  | "REVIEW_COMPLETE"
  | "ESCALATED"
  | "CYCLE_LIMIT_REACHED"
  | "ERROR";

export type CommentCategory =
  | "BUG"
  | "SECURITY"
  | "PERFORMANCE"
  | "TYPE_SAFETY"
  | "ERROR_HANDLING"
  | "STYLE"
  | "NAMING"
  | "DOCUMENTATION"
  | "BEST_PRACTICE"
  | "ARCHITECTURE"
  | "TEST"
  | "OTHER";

export type CommentSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFO";

export type CommentJudgment =
  | "ACCEPT"
  | "REJECT"
  | "ESCALATE"
  | "ALREADY_FIXED"
  | "DUPLICATE";

export type CycleDecision =
  | "CONTINUE"
  | "COMPLETE"
  | "ESCALATE"
  | "CYCLE_LIMIT";

// ==================== PRReviewState ====================

/**
 * PRReviewState entity — PR-level review automation state
 *
 * DynamoDB Keys: PK=ORG#<orgId>, SK=PR#<projectId>#<prNumber>
 */
export interface PRReviewState {
  PK: string;
  SK: string;

  projectId: string;
  orgId: string;
  prNumber: number;

  prTitle: string;
  prUrl: string;
  baseBranch: string;
  headBranch: string;
  repository: string;

  status: PRReviewStatus;
  currentCycle: number;
  maxCycles: number;

  totalComments: number;
  pendingComments: number;
  acceptedComments: number;
  rejectedComments: number;
  escalatedComments: number;

  lastReviewArrivedAt: string | null;
  lastFixPushedAt: string | null;

  version: number;
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

// ==================== PRReviewComment ====================

export interface UserOverride {
  action: "ACCEPT" | "REJECT" | "DEFER";
  reason?: string;
  overriddenAt: string;
}

/**
 * PRReviewComment entity — individual review comment with LLM judgment
 *
 * DynamoDB Keys: PK=ORG#<orgId>, SK=PRCOMMENT#<projectId>#<prNumber>#<commentId>
 */
export interface PRReviewComment {
  PK: string;
  SK: string;

  commentId: string;
  projectId: string;
  orgId: string;
  prNumber: number;

  filePath: string;
  lineRange?: { start: number; end: number };
  body: string;
  category: CommentCategory;
  severity: CommentSeverity;

  judgment: CommentJudgment;
  judgmentReason: string;
  judgmentConfidence: number;
  suggestedFix?: string;
  llmModel: string;

  fixApplied: boolean;
  fixCommitHash?: string;
  fixDescription?: string;

  detectedInCycle: number;
  lastSeenInCycle: number;
  isDuplicate: boolean;
  duplicateOfCommentId?: string;

  userOverride?: UserOverride;

  createdAt: string;
  updatedAt: string;
}

// ==================== PRReviewCycle ====================

/**
 * PRReviewCycle entity — per-cycle execution record
 *
 * DynamoDB Keys: PK=ORG#<orgId>, SK=PRCYCLE#<projectId>#<prNumber>#<cycle>
 */
export interface PRReviewCycle {
  PK: string;
  SK: string;

  projectId: string;
  orgId: string;
  prNumber: number;
  cycleNumber: number;

  reviewCommentIds: string[];
  newCommentCount: number;
  resolvedCommentCount: number;
  duplicateCommentCount: number;

  llmCycleSummary: string;
  llmContinueDecision: CycleDecision;
  llmDecisionReason: string;

  fixCommitHash?: string;
  filesModified: string[];

  reviewArrivedAt: string;
  analysisCompletedAt?: string;
  userApprovedAt?: string;
  fixPushedAt?: string;

  createdAt: string;
}

// ==================== Input Types ====================

export interface CreatePRReviewStateInput {
  projectId: string;
  orgId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  baseBranch: string;
  headBranch: string;
  repository: string;
  maxCycles?: number;
}

export interface UpdatePRReviewStateInput {
  status?: PRReviewStatus;
  currentCycle?: number;
  totalComments?: number;
  pendingComments?: number;
  acceptedComments?: number;
  rejectedComments?: number;
  escalatedComments?: number;
  lastReviewArrivedAt?: string;
  lastFixPushedAt?: string;
}

// ==================== GitHub Adapter Types ====================

export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  state: "open" | "closed" | "merged";
  repository: string;
  author: string;
  createdAt: string;
}

export interface GitHubReviewComment {
  id: number;
  body: string;
  path: string;
  line?: number;
  startLine?: number;
  user: string;
  createdAt: string;
  updatedAt: string;
  inReplyToId?: number;
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== GitHub Adapter Interface ====================

/**
 * IGitHubAdapter — abstraction over GitHub API
 *
 * Phase 1: gh CLI-based implementation (GhCliGitHubAdapter)
 * Phase 2: @octokit/rest migration (optional)
 */
export interface IGitHubAdapter {
  getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestInfo>;

  listPRReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubReviewComment[]>;

  listPRIssueComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubIssueComment[]>;

  replyToComment(
    owner: string,
    repo: string,
    prNumber: number,
    commentId: number,
    body: string
  ): Promise<void>;

  createIssueComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<void>;
}
