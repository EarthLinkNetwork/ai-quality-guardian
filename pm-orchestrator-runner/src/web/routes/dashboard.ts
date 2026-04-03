/**
 * Dashboard Routes - Project management and activity APIs
 * Per spec/03_DASHBOARD_UI.md
 */

import { Router, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  InspectionPacket,
} from '../dal/no-dynamo';
import { initDAL, getDAL, isDALInitialized } from '../dal/dal-factory';
import type { IQueueStore } from '../../queue/queue-store';
import { buildProjectCostInfo, getAllModelCostInfo } from '../services/ai-cost-service';

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Dashboard routes configuration
 */
export interface DashboardRoutesConfig {
  stateDir: string;
  /** Optional queue store for task group status enrichment */
  queueStore?: IQueueStore;
}

/**
 * Create dashboard routes
 */
export function createDashboardRoutes(stateDirOrConfig: string | DashboardRoutesConfig): Router {
  const config = typeof stateDirOrConfig === 'string'
    ? { stateDir: stateDirOrConfig }
    : stateDirOrConfig;
  const { stateDir, queueStore } = config;
  const router = Router();

  // Ensure DAL is initialized
  if (!isDALInitialized()) {
    initDAL({ useDynamoDB: false, stateDir });
  }

  /**
   * GET /api/dashboard
   * Dashboard summary: projects, activity, stats
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const dal = getDAL();
      const authReq = req as AuthenticatedRequest;
      const projectStatus = (req.query.projectStatus as string) || 'active';
      const [projectsResult, activityResult, stats] = await Promise.all([
        dal.listProjectIndexes({ limit: 50, projectStatus: projectStatus === 'all' ? undefined : projectStatus as any, orgId: authReq.orgId }),
        dal.listActivityEvents({ limit: 20, orgId: authReq.orgId } as any),
        dal.getStats(authReq.orgId),
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
      const dal = getDAL();
      const authReq = req as AuthenticatedRequest;
      const includeArchived = req.query.includeArchived === 'true';
      const status = req.query.status as string | undefined;
      const projectStatus = req.query.projectStatus as string | undefined;
      const favoriteOnly = req.query.favoriteOnly === 'true';
      const search = req.query.search as string | undefined;
      const sortBy = req.query.sortBy as string | undefined;
      const sortDirection = req.query.sortDirection as string | undefined;

      const result = await dal.listProjectIndexes({
        includeArchived,
        status: status as any,
        projectStatus: projectStatus as any,
        favoriteOnly,
        search,
        sortBy: sortBy as any,
        sortDirection: sortDirection as any,
        limit: 50,
        orgId: authReq.orgId,
      });

      // Enrich projects with cost info
      const projectsWithCost = result.items.map(p => {
        const proj = p as any;
        const costInfo = proj.aiModel
          ? buildProjectCostInfo(proj.aiModel, proj.aiProvider)
          : null;
        return {
          ...p,
          costInfo,
        };
      });

      res.json({
        projects: projectsWithCost,
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
      const dal = getDAL();
      const authReq = req as AuthenticatedRequest;
      const { projectPath, alias, description, notes, tags, projectType, aiModel, aiProvider } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'projectPath is required',
        } as ErrorResponse);
        return;
      }

      const project = await dal.createProjectIndex({
        orgId: authReq.orgId || 'default',
        projectPath,
        alias,
        description,
        notes,
        tags,
        projectType: projectType || 'normal',
        aiModel,
        aiProvider,
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
      const dal = getDAL();
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

      // Fetch queue store items once (reused for task group enrichment and recentTasks supplement)
      let queueTasksForProject: import('../../queue/queue-store').QueueItem[] = [];
      if (queueStore) {
        try {
          const allQueueItems = await queueStore.getAllItemsSummary();
          queueTasksForProject = allQueueItems.filter(
            item => item.project_path === (project as any).projectPath
          );
          // Add task group IDs from queue store (tasks may exist in queue but not yet in activity events)
          for (const item of queueTasksForProject) {
            projectTaskGroupIds.add(item.task_group_id);
            // Also update taskGroupTaskMap so task counts are accurate
            if (!taskGroupTaskMap.has(item.task_group_id)) {
              taskGroupTaskMap.set(item.task_group_id, new Set());
            }
            taskGroupTaskMap.get(item.task_group_id)!.add(item.task_id);
          }
        } catch { /* ignore queue store errors */ }
      }

      // Build task group status lookup from queue store if available
      const groupStatusMap = new Map<string, string>();
      if (queueStore) {
        try {
          const allQueueGroups = await queueStore.getAllTaskGroups();
          for (const g of allQueueGroups) {
            if (g.group_status) {
              groupStatusMap.set(g.task_group_id, g.group_status);
            }
          }
        } catch {
          // Best effort - queue store lookup is optional
        }
      }

      // Build recentTaskGroups with task_group_id, task counts, and group_status
      const excludeGroupStatus = (req.query.excludeGroupStatus as string || '').split(',').filter(Boolean);
      const recentTaskGroups = Array.from(projectTaskGroupIds)
        .map(tgId => {
          const taskIds = taskGroupTaskMap.get(tgId) || new Set();
          const latestEvent = taskGroupLatestEvent.get(tgId);
          return {
            task_group_id: tgId,
            projectId,
            task_count: taskIds.size,
            task_ids: Array.from(taskIds),
            latest_activity_type: latestEvent?.type || 'N/A',
            latest_activity_at: latestEvent?.timestamp || 'N/A',
            group_status: groupStatusMap.get(tgId) || 'active',
          };
        })
        .filter(tg => !excludeGroupStatus.includes(tg.group_status))
        // Only include groups that have actual activity events (not orphaned runs from old orgId)
        .filter(tg => tg.latest_activity_type !== 'N/A' || tg.group_status !== 'active')
        .slice(0, 20);

      // Build recentTasks from runs that have matching activity events (filters out old orgId orphans)
      const projectRunsWithActivity = projectRuns.filter(r =>
        activityResult.items.some(e => e.taskId === r.taskRunId || (e.details as any)?.taskRunId === r.taskRunId)
      );
      const recentTasks = projectRunsWithActivity.slice(0, 20).map(r => {
        const resolvedGroupId = taskIdToGroupId.get(r.taskRunId) || 'N/A';
        return {
          task_id: r.taskRunId,
          run_id: r.runId,
          task_group_id: resolvedGroupId,
          projectId,
          status: r.status,
          summary: r.summary || r.prompt?.substring(0, 120) || r.taskRunId,
          started_at: r.startedAt,
          updated_at: r.updatedAt,
          ended_at: r.endedAt || null,
        };
      });

      // Supplement recentTasks with live queue store data (using cached queueTasksForProject)
      if (queueTasksForProject.length > 0) {
        // Build a set of task IDs already in recentTasks
        const existingTaskIds = new Set(recentTasks.map(t => t.task_id));

        // Add queue tasks not already in recentTasks
        for (const item of queueTasksForProject) {
          if (!existingTaskIds.has(item.task_id)) {
            recentTasks.push({
              task_id: item.task_id,
              run_id: 'N/A',
              task_group_id: item.task_group_id,
              projectId,
              status: item.status,
              summary: item.prompt?.substring(0, 120) || item.task_id,
              started_at: item.created_at,
              updated_at: item.updated_at,
              ended_at: null,
            });
          } else {
            // Update status from queue store (more current than runs)
            const existing = recentTasks.find(t => t.task_id === item.task_id);
            if (existing && item.status !== existing.status) {
              existing.status = item.status;
              existing.updated_at = item.updated_at;
            }
          }
        }

        // Re-sort by updated_at descending
        recentTasks.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

        // Also update task group task counts from queue store
        for (const tg of recentTaskGroups) {
          const queueCount = queueTasksForProject.filter(i => i.task_group_id === tg.task_group_id).length;
          if (queueCount > tg.task_count) {
            tg.task_count = queueCount;
            tg.task_ids = queueTasksForProject
              .filter(i => i.task_group_id === tg.task_group_id)
              .map(i => i.task_id);
          }
        }
      }

      // Build cost info for the project
      const proj = project as any;
      const costInfo = proj.aiModel
        ? buildProjectCostInfo(proj.aiModel, proj.aiProvider)
        : null;

      res.json({
        project,
        costInfo,
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
   * Update project (favorite, tags, alias, bootstrapPrompt, projectType, inputTemplateId, outputTemplateId)
   */
  router.patch('/projects/:projectId', async (req: Request, res: Response) => {
    try {
      const dal = getDAL();
      const { favorite, alias, description, notes, tags, bootstrapPrompt, projectType, projectStatus, inputTemplateId, outputTemplateId, aiModel, aiProvider, defaultCommand } = req.body;

      const project = await dal.updateProjectIndex(req.params.projectId as string, {
        favorite,
        alias,
        description,
        notes,
        tags,
        bootstrapPrompt,
        projectType,
        projectStatus,
        inputTemplateId,
        outputTemplateId,
        aiModel,
        aiProvider,
        defaultCommand,
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
      const dal = getDAL();
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
      const dal = getDAL();
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
      const dal = getDAL();
      const authReq = req as AuthenticatedRequest;
      const projectId = req.query.projectId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const since = req.query.since as string;

      const result = await dal.listActivityEvents({
        projectId,
        limit,
        since,
        orgId: authReq.orgId,
      } as any);

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
      const dal = getDAL();
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
      const dal = getDAL();
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
      const dal = getDAL();
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
      const dal = getDAL();
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
      const dal = getDAL();
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

  /**
   * GET /api/models
   * List all available AI models with pricing info
   */
  router.get('/models', (_req: Request, res: Response) => {
    try {
      const models = getAllModelCostInfo();
      res.json({ models });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  return router;
}
