/**
 * Session Logs Routes - Session Log Tree API
 *
 * Provides hierarchical session/log tree view for Web Dev Mode.
 * Sessions group command runs by date, providing tree navigation.
 *
 * Storage structure:
 *   stateDir/{namespace}/devconsole/
 *     sessions/
 *       {sessionId}.json - Session metadata
 *       index.json - Session index
 *     cmd/
 *       {runId}.json - Existing command run info
 *       {runId}.log.jsonl - Existing command logs
 *
 * SECURITY: Only available for projectType === "runner-dev"
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import {
  getNoDynamoExtended,
  initNoDynamoExtended,
  isNoDynamoExtendedInitialized,
} from "../dal/no-dynamo";

/**
 * Session info for tree display
 */
export interface SessionInfo {
  sessionId: string;
  label: string;
  startedAt: string;
  endedAt?: string;
  runCount: number;
  status: "active" | "completed" | "failed";
  summary?: string;
}

/**
 * Session with runs for detailed view
 */
export interface SessionWithRuns extends SessionInfo {
  runs: SessionRunInfo[];
}

/**
 * Run info for session tree
 */
export interface SessionRunInfo {
  runId: string;
  command: string;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
  duration?: number; // milliseconds
  logLineCount?: number;
}

/**
 * Session tree node for UI rendering
 */
export interface SessionTreeNode {
  id: string;
  type: "date" | "session" | "run";
  label: string;
  status?: "active" | "completed" | "failed" | "running";
  children?: SessionTreeNode[];
  metadata?: Record<string, unknown>;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Get directory for session data
 */
function getSessionDir(stateDir: string, namespace: string): string {
  const dir = path.join(stateDir, namespace, "devconsole", "sessions");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get directory for command logs
 */
function getCmdLogDir(stateDir: string, namespace: string): string {
  const dir = path.join(stateDir, namespace, "devconsole", "cmd");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Load session index
 */
function loadSessionIndex(sessionDir: string): string[] {
  const indexPath = path.join(sessionDir, "index.json");
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Save session index
 */
function saveSessionIndex(sessionDir: string, index: string[]): void {
  const indexPath = path.join(sessionDir, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Load session info
 */
function loadSessionInfo(sessionDir: string, sessionId: string): SessionInfo | null {
  const sessionPath = path.join(sessionDir, sessionId + ".json");
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Save session info
 */
function saveSessionInfo(sessionDir: string, session: SessionInfo): void {
  const sessionPath = path.join(sessionDir, session.sessionId + ".json");
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  // Update index
  const index = loadSessionIndex(sessionDir);
  if (!index.includes(session.sessionId)) {
    index.push(session.sessionId);
    saveSessionIndex(sessionDir, index);
  }
}

/**
 * Load command run info (minimal, without logs)
 */
interface CmdRunInfo {
  runId: string;
  command: string;
  cwd: string;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
  sessionId?: string;
}

function loadCmdRun(logDir: string, runId: string): CmdRunInfo | null {
  const runPath = path.join(logDir, runId + ".json");
  if (!fs.existsSync(runPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(runPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Count lines in log file
 */
function countLogLines(logDir: string, runId: string): number {
  const logPath = path.join(logDir, runId + ".log.jsonl");
  if (!fs.existsSync(logPath)) {
    return 0;
  }
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    return content.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * List all command runs from index
 */
function listAllCmdRuns(logDir: string): CmdRunInfo[] {
  const indexPath = path.join(logDir, "index.json");
  if (!fs.existsSync(indexPath)) {
    return [];
  }

  let index: string[];
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch {
    return [];
  }

  const runs: CmdRunInfo[] = [];
  for (const runId of index) {
    const run = loadCmdRun(logDir, runId);
    if (run) {
      runs.push(run);
    }
  }

  return runs;
}

/**
 * Group runs by date for session tree
 */
function groupRunsByDate(runs: CmdRunInfo[]): Map<string, CmdRunInfo[]> {
  const groups = new Map<string, CmdRunInfo[]>();

  for (const run of runs) {
    const dateKey = run.startedAt.split("T")[0]; // YYYY-MM-DD
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(run);
  }

  // Sort runs within each group by startedAt descending
  for (const [, groupRuns] of groups) {
    groupRuns.sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  return groups;
}

/**
 * Build session tree for UI
 */
function buildSessionTree(
  runs: CmdRunInfo[],
  sessions: SessionInfo[],
  logDir: string
): SessionTreeNode[] {
  const tree: SessionTreeNode[] = [];
  const runsByDate = groupRunsByDate(runs);

  // Sort dates descending (most recent first)
  const sortedDates = Array.from(runsByDate.keys()).sort().reverse();

  for (const dateKey of sortedDates) {
    const dateRuns = runsByDate.get(dateKey) || [];

    // Find sessions for this date
    const dateSessions = sessions.filter(s => s.startedAt.startsWith(dateKey));

    const children: SessionTreeNode[] = [];

    // Add session nodes
    for (const session of dateSessions) {
      const sessionRuns = dateRuns.filter(r => r.sessionId === session.sessionId);

      const runNodes: SessionTreeNode[] = sessionRuns.map(run => ({
        id: run.runId,
        type: "run" as const,
        label: run.command.length > 50 ? run.command.substring(0, 50) + "..." : run.command,
        status: run.status,
        metadata: {
          runId: run.runId,
          command: run.command,
          exitCode: run.exitCode,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          logLineCount: countLogLines(logDir, run.runId),
        },
      }));

      children.push({
        id: session.sessionId,
        type: "session",
        label: session.label,
        status: session.status,
        children: runNodes,
        metadata: {
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          runCount: session.runCount,
        },
      });
    }

    // Add orphan runs (not in any session)
    const sessionRunIds = new Set(
      dateSessions.flatMap(s =>
        dateRuns.filter(r => r.sessionId === s.sessionId).map(r => r.runId)
      )
    );
    const orphanRuns = dateRuns.filter(r => !sessionRunIds.has(r.runId));

    for (const run of orphanRuns) {
      children.push({
        id: run.runId,
        type: "run",
        label: run.command.length > 50 ? run.command.substring(0, 50) + "..." : run.command,
        status: run.status,
        metadata: {
          runId: run.runId,
          command: run.command,
          exitCode: run.exitCode,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          logLineCount: countLogLines(logDir, run.runId),
        },
      });
    }

    // Create date node
    const formattedDate = new Date(dateKey).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });

    tree.push({
      id: dateKey,
      type: "date",
      label: formattedDate,
      children,
      metadata: {
        date: dateKey,
        runCount: dateRuns.length,
        sessionCount: dateSessions.length,
      },
    });
  }

  return tree;
}

/**
 * Create Session Logs routes
 */
export function createSessionLogsRoutes(stateDir: string): Router {
  const router = Router();

  if (!isNoDynamoExtendedInitialized()) {
    initNoDynamoExtended(stateDir);
  }

  /**
   * Middleware: Verify project is runner-dev type
   */
  async function verifySelfhostRunner(
    req: Request,
    res: Response,
    next: () => void
  ): Promise<void> {
    try {
      const dal = getNoDynamoExtended();
      const projectId = req.params.projectId as string;

      const project = await dal.getProjectIndex(projectId);
      if (!project) {
        res.status(404).json({
          error: "NOT_FOUND",
          message: "Project not found: " + projectId,
        } as ErrorResponse);
        return;
      }

      const extendedProject = project as unknown as { projectType?: string };
      if (extendedProject.projectType !== "runner-dev") {
        res.status(403).json({
          error: "FORBIDDEN",
          message: "Session Logs is only available for runner-dev projects",
        } as ErrorResponse);
        return;
      }

      (req as any).project = project;
      (req as any).projectRoot = project.projectPath;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
    }
  }

  // =========================================================================
  // SESSION TREE API
  // =========================================================================

  /**
   * GET /api/projects/:projectId/session-logs/tree
   * Get session log tree for UI rendering
   */
  router.get(
    "/projects/:projectId/session-logs/tree",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const limit = parseInt(req.query.limit as string) || 100;

          const sessionDir = getSessionDir(stateDir, namespace);
          const cmdLogDir = getCmdLogDir(stateDir, namespace);

          // Load all sessions
          const sessionIndex = loadSessionIndex(sessionDir);
          const sessions: SessionInfo[] = [];
          for (const sessionId of sessionIndex) {
            const session = loadSessionInfo(sessionDir, sessionId);
            if (session) {
              sessions.push(session);
            }
          }

          // Load all runs
          const allRuns = listAllCmdRuns(cmdLogDir);

          // Limit to most recent runs
          const sortedRuns = allRuns
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, limit);

          // Build tree
          const tree = buildSessionTree(sortedRuns, sessions, cmdLogDir);

          res.json({
            tree,
            totalRuns: allRuns.length,
            totalSessions: sessions.length,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * GET /api/projects/:projectId/session-logs/runs
   * Get list of recent runs with summary
   */
  router.get(
    "/projects/:projectId/session-logs/runs",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const limit = parseInt(req.query.limit as string) || 50;
          const dateFilter = req.query.date as string; // YYYY-MM-DD

          const cmdLogDir = getCmdLogDir(stateDir, namespace);
          const allRuns = listAllCmdRuns(cmdLogDir);

          // Filter and sort
          let runs = allRuns;
          if (dateFilter) {
            runs = runs.filter(r => r.startedAt.startsWith(dateFilter));
          }
          runs = runs
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, limit);

          // Add log line counts
          const runsWithCounts: SessionRunInfo[] = runs.map(run => {
            const duration = run.endedAt
              ? new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()
              : undefined;
            return {
              runId: run.runId,
              command: run.command,
              status: run.status,
              exitCode: run.exitCode,
              startedAt: run.startedAt,
              endedAt: run.endedAt,
              duration,
              logLineCount: countLogLines(cmdLogDir, run.runId),
            };
          });

          res.json({ runs: runsWithCounts });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * GET /api/projects/:projectId/session-logs/run/:runId
   * Get detailed run info with full log
   */
  router.get(
    "/projects/:projectId/session-logs/run/:runId",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const runId = req.params.runId as string;
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");

          const cmdLogDir = getCmdLogDir(stateDir, namespace);
          const run = loadCmdRun(cmdLogDir, runId);

          if (!run) {
            res.status(404).json({
              error: "NOT_FOUND",
              message: "Run not found: " + runId,
            } as ErrorResponse);
            return;
          }

          // Load full logs
          const logPath = path.join(cmdLogDir, runId + ".log.jsonl");
          const logs: Array<{ timestamp: string; stream: string; text: string }> = [];

          if (fs.existsSync(logPath)) {
            const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
            for (const line of lines) {
              try {
                logs.push(JSON.parse(line));
              } catch {
                // Skip invalid lines
              }
            }
          }

          const duration = run.endedAt
            ? new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()
            : undefined;

          res.json({
            ...run,
            duration,
            logs,
            logLineCount: logs.length,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * POST /api/projects/:projectId/session-logs/sessions
   * Create a new session (for grouping runs)
   */
  router.post(
    "/projects/:projectId/session-logs/sessions",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const { label, summary } = req.body as { label?: string; summary?: string };

          const sessionDir = getSessionDir(stateDir, namespace);

          const sessionId = "sess-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
          const now = new Date().toISOString();

          const session: SessionInfo = {
            sessionId,
            label: label || `Session ${new Date().toLocaleTimeString("ja-JP")}`,
            startedAt: now,
            runCount: 0,
            status: "active",
            summary,
          };

          saveSessionInfo(sessionDir, session);

          res.status(201).json(session);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * PATCH /api/projects/:projectId/session-logs/sessions/:sessionId
   * Update session info
   */
  router.patch(
    "/projects/:projectId/session-logs/sessions/:sessionId",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const sessionId = req.params.sessionId as string;
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const updates = req.body as Partial<SessionInfo>;

          const sessionDir = getSessionDir(stateDir, namespace);
          const session = loadSessionInfo(sessionDir, sessionId);

          if (!session) {
            res.status(404).json({
              error: "NOT_FOUND",
              message: "Session not found: " + sessionId,
            } as ErrorResponse);
            return;
          }

          // Apply updates
          if (updates.label !== undefined) session.label = updates.label;
          if (updates.status !== undefined) session.status = updates.status;
          if (updates.summary !== undefined) session.summary = updates.summary;
          if (updates.endedAt !== undefined) session.endedAt = updates.endedAt;

          saveSessionInfo(sessionDir, session);

          res.json(session);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * GET /api/projects/:projectId/session-logs/sessions
   * List all sessions
   */
  router.get(
    "/projects/:projectId/session-logs/sessions",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const limit = parseInt(req.query.limit as string) || 20;

          const sessionDir = getSessionDir(stateDir, namespace);
          const index = loadSessionIndex(sessionDir);

          // Load sessions, most recent first
          const sessions: SessionInfo[] = [];
          const recentIds = index.slice(-limit).reverse();

          for (const sessionId of recentIds) {
            const session = loadSessionInfo(sessionDir, sessionId);
            if (session) {
              sessions.push(session);
            }
          }

          res.json({ sessions });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * GET /api/projects/:projectId/session-logs/summary
   * Get summary statistics for dashboard
   */
  router.get(
    "/projects/:projectId/session-logs/summary",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");

          const sessionDir = getSessionDir(stateDir, namespace);
          const cmdLogDir = getCmdLogDir(stateDir, namespace);

          const sessions = loadSessionIndex(sessionDir);
          const allRuns = listAllCmdRuns(cmdLogDir);

          // Calculate stats
          const today = new Date().toISOString().split("T")[0];
          const todayRuns = allRuns.filter(r => r.startedAt.startsWith(today));

          const completedRuns = allRuns.filter(r => r.status === "completed");
          const failedRuns = allRuns.filter(r => r.status === "failed");
          const runningRuns = allRuns.filter(r => r.status === "running");

          // Gate:all stats
          const gateRuns = allRuns.filter(r => r.command.includes("gate:all"));
          const gatePassCount = gateRuns.filter(r => r.exitCode === 0).length;

          res.json({
            totalSessions: sessions.length,
            totalRuns: allRuns.length,
            todayRuns: todayRuns.length,
            runningRuns: runningRuns.length,
            completedRuns: completedRuns.length,
            failedRuns: failedRuns.length,
            gateRunCount: gateRuns.length,
            gatePassCount,
            lastRunAt: allRuns.length > 0
              ? allRuns.sort((a, b) =>
                  new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
                )[0].startedAt
              : null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  return router;
}
