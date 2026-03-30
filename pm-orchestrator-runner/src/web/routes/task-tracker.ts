/**
 * Task Tracker Routes
 *
 * Provides REST API endpoints for TaskTracker CRUD, snapshots, summaries,
 * and recovery operations.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 11
 */

import { Router, Request, Response } from "express";
import type { IDataAccessLayer } from "../dal/dal-interface";
import type {
  TaskTracker,
  TaskSnapshot,
} from "../dal/task-tracker-types";
import { generateRecoveryPrompt } from "../../task-tracker/context-recovery";

/**
 * Task Tracker routes configuration
 */
export interface TaskTrackerRoutesConfig {
  dal: IDataAccessLayer;
}

/**
 * Create task tracker routes
 *
 * Mounts at /api/tracker and provides:
 * - GET    /:projectId             - Get tracker
 * - PUT    /:projectId             - Create/update tracker
 * - DELETE /:projectId             - Reset (delete) tracker
 * - GET    /:projectId/snapshots   - List snapshots
 * - POST   /:projectId/snapshots   - Create manual snapshot
 * - GET    /:projectId/summaries   - List task summaries
 * - GET    /:projectId/recovery    - Get recovery info
 * - POST   /:projectId/recover     - Execute recovery
 */
export function createTaskTrackerRoutes(config: TaskTrackerRoutesConfig): Router {
  const { dal } = config;
  const router = Router();

  // ==================== GET /:projectId ====================

  router.get("/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const tracker = await dal.getTaskTracker(projectId);

      if (!tracker) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: `TaskTracker not found for project '${projectId}'`,
        });
      }

      res.json(tracker);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== PUT /:projectId ====================

  router.put("/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const body = req.body;

      if (!body.orgId) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "orgId is required",
        });
      }

      // Load existing or create new
      const existing = await dal.getTaskTracker(projectId);
      const now = new Date().toISOString();

      const tracker: TaskTracker = {
        PK: `ORG#${body.orgId}`,
        SK: `TRACKER#${projectId}`,
        projectId,
        orgId: body.orgId,
        currentPlan: body.currentPlan ?? existing?.currentPlan ?? null,
        activeTasks: body.activeTasks ?? existing?.activeTasks ?? [],
        completedTaskIds: body.completedTaskIds ?? existing?.completedTaskIds ?? [],
        lastContextSummary: body.lastContextSummary ?? existing?.lastContextSummary ?? null,
        lastCheckpointAt: body.lastCheckpointAt ?? existing?.lastCheckpointAt ?? null,
        recoveryHint: body.recoveryHint ?? existing?.recoveryHint ?? null,
        version: existing ? existing.version + 1 : 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const result = await dal.upsertTaskTracker(tracker);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== DELETE /:projectId ====================

  router.delete("/:projectId", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      await dal.deleteTaskTracker(projectId);
      res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== GET /:projectId/snapshots ====================

  router.get("/:projectId/snapshots", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const snapshots = await dal.listTaskSnapshots(projectId, limit);
      res.json({ snapshots });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== POST /:projectId/snapshots ====================

  router.post("/:projectId/snapshots", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const body = req.body;

      // Need an existing tracker to snapshot
      const tracker = await dal.getTaskTracker(projectId);
      if (!tracker) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: `TaskTracker not found for project '${projectId}'. Cannot create snapshot.`,
        });
      }

      const snapshot = await dal.createTaskSnapshot({
        projectId,
        orgId: tracker.orgId,
        trigger: "USER_REQUESTED",
        trackerState: tracker,
        contextSummary: body.contextSummary ?? "",
        filesModified: body.filesModified ?? [],
        gitState: body.gitState,
      });

      res.status(201).json(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== GET /:projectId/summaries ====================

  router.get("/:projectId/summaries", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const summaries = await dal.listTaskSummaries(projectId);
      res.json({ summaries });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== GET /:projectId/recovery ====================

  router.get("/:projectId/recovery", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const tracker = await dal.getTaskTracker(projectId);

      if (!tracker) {
        return res.json({
          hasUnfinishedWork: false,
          lastCheckpointAt: null,
          activePlan: null,
          activeTaskCount: 0,
          contextSummary: null,
          recoveryHint: null,
        });
      }

      const activeTaskCount = tracker.activeTasks.filter(
        (t) => t.status === "RUNNING" || t.status === "QUEUED" || t.status === "BLOCKED"
      ).length;

      const hasPendingSubtasks = tracker.currentPlan?.subtasks.some(
        (s) => s.status !== "DONE" && s.status !== "SKIPPED"
      ) ?? false;

      const planIsActive = tracker.currentPlan != null &&
        tracker.currentPlan.status !== "COMPLETED" &&
        tracker.currentPlan.status !== "CANCELLED" &&
        tracker.currentPlan.status !== "FAILED";

      const hasUnfinishedWork = activeTaskCount > 0 || (planIsActive && hasPendingSubtasks);

      res.json({
        hasUnfinishedWork,
        lastCheckpointAt: tracker.lastCheckpointAt,
        activePlan: tracker.currentPlan,
        activeTaskCount,
        contextSummary: tracker.lastContextSummary,
        recoveryHint: tracker.recoveryHint,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  // ==================== POST /:projectId/recover ====================

  router.post("/:projectId/recover", async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const tracker = await dal.getTaskTracker(projectId);

      if (!tracker) {
        return res.json({
          recovered: false,
          plan: null,
          activeTasks: [],
          recoveryPrompt: "",
        });
      }

      const snapshot = await dal.getLatestTaskSnapshot(projectId);
      const recoveryPrompt = generateRecoveryPrompt(tracker, snapshot);

      res.json({
        recovered: true,
        plan: tracker.currentPlan,
        activeTasks: tracker.activeTasks,
        recoveryPrompt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message });
    }
  });

  return router;
}
