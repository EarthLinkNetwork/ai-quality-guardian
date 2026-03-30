/**
 * PRReviewService — Main orchestrator for PR Review Automation
 *
 * Integrates:
 * - DAL (PRReviewState, PRReviewComment, PRReviewCycle persistence)
 * - GitHub Adapter (comment fetching)
 * - ReviewJudge (LLM-based comment analysis)
 * - DuplicateDetector (cross-cycle duplicate detection)
 * - CycleManager (cycle continuation/termination decision)
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 9
 */

import type { IDataAccessLayer } from "../web/dal/dal-interface";
import type {
  PRReviewState,
  PRReviewComment,
  PRReviewCycle,
  PRReviewStatus,
  IGitHubAdapter,

  CreatePRReviewStateInput,

  UserOverride,

  CycleDecision,
} from "../web/dal/pr-review-types";
import { ReviewJudge } from "./review-judge";
import type { ReviewJudgeLLMClient } from "./review-judge";
import { DuplicateDetector } from "./duplicate-detector";
import { CycleManager } from "./cycle-manager";
import type { CommentSummaryForCycle } from "./cycle-manager";

// ==================== Types ====================

export interface ReviewSummaryForDashboard {
  state: PRReviewState;
  comments: PRReviewComment[];
  cycles: PRReviewCycle[];
  acceptCount: number;
  rejectCount: number;
  escalateCount: number;
  pendingUserAction: "APPROVE_FIXES" | "REVIEW_ESCALATIONS" | "NONE";
}

export interface FullPRReviewInfo {
  state: PRReviewState;
  comments: PRReviewComment[];
  cycles: PRReviewCycle[];
}

// ==================== Implementation ====================

export class PRReviewService {
  private dal: IDataAccessLayer;
  private github: IGitHubAdapter;
  private reviewJudge: ReviewJudge;
  private duplicateDetector: DuplicateDetector;
  private cycleManager: CycleManager;
  private orgId: string;

  constructor(
    dal: IDataAccessLayer,
    github: IGitHubAdapter,
    llmClient: ReviewJudgeLLMClient,
    orgId: string
  ) {
    this.dal = dal;
    this.github = github;
    this.orgId = orgId;
    this.reviewJudge = new ReviewJudge(llmClient);
    this.duplicateDetector = new DuplicateDetector(llmClient);
    this.cycleManager = new CycleManager(llmClient);
  }

  // ==================== PR Registration ====================

  /**
   * Register a new PR for review automation.
   * Creates a PRReviewState with REVIEW_PENDING status.
   */
  async registerPR(input: CreatePRReviewStateInput): Promise<PRReviewState> {
    return this.dal.createPRReviewState(input);
  }

  // ==================== Review Cycle ====================

  /**
   * Start a review cycle:
   * 1. Fetch comments from GitHub
   * 2. Analyze each comment with ReviewJudge
   * 3. Detect duplicates (for cycle >= 2)
   * 4. Save comments to DAL
   * 5. Get cycle decision from CycleManager
   * 6. Update PR state accordingly
   */
  async startReviewCycle(
    projectId: string,
    prNumber: number
  ): Promise<PRReviewCycle> {
    // Load current state
    const state = await this.dal.getPRReviewState(projectId, prNumber);
    if (!state) {
      throw new Error(
        `PR review state not found for ${projectId}/${prNumber}`
      );
    }

    const newCycleNumber = state.currentCycle + 1;
    const now = new Date().toISOString();

    // Update state to ANALYZING
    await this.dal.updatePRReviewState(projectId, prNumber, {
      status: "ANALYZING",
      currentCycle: newCycleNumber,
      version: state.version,
    });

    // Parse repository owner/name
    const [owner, repo] = state.repository.split("/");

    // Fetch comments from GitHub
    const githubComments = await this.github.listPRReviewComments(
      owner,
      repo,
      prNumber
    );

    // If no comments, complete immediately
    if (githubComments.length === 0) {
      const cycle = await this.createCycleRecord(
        state,
        newCycleNumber,
        [],
        {
          decision: "COMPLETE",
          reason: "No new comments in this cycle",
          summary:
            "No new review comments. All previous issues have been resolved.",
          newValidCommentCount: 0,
          duplicateCommentCount: 0,
          styleOnlyCommentCount: 0,
        },
        now
      );

      // Update state to REVIEW_COMPLETE
      const updatedState = await this.dal.getPRReviewState(projectId, prNumber);
      await this.dal.updatePRReviewState(projectId, prNumber, {
        status: "REVIEW_COMPLETE",
        version: updatedState!.version,
      });

      return cycle;
    }

    // Analyze comments with ReviewJudge
    const analysisResults = await this.reviewJudge.analyzeComments({
      prTitle: state.prTitle,
      prUrl: state.prUrl,
      repository: state.repository,
      comments: githubComments,
    });

    // Detect duplicates for cycle >= 2
    const previousComments =
      newCycleNumber >= 2
        ? await this.dal.listPRReviewComments(projectId, prNumber)
        : [];

    // Build PRReviewComment records
    const commentRecords: PRReviewComment[] = [];
    for (let i = 0; i < githubComments.length; i++) {
      const ghComment = githubComments[i];
      const analysis = analysisResults.find(
        (a) => a.commentId === String(ghComment.id)
      ) ?? analysisResults[i]; // fallback to positional match

      // Duplicate detection
      let isDuplicate = false;
      let duplicateOfCommentId: string | undefined;
      if (newCycleNumber >= 2 && previousComments.length > 0) {
        const dupResult = await this.duplicateDetector.checkDuplicate(
          ghComment,
          previousComments
        );
        isDuplicate = dupResult.isDuplicate;
        duplicateOfCommentId = dupResult.duplicateOfCommentId;
      }

      const record: PRReviewComment = {
        PK: `ORG#${this.orgId}`,
        SK: `PRCOMMENT#${projectId}#${prNumber}#${ghComment.id}`,
        commentId: String(ghComment.id),
        projectId,
        orgId: this.orgId,
        prNumber,
        filePath: ghComment.path,
        lineRange:
          ghComment.line != null
            ? {
                start: ghComment.startLine ?? ghComment.line,
                end: ghComment.line,
              }
            : undefined,
        body: ghComment.body,
        category: analysis?.category ?? "OTHER",
        severity: analysis?.severity ?? "MEDIUM",
        judgment: isDuplicate
          ? "DUPLICATE"
          : (analysis?.judgment ?? "ESCALATE"),
        judgmentReason: isDuplicate
          ? `Duplicate of comment ${duplicateOfCommentId}`
          : (analysis?.judgmentReason ?? ""),
        judgmentConfidence: analysis?.judgmentConfidence ?? 0,
        suggestedFix: analysis?.suggestedFix ?? undefined,
        llmModel: analysis?.llmModel ?? "unknown",
        fixApplied: false,
        detectedInCycle: newCycleNumber,
        lastSeenInCycle: newCycleNumber,
        isDuplicate,
        duplicateOfCommentId,
        createdAt: now,
        updatedAt: now,
      };

      commentRecords.push(record);
    }

    // Save comments to DAL
    if (commentRecords.length > 0) {
      await this.dal.batchCreatePRReviewComments(commentRecords);
    }

    // Count by judgment
    const counts = this.countJudgments(commentRecords);

    // Get cycle decision
    const commentSummaries: CommentSummaryForCycle[] = commentRecords.map(
      (c) => ({
        commentId: c.commentId,
        judgment: c.judgment,
        isDuplicate: c.isDuplicate,
        category: c.category,
        severity: c.severity,
      })
    );

    const previousCycles = await this.dal.listPRReviewCycles(
      projectId,
      prNumber
    );
    const previousCycleSummaries = previousCycles.map(
      (c) => c.llmCycleSummary
    );

    // Check cycle limit BEFORE LLM decision
    let cycleDecision;
    if (newCycleNumber >= state.maxCycles) {
      cycleDecision = {
        decision: "CYCLE_LIMIT" as CycleDecision,
        reason: `Cycle limit reached (${newCycleNumber}/${state.maxCycles})`,
        summary: `Reached maximum cycle limit of ${state.maxCycles}. Remaining issues require human review.`,
        newValidCommentCount: counts.accepted,
        duplicateCommentCount: counts.duplicate,
        styleOnlyCommentCount: counts.rejected,
      };
    } else {
      cycleDecision = await this.cycleManager.decideCycle({
        currentCycle: newCycleNumber,
        maxCycles: state.maxCycles,
        commentSummaries,
        previousCycleSummaries,
      });
    }

    // Create cycle record
    const cycle = await this.createCycleRecord(
      state,
      newCycleNumber,
      commentRecords.map((c) => c.commentId),
      cycleDecision,
      now
    );

    // Update PR state based on cycle decision
    const currentState = await this.dal.getPRReviewState(projectId, prNumber);
    const newStatus = this.decisionToStatus(cycleDecision.decision);
    await this.dal.updatePRReviewState(projectId, prNumber, {
      status: newStatus,
      totalComments: (currentState!.totalComments || 0) + commentRecords.length,
      pendingComments: counts.accepted,
      acceptedComments: (currentState!.acceptedComments || 0) + counts.accepted,
      rejectedComments: (currentState!.rejectedComments || 0) + counts.rejected,
      escalatedComments:
        (currentState!.escalatedComments || 0) + counts.escalated,
      lastReviewArrivedAt: now,
      version: currentState!.version,
    });

    return cycle;
  }

  // ==================== User Interaction ====================

  /**
   * Get a summary of the current review state for the dashboard.
   */
  async getReviewSummary(
    projectId: string,
    prNumber: number
  ): Promise<ReviewSummaryForDashboard> {
    const state = await this.dal.getPRReviewState(projectId, prNumber);
    if (!state) {
      throw new Error(
        `PR review state not found for ${projectId}/${prNumber}`
      );
    }

    const comments = await this.dal.listPRReviewComments(
      projectId,
      prNumber
    );
    const cycles = await this.dal.listPRReviewCycles(projectId, prNumber);

    const acceptCount = comments.filter(
      (c) => c.judgment === "ACCEPT"
    ).length;
    const rejectCount = comments.filter(
      (c) => c.judgment === "REJECT"
    ).length;
    const escalateCount = comments.filter(
      (c) => c.judgment === "ESCALATE"
    ).length;

    let pendingUserAction: "APPROVE_FIXES" | "REVIEW_ESCALATIONS" | "NONE" =
      "NONE";
    if (state.status === "AWAITING_APPROVAL") {
      if (escalateCount > 0) {
        pendingUserAction = "REVIEW_ESCALATIONS";
      } else if (acceptCount > 0) {
        pendingUserAction = "APPROVE_FIXES";
      }
    }

    return {
      state,
      comments,
      cycles,
      acceptCount,
      rejectCount,
      escalateCount,
      pendingUserAction,
    };
  }

  /**
   * Apply a user override to a specific comment's judgment.
   */
  async applyUserOverride(
    projectId: string,
    prNumber: number,
    commentId: string,
    override: UserOverride
  ): Promise<void> {
    await this.dal.updatePRReviewComment(projectId, prNumber, commentId, {
      userOverride: override,
    });
  }

  /**
   * Mark the PR review as complete without applying any fixes.
   */
  async completeWithoutFix(
    projectId: string,
    prNumber: number
  ): Promise<void> {
    const state = await this.dal.getPRReviewState(projectId, prNumber);
    if (!state) {
      throw new Error(
        `PR review state not found for ${projectId}/${prNumber}`
      );
    }

    await this.dal.updatePRReviewState(projectId, prNumber, {
      status: "REVIEW_COMPLETE",
      version: state.version,
    });
  }

  // ==================== Status Updates ====================

  /**
   * Mark that a new review has arrived (e.g., CodeRabbit re-review).
   */
  async markReviewArrived(
    projectId: string,
    prNumber: number
  ): Promise<void> {
    const state = await this.dal.getPRReviewState(projectId, prNumber);
    if (!state) {
      throw new Error(
        `PR review state not found for ${projectId}/${prNumber}`
      );
    }

    await this.dal.updatePRReviewState(projectId, prNumber, {
      status: "REVIEW_ARRIVED",
      lastReviewArrivedAt: new Date().toISOString(),
      version: state.version,
    });
  }

  /**
   * Get the full PR review state including comments and cycles.
   */
  async getFullState(
    projectId: string,
    prNumber: number
  ): Promise<FullPRReviewInfo> {
    const state = await this.dal.getPRReviewState(projectId, prNumber);
    if (!state) {
      throw new Error(
        `PR review state not found for ${projectId}/${prNumber}`
      );
    }

    const comments = await this.dal.listPRReviewComments(
      projectId,
      prNumber
    );
    const cycles = await this.dal.listPRReviewCycles(projectId, prNumber);

    return { state, comments, cycles };
  }

  // ==================== Private Helpers ====================

  private countJudgments(comments: PRReviewComment[]): {
    accepted: number;
    rejected: number;
    escalated: number;
    duplicate: number;
  } {
    let accepted = 0;
    let rejected = 0;
    let escalated = 0;
    let duplicate = 0;

    for (const c of comments) {
      switch (c.judgment) {
        case "ACCEPT":
          accepted++;
          break;
        case "REJECT":
          rejected++;
          break;
        case "ESCALATE":
          escalated++;
          break;
        case "DUPLICATE":
          duplicate++;
          break;
      }
    }

    return { accepted, rejected, escalated, duplicate };
  }

  private decisionToStatus(decision: CycleDecision): PRReviewStatus {
    switch (decision) {
      case "CONTINUE":
        return "AWAITING_APPROVAL";
      case "COMPLETE":
        return "REVIEW_COMPLETE";
      case "ESCALATE":
        return "ESCALATED";
      case "CYCLE_LIMIT":
        return "CYCLE_LIMIT_REACHED";
      default:
        return "AWAITING_APPROVAL";
    }
  }

  private async createCycleRecord(
    state: PRReviewState,
    cycleNumber: number,
    commentIds: string[],
    decision: {
      decision: CycleDecision;
      reason: string;
      summary: string;
      newValidCommentCount: number;
      duplicateCommentCount: number;
      styleOnlyCommentCount: number;
    },
    now: string
  ): Promise<PRReviewCycle> {
    const cycle: PRReviewCycle = {
      PK: `ORG#${this.orgId}`,
      SK: `PRCYCLE#${state.projectId}#${state.prNumber}#${cycleNumber}`,
      projectId: state.projectId,
      orgId: this.orgId,
      prNumber: state.prNumber,
      cycleNumber,
      reviewCommentIds: commentIds,
      newCommentCount: decision.newValidCommentCount,
      resolvedCommentCount: 0,
      duplicateCommentCount: decision.duplicateCommentCount,
      llmCycleSummary: decision.summary,
      llmContinueDecision: decision.decision,
      llmDecisionReason: decision.reason,
      filesModified: [],
      reviewArrivedAt: now,
      analysisCompletedAt: now,
      createdAt: now,
    };

    return this.dal.createPRReviewCycle(cycle);
  }
}
