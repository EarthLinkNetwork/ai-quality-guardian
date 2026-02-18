/**
 * Dashboard Routes - Project management and activity APIs
 * Per spec/03_DASHBOARD_UI.md
 */

import { Router, Request, Response } from 'express';
import {
  NoDynamoDAL,
  InspectionPacket,
  initNoDynamo,
  getNoDynamo,
  isNoDynamoInitialized,
} from '../dal/no-dynamo';

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Create dashboard routes
 */
export function createDashboardRoutes(stateDir: string): Router {
  const router = Router();

  // Ensure NoDynamo is initialized
  if (!isNoDynamoInitialized()) {
    initNoDynamo(stateDir);
  }

  /**
   * GET /api/dashboard
   * Dashboard summary: projects, activity, stats
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const [projectsResult, activityResult, stats] = await Promise.all([
        dal.listProjectIndexes({ limit: 10 }),
        dal.listActivityEvents({ limit: 20 }),
        dal.getStats(),
      ]);

      res.json({
        projects: projectsResult.items,
        recentActivity: activityResult.items,
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/projects
   * List all projects
   */
  router.get('/projects', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const includeArchived = req.query.includeArchived === 'true';
      const status = req.query.status as string | undefined;
      const favoriteOnly = req.query.favoriteOnly === 'true';

      const result = await dal.listProjectIndexes({
        includeArchived,
        status: status as any,
        favoriteOnly,
        limit: 50,
      });

      res.json({
        projects: result.items,
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/projects
   * Create a new project
   */
  router.post('/projects', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const { projectPath, alias, tags, projectType } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'projectPath is required',
        } as ErrorResponse);
        return;
      }

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath,
        alias,
        tags,
        projectType: projectType || 'normal',
      });

      res.status(201).json(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/projects/:projectId
   * Get project details with separated task groups and tasks
   *
   * Link resolution: cross-references activity events, runs, and queue store
   * to maximize identifier recovery. N/A only when truly unknown.
   */
  router.get('/projects/:projectId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const projectId = req.params.projectId as string;
      const project = await dal.getProjectIndex(projectId);

      if (!project) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Project not found',
        } as ErrorResponse);
        return;
      }

      // Get sessions, activity events, and runs for this project
      const [sessions, activityResult, runs] = await Promise.all([
        dal.listSessions(projectId),
        dal.listActivityEvents({ projectId, limit: 100 }),
        dal.listRuns(),
      ]);

      // --- Build bidirectional lookup maps for link resolution ---

      // Map: taskId -> taskGroupId (from activity events)
      const taskIdToGroupId = new Map<string, string>();
      // Map: taskGroupId -> Set<taskId>
      const taskGroupTaskMap = new Map<string, Set<string>>();
      // Map: taskGroupId -> latest activity event
      const taskGroupLatestEvent = new Map<string, typeof activityResult.items[0]>();

      for (const evt of activityResult.items) {
        // Build taskId -> taskGroupId mapping from activity events
        if (evt.taskId && evt.taskGroupId) {
          taskIdToGroupId.set(evt.taskId, evt.taskGroupId);
        }
        // Also check details for taskRunId/taskGroupId saved by chat route
        const details = evt.details as Record<string, unknown> | undefined;
        if (details) {
          const detailTaskId = details.taskRunId as string | undefined;
          const detailGroupId = details.taskGroupId as string | undefined;
          if (detailTaskId && detailGroupId) {
            taskIdToGroupId.set(detailTaskId, detailGroupId);
          }
        }

        if (evt.taskGroupId) {
          if (!taskGroupTaskMap.has(evt.taskGroupId)) {
            taskGroupTaskMap.set(evt.taskGroupId, new Set());
          }
          if (evt.taskId) {
            taskGroupTaskMap.get(evt.taskGroupId)!.add(evt.taskId);
          }

          // Track latest event per group
          const existing = taskGroupLatestEvent.get(evt.taskGroupId);
          if (!existing || evt.timestamp > existing.timestamp) {
            taskGroupLatestEvent.set(evt.taskGroupId, evt);
          }
        }
      }

      // Filter runs by projectId
      const projectRuns = runs.filter(r => r.projectId === projectId);

      // Also derive taskGroupId from runs via session_id pattern
      // (sessionId is used as taskGroupId in chat route)
      for (const r of projectRuns) {
        if (!taskIdToGroupId.has(r.taskRunId)) {
          // sessionId == taskGroupId per SESSION_MODEL.md
          taskIdToGroupId.set(r.taskRunId, r.sessionId);
        }
        // Ensure the group exists in the map
        const gid = taskIdToGroupId.get(r.taskRunId);
        if (gid) {
          if (!taskGroupTaskMap.has(gid)) {
            taskGroupTaskMap.set(gid, new Set());
          }
          taskGroupTaskMap.get(gid)!.add(r.taskRunId);
        }
      }

      // Collect all known taskGroupIds for this project
      const projectTaskGroupIds = new Set<string>();
      for (const [, gid] of taskIdToGroupId) {
        projectTaskGroupIds.add(gid);
      }
      // Also add any from activity events directly
      for (const evt of activityResult.items) {
        if (evt.taskGroupId) {
          projectTaskGroupIds.add(evt.taskGroupId);
        }
      }

      // Build recentTaskGroups with task_group_id and task counts
      const recentTaskGroups = Array.from(projectTaskGroupIds).map(tgId => {
        const taskIds = taskGroupTaskMap.get(tgId) || new Set();
        const latestEvent = taskGroupLatestEvent.get(tgId);
        return {
          task_group_id: tgId,
          projectId,
          task_count: taskIds.size,
          task_ids: Array.from(taskIds),
          latest_activity_type: latestEvent?.type || 'N/A',
          latest_activity_at: latestEvent?.timestamp || 'N/A',
        };
      });

      // Build recentTasks from runs with resolved identifiers
      const recentTasks = projectRuns.slice(0, 20).map(r => {
        const resolvedGroupId = taskIdToGroupId.get(r.taskRunId) || 'N/A';
        return {
          task_id: r.taskRunId,
          run_id: r.runId,
          task_group_id: resolvedGroupId,
          projectId,
          status: r.status,
          summary: r.summary || r.prompt?.substring(0, 60) || r.taskRunId,
          started_at: r.startedAt,
          updated_at: r.updatedAt,
          ended_at: r.endedAt || null,
        };
      });

      res.json({
        project,
        sessions,
        recentActivity: activityResult.items.slice(0, 20),
        taskGroupIds: Array.from(projectTaskGroupIds),
        runs: projectRuns.slice(0, 20),
        recentTaskGroups,
        recentTasks,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * PATCH /api/projects/:projectId
   * Update project (favorite, tags, alias, bootstrapPrompt, projectType)
   */
  router.patch('/projects/:projectId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const { favorite, alias, tags, bootstrapPrompt, projectType } = req.body;

      const project = await dal.updateProjectIndex(req.params.projectId as string, {
        favorite,
        alias,
        tags,
        bootstrapPrompt,
        projectType,
      });

      if (!project) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Project not found',
        } as ErrorResponse);
        return;
      }

      res.json(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/projects/:projectId/archive
   * Archive project
   */
  router.post('/projects/:projectId/archive', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const project = await dal.archiveProject(req.params.projectId as string);

      if (!project) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Project not found',
        } as ErrorResponse);
        return;
      }

      res.json(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/projects/:projectId/unarchive
   * Unarchive project
   */
  router.post('/projects/:projectId/unarchive', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const project = await dal.unarchiveProject(req.params.projectId as string);

      if (!project) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Project not found',
        } as ErrorResponse);
        return;
      }

      res.json(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/activity
   * List activity events with unified identifiers
   *
   * Link resolution: cross-references event details and runs
   * to recover taskGroupId/taskId when top-level fields are missing.
   * N/A only when truly unknown after all resolution attempts.
   */
  router.get('/activity', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const projectId = req.query.projectId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const since = req.query.since as string;

      const result = await dal.listActivityEvents({
        projectId,
        limit,
        since,
      });

      // Build lookup from runs for identifier recovery
      let runLookup: Map<string, { sessionId: string; projectId: string; taskRunId: string }> = new Map();
      try {
        const runs = await dal.listRuns();
        for (const r of runs) {
          // Map taskRunId -> run info (sessionId == taskGroupId per SESSION_MODEL.md)
          runLookup.set(r.taskRunId, {
            sessionId: r.sessionId,
            projectId: r.projectId,
            taskRunId: r.taskRunId,
          });
        }
      } catch {
        // Best effort - runs lookup is optional
      }

      // Normalize identifiers with cross-reference resolution
      const events = result.items.map(e => {
        let resolvedTaskGroupId = e.taskGroupId;
        let resolvedTaskId = e.taskId;
        let resolvedProjectId = e.projectId;

        // Try to recover from event details (saved by chat route)
        const details = e.details as Record<string, unknown> | undefined;
        if (details) {
          if (!resolvedTaskGroupId && details.taskGroupId) {
            resolvedTaskGroupId = details.taskGroupId as string;
          }
          if (!resolvedTaskId && details.taskRunId) {
            resolvedTaskId = details.taskRunId as string;
          }
        }

        // Try to recover from runs via taskId
        if (resolvedTaskId && runLookup.has(resolvedTaskId)) {
          const runInfo = runLookup.get(resolvedTaskId)!;
          if (!resolvedTaskGroupId) {
            resolvedTaskGroupId = runInfo.sessionId;
          }
          if (!resolvedProjectId) {
            resolvedProjectId = runInfo.projectId;
          }
        }

        // Try to recover from runs via sessionId -> taskGroupId
        if (e.sessionId && !resolvedTaskGroupId) {
          resolvedTaskGroupId = e.sessionId;
        }

        return {
          ...e,
          projectId: resolvedProjectId || 'N/A',
          taskGroupId: resolvedTaskGroupId || 'N/A',
          taskId: resolvedTaskId || 'N/A',
        };
      });

      res.json({
        events,
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/runs
   * List runs
   */
  router.get('/runs', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const sessionId = req.query.sessionId as string;
      const runs = await dal.listRuns(sessionId);

      res.json({ runs });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/runs/:runId
   * Get run details with events
   */
  router.get('/runs/:runId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const run = await dal.getRun(req.params.runId as string);

      if (!run) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Run not found',
        } as ErrorResponse);
        return;
      }

      // Get events for this run
      const events = await dal.listEvents(req.params.runId as string);

      res.json({
        run,
        events,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/runs/:runId/logs
   * Get logs for a run
   */
  router.get('/runs/:runId/logs', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const events = await dal.listEvents(req.params.runId as string);

      // Filter to log-type events
      const logs = events
        .filter(e => e.type === 'LOG_BATCH' || e.type === 'PROGRESS' || e.type === 'ERROR')
        .map(e => ({
          timestamp: e.timestamp,
          level: e.level,
          message: e.message,
          type: e.type,
        }));

      res.json({ logs });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/sessions
   * List sessions
   */
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const projectId = req.query.projectId as string;
      const sessions = await dal.listSessions(projectId);

      res.json({ sessions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/sessions/:sessionId
   * Get session details with runs
   */
  router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const session = await dal.getSession(req.params.sessionId as string);

      if (!session) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Session not found',
        } as ErrorResponse);
        return;
      }

      // Get runs for this session
      const runs = await dal.listRuns(req.params.sessionId as string);

      res.json({
        session,
        runs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  return router;
}
