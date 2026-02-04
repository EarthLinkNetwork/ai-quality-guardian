"use strict";
/**
 * Dashboard Routes - Project management and activity APIs
 * Per spec/03_DASHBOARD_UI.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboardRoutes = createDashboardRoutes;
const express_1 = require("express");
const no_dynamo_1 = require("../dal/no-dynamo");
/**
 * Create dashboard routes
 */
function createDashboardRoutes(stateDir) {
    const router = (0, express_1.Router)();
    // Ensure NoDynamo is initialized
    if (!(0, no_dynamo_1.isNoDynamoInitialized)()) {
        (0, no_dynamo_1.initNoDynamo)(stateDir);
    }
    /**
     * GET /api/dashboard
     * Dashboard summary: projects, activity, stats
     */
    router.get('/', async (_req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/projects
     * List all projects
     */
    router.get('/projects', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const includeArchived = req.query.includeArchived === 'true';
            const status = req.query.status;
            const favoriteOnly = req.query.favoriteOnly === 'true';
            const result = await dal.listProjectIndexes({
                includeArchived,
                status: status,
                favoriteOnly,
                limit: 50,
            });
            res.json({
                projects: result.items,
                nextCursor: result.nextCursor,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * POST /api/projects
     * Create a new project
     */
    router.post('/projects', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const { projectPath, alias, tags, projectType } = req.body;
            if (!projectPath || typeof projectPath !== 'string') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'projectPath is required',
                });
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/projects/:projectId
     * Get project details
     */
    router.get('/projects/:projectId', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const project = await dal.getProjectIndex(req.params.projectId);
            if (!project) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Project not found',
                });
                return;
            }
            // Also get sessions for this project
            const sessions = await dal.listSessions(req.params.projectId);
            res.json({
                project,
                sessions,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * PATCH /api/projects/:projectId
     * Update project (favorite, tags, alias, bootstrapPrompt, projectType)
     */
    router.patch('/projects/:projectId', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const { favorite, alias, tags, bootstrapPrompt, projectType } = req.body;
            const project = await dal.updateProjectIndex(req.params.projectId, {
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
                });
                return;
            }
            res.json(project);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * POST /api/projects/:projectId/archive
     * Archive project
     */
    router.post('/projects/:projectId/archive', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const project = await dal.archiveProject(req.params.projectId);
            if (!project) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Project not found',
                });
                return;
            }
            res.json(project);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * POST /api/projects/:projectId/unarchive
     * Unarchive project
     */
    router.post('/projects/:projectId/unarchive', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const project = await dal.unarchiveProject(req.params.projectId);
            if (!project) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Project not found',
                });
                return;
            }
            res.json(project);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/activity
     * List activity events
     */
    router.get('/activity', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const projectId = req.query.projectId;
            const limit = parseInt(req.query.limit) || 50;
            const since = req.query.since;
            const result = await dal.listActivityEvents({
                projectId,
                limit,
                since,
            });
            res.json({
                events: result.items,
                nextCursor: result.nextCursor,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/runs
     * List runs
     */
    router.get('/runs', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const sessionId = req.query.sessionId;
            const runs = await dal.listRuns(sessionId);
            res.json({ runs });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/runs/:runId
     * Get run details with events
     */
    router.get('/runs/:runId', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const run = await dal.getRun(req.params.runId);
            if (!run) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Run not found',
                });
                return;
            }
            // Get events for this run
            const events = await dal.listEvents(req.params.runId);
            res.json({
                run,
                events,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/runs/:runId/logs
     * Get logs for a run
     */
    router.get('/runs/:runId/logs', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const events = await dal.listEvents(req.params.runId);
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/sessions
     * List sessions
     */
    router.get('/sessions', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const projectId = req.query.projectId;
            const sessions = await dal.listSessions(projectId);
            res.json({ sessions });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/sessions/:sessionId
     * Get session details with runs
     */
    router.get('/sessions/:sessionId', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const session = await dal.getSession(req.params.sessionId);
            if (!session) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Session not found',
                });
                return;
            }
            // Get runs for this session
            const runs = await dal.listRuns(req.params.sessionId);
            res.json({
                session,
                runs,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    return router;
}
//# sourceMappingURL=dashboard.js.map