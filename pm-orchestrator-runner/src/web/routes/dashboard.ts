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
      const { projectPath, alias, tags } = req.body;

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
      });

      res.status(201).json(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/projects/:projectId
   * Get project details
   */
  router.get('/projects/:projectId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const project = await dal.getProjectIndex(req.params.projectId as string);

      if (!project) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Project not found',
        } as ErrorResponse);
        return;
      }

      // Also get sessions for this project
      const sessions = await dal.listSessions(req.params.projectId as string);

      res.json({
        project,
        sessions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * PATCH /api/projects/:projectId
   * Update project (favorite, tags, alias)
   */
  router.patch('/projects/:projectId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const { favorite, alias, tags } = req.body;

      const project = await dal.updateProjectIndex(req.params.projectId as string, {
        favorite,
        alias,
        tags,
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
   * List activity events
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

      res.json({
        events: result.items,
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
