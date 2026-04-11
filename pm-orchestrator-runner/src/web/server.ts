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

import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execCb);
import { IQueueStore, QueueItemStatus, TaskGroupStatus } from '../queue/index';
import { ConversationTracer } from '../trace/conversation-tracer';
import { createApiKeyAuth, createPublicPathBypass, type AuthConfig, type AuthenticatedRequest } from './middleware/auth';
import { createSettingsRoutes } from './routes/settings';
import { createDashboardRoutes } from './routes/dashboard';
import { createInspectionRoutes } from './routes/inspection';
import { createChatRoutes } from './routes/chat';
import { createSelfhostRoutes } from './routes/selfhost';
import { createDevconsoleRoutes } from './routes/devconsole';
import { createSessionLogsRoutes } from './routes/session-logs';
import { createRunnerControlsRoutes } from './routes/runner-controls';
import type { RunnerRestartResult } from './routes/runner-controls';
import { createSupervisorConfigRoutes } from './routes/supervisor-config';
import { createSupervisorLogsRoutes } from './routes/supervisor-logs';
import { createExecutorLogsRoutes } from './routes/executor-logs';
import { createClaudeSettingsRoutes } from './routes/claude-settings';
import { createClaudeFilesRoutes } from './routes/claude-files';
import { createClaudeHooksRoutes } from './routes/claude-hooks';
import { createAssistantRoutes } from './routes/assistant';
import { createRepoProfileRoutes } from './routes/repo-profile';
import { createTemplateRoutes } from './routes/templates';
import { createTaskTrackerRoutes } from './routes/task-tracker';
import { createPRReviewRoutes } from './routes/pr-review';
import { GhCliGitHubAdapter } from './github/gh-cli-adapter';
import type { ReviewJudgeLLMClient } from '../pr-review/review-judge';
import { createSkillsRoutes } from './routes/skills';
import { detectTaskType } from '../utils/task-type-detector';
import { detectQuestionsWithLlm } from '../utils/question-detector';
import { initDAL, isDALInitialized, getDAL } from './dal/dal-factory';
import { getLogEntries } from '../logging/app-logger';
import { killTaskProcess } from '../executor/process-registry';

/**
 * Derive namespace from folder path (same logic as CLI)
 */
function deriveNamespace(folderPath: string): string {
  const basename = path.basename(folderPath);
  const hash = crypto.createHash('sha256').update(folderPath).digest('hex').substring(0, 4);
  return `${basename}-${hash}`;
}

/**
 * Get stateDir for a folder
 */
function getStateDir(folderPath: string): string {
  return path.join(folderPath, '.claude', 'state');
}

/**
 * Web Server configuration
 */
export interface WebServerConfig {
  /** Port number (default: 5678) */
  port?: number;
  /** Host (default: localhost) */
  host?: string;
  /** QueueStore instance (can be DynamoDB or InMemory) */
  queueStore: IQueueStore;
  /** Session ID for new tasks */
  sessionId: string;
  /** Current namespace (from queueStore) */
  namespace: string;
  /** Project root for display */
  projectRoot?: string;
  /** State directory for trace files (per spec/28_CONVERSATION_TRACE.md Section 5.2) */
  stateDir?: string;
  /** Queue store type for health endpoint display */
  queueStoreType?: 'file' | 'dynamodb' | 'memory';
  /** Optional self-restart handler for Runner Controls */
  runnerRestartHandler?: () => Promise<RunnerRestartResult>;
  /** Auth configuration for API key authentication */
  authConfig?: AuthConfig;
  /** Override global ~/.claude directory (for testing) */
  globalClaudeDir?: string;
}

/**
 * Web Server state
 */
export interface WebServerState {
  isRunning: boolean;
  port: number;
  host: string;
  namespace: string;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Create configured Express app
 */
export function createApp(config: WebServerConfig): Express {
  const app = express();
  const { queueStore, sessionId, namespace, projectRoot, stateDir, queueStoreType } = config;

  // Middleware (50mb limit for base64 image attachments)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Prefer src/web/public/ when available (self-hosted/dev mode) so that
  // edits to index.html by Claude Code are immediately visible without a build step.
  const srcPublicPath = path.join(__dirname, '../../src/web/public');
  const distPublicPath = path.join(__dirname, 'public');
  const publicPath = fs.existsSync(srcPublicPath) ? srcPublicPath : distPublicPath;

  // Static files (no-cache for development)
  app.use(express.static(publicPath, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }));

  // CORS headers for local development
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    next();
  });

  // API Key authentication middleware
  if (config.authConfig) {
    const authMiddleware = createApiKeyAuth(config.authConfig);
    const bypassMiddleware = createPublicPathBypass(authMiddleware);
    app.use('/api', bypassMiddleware);
  }

  // ===================
  // Settings Routes (API Key persistence)
  // ===================
  if (stateDir) {
    // Initialize DAL factory (unified data access layer)
    if (!isDALInitialized()) {
      initDAL({
        useDynamoDB: queueStoreType === 'dynamodb',
        stateDir,
        orgId: process.env.ORG_ID || 'default',
      });
    }

    app.use('/api/settings', createSettingsRoutes(stateDir));
    // Dashboard routes (projects, activity, runs)
    app.use("/api/dashboard", createDashboardRoutes({ stateDir, queueStore }));
    app.use("/api", createDashboardRoutes({ stateDir, queueStore })); // Also mount projects/activity/runs at /api
    // Inspection packet routes
    app.use("/api/inspection", createInspectionRoutes(stateDir));
    // Chat routes (conversation management with execution pipeline integration)
    app.use("/api", createChatRoutes({ stateDir, queueStore, sessionId }));
    // Self-hosting routes (dev/prod promotion)
    app.use("/api", createSelfhostRoutes(stateDir));
    // Dev Console routes (selfhost-runner only)
    app.use("/api", createDevconsoleRoutes(stateDir));
    // Session Logs routes (selfhost-runner only, Session Log Tree feature)
    app.use("/api", createSessionLogsRoutes(stateDir));
    // Runner Controls routes (selfhost-runner only)
    // Per AC-OPS-1: Web UI provides Run/Stop/Build/Restart controls
    app.use("/api/runner", createRunnerControlsRoutes({
      projectRoot: projectRoot || process.cwd(),
      restartHandler: config.runnerRestartHandler,
    }));

    // Supervisor Config routes (SUP-4, SUP-5)
    // Per docs/spec/SUPERVISOR_SYSTEM.md
    app.use("/api/supervisor", createSupervisorConfigRoutes({ projectRoot: projectRoot || process.cwd() }));

    // Supervisor Logs routes (AC A.1 - Observability)
    // Per docs/spec/RUNNER_CONTROLS_SELF_UPDATE.md - Decision transparency
    app.use("/api/supervisor", createSupervisorLogsRoutes());

    // Executor Logs routes (AC A.2 - Real-time stdout/stderr streaming)
    // Per docs/spec/RUNNER_CONTROLS_SELF_UPDATE.md - Executor Live Log
    app.use("/api/executor", createExecutorLogsRoutes());

    // Claude Settings routes (settings.json + CLAUDE.md editor)
    app.use("/api/claude-settings", createClaudeSettingsRoutes({
      projectRoot: projectRoot || process.cwd(),
    }));

    // Claude Files routes (commands, agents, skills CRUD)
    app.use("/api/claude-files", createClaudeFilesRoutes({
      projectRoot: projectRoot || process.cwd(),
      ...(config.globalClaudeDir ? { globalClaudeDir: config.globalClaudeDir } : {}),
    }));

    // Claude Hooks routes (hooks CRUD, scripts, inconsistency detection)
    app.use("/api/claude-hooks", createClaudeHooksRoutes({
      projectRoot: projectRoot || process.cwd(),
      ...(config.globalClaudeDir ? { globalClaudeDir: config.globalClaudeDir } : {}),
    }));

    // Assistant routes (LLM propose, apply engine, plugin CRUD, golden eval)
    app.use("/api/assistant", createAssistantRoutes({
      projectRoot: projectRoot || process.cwd(),
      stateDir,
      ...(config.globalClaudeDir ? { globalClaudeDir: config.globalClaudeDir } : {}),
    }));

    // Repo Profile routes (project scanner)
    app.use("/api/repo", createRepoProfileRoutes({
      projectRoot: projectRoot || process.cwd(),
    }));

    // Template routes (CRUD for input/output templates)
    app.use("/api/templates", createTemplateRoutes({ stateDir }));

    // Task Tracker routes (task persistence, snapshots, recovery)
    // Per spec/34_TASK_TRACKER_PERSISTENCE.md Section 11
    app.use("/api/tracker", createTaskTrackerRoutes({ dal: getDAL() }));

    // PR Review Automation routes (review automation, dashboard API)
    // Per spec/35_PR_REVIEW_AUTOMATION.md Section 10
    const prReviewGitHub = new GhCliGitHubAdapter();
    const prReviewLLM: ReviewJudgeLLMClient = {
      generate: async () => ({ content: "[]", model: "stub" }),
    };
    app.use("/api/pr-reviews", createPRReviewRoutes({
      dal: getDAL(),
      github: prReviewGitHub,
      llmClient: prReviewLLM,
      orgId: process.env.ORG_ID || "default",
    }));

    // Skills routes (project scanner + skill auto-generation)
    app.use("/api/skills", createSkillsRoutes({
      projectRoot: projectRoot || process.cwd(),
    }));
  }

  // ===================
  // Application Log Routes
  // ===================

  /**
   * GET /api/app-logs
   * Return in-memory application/system log entries for Web UI
   */
  app.get('/api/app-logs', (_req: Request, res: Response) => {
    const category = _req.query.category as string | undefined;
    const level = _req.query.level as string | undefined;
    const limit = parseInt(_req.query.limit as string) || 100;
    const projectId = _req.query.projectId as string | undefined;

    const entries = getLogEntries({
      category: category as 'app' | 'sys' | undefined,
      level,
      limit,
      projectId,
    });

    res.json({ entries, count: entries.length });
  });

  // ===================
  // REST API Routes (v2)
  // ===================

  /**
   * GET /api/namespaces
   * List all namespaces with summary
   */
  app.get('/api/namespaces', async (_req: Request, res: Response) => {
    try {
      const namespaces = await queueStore.getAllNamespaces();
      res.json({ 
        namespaces,
        current_namespace: namespace,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/runners
   * List all runners with status for specified namespace (or current)
   * Query: ?namespace=xxx (optional)
   */
  app.get('/api/runners', async (req: Request, res: Response) => {
    try {
      const targetNamespace = (req.query.namespace as string) || namespace;
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/system/processes
   * List PM Runner-spawned task processes, cross-referenced with:
   *   - Live OS state (ps) for PID liveness, CPU/MEM, elapsed time
   *   - Task store for task status, task group, project alias
   *
   * SAFETY: This endpoint returns ONLY processes recorded in the in-memory
   * process registry (src/executor/process-registry.ts). Processes the user
   * runs in their terminal (e.g. `claude --dangerously-skip-permissions`) or
   * Claude Desktop helpers are NEVER included, so Kill actions cannot harm
   * unrelated sessions.
   *
   * Each entry includes:
   *   pid, task_id, task_group_id, project_path, project_alias,
   *   task_status, spawned_at, registry_elapsed_ms, is_alive,
   *   ps_etime, cpu, mem, command
   */
  app.get('/api/system/processes', async (_req: Request, res: Response) => {
    try {
      const { listTaskProcesses } = await import('../executor/process-registry');
      const snapshots = listTaskProcesses();
      const selfPid = process.pid;
      const now = Date.now();

      // Fetch OS info for the relevant PIDs only.
      // `ps -p <pid>,<pid>,...` queries specific PIDs without scanning the full process table.
      const pidNumbers = snapshots
        .map(s => s.pid)
        .filter((p): p is number => Number.isFinite(p) && p > 0);
      const psInfo = new Map<number, { etime: string; cpu: number; mem: number; command: string }>();
      if (pidNumbers.length > 0) {
        try {
          const psArgs = pidNumbers.join(',');
          const { stdout } = await exec(
            `ps -o pid=,etime=,%cpu=,%mem=,command= -p ${psArgs}`,
            { maxBuffer: 2 * 1024 * 1024 }
          );
          for (const line of stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const m = trimmed.match(/^(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
            if (!m) continue;
            const pid = parseInt(m[1], 10);
            psInfo.set(pid, {
              etime: m[2],
              cpu: parseFloat(m[3]) || 0,
              mem: parseFloat(m[4]) || 0,
              command: m[5],
            });
          }
        } catch {
          // ps may exit non-zero if some PIDs are dead — that's fine, we just
          // won't have OS info for those and will mark them as not alive.
        }
      }

      // Build task metadata lookup from the queue store for any taskIds we track.
      const taskStatusById = new Map<string, {
        status: string;
        task_group_id: string;
        project_path?: string;
        created_at?: string;
        updated_at?: string;
      }>();
      for (const snap of snapshots) {
        try {
          const item = await queueStore.getItem(snap.taskId);
          if (item) {
            taskStatusById.set(snap.taskId, {
              status: item.status,
              task_group_id: item.task_group_id,
              project_path: item.project_path,
              created_at: item.created_at,
              updated_at: item.updated_at,
            });
          }
        } catch {
          // Task record missing (deleted) — leave unset
        }
      }

      // Build project alias lookup if DAL is initialized
      const projectAliasByPath = new Map<string, string>();
      if (isDALInitialized()) {
        try {
          const dal = getDAL();
          const allProjects = await dal.listProjectIndexes();
          for (const p of allProjects.items) {
            if (p.projectPath) {
              projectAliasByPath.set(p.projectPath, p.alias || p.projectPath.split('/').pop() || p.projectPath);
            }
          }
        } catch {
          // Non-fatal
        }
      }

      const processes = snapshots.map(snap => {
        const os = psInfo.get(snap.pid);
        const taskMeta = taskStatusById.get(snap.taskId);
        const projectPath = snap.projectPath || taskMeta?.project_path;
        const projectAlias = projectPath ? projectAliasByPath.get(projectPath) : undefined;
        const spawnedMs = Date.parse(snap.spawnedAt);
        return {
          pid: snap.pid,
          task_id: snap.taskId,
          task_group_id: snap.taskGroupId || taskMeta?.task_group_id,
          project_path: projectPath,
          project_alias: projectAlias,
          task_status: taskMeta?.status,
          task_created_at: taskMeta?.created_at,
          task_updated_at: taskMeta?.updated_at,
          spawned_at: snap.spawnedAt,
          registry_elapsed_ms: Number.isFinite(spawnedMs) ? now - spawnedMs : null,
          is_alive: os !== undefined,
          ps_etime: os?.etime,
          cpu: os?.cpu ?? 0,
          mem: os?.mem ?? 0,
          command: os?.command,
          is_self: snap.pid === selfPid,
        };
      });

      // Sort: dead processes (ghost candidates) first, then by elapsed desc
      processes.sort((a, b) => {
        if (a.is_alive !== b.is_alive) return a.is_alive ? 1 : -1;
        return (b.registry_elapsed_ms ?? 0) - (a.registry_elapsed_ms ?? 0);
      });

      res.json({
        self_pid: selfPid,
        count: processes.length,
        ghost_count: processes.filter(p => !p.is_alive).length,
        processes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/system/processes/:pid/kill
   * Kill a task process by PID.
   *
   * SAFETY: Only registered task processes can be killed via this endpoint.
   * PIDs not in the process registry (e.g. the user's terminal claude session,
   * Claude Desktop helpers) are rejected with 403 even if the PID is valid.
   *
   * Body: { signal?: 'SIGTERM' | 'SIGKILL' } (default: SIGTERM)
   */
  app.post('/api/system/processes/:pid/kill', async (req: Request, res: Response) => {
    try {
      const { listTaskProcesses, killTaskProcessByPid } = await import('../executor/process-registry');
      const pid = parseInt(req.params.pid as string, 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid pid' } as ErrorResponse);
        return;
      }
      if (pid === process.pid) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cannot kill self' } as ErrorResponse);
        return;
      }

      // CRITICAL SAFETY: only allow killing PIDs that PM Runner itself spawned.
      // This prevents accidentally killing the user's terminal `claude` sessions.
      const registered = listTaskProcesses().find(p => p.pid === pid);
      if (!registered) {
        res.status(403).json({
          error: 'NOT_OWNED',
          message: 'Refusing to kill a PID that was not spawned by this PM Runner (not in process registry).',
        } as ErrorResponse);
        return;
      }

      const killed = killTaskProcessByPid(pid);
      if (killed) {
        res.json({ success: true, pid, task_id: registered.taskId });
      } else {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Process already gone' } as ErrorResponse);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/required-actions
   * List tasks that need user attention (AWAITING_RESPONSE)
   * Returns tasks with their task_group context
   */
  app.get('/api/required-actions', async (_req: Request, res: Response) => {
    try {
      const [awaitingTasks, errorTasks] = await Promise.all([
        queueStore.getByStatus('AWAITING_RESPONSE'),
        queueStore.getByStatus('ERROR'),
      ]);

      // Build project lookup from activity events if DAL is available
      let projectLookup: Map<string, { projectId: string; projectAlias?: string; projectPath?: string }> = new Map();
      if (isDALInitialized()) {
        try {
          const dal = getDAL();
          const activityResult = await dal.listActivityEvents({ limit: 200 });
          for (const evt of activityResult.items) {
            if (evt.taskGroupId && evt.projectId) {
              projectLookup.set(evt.taskGroupId, {
                projectId: evt.projectId,
                projectAlias: evt.projectAlias,
                projectPath: evt.projectPath,
              });
            }
          }
        } catch {
          // Ignore - project lookup is best-effort
        }
      }

      // AWAITING_RESPONSE actions
      const awaitingActions = awaitingTasks.map(t => {
        const waitingSince = t.updated_at;
        const waitingMs = Date.now() - new Date(waitingSince).getTime();
        const waitingMinutes = Math.floor(waitingMs / 60000);
        const proj = projectLookup.get(t.task_group_id);
        return {
          task_id: t.task_id,
          task_group_id: t.task_group_id,
          namespace: t.namespace,
          status: t.status,
          prompt_preview: (t.prompt || '').substring(0, 100),
          clarification_preview: t.clarification?.question?.substring(0, 120) || '',
          updated_at: t.updated_at,
          waiting_minutes: waitingMinutes,
          waiting_display: waitingMinutes < 60
            ? waitingMinutes + 'm'
            : Math.floor(waitingMinutes / 60) + 'h ' + (waitingMinutes % 60) + 'm',
          project_id: proj?.projectId,
          project_alias: proj?.projectAlias,
          project_path: proj?.projectPath,
        };
      });

      // ERROR tasks with failure classification
      const errorActions = errorTasks
        .filter(t => t.failure_category)
        .map(t => {
          const waitingSince = t.updated_at;
          const waitingMs = Date.now() - new Date(waitingSince).getTime();
          const waitingMinutes = Math.floor(waitingMs / 60000);
          const proj = projectLookup.get(t.task_group_id);
          return {
            task_id: t.task_id,
            task_group_id: t.task_group_id,
            namespace: t.namespace,
            status: t.status,
            prompt_preview: (t.prompt || '').substring(0, 100),
            failure_category: t.failure_category,
            failure_summary: t.failure_summary || '',
            failure_next_actions: t.failure_next_actions || [],
            updated_at: t.updated_at,
            waiting_minutes: waitingMinutes,
            waiting_display: waitingMinutes < 60
              ? waitingMinutes + 'm'
              : Math.floor(waitingMinutes / 60) + 'h ' + (waitingMinutes % 60) + 'm',
            project_id: proj?.projectId,
            project_alias: proj?.projectAlias,
            project_path: proj?.projectPath,
          };
        });

      const actions = [...awaitingActions, ...errorActions];
      // Sort by oldest first (longest waiting)
      actions.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
      res.json({ actions, count: actions.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  // Task groups cache (TTL-based) to avoid slow DynamoDB queries on every request
  let taskGroupsCache: { data: unknown; timestamp: number; cacheKey: string } | null = null;
  const TASK_GROUPS_CACHE_TTL_MS = 10_000; // 10 seconds

  function invalidateTaskGroupsCache() {
    taskGroupsCache = null;
  }

  /**
   * GET /api/task-groups
   * List all task groups with summary for specified namespace (or current)
   * Query: ?namespace=xxx (optional)
   */
  app.get('/api/task-groups', async (req: Request, res: Response) => {
    try {
      const targetNamespace = (req.query.namespace as string) || namespace;

      // Return cached result if fresh
      const cacheKey = targetNamespace + '|' + (req.query.group_status || '') + '|' + (req.query.limit || '') + '|' + (req.query.offset || '');
      if (taskGroupsCache && taskGroupsCache.cacheKey === cacheKey && (Date.now() - taskGroupsCache.timestamp) < TASK_GROUPS_CACHE_TTL_MS) {
        return res.json(taskGroupsCache.data);
      }

      // Fetch groups, activity events, and local projects in PARALLEL
      const dal = isDALInitialized() ? getDAL() : null;
      const [groups, activityItems, localProjectItems] = await Promise.all([
        queueStore.getAllTaskGroups(targetNamespace),
        dal ? dal.listActivityEvents({ limit: 200 }).then(r => r.items).catch(() => []) : Promise.resolve([]),
        dal ? dal.listProjectIndexes({ limit: 100 }).then(r => r.items).catch(() => []) : Promise.resolve([]),
      ]);

      // Build project lookup from activity events
      const projectLookup = new Map<string, { projectId: string; projectAlias?: string; projectPath?: string }>();
      for (const evt of activityItems) {
        if (evt.taskGroupId && evt.projectId) {
          projectLookup.set(evt.taskGroupId, {
            projectId: evt.projectId,
            projectAlias: evt.projectAlias,
            projectPath: evt.projectPath,
          });
        }
      }

      const enrichedGroups = groups.map(g => {
        const proj = projectLookup.get(g.task_group_id);
        return {
          ...g,
          project_id: proj?.projectId || 'N/A',
          project_alias: proj?.projectAlias || 'N/A',
          project_path: proj?.projectPath || 'N/A',
        };
      });

      // Filter: only show task groups belonging to local projects
      const localProjects = new Set(localProjectItems.map(p => p.projectId));

      // Keep only groups linked to local projects. Unlinked (N/A) groups from
      // old orgId are excluded — they belong to a different machine/tenant.
      const localFilteredGroups = localProjects.size > 0
        ? enrichedGroups.filter(g => localProjects.has(g.project_id))
        : enrichedGroups;

      // Auto-archive: groups where all tasks complete and last update > 24h ago
      // Auto-archive: mark completed groups as archived IN MEMORY only (no DynamoDB writes)
      // This avoids N DynamoDB writes per request that caused 10+ second response times.
      // Actual archiving happens when user clicks "Archived" button.
      const now = Date.now();
      const AUTO_ARCHIVE_MS = 24 * 60 * 60 * 1000;
      for (const g of localFilteredGroups) {
        if (g.group_status !== 'archived' && g.group_status !== 'complete') {
          const sc = g.status_counts || { QUEUED: 0, RUNNING: 0, AWAITING_RESPONSE: 0, WAITING_CHILDREN: 0, COMPLETE: 0, ERROR: 0, CANCELLED: 0 };
          const allComplete = sc.QUEUED === 0 && sc.RUNNING === 0 &&
                              sc.AWAITING_RESPONSE === 0 && sc.COMPLETE > 0 &&
                              sc.ERROR === 0;
          const age = now - new Date(g.latest_updated_at).getTime();
          if (allComplete && age > AUTO_ARCHIVE_MS) {
            g.group_status = 'archived'; // In-memory only, no DynamoDB write
          }
        }
      }

      // Filter by group_status (default: exclude archived)
      const groupStatusFilter = req.query.group_status as string | undefined;
      let filteredGroups = localFilteredGroups;
      if (groupStatusFilter === 'all') {
        // Show everything including archived
      } else if (groupStatusFilter) {
        // Filter to specific status
        filteredGroups = enrichedGroups.filter(g => g.group_status === groupStatusFilter);
      } else {
        // Default: exclude archived groups
        filteredGroups = enrichedGroups.filter(g => g.group_status !== 'archived');
      }

      // Apply limit if requested (for "load more" pagination)
      const limitParam = parseInt(req.query.limit as string);
      const offsetParam = parseInt(req.query.offset as string) || 0;
      const totalCount = filteredGroups.length;
      if (limitParam > 0) {
        filteredGroups = filteredGroups.slice(offsetParam, offsetParam + limitParam);
      }

      const responseData = {
        namespace: targetNamespace,
        task_groups: filteredGroups,
        total_count: totalCount,
        has_more: limitParam > 0 ? (offsetParam + limitParam) < totalCount : false,
      };
      taskGroupsCache = { data: responseData, timestamp: Date.now(), cacheKey };
      res.json(responseData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/task-groups
   * Create a new task group (enqueue first task)
   * Body: { task_group_id: string, prompt: string }
   */
  app.post('/api/task-groups', async (req: Request, res: Response) => {
    try {
      const { task_group_id, prompt } = req.body;

      if (!task_group_id || typeof task_group_id !== 'string' || task_group_id.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'task_group_id is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'prompt is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      const taskType = detectTaskType(prompt.trim());
      const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim(), undefined, taskType);

      res.status(201).json({
        task_id: item.task_id,
        task_group_id: item.task_group_id,
        namespace: item.namespace,
        status: item.status,
        created_at: item.created_at,
      });
      invalidateTaskGroupsCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/task-groups/:task_group_id/tasks
   * List tasks in a task group
   * Query: ?namespace=xxx (optional)
   */
  app.get('/api/task-groups/:task_group_id/tasks', async (req: Request, res: Response) => {
    try {
      const task_group_id = req.params.task_group_id as string;
      const targetNamespace = (req.query.namespace as string) || namespace;
      const tasks = await queueStore.getByTaskGroup(task_group_id, targetNamespace);

      res.json({
        namespace: targetNamespace,
        task_group_id,
        tasks: tasks.map(t => ({
          task_id: t.task_id,
          task_group_id: t.task_group_id,
          parent_task_id: t.parent_task_id || null,
          status: t.status,
          prompt: t.prompt,
          created_at: t.created_at,
          updated_at: t.updated_at,
          error_message: t.error_message,
          task_type: t.task_type,
          output: t.output,  // Include output in list for UI visibility
          has_output: !!t.output,  // Flag for quick check
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * PATCH /api/task-groups/:task_group_id
   * Update task group status (archive/unarchive or set group_status)
   * Body: { archived?: boolean, group_status?: 'active' | 'complete' | 'archived' | null }
   */
  app.patch('/api/task-groups/:task_group_id', async (req: Request, res: Response) => {
    try {
      const task_group_id = req.params.task_group_id as string;
      const { archived, group_status } = req.body;

      // Support group_status field (preferred) or archived field (backward compat)
      if (group_status !== undefined) {
        const validStatuses = ['active', 'complete', 'archived', null];
        if (!validStatuses.includes(group_status)) {
          res.status(400).json({
            error: 'INVALID_INPUT',
            message: 'group_status must be one of: active, complete, archived, or null',
          } as ErrorResponse);
          return;
        }

        const success = await queueStore.setTaskGroupStatus(task_group_id, group_status);
        if (!success) {
          res.status(404).json({
            error: 'NOT_FOUND',
            message: 'Task group not found: ' + task_group_id,
          } as ErrorResponse);
          return;
        }

        res.json({
          task_group_id,
          group_status,
          archived: group_status === 'archived',
        });
        invalidateTaskGroupsCache();
      } else if (typeof archived === 'boolean') {
        const success = await queueStore.setTaskGroupArchived(task_group_id, archived);
        if (!success) {
          res.status(404).json({
            error: 'NOT_FOUND',
            message: 'Task group not found: ' + task_group_id,
          } as ErrorResponse);
          return;
        }

        res.json({
          task_group_id,
          archived,
          group_status: archived ? 'archived' : null,
        });
        invalidateTaskGroupsCache();
      } else {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'Either group_status or archived must be provided',
        } as ErrorResponse);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * DELETE /api/task-groups/:task_group_id
   * Delete all tasks in a task group
   */
  app.delete('/api/task-groups/:task_group_id', async (req: Request, res: Response) => {
    try {
      const task_group_id = req.params.task_group_id as string;
      const targetNamespace = (req.query.namespace as string) || namespace;

      // Get tasks before deletion to cancel running/queued ones
      const tasks = await queueStore.getByTaskGroup(task_group_id, targetNamespace);

      // Kill running processes and cancel queued tasks
      for (const task of tasks) {
        if (task.status === 'RUNNING' || task.status === 'AWAITING_RESPONSE') {
          killTaskProcess(task.task_id);
          // Also update status to CANCELLED in store
          await queueStore.updateStatusWithValidation(task.task_id, 'CANCELLED').catch(() => {});
        } else if (task.status === 'QUEUED') {
          await queueStore.updateStatusWithValidation(task.task_id, 'CANCELLED').catch(() => {});
        }
      }

      const count = await queueStore.deleteTaskGroup(task_group_id, targetNamespace);
      if (count === 0) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Task group not found: ' + task_group_id,
        } as ErrorResponse);
        return;
      }
      invalidateTaskGroupsCache();
      res.json({ task_group_id, deleted_count: count });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * DELETE /api/tasks/:task_id
   * Delete a single task
   */
  app.delete('/api/tasks/:task_id', async (req: Request, res: Response) => {
    try {
      const task_id = req.params.task_id as string;
      const targetNamespace = (req.query.namespace as string) || namespace;
      const task = await queueStore.getItem(task_id, targetNamespace);
      if (!task) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Task not found: ' + task_id,
        } as ErrorResponse);
        return;
      }
      await queueStore.deleteItem(task_id);
      invalidateTaskGroupsCache();
      res.json({ task_id, deleted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/tasks/:task_id
   * Get task detail
   * Query: ?namespace=xxx (optional)
   */
  app.get('/api/tasks/:task_id', async (req: Request, res: Response) => {
    try {
      const task_id = req.params.task_id as string;
      const targetNamespace = (req.query.namespace as string) || namespace;
      const task = await queueStore.getItem(task_id, targetNamespace);

      if (!task) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Task not found: ' + task_id,
        } as ErrorResponse);
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
        output: task.output,  // Task output for READ_INFO/REPORT (AC-CHAT-002, AC-CHAT-003)
        task_type: task.task_type,
        clarification: task.clarification,  // Clarification details for AWAITING_RESPONSE (AC-CHAT-005)
        show_reply_ui: showReplyUI,  // AC-CHAT-3: Reply UI required for AWAITING_RESPONSE
        failure_category: task.failure_category,
        failure_summary: task.failure_summary,
        failure_next_actions: task.failure_next_actions,
        command_preview: task.command_preview,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/tasks/:task_id/trace
   * Get conversation trace for a task
   * Per spec/28_CONVERSATION_TRACE.md Section 5.2
   * Query: ?latest=true, ?raw=true
   */
  app.get('/api/tasks/:task_id/trace', async (req: Request, res: Response) => {
    try {
      const task_id = req.params.task_id as string;
      const latest = req.query.latest === 'true';
      const raw = req.query.raw === 'true';
      const format = req.query.format as string; // 'stream' for stream-json trace

      // Check if stateDir is configured
      if (!stateDir) {
        res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Trace functionality not available: stateDir not configured',
        } as ErrorResponse);
        return;
      }

      // stream-json trace: return JSONL events from stream trace file
      if (format === 'stream') {
        // Check stateDir first, then project root fallback, then task's project_path
        // (executor saves to cwd/.claude/state/traces/)
        let streamTraceFile = path.join(stateDir, 'traces', `stream-${task_id}.jsonl`);
        if (!fs.existsSync(streamTraceFile) && projectRoot) {
          const fallback = path.join(projectRoot, '.claude', 'state', 'traces', `stream-${task_id}.jsonl`);
          if (fs.existsSync(fallback)) {
            streamTraceFile = fallback;
          }
        }
        // Also check task's project_path (executor cwd may differ from runner's projectRoot)
        if (!fs.existsSync(streamTraceFile)) {
          try {
            const taskItem = await queueStore.getItem(task_id);
            if (taskItem?.project_path) {
              const projectFallback = path.join(taskItem.project_path, '.claude', 'state', 'traces', `stream-${task_id}.jsonl`);
              if (fs.existsSync(projectFallback)) {
                streamTraceFile = projectFallback;
              }
            }
          } catch { /* ignore lookup errors */ }
        }
        // Final fallback: check common subdirectories (e.g. self-update/)
        if (!fs.existsSync(streamTraceFile) && projectRoot) {
          const traceFileName = `stream-${task_id}.jsonl`;
          const candidates = ['self-update', 'worktree'];
          for (const sub of candidates) {
            const subPath = path.join(projectRoot, sub, '.claude', 'state', 'traces', traceFileName);
            if (fs.existsSync(subPath)) {
              streamTraceFile = subPath;
              break;
            }
          }
        }
        if (!fs.existsSync(streamTraceFile)) {
          res.status(404).json({
            error: 'NOT_FOUND',
            message: 'No stream trace found for task: ' + task_id,
          } as ErrorResponse);
          return;
        }
        const content = fs.readFileSync(streamTraceFile, 'utf-8');
        const events = content.split('\n').filter(l => l.trim()).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        res.json({ task_id, format: 'stream', events });
        return;
      }

      // Find trace file for the task (ConversationTracer format)
      const traceFile = ConversationTracer.getLatestTraceFile(stateDir, task_id);

      // Also check for stream trace file as fallback (check stateDir, project root, task's project_path)
      let streamTraceFile = path.join(stateDir, 'traces', `stream-${task_id}.jsonl`);
      if (!fs.existsSync(streamTraceFile) && projectRoot) {
        const fallback = path.join(projectRoot, '.claude', 'state', 'traces', `stream-${task_id}.jsonl`);
        if (fs.existsSync(fallback)) {
          streamTraceFile = fallback;
        }
      }
      if (!fs.existsSync(streamTraceFile)) {
        try {
          const taskItem = await queueStore.getItem(task_id);
          if (taskItem?.project_path) {
            const projectFallback = path.join(taskItem.project_path, '.claude', 'state', 'traces', `stream-${task_id}.jsonl`);
            if (fs.existsSync(projectFallback)) {
              streamTraceFile = projectFallback;
            }
          }
        } catch { /* ignore lookup errors */ }
      }
      // Final fallback: check common subdirectories (e.g. self-update/)
      if (!fs.existsSync(streamTraceFile) && projectRoot) {
        const traceFileName = `stream-${task_id}.jsonl`;
        const candidates = ['self-update', 'worktree'];
        for (const sub of candidates) {
          const subPath = path.join(projectRoot, sub, '.claude', 'state', 'traces', traceFileName);
          if (fs.existsSync(subPath)) {
            streamTraceFile = subPath;
            break;
          }
        }
      }
      const hasStreamTrace = fs.existsSync(streamTraceFile);

      if (!traceFile && !hasStreamTrace) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'No conversation trace found for task: ' + task_id,
        } as ErrorResponse);
        return;
      }

      // If only stream trace exists, return it
      if (!traceFile && hasStreamTrace) {
        const content = fs.readFileSync(streamTraceFile, 'utf-8');
        const events = content.split('\n').filter(l => l.trim()).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        res.json({ task_id, format: 'stream', events, has_stream_trace: true });
        return;
      }

      // Read trace entries (ConversationTracer format)
      const entries = ConversationTracer.readTrace(traceFile!);

      if (entries.length === 0) {
        // Fallback to stream trace if conversation trace is empty
        if (hasStreamTrace) {
          const content = fs.readFileSync(streamTraceFile, 'utf-8');
          const events = content.split('\n').filter(l => l.trim()).map(l => {
            try { return JSON.parse(l); } catch { return null; }
          }).filter(Boolean);
          res.json({ task_id, format: 'stream', events, has_stream_trace: true });
          return;
        }
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Conversation trace is empty for task: ' + task_id,
        } as ErrorResponse);
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
        res.json({
          task_id,
          trace_file: traceFile,
          entries,
          summary,
          has_stream_trace: hasStreamTrace,
        });
      } else if (latest) {
        const latestIteration = Math.max(
          ...entries
            .filter(e => e.iteration_index !== undefined)
            .map(e => e.iteration_index as number),
          0
        );
        const latestEntries = entries.filter(e =>
          e.iteration_index === undefined || e.iteration_index === latestIteration
        );
        res.json({
          task_id,
          trace_file: traceFile,
          entries: latestEntries,
          summary,
          has_stream_trace: hasStreamTrace,
        });
      } else {
        const formatted = ConversationTracer.formatTraceForDisplay(entries, { latestOnly: false, raw: false });
        res.json({
          task_id,
          trace_file: traceFile,
          formatted,
          summary,
          has_stream_trace: hasStreamTrace,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/tasks
   * Enqueue a new task (does NOT run it directly)
   * Body: { task_group_id: string, prompt: string, task_type?: string }
   */
  app.post('/api/tasks', async (req: Request, res: Response) => {
    try {
      const { task_group_id, prompt, task_type } = req.body;

      if (!task_group_id || typeof task_group_id !== 'string' || task_group_id.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'task_group_id is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'prompt is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      // Use provided task_type if valid, otherwise detect from prompt
      const taskType = task_type || detectTaskType(prompt.trim());
      const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim(), undefined, taskType);

      res.status(201).json({
        task_id: item.task_id,
        task_group_id: item.task_group_id,
        namespace: item.namespace,
        status: item.status,
        created_at: item.created_at,
      });
      invalidateTaskGroupsCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * PATCH /api/tasks/:task_id/status
   * Update task status
   * Body: { status: 'CANCELLED' | other valid status }
   */
  app.patch('/api/tasks/:task_id/status', async (req: Request, res: Response) => {
    try {
      const task_id = req.params.task_id as string;
      const { status } = req.body;

      if (!status || typeof status !== 'string') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'status is required and must be a string',
        } as ErrorResponse);
        return;
      }

      // v2.1: Added AWAITING_RESPONSE for clarification flow (P0-3, P0-4)
      const validStatuses: QueueItemStatus[] = ['QUEUED', 'RUNNING', 'AWAITING_RESPONSE', 'WAITING_CHILDREN', 'COMPLETE', 'ERROR', 'CANCELLED'];
      if (!validStatuses.includes(status as QueueItemStatus)) {
        res.status(400).json({
          error: 'INVALID_STATUS',
          message: 'Invalid status: ' + status + '. Must be one of: ' + validStatuses.join(', '),
        } as ErrorResponse);
        return;
      }

      // Get task item first to capture taskGroupId for activity event
      const taskItem = await queueStore.getItem(task_id);

      const result = await queueStore.updateStatusWithValidation(task_id, status as QueueItemStatus);

      if (!result.success) {
        if (result.error === 'Task not found') {
          res.status(404).json({
            error: 'NOT_FOUND',
            task_id: task_id,
            message: result.message,
          });
        } else {
          res.status(400).json({
            error: result.error,
            message: result.message,
          });
        }
        return;
      }

      // Emit task_updated activity event on meaningful state transitions
      const meaningfulStatuses: QueueItemStatus[] = ['COMPLETE', 'ERROR', 'AWAITING_RESPONSE', 'CANCELLED'];
      if (meaningfulStatuses.includes(status as QueueItemStatus) && isDALInitialized()) {
        try {
          const dal = getDAL();
          // Determine activity event type based on new status
          const activityType = status === 'COMPLETE' ? 'task_completed' as const
            : status === 'ERROR' ? 'task_failed' as const
            : status === 'AWAITING_RESPONSE' ? 'task_awaiting' as const
            : 'task_updated' as const;
          const importance = (status === 'ERROR' || status === 'AWAITING_RESPONSE') ? 'high' as const : 'normal' as const;

          // Recover project info from activity events for the taskGroupId
          let projectId: string | undefined;
          let projectPath: string | undefined;
          let projectAlias: string | undefined;
          let projectOrgId = 'default';
          const taskGroupId = taskItem?.task_group_id;

          if (taskGroupId) {
            const activityResult = await dal.listActivityEvents({ limit: 50 });
            for (const evt of activityResult.items) {
              if (evt.taskGroupId === taskGroupId && evt.projectId) {
                projectId = evt.projectId;
                projectPath = evt.projectPath;
                projectAlias = evt.projectAlias;
                if (evt.orgId) projectOrgId = evt.orgId;
                break;
              }
            }
          }

          await dal.createActivityEvent({
            orgId: projectOrgId,
            type: activityType,
            projectId,
            projectPath,
            projectAlias,
            taskGroupId,
            taskId: task_id,
            summary: `Task ${status.toLowerCase()}: ${task_id.substring(0, 12)}...`,
            importance,
            details: {
              taskId: task_id,
              taskGroupId,
              oldStatus: result.old_status,
              newStatus: result.new_status,
            },
          });
        } catch {
          // Best effort - don't fail the status update
        }
      }

      // If cancelling, kill any running Claude Code process
      if (status === 'CANCELLED') {
        killTaskProcess(task_id);
      }

      res.json({
        success: true,
        task_id: result.task_id,
        old_status: result.old_status,
        new_status: result.new_status,
      });
      invalidateTaskGroupsCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/tasks/:task_id/rejudge
   * Re-run question detection on stored output using LLM
   * Updates status based on result (AWAITING_RESPONSE <-> COMPLETE)
   */
  app.post('/api/tasks/:task_id/rejudge', async (req: Request, res: Response) => {
    try {
      const task_id = req.params.task_id as string;
      const taskItem = await queueStore.getItem(task_id);

      if (!taskItem) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Task not found' });
        return;
      }

      const output = taskItem.output || '';
      if (!output.trim()) {
        res.status(400).json({ error: 'NO_OUTPUT', message: 'Task has no output to analyze' });
        return;
      }

      // Run LLM question detection (multi-provider: uses stateDir + global config for key resolution)
      const llmResult = await detectQuestionsWithLlm(output, taskItem.prompt, undefined, stateDir);

      let newStatus: QueueItemStatus;
      if (llmResult.hasQuestions) {
        newStatus = 'AWAITING_RESPONSE';
        // Update clarification with LLM-extracted question
        const awResult = await queueStore.setAwaitingResponse(task_id, {
          type: 'unknown',
          question: llmResult.questionSummary || 'Question detected by LLM',
          context: taskItem.prompt,
        }, undefined, output);
        if (!awResult.success) {
          console.warn(`[rejudge] setAwaitingResponse failed: ${awResult.message}`);
        }
      } else {
        newStatus = 'COMPLETE';
        const upResult = await queueStore.updateStatusWithValidation(task_id, 'COMPLETE');
        if (!upResult.success) {
          console.warn(`[rejudge] updateStatus failed: ${upResult.message}`);
          res.status(400).json({ error: 'STATUS_UPDATE_FAILED', message: upResult.message });
          return;
        }
      }

      res.json({
        success: true,
        task_id,
        old_status: taskItem.status,
        new_status: newStatus,
        llm_result: {
          hasQuestions: llmResult.hasQuestions,
          questionSummary: llmResult.questionSummary,
          reasoning: llmResult.reasoning,
          usedProvider: llmResult.usedProvider,
          usedModel: llmResult.usedModel,
        },
      });
    } catch (error) {
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
  app.post('/api/tasks/:task_id/reply', async (req: Request, res: Response) => {
    try {
      const task_id = req.params.task_id as string;
      const { reply } = req.body;

      // Validate reply content
      if (!reply || typeof reply !== 'string' || reply.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'reply is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      // Get current task
      const task = await queueStore.getItem(task_id);

      if (!task) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Task not found: ' + task_id,
        } as ErrorResponse);
        return;
      }

      // Allow reply from AWAITING_RESPONSE, ERROR, or CANCELLED status
      const replyableStatuses = ['AWAITING_RESPONSE', 'ERROR', 'CANCELLED'];
      if (!replyableStatuses.includes(task.status)) {
        res.status(409).json({
          error: 'INVALID_STATUS',
          message: 'Task cannot be continued. Current status: ' + task.status + '. Allowed: ' + replyableStatuses.join(', '),
        } as ErrorResponse);
        return;
      }

      // For ERROR/CANCELLED tasks: first transition to AWAITING_RESPONSE so resumeWithResponse works
      if (task.status === 'ERROR' || task.status === 'CANCELLED') {
        await queueStore.setAwaitingResponse(task_id, {
          type: 'unknown',
          question: 'Task ended with ' + task.status + '. User requested continuation.',
          context: task.prompt,
        }, undefined, task.output || undefined);
      }

      // Resume task with user reply (changes to QUEUED -> will be picked up by executor)
      const result = await queueStore.resumeWithResponse(task_id, reply.trim());

      if (!result.success) {
        res.status(400).json({
          error: result.error || 'RESUME_FAILED',
          message: result.message || 'Failed to resume task with reply',
        });
        return;
      }

      // Emit task_updated activity event for reply (AWAITING_RESPONSE -> QUEUED)
      if (isDALInitialized()) {
        try {
          const dal = getDAL();
          let projectId: string | undefined;
          let projectPath: string | undefined;
          let projectAlias: string | undefined;
          let replyOrgId = 'default';
          const taskGroupId = task.task_group_id;

          if (taskGroupId) {
            const activityResult = await dal.listActivityEvents({ limit: 50 });
            for (const evt of activityResult.items) {
              if (evt.taskGroupId === taskGroupId && evt.projectId) {
                projectId = evt.projectId;
                projectPath = evt.projectPath;
                projectAlias = evt.projectAlias;
                if (evt.orgId) replyOrgId = evt.orgId;
                break;
              }
            }
          }

          await dal.createActivityEvent({
            orgId: replyOrgId,
            type: 'task_updated' as const,
            projectId,
            projectPath,
            projectAlias,
            taskGroupId,
            taskId: task_id,
            summary: `Task reply received: ${task_id.substring(0, 12)}...`,
            importance: 'normal' as const,
            details: {
              taskId: task_id,
              taskGroupId,
              oldStatus: result.old_status,
              newStatus: result.new_status,
              replyLength: reply.trim().length,
            },
          });
        } catch {
          // Best effort
        }
      }

      res.json({
        success: true,
        task_id: task_id,
        old_status: result.old_status,
        new_status: result.new_status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  // ===================
  // Frontend Routes
  // ===================

  /**
   * GET /
   * Serve main page (task group list)
   */
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /task-groups
   * Serve task groups list page
   */
  app.get('/task-groups', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /task-groups/:id
   * Serve task list page
   */
  app.get('/task-groups/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /tasks/:id
   * Serve task detail page
   */
  app.get('/tasks/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /new
   * Serve new command form
   */
  app.get('/new', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /settings
   * Serve settings page
   */
  app.get('/settings', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/commands', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/agents', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/hooks', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/mcp-servers', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/backup', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/plugins', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/assistant', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/dashboard', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/activity', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.get('/projects', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
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
  app.get('/api/health', (_req: Request, res: Response) => {
    // Read build info from environment (set by ProcessSupervisor/self-restart) or build-meta.json
    let buildSha: string | undefined = process.env.PM_BUILD_SHA;
    let buildTimestamp: string | undefined = process.env.PM_BUILD_TIMESTAMP;

    if (projectRoot && (!buildSha || !buildTimestamp)) {
      try {
        const buildMetaPath = path.join(projectRoot, 'dist', 'build-meta.json');
        if (fs.existsSync(buildMetaPath)) {
          const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
          buildSha = buildSha || buildMeta.build_sha;
          buildTimestamp = buildTimestamp || buildMeta.build_timestamp;
        }
      } catch {
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
  app.get('/api/namespace', (_req: Request, res: Response) => {
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
  app.get('/api/agents', (req: Request, res: Response) => {
    try {
      const folder = req.query.folder as string;

      if (!folder || typeof folder !== 'string') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'folder query parameter is required',
        } as ErrorResponse);
        return;
      }

      // Resolve to absolute path
      const absoluteFolder = path.resolve(folder);

      // Check if folder exists
      if (!fs.existsSync(absoluteFolder)) {
        res.status(404).json({
          error: 'FOLDER_NOT_FOUND',
          message: `Folder does not exist: ${absoluteFolder}`,
        } as ErrorResponse);
        return;
      }

      // Check if it's a directory
      const stat = fs.statSync(absoluteFolder);
      if (!stat.isDirectory()) {
        res.status(400).json({
          error: 'NOT_A_DIRECTORY',
          message: `Path is not a directory: ${absoluteFolder}`,
        } as ErrorResponse);
        return;
      }

      // Derive namespace and stateDir
      const folderNamespace = deriveNamespace(absoluteFolder);
      const folderStateDir = getStateDir(absoluteFolder);

      // Check for .claude/agents/ directory
      const agentsDir = path.join(absoluteFolder, '.claude', 'agents');
      const agents: { name: string; path: string }[] = [];

      if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
        const files = fs.readdirSync(agentsDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            agents.push({
              name: file.replace('.md', ''),
              path: path.join(agentsDir, file),
            });
          }
        }
      }

      res.json({
        folder: absoluteFolder,
        effectiveCwd: absoluteFolder,
        namespace: folderNamespace,
        stateDir: folderStateDir,
        hasAgentsDir: fs.existsSync(agentsDir),
        agents,
        agentCount: agents.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /agent
   * Serve agent launcher page
   */
  app.get('/agent', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /dashboard
   * Serve dashboard page
   */
  app.get('/dashboard', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /projects/:id
   * Serve project detail page
   */
  app.get('/projects/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /chat/:projectId
   * Serve chat page for a project
   */
  app.get('/chat/:projectId', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /activity
   * Serve activity page
   */
  app.get('/activity', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /processes
   * Serve processes page (system process monitor)
   */
  app.get('/processes', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /runs/:id
   * Serve run detail page
   */
  app.get('/runs/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  /**
   * GET /sessions/:id
   * Serve session detail page
   */
  app.get('/sessions/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // ===================
  // Route List
  // ===================

  /**
   * GET /api/routes
   * List all registered routes (for testing)
   */
  app.get('/api/routes', (_req: Request, res: Response) => {
    const routes: string[] = [
      'GET /api/namespaces',
      'GET /api/runners',
      'GET /api/task-groups',
      'POST /api/task-groups',
      'GET /api/task-groups/:task_group_id/tasks',
      'PATCH /api/task-groups/:task_group_id',
      'DELETE /api/task-groups/:task_group_id',
      'GET /api/tasks/:task_id',
      'DELETE /api/tasks/:task_id',
      'GET /api/tasks/:task_id/trace',
      'POST /api/tasks',
      'PATCH /api/tasks/:task_id/status',
      'POST /api/tasks/:task_id/rejudge',
      'POST /api/tasks/:task_id/reply',
      'GET /api/required-actions',
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
      // Supervisor Logs routes (AC A.1 - Observability)
      'GET /api/supervisor/logs',
      'GET /api/supervisor/logs/recent',
      'GET /api/supervisor/logs/task/:taskId',
      'GET /api/supervisor/logs/stream',
      'GET /api/supervisor/logs/categories',
      'GET /api/supervisor/logs/summary',
      'DELETE /api/supervisor/logs',
      // Claude Hooks routes
      'GET /api/claude-hooks/:scope',
      'GET /api/claude-hooks/:scope/scripts',
      'GET /api/claude-hooks/:scope/scripts/:filename',
      'PUT /api/claude-hooks/:scope/scripts/:filename',
      'DELETE /api/claude-hooks/:scope/scripts/:filename',
      'GET /api/claude-hooks/:scope/inconsistencies',
      'GET /api/claude-hooks/:scope/:event',
      'PUT /api/claude-hooks/:scope/:event',
      'DELETE /api/claude-hooks/:scope/:event',
    ];
    res.json({ routes });
  });

  return app;
}

/**
 * Web Server
 * Manages Express server lifecycle
 */
export class WebServer {
  private readonly app: Express;
  private readonly port: number;
  private readonly host: string;
  private readonly namespace: string;
  private server: ReturnType<Express['listen']> | null = null;
  private readonly connections: Set<import('net').Socket> = new Set();

  constructor(config: WebServerConfig) {
    this.port = config.port || 5678;
    this.host = config.host || 'localhost';
    this.namespace = config.namespace;
    this.app = createApp(config);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          resolve();
        });
        this.server.on('connection', (socket) => {
          this.connections.add(socket);
          socket.on('close', () => {
            this.connections.delete(socket);
          });
        });
        this.server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      // Close any open connections to avoid hanging on SSE
      for (const socket of this.connections) {
        try {
          socket.destroy();
        } catch {
          // Ignore socket errors on shutdown
        }
      }
      this.server.close((err) => {
        this.server = null;
        if (err && (err as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
          // Server already closed - not an error
          resolve();
        } else if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get server state
   */
  getState(): WebServerState {
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
  getApp(): Express {
    return this.app;
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return 'http://' + this.host + ':' + this.port;
  }
}
