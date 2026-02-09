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
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const conversation_tracer_1 = require("../trace/conversation-tracer");
const settings_1 = require("./routes/settings");
const dashboard_1 = require("./routes/dashboard");
const inspection_1 = require("./routes/inspection");
const chat_1 = require("./routes/chat");
const selfhost_1 = require("./routes/selfhost");
const devconsole_1 = require("./routes/devconsole");
const session_logs_1 = require("./routes/session-logs");
const runner_controls_1 = require("./routes/runner-controls");
const supervisor_config_1 = require("./routes/supervisor-config");
const task_type_detector_1 = require("../utils/task-type-detector");
/**
 * Derive namespace from folder path (same logic as CLI)
 */
function deriveNamespace(folderPath) {
    const basename = path_1.default.basename(folderPath);
    const hash = crypto_1.default.createHash('sha256').update(folderPath).digest('hex').substring(0, 4);
    return `${basename}-${hash}`;
}
/**
 * Get stateDir for a folder
 */
function getStateDir(folderPath) {
    return path_1.default.join(folderPath, '.claude', 'state');
}
/**
 * Create configured Express app
 */
function createApp(config) {
    const app = (0, express_1.default)();
    const { queueStore, sessionId, namespace, projectRoot, stateDir, queueStoreType } = config;
    // Middleware
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    // Static files
    app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
    // CORS headers for local development
    app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });
    // ===================
    // Settings Routes (API Key persistence)
    // ===================
    if (stateDir) {
        app.use('/api/settings', (0, settings_1.createSettingsRoutes)(stateDir));
        // Dashboard routes (projects, activity, runs)
        app.use("/api/dashboard", (0, dashboard_1.createDashboardRoutes)(stateDir));
        app.use("/api", (0, dashboard_1.createDashboardRoutes)(stateDir)); // Also mount projects/activity/runs at /api
        // Inspection packet routes
        app.use("/api/inspection", (0, inspection_1.createInspectionRoutes)(stateDir));
        // Chat routes (conversation management with execution pipeline integration)
        app.use("/api", (0, chat_1.createChatRoutes)({ stateDir, queueStore, sessionId }));
        // Self-hosting routes (dev/prod promotion)
        app.use("/api", (0, selfhost_1.createSelfhostRoutes)(stateDir));
        // Dev Console routes (selfhost-runner only)
        app.use("/api", (0, devconsole_1.createDevconsoleRoutes)(stateDir));
        // Session Logs routes (selfhost-runner only, Session Log Tree feature)
        app.use("/api", (0, session_logs_1.createSessionLogsRoutes)(stateDir));
        // Runner Controls routes (selfhost-runner only)
        // Per AC-OPS-1: Web UI provides Run/Stop/Build/Restart controls
        app.use("/api/runner", (0, runner_controls_1.createRunnerControlsRoutes)({ projectRoot: projectRoot || process.cwd() }));
        // Supervisor Config routes (SUP-4, SUP-5)
        // Per docs/spec/SUPERVISOR_SYSTEM.md
        app.use("/api/supervisor", (0, supervisor_config_1.createSupervisorConfigRoutes)({ projectRoot: projectRoot || process.cwd() }));
    }
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
            const taskType = (0, task_type_detector_1.detectTaskType)(prompt.trim());
            const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim(), undefined, taskType);
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
                    task_group_id: t.task_group_id,
                    status: t.status,
                    prompt: t.prompt,
                    created_at: t.created_at,
                    updated_at: t.updated_at,
                    error_message: t.error_message,
                    task_type: t.task_type,
                    output: t.output, // Include output in list for UI visibility
                    has_output: !!t.output, // Flag for quick check
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
            // AC-CHAT-3: show_reply_ui = true when AWAITING_RESPONSE
            const showReplyUI = task.status === 'AWAITING_RESPONSE';
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
                output: task.output, // Task output for READ_INFO/REPORT (AC-CHAT-002, AC-CHAT-003)
                task_type: task.task_type,
                clarification: task.clarification, // Clarification details for AWAITING_RESPONSE (AC-CHAT-005)
                show_reply_ui: showReplyUI, // AC-CHAT-3: Reply UI required for AWAITING_RESPONSE
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
            const taskType = (0, task_type_detector_1.detectTaskType)(prompt.trim());
            const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim(), undefined, taskType);
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
    /**
     * POST /api/tasks/:task_id/reply
     * Reply to an AWAITING_RESPONSE task with free-form text
     * Per spec REPLY_PROTOCOL.md
     * Body: { reply: string }
     *
     * Flow:
     * 1. Task in AWAITING_RESPONSE status
     * 2. User submits reply
     * 3. Server stores reply in task.user_reply
     * 4. Server changes status to QUEUED (for executor to pick up)
     */
    app.post('/api/tasks/:task_id/reply', async (req, res) => {
        try {
            const task_id = req.params.task_id;
            const { reply } = req.body;
            // Validate reply content
            if (!reply || typeof reply !== 'string' || reply.trim() === '') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'reply is required and must be a non-empty string',
                });
                return;
            }
            // Get current task
            const task = await queueStore.getItem(task_id);
            if (!task) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Task not found: ' + task_id,
                });
                return;
            }
            // Verify task is in AWAITING_RESPONSE status
            if (task.status !== 'AWAITING_RESPONSE') {
                res.status(409).json({
                    error: 'INVALID_STATUS',
                    message: 'Task is not awaiting response. Current status: ' + task.status,
                });
                return;
            }
            // Resume task with user reply (changes to RUNNING -> will be picked up by executor)
            const result = await queueStore.resumeWithResponse(task_id, reply.trim());
            if (!result.success) {
                res.status(400).json({
                    error: result.error || 'RESUME_FAILED',
                    message: result.message || 'Failed to resume task with reply',
                });
                return;
            }
            res.json({
                success: true,
                task_id: task_id,
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
    /**
     * GET /settings
     * Serve settings page
     */
    app.get('/settings', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    // ===================
    // Health Check
    // ===================
    /**
     * GET /api/health
     * Health check endpoint with namespace info and queue store details
     * Per docs/spec/WEB_COMPLETE_OPERATION.md:
     * - AC-OPS-2: Returns web_pid for restart verification
     * - AC-OPS-3: Returns build_sha for build tracking
     */
    app.get('/api/health', (_req, res) => {
        // Read build_sha from environment (set by ProcessSupervisor) or build-meta.json
        let buildSha = process.env.PM_BUILD_SHA;
        let buildTimestamp;
        if (!buildSha && projectRoot) {
            try {
                const buildMetaPath = path_1.default.join(projectRoot, 'dist', 'build-meta.json');
                if (fs_1.default.existsSync(buildMetaPath)) {
                    const buildMeta = JSON.parse(fs_1.default.readFileSync(buildMetaPath, 'utf-8'));
                    buildSha = buildMeta.build_sha;
                    buildTimestamp = buildMeta.build_timestamp;
                }
            }
            catch {
                // Ignore errors reading build-meta.json
            }
        }
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            namespace,
            web_pid: process.pid,
            build_sha: buildSha,
            build_timestamp: buildTimestamp,
            queue_store: {
                type: queueStoreType || 'unknown',
                endpoint: queueStore.getEndpoint(),
                table_name: queueStore.getTableName(),
            },
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
    // Agent Launch API
    // ===================
    /**
     * GET /api/agents
     * List agents available in specified folder
     * Query: ?folder=/path/to/project
     * Returns: { folder, namespace, stateDir, agents[], effectiveCwd }
     */
    app.get('/api/agents', (req, res) => {
        try {
            const folder = req.query.folder;
            if (!folder || typeof folder !== 'string') {
                res.status(400).json({
                    error: 'INVALID_INPUT',
                    message: 'folder query parameter is required',
                });
                return;
            }
            // Resolve to absolute path
            const absoluteFolder = path_1.default.resolve(folder);
            // Check if folder exists
            if (!fs_1.default.existsSync(absoluteFolder)) {
                res.status(404).json({
                    error: 'FOLDER_NOT_FOUND',
                    message: `Folder does not exist: ${absoluteFolder}`,
                });
                return;
            }
            // Check if it's a directory
            const stat = fs_1.default.statSync(absoluteFolder);
            if (!stat.isDirectory()) {
                res.status(400).json({
                    error: 'NOT_A_DIRECTORY',
                    message: `Path is not a directory: ${absoluteFolder}`,
                });
                return;
            }
            // Derive namespace and stateDir
            const folderNamespace = deriveNamespace(absoluteFolder);
            const folderStateDir = getStateDir(absoluteFolder);
            // Check for .claude/agents/ directory
            const agentsDir = path_1.default.join(absoluteFolder, '.claude', 'agents');
            const agents = [];
            if (fs_1.default.existsSync(agentsDir) && fs_1.default.statSync(agentsDir).isDirectory()) {
                const files = fs_1.default.readdirSync(agentsDir);
                for (const file of files) {
                    if (file.endsWith('.md')) {
                        agents.push({
                            name: file.replace('.md', ''),
                            path: path_1.default.join(agentsDir, file),
                        });
                    }
                }
            }
            res.json({
                folder: absoluteFolder,
                effectiveCwd: absoluteFolder,
                namespace: folderNamespace,
                stateDir: folderStateDir,
                hasAgentsDir: fs_1.default.existsSync(agentsDir),
                agents,
                agentCount: agents.length,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /agent
     * Serve agent launcher page
     */
    app.get('/agent', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /dashboard
     * Serve dashboard page
     */
    app.get('/dashboard', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /projects/:id
     * Serve project detail page
     */
    app.get('/projects/:id', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /chat/:projectId
     * Serve chat page for a project
     */
    app.get('/chat/:projectId', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /activity
     * Serve activity page
     */
    app.get('/activity', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /runs/:id
     * Serve run detail page
     */
    app.get('/runs/:id', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
    });
    /**
     * GET /sessions/:id
     * Serve session detail page
     */
    app.get('/sessions/:id', (_req, res) => {
        res.sendFile(path_1.default.join(__dirname, 'public', 'index.html'));
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
            'POST /api/tasks/:task_id/reply',
            'GET /api/health',
            'GET /api/namespace',
            'GET /api/agents',
            'GET /api/routes',
            // Dashboard routes
            'GET /api/dashboard',
            'GET /api/projects',
            'POST /api/projects',
            'GET /api/projects/:projectId',
            'PATCH /api/projects/:projectId',
            'POST /api/projects/:projectId/archive',
            'POST /api/projects/:projectId/unarchive',
            'GET /api/activity',
            'GET /api/sessions',
            'GET /api/sessions/:sessionId',
            'GET /api/runs',
            'GET /api/runs/:runId',
            'GET /api/runs/:runId/logs',
            // Inspection routes
            'GET /api/inspection',
            'POST /api/inspection/run/:runId',
            'GET /api/inspection/:packetId',
            'GET /api/inspection/:packetId/markdown',
            'GET /api/inspection/:packetId/clipboard',
            // Chat routes
            'GET /api/projects/:projectId/conversation',
            'GET /api/projects/:projectId/conversation/status',
            'POST /api/projects/:projectId/chat',
            'POST /api/projects/:projectId/respond',
            'DELETE /api/projects/:projectId/conversation',
            'PATCH /api/projects/:projectId/conversation/:messageId',
            // Self-hosting routes
            'GET /api/projects/:projectId/selfhost/status',
            'POST /api/projects/:projectId/selfhost/apply',
            'GET /api/projects/:projectId/selfhost/resume/:applyId',
            // Dev Console routes (selfhost-runner only)
            'GET /api/projects/:projectId/dev/fs/tree',
            'GET /api/projects/:projectId/dev/fs/read',
            'POST /api/projects/:projectId/dev/fs/search',
            'POST /api/projects/:projectId/dev/fs/applyPatch',
            'POST /api/projects/:projectId/dev/cmd/run',
            'GET /api/projects/:projectId/dev/cmd/:runId/log',
            'GET /api/projects/:projectId/dev/cmd/list',
            // Git API
            'GET /api/projects/:projectId/dev/git/status',
            'GET /api/projects/:projectId/dev/git/diff',
            'GET /api/projects/:projectId/dev/git/log',
            'GET /api/projects/:projectId/dev/git/gateStatus',
            'POST /api/projects/:projectId/dev/git/commit',
            'POST /api/projects/:projectId/dev/git/push',
            // Runner Controls routes
            'GET /api/runner/status',
            'GET /api/runner/preflight',
            'POST /api/runner/stop',
            'POST /api/runner/build',
            'POST /api/runner/restart',
            // Session Logs routes (Session Log Tree)
            'GET /api/projects/:projectId/session-logs/tree',
            'GET /api/projects/:projectId/session-logs/runs',
            'GET /api/projects/:projectId/session-logs/run/:runId',
            'POST /api/projects/:projectId/session-logs/sessions',
            'PATCH /api/projects/:projectId/session-logs/sessions/:sessionId',
            'GET /api/projects/:projectId/session-logs/sessions',
            'GET /api/projects/:projectId/session-logs/summary',
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