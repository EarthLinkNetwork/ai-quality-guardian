"use strict";
/**
 * Web Server - Express HTTP server (v2)
 * Per spec/19_WEB_UI.md
 *
 * v2 Changes:
 * - Namespace selector support
 * - Runner status API
 * - All namespaces listing API
 *
 * Provides:
 * - REST API for queue operations (read/write to QueueStore)
 * - Static file serving for frontend
 * - Same process as Runner (integrated)
 *
 * IMPORTANT: Web UI does NOT directly command Runner.
 * Submit = queue insert only.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebServer = void 0;
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const conversation_tracer_1 = require("../trace/conversation-tracer");
/**
 * Create configured Express app
 */
function createApp(config) {
    const app = (0, express_1.default)();
    const { queueStore, sessionId, namespace, projectRoot, stateDir } = config;
    // Middleware
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    // Static files
    app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
    // CORS headers for local development
    app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });
    // ===================
    // REST API Routes (v2)
    // ===================
    /**
     * GET /api/namespaces
     * List all namespaces with summary
     */
    app.get('/api/namespaces', async (_req, res) => {
        try {
            const namespaces = await queueStore.getAllNamespaces();
            res.json({
                namespaces,
                current_namespace: namespace,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/runners
     * List all runners with status for specified namespace (or current)
     * Query: ?namespace=xxx (optional)
     */
    app.get('/api/runners', async (req, res) => {
        try {
            const targetNamespace = req.query.namespace || namespace;
            const runners = await queueStore.getRunnersWithStatus(2 * 60 * 1000, targetNamespace);
            res.json({
                namespace: targetNamespace,
                runners: runners.map(r => ({
                    runner_id: r.runner_id,
                    status: r.status,
                    is_alive: r.isAlive,
                    last_heartbeat: r.last_heartbeat,
                    started_at: r.started_at,
                    project_root: r.project_root,
                })),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/task-groups
     * List all task groups with summary for specified namespace (or current)
     * Query: ?namespace=xxx (optional)
     */
    app.get('/api/task-groups', async (req, res) => {
        try {
            const targetNamespace = req.query.namespace || namespace;
            const groups = await queueStore.getAllTaskGroups(targetNamespace);
            res.json({
                namespace: targetNamespace,
                task_groups: groups,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * POST /api/task-groups
     * Create a new task group (enqueue first task)
     * Body: { task_group_id: string, prompt: string }
     */
    app.post('/api/task-groups', async (req, res) => {
        try {
            const { task_group_id, prompt } = req.body;
            if (!task_group_id || typeof task_group_id !== 'string' || task_group_id.trim() === '') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'task_group_id is required and must be a non-empty string',
                });
                return;
            }
            if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'prompt is required and must be a non-empty string',
                });
                return;
            }
            const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim());
            res.status(201).json({
                task_id: item.task_id,
                task_group_id: item.task_group_id,
                namespace: item.namespace,
                status: item.status,
                created_at: item.created_at,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/task-groups/:task_group_id/tasks
     * List tasks in a task group
     * Query: ?namespace=xxx (optional)
     */
    app.get('/api/task-groups/:task_group_id/tasks', async (req, res) => {
        try {
            const task_group_id = req.params.task_group_id;
            const targetNamespace = req.query.namespace || namespace;
            const tasks = await queueStore.getByTaskGroup(task_group_id, targetNamespace);
            res.json({
                namespace: targetNamespace,
                task_group_id,
                tasks: tasks.map(t => ({
                    task_id: t.task_id,
                    status: t.status,
                    prompt: t.prompt,
                    created_at: t.created_at,
                    updated_at: t.updated_at,
                    error_message: t.error_message,
                })),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/tasks/:task_id
     * Get task detail
     * Query: ?namespace=xxx (optional)
     */
    app.get('/api/tasks/:task_id', async (req, res) => {
        try {
            const task_id = req.params.task_id;
            const targetNamespace = req.query.namespace || namespace;
            const task = await queueStore.getItem(task_id, targetNamespace);
            if (!task) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Task not found: ' + task_id,
                });
                return;
            }
            res.json({
                task_id: task.task_id,
                task_group_id: task.task_group_id,
                namespace: task.namespace,
                session_id: task.session_id,
                status: task.status,
                prompt: task.prompt,
                created_at: task.created_at,
                updated_at: task.updated_at,
                error_message: task.error_message,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/tasks/:task_id/trace
     * Get conversation trace for a task
     * Per spec/28_CONVERSATION_TRACE.md Section 5.2
     * Query: ?latest=true, ?raw=true
     */
    app.get('/api/tasks/:task_id/trace', async (req, res) => {
        try {
            const task_id = req.params.task_id;
            const latest = req.query.latest === 'true';
            const raw = req.query.raw === 'true';
            // Check if stateDir is configured
            if (!stateDir) {
                res.status(503).json({
                    error: 'SERVICE_UNAVAILABLE',
                    message: 'Trace functionality not available: stateDir not configured',
                });
                return;
            }
            // Find trace file for the task
            const traceFile = conversation_tracer_1.ConversationTracer.getLatestTraceFile(stateDir, task_id);
            if (!traceFile) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'No conversation trace found for task: ' + task_id,
                });
                return;
            }
            // Read trace entries
            const entries = conversation_tracer_1.ConversationTracer.readTrace(traceFile);
            if (entries.length === 0) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Conversation trace is empty for task: ' + task_id,
                });
                return;
            }
            // Build summary
            const judgments = entries.filter(e => e.event === 'QUALITY_JUDGMENT');
            const finalEntry = entries[entries.length - 1];
            const iterations = entries.filter(e => e.event === 'ITERATION_END').length;
            const summary = {
                total_iterations: iterations,
                judgments: judgments.map(j => ({
                    iteration: j.iteration_index,
                    passed: j.data?.passed,
                    reason: j.data?.reason,
                })),
                final_status: finalEntry?.event === 'FINAL_SUMMARY' ? finalEntry.data?.status : undefined,
            };
            // Format output based on options
            if (raw) {
                // Return raw JSONL entries
                res.json({
                    task_id,
                    trace_file: traceFile,
                    entries,
                    summary,
                });
            }
            else if (latest) {
                // Return only latest iteration entries
                const latestIteration = Math.max(...entries
                    .filter(e => e.iteration_index !== undefined)
                    .map(e => e.iteration_index), 0);
                const latestEntries = entries.filter(e => e.iteration_index === undefined || e.iteration_index === latestIteration);
                res.json({
                    task_id,
                    trace_file: traceFile,
                    entries: latestEntries,
                    summary,
                });
            }
            else {
                // Return formatted entries (default)
                const formatted = conversation_tracer_1.ConversationTracer.formatTraceForDisplay(entries, { latestOnly: false, raw: false });
                res.json({
                    task_id,
                    trace_file: traceFile,
                    formatted,
                    summary,
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * POST /api/tasks
     * Enqueue a new task (does NOT run it directly)
     * Body: { task_group_id: string, prompt: string }
     */
    app.post('/api/tasks', async (req, res) => {
        try {
            const { task_group_id, prompt } = req.body;
            if (!task_group_id || typeof task_group_id !== 'string' || task_group_id.trim() === '') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'task_group_id is required and must be a non-empty string',
                });
                return;
            }
            if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'prompt is required and must be a non-empty string',
                });
                return;
            }
            const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim());
            res.status(201).json({
                task_id: item.task_id,
                task_group_id: item.task_group_id,
                namespace: item.namespace,
                status: item.status,
                created_at: item.created_at,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * PATCH /api/tasks/:task_id/status
     * Update task status
     * Body: { status: 'CANCELLED' | other valid status }
     */
    app.patch('/api/tasks/:task_id/status', async (req, res) => {
        try {
            const task_id = req.params.task_id;
            const { status } = req.body;
            if (!status || typeof status !== 'string') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'status is required and must be a string',
                });
                return;
            }
            const validStatuses = ['QUEUED', 'RUNNING', 'COMPLETE', 'ERROR', 'CANCELLED'];
            if (!validStatuses.includes(status)) {
                res.status(400).json({
                    error: 'INVALID_STATUS',
                    message: 'Invalid status: ' + status + '. Must be one of: ' + validStatuses.join(', '),
                });
                return;
            }
            const result = await queueStore.updateStatusWithValidation(task_id, status);
            if (!result.success) {
                if (result.error === 'Task not found') {
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        task_id: task_id,
                        message: result.message,
                    });
                }
                else {
                    res.status(400).json({
                        error: result.error,
                        message: result.message,
                    });
                }
                return;
            }
            res.json({
                success: true,
                task_id: result.task_id,
                old_status: result.old_status,
                new_status: result.new_status,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    // ===================
    // Frontend Routes
    // ===================
    /**
     * GET /
     * Serve main page (task group list)
     */
    app.get('/', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /task-groups/:id
     * Serve task list page
     */
    app.get('/task-groups/:id', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /tasks/:id
     * Serve task detail page
     */
    app.get('/tasks/:id', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /new
     * Serve new command form
     */
    app.get('/new', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    // ===================
    // Health Check
    // ===================
    /**
     * GET /api/health
     * Health check endpoint with namespace info
     */
    app.get('/api/health', (_req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            namespace,
            table_name: queueStore.getTableName(),
            project_root: projectRoot,
        });
    });
    /**
     * GET /api/namespace
     * Get current namespace configuration
     */
    app.get('/api/namespace', (_req, res) => {
        res.json({
            namespace,
            table_name: queueStore.getTableName(),
            project_root: projectRoot,
        });
    });
    // ===================
    // Route List
    // ===================
    /**
     * GET /api/routes
     * List all registered routes (for testing)
     */
    app.get('/api/routes', (_req, res) => {
        const routes = [
            'GET /api/namespaces',
            'GET /api/runners',
            'GET /api/task-groups',
            'POST /api/task-groups',
            'GET /api/task-groups/:task_group_id/tasks',
            'GET /api/tasks/:task_id',
            'GET /api/tasks/:task_id/trace',
            'POST /api/tasks',
            'PATCH /api/tasks/:task_id/status',
            'GET /api/health',
            'GET /api/namespace',
            'GET /api/routes',
        ];
        res.json({ routes });
    });
    return app;
}
/**
 * Web Server
 * Manages Express server lifecycle
 */
class WebServer {
    app;
    port;
    host;
    namespace;
    server = null;
    constructor(config) {
        this.port = config.port || 5678;
        this.host = config.host || 'localhost';
        this.namespace = config.namespace;
        this.app = createApp(config);
    }
    /**
     * Start the server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, this.host, () => {
                    resolve();
                });
                this.server.on('error', reject);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Stop the server
     */
    async stop() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    this.server = null;
                    resolve();
                }
            });
        });
    }
    /**
     * Get server state
     */
    getState() {
        return {
            isRunning: this.server !== null,
            port: this.port,
            host: this.host,
            namespace: this.namespace,
        };
    }
    /**
     * Get Express app (for testing)
     */
    getApp() {
        return this.app;
    }
    /**
     * Get server URL
     */
    getUrl() {
        return 'http://' + this.host + ':' + this.port;
    }
}
exports.WebServer = WebServer;
//# sourceMappingURL=server.js.map