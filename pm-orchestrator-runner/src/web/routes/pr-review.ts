/**
 * PR Review Routes
 *
 * Provides REST API endpoints for PR Review Automation.
 * Follows the same pattern as task-tracker.ts routes.
 *
 * @see spec/35_PR_REVIEW_AUTOMATION.md Section 10
 */

import { Router, Request, Response } from "express";
import type { IDataAccessLayer } from "../dal/dal-interface";
import type { IGitHubAdapter } from "../dal/pr-review-types";
import type { ReviewJudgeLLMClient } from "../../pr-review/review-judge";
import { PRReviewService } from "../../pr-review/pr-review-service";

// ==================== Configuration ====================

export interface PRReviewRoutesConfig {
  dal: IDataAccessLayer;
  github: IGitHubAdapter;
  llmClient: ReviewJudgeLLMClient;
  orgId: string;
}

// ==================== Route Factory ====================

/**
 * Create PR review routes.
 *
 * Mounts at /api/pr-reviews and provides:
 * - POST   /register                                   - Register a PR
 * - GET    /:projectId                                 - List PRs for project
 * - GET    /:projectId/:prNumber                       - PR detail (state + comments + action)
 * - POST   /:projectId/:prNumber/start-cycle           - Start review cycle
 * - GET    /:projectId/:prNumber/comments              - List comments
 * - PATCH  /:projectId/:prNumber/comments/:commentId   - Override comment judgment
 * - POST   /:projectId/:prNumber/complete              - Complete without fix
 * - GET    /:projectId/:prNumber/cycles                - List cycles
 * - POST   /:projectId/:prNumber/mark-review-arrived   - Mark review arrived
 */
export function createPRReviewRoutes(config: PRReviewRoutesConfig): Router {
  const { dal, github, llmClient, orgId } = config;
  const service = new PRReviewService(dal, github, llmClient, orgId);
  const router = Router();

  // ==================== POST /register ====================

  router.post("/register", async (req: Request, res: Response) => {
    try {
      const {
        projectId,
        orgId: bodyOrgId,
        prNumber,
        prTitle,
        prUrl,
        baseBranch,
        headBranch,
        repository,
        maxCycles,
      } = req.body;

      // Validation
      if (!projectId || !prNumber || !prTitle || !prUrl || !baseBranch || !headBranch || !repository) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Required fields: projectId, prNumber, prTitle, prUrl, baseBranch, headBranch, repository",
        });
      }

      const result = await service.registerPR({
        projectId,
        orgId: bodyOrgId || orgId,
        prNumber: Number(prNumber),
        prTitle,
        prUrl,
        baseBranch,
        headBranch,
        repository,
        maxCycles,
      });

      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== GET /:projectId ====================

  router.get("/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const status = req.query.status as string | undefined;

      const reviews = await dal.listPRReviewStates(projectId, {
        status: status as import("../dal/pr-review-types").PRReviewStatus | undefined,
      });

      res.json({ reviews });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== GET /:projectId/:prNumber ====================

  router.get("/:projectId/:prNumber", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const prNum = Number(req.params.prNumber as string);

      const summary = await service.getReviewSummary(projectId, prNum);
      res.json(summary);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: error.message,
        });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== POST /:projectId/:prNumber/start-cycle ====================

  router.post("/:projectId/:prNumber/start-cycle", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const prNum = Number(req.params.prNumber as string);

      const cycle = await service.startReviewCycle(projectId, prNum);
      res.json(cycle);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: error.message,
        });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== GET /:projectId/:prNumber/comments ====================

  router.get("/:projectId/:prNumber/comments", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const prNum = Number(req.params.prNumber as string);

      const comments = await dal.listPRReviewComments(projectId, prNum);
      res.json({ comments });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== PATCH /:projectId/:prNumber/comments/:commentId ====================

  router.patch(
    "/:projectId/:prNumber/comments/:commentId",
    async (req: Request, res: Response) => {
      try {
        const projectId = req.params.projectId as string;
        const prNum = Number(req.params.prNumber as string);
        const commentId = req.params.commentId as string;
        const { action, reason } = req.body;

        if (!action) {
          return res.status(400).json({
            error: "VALIDATION_ERROR",
            message: "action is required (ACCEPT, REJECT, or DEFER)",
          });
        }

        const override = {
          action: action as "ACCEPT" | "REJECT" | "DEFER",
          reason,
          overriddenAt: new Date().toISOString(),
        };

        await service.applyUserOverride(projectId, prNum, commentId, override);

        const updated = await dal.getPRReviewComment(projectId, prNum, commentId);
        res.json(updated);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message });
      }
    }
  );

  // ==================== POST /:projectId/:prNumber/complete ====================

  router.post("/:projectId/:prNumber/complete", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const prNum = Number(req.params.prNumber as string);

      await service.completeWithoutFix(projectId, prNum);

      const state = await dal.getPRReviewState(projectId, prNum);
      res.json(state);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: error.message,
        });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== GET /:projectId/:prNumber/cycles ====================

  router.get("/:projectId/:prNumber/cycles", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const prNum = Number(req.params.prNumber as string);

      const cycles = await dal.listPRReviewCycles(projectId, prNum);
      res.json({ cycles });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== POST /:projectId/:prNumber/mark-review-arrived ====================

  router.post(
    "/:projectId/:prNumber/mark-review-arrived",
    async (req: Request, res: Response) => {
      try {
        const projectId = req.params.projectId as string;
        const prNum = Number(req.params.prNumber as string);

        await service.markReviewArrived(projectId, prNum);

        const state = await dal.getPRReviewState(projectId, prNum);
        res.json(state);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: error.message,
          });
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message });
      }
    }
  );

  return router;
}
