/**
 * Dev Console Routes - Self-hosted Runner Development Console
 *
 * Provides file system browsing, code search, patch application,
 * and command execution with persistent logging.
 *
 * SECURITY: Only available for projectType === "selfhost-runner"
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { spawn, execSync, SpawnOptions } from "child_process";
import {
  getNoDynamoExtended,
  initNoDynamoExtended,
  isNoDynamoExtendedInitialized,
} from "../dal/no-dynamo";

/**
 * File entry in directory listing
 */
interface FileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  mtime: string;
  relPath: string;
}

/**
 * Directory tree response
 */
interface TreeResponse {
  root: string;
  entries: FileEntry[];
}

/**
 * File content response
 */
interface ReadResponse {
  path: string;
  content: string;
}

/**
 * Search result entry
 */
interface SearchResult {
  relPath: string;
  line: number;
  text: string;
}

/**
 * Patch apply response
 */
interface PatchResponse {
  ok: boolean;
  changedFiles?: string[];
  error?: string;
}

/**
 * Command run info
 */
interface CmdRunInfo {
  runId: string;
  command: string;
  cwd: string;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
}

/**
 * Command log entry
 */
interface CmdLogEntry {
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

/**
 * Command run with logs
 */
interface CmdRunWithLogs extends CmdRunInfo {
  logs: CmdLogEntry[];
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
  message: string;
}

// In-memory running processes
const runningProcesses = new Map<string, ReturnType<typeof spawn>>();

/**
 * Validate path is within project root (sandbox)
 */
function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolved = path.resolve(basePath, targetPath);
  const normalizedBase = path.resolve(basePath);
  return resolved.startsWith(normalizedBase + path.sep) || resolved === normalizedBase;
}

/**
 * Resolve safe path within project root
 */
function resolveSafePath(basePath: string, relPath: string): string | null {
  // Normalize and resolve
  const resolved = path.resolve(basePath, relPath);
  const normalizedBase = path.resolve(basePath);

  // Check if within base
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return null;
  }

  return resolved;
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
 * Save command run info
 */
function saveCmdRun(logDir: string, run: CmdRunInfo): void {
  const runPath = path.join(logDir, `${run.runId}.json`);
  fs.writeFileSync(runPath, JSON.stringify(run, null, 2));

  // Update index
  const indexPath = path.join(logDir, "index.json");
  let index: string[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    } catch {
      index = [];
    }
  }
  if (!index.includes(run.runId)) {
    index.push(run.runId);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }
}

/**
 * Append log entry
 */
function appendCmdLog(logDir: string, runId: string, entry: CmdLogEntry): void {
  const logPath = path.join(logDir, `${runId}.log.jsonl`);
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

/**
 * Load command run with logs
 */
function loadCmdRun(logDir: string, runId: string): CmdRunWithLogs | null {
  const runPath = path.join(logDir, `${runId}.json`);
  if (!fs.existsSync(runPath)) {
    return null;
  }

  const run: CmdRunInfo = JSON.parse(fs.readFileSync(runPath, "utf-8"));
  const logs: CmdLogEntry[] = [];

  const logPath = path.join(logDir, `${runId}.log.jsonl`);
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

  return { ...run, logs };
}

/**
 * List recent command runs
 */
function listCmdRuns(logDir: string, limit = 20): CmdRunInfo[] {
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

  // Get last N runs
  const recentIds = index.slice(-limit).reverse();
  const runs: CmdRunInfo[] = [];

  for (const runId of recentIds) {
    const runPath = path.join(logDir, `${runId}.json`);
    if (fs.existsSync(runPath)) {
      try {
        runs.push(JSON.parse(fs.readFileSync(runPath, "utf-8")));
      } catch {
        // Skip invalid
      }
    }
  }

  return runs;
}

/**
 * Create Dev Console routes
 */
export function createDevconsoleRoutes(stateDir: string): Router {
  const router = Router();

  // Ensure NoDynamoExtended is initialized
  if (!isNoDynamoExtendedInitialized()) {
    initNoDynamoExtended(stateDir);
  }

  /**
   * Middleware: Verify project is selfhost-runner type
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
          message: "Dev Console is only available for runner-dev projects",
        } as ErrorResponse);
        return;
      }

      // Attach project info to request
      (req as any).project = project;
      (req as any).projectRoot = project.projectPath;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
    }
  }

  // =========================================================================
  // FS API
  // =========================================================================

  /**
   * GET /api/projects/:projectId/dev/fs/tree
   * List directory contents
   */
  router.get(
    "/projects/:projectId/dev/fs/tree",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const projectRoot = (req as any).projectRoot as string;
          const rootParam = (req.query.root as string) || ".";

          const targetPath = resolveSafePath(projectRoot, rootParam);
          if (!targetPath) {
            res.status(400).json({
              error: "INVALID_PATH",
              message: "Path escapes project root",
            } as ErrorResponse);
            return;
          }

          if (!fs.existsSync(targetPath)) {
            res.status(404).json({
              error: "NOT_FOUND",
              message: "Directory not found: " + rootParam,
            } as ErrorResponse);
            return;
          }

          const stat = fs.statSync(targetPath);
          if (!stat.isDirectory()) {
            res.status(400).json({
              error: "NOT_DIRECTORY",
              message: "Path is not a directory: " + rootParam,
            } as ErrorResponse);
            return;
          }

          const entries: FileEntry[] = [];
          const items = fs.readdirSync(targetPath);

          for (const name of items) {
            // Skip hidden files and node_modules
            if (name.startsWith(".") || name === "node_modules") {
              continue;
            }

            const itemPath = path.join(targetPath, name);
            try {
              const itemStat = fs.statSync(itemPath);
              const relPath = path.relative(projectRoot, itemPath);

              entries.push({
                name,
                type: itemStat.isDirectory() ? "directory" : "file",
                size: itemStat.size,
                mtime: itemStat.mtime.toISOString(),
                relPath,
              });
            } catch {
              // Skip inaccessible items
            }
          }

          // Sort: directories first, then alphabetically
          entries.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === "directory" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          res.json({
            root: path.relative(projectRoot, targetPath) || ".",
            entries,
          } as TreeResponse);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * GET /api/projects/:projectId/dev/fs/read
   * Read file contents
   */
  router.get(
    "/projects/:projectId/dev/fs/read",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const projectRoot = (req as any).projectRoot as string;
          const filePath = req.query.path as string;

          if (!filePath) {
            res.status(400).json({
              error: "MISSING_PATH",
              message: "Query parameter 'path' is required",
            } as ErrorResponse);
            return;
          }

          const targetPath = resolveSafePath(projectRoot, filePath);
          if (!targetPath) {
            res.status(400).json({
              error: "INVALID_PATH",
              message: "Path escapes project root",
            } as ErrorResponse);
            return;
          }

          if (!fs.existsSync(targetPath)) {
            res.status(404).json({
              error: "NOT_FOUND",
              message: "File not found: " + filePath,
            } as ErrorResponse);
            return;
          }

          const stat = fs.statSync(targetPath);
          if (stat.isDirectory()) {
            res.status(400).json({
              error: "IS_DIRECTORY",
              message: "Path is a directory: " + filePath,
            } as ErrorResponse);
            return;
          }

          // Limit file size (10MB)
          if (stat.size > 10 * 1024 * 1024) {
            res.status(413).json({
              error: "FILE_TOO_LARGE",
              message: "File exceeds 10MB limit",
            } as ErrorResponse);
            return;
          }

          const content = fs.readFileSync(targetPath, "utf-8");
          res.json({
            path: filePath,
            content,
          } as ReadResponse);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * POST /api/projects/:projectId/dev/fs/search
   * Search files using ripgrep or fallback
   */
  router.post(
    "/projects/:projectId/dev/fs/search",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const projectRoot = (req as any).projectRoot as string;
          const { query: queryParam, root } = req.body as { query?: string; root?: string };

          if (!queryParam) {
            res.status(400).json({
              error: "MISSING_QUERY",
              message: "Request body must include 'query'",
            } as ErrorResponse);
            return;
          }

          const query: string = queryParam;

          const searchRoot = root
            ? resolveSafePath(projectRoot, root)
            : projectRoot;

          if (!searchRoot) {
            res.status(400).json({
              error: "INVALID_PATH",
              message: "Search root escapes project root",
            } as ErrorResponse);
            return;
          }

          const results: SearchResult[] = [];

          // Try ripgrep first
          try {
            const rgOutput = execSync(
              `rg --line-number --no-heading --color=never --max-count=100 -- ${JSON.stringify(query)}`,
              {
                cwd: searchRoot,
                encoding: "utf-8",
                timeout: 30000,
                maxBuffer: 10 * 1024 * 1024,
              }
            );

            const lines = rgOutput.split("\n").filter(Boolean);
            for (const line of lines.slice(0, 100)) {
              const match = line.match(/^([^:]+):(\d+):(.*)$/);
              if (match) {
                results.push({
                  relPath: match[1],
                  line: parseInt(match[2], 10),
                  text: match[3],
                });
              }
            }
          } catch (rgError: any) {
            // ripgrep returns non-zero if no matches, check if it's installed
            if (rgError.status === 1 && rgError.stdout === "") {
              // No matches, return empty
            } else if (rgError.code === "ENOENT" || rgError.message?.includes("not found")) {
              // ripgrep not installed, use fallback
              // Simple recursive search (limited)
              function searchDir(dir: string, depth = 0): void {
                if (depth > 5 || results.length >= 100) return;

                const items = fs.readdirSync(dir);
                for (const item of items) {
                  if (item.startsWith(".") || item === "node_modules") continue;

                  const itemPath = path.join(dir, item);
                  try {
                    const stat = fs.statSync(itemPath);
                    if (stat.isDirectory()) {
                      searchDir(itemPath, depth + 1);
                    } else if (stat.isFile() && stat.size < 1024 * 1024) {
                      const content = fs.readFileSync(itemPath, "utf-8");
                      const lines = content.split("\n");
                      for (let i = 0; i < lines.length && results.length < 100; i++) {
                        if (lines[i].includes(query)) {
                          results.push({
                            relPath: path.relative(projectRoot, itemPath),
                            line: i + 1,
                            text: lines[i].substring(0, 200),
                          });
                        }
                      }
                    }
                  } catch {
                    // Skip inaccessible
                  }
                }
              }

              searchDir(searchRoot);
            }
          }

          res.json(results);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * POST /api/projects/:projectId/dev/fs/applyPatch
   * Apply unified diff patch
   */
  router.post(
    "/projects/:projectId/dev/fs/applyPatch",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const projectRoot = (req as any).projectRoot as string;
          const { patch } = req.body as { patch?: string };

          if (!patch) {
            res.status(400).json({
              error: "MISSING_PATCH",
              message: "Request body must include 'patch'",
            } as ErrorResponse);
            return;
          }

          // Parse patch to extract file paths
          const filePathPattern = /^(?:---|\+\+\+)\s+([ab]\/)?(.+?)(?:\t|$)/gm;
          const filePaths = new Set<string>();
          let match;

          while ((match = filePathPattern.exec(patch)) !== null) {
            const filePath = match[2];
            // Skip /dev/null (new or deleted files)
            if (filePath !== "/dev/null") {
              filePaths.add(filePath);
            }
          }

          // Validate all paths are within project root
          for (const filePath of filePaths) {
            const resolved = resolveSafePath(projectRoot, filePath);
            if (!resolved) {
              res.status(400).json({
                ok: false,
                error: `Path escapes project root: ${filePath}`,
              } as PatchResponse);
              return;
            }
          }

          // Apply patch using system patch command
          try {
            execSync(`patch -p1 --dry-run`, {
              input: patch,
              cwd: projectRoot,
              encoding: "utf-8",
              timeout: 30000,
            });

            // Dry run succeeded, apply for real
            execSync(`patch -p1`, {
              input: patch,
              cwd: projectRoot,
              encoding: "utf-8",
              timeout: 30000,
            });

            res.json({
              ok: true,
              changedFiles: Array.from(filePaths),
            } as PatchResponse);
          } catch (patchError: any) {
            const errorMsg = patchError.stderr || patchError.stdout || patchError.message;
            res.status(400).json({
              ok: false,
              error: `Patch failed: ${errorMsg}`,
            } as PatchResponse);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  // =========================================================================
  // CMD API
  // =========================================================================

  /**
   * POST /api/projects/:projectId/dev/cmd/run
   * Execute a command with persistent logging
   */
  router.post(
    "/projects/:projectId/dev/cmd/run",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const projectRoot = (req as any).projectRoot as string;
          const { command, cwd } = req.body as { command?: string; cwd?: string };

          if (!command) {
            res.status(400).json({
              error: "MISSING_COMMAND",
              message: "Request body must include 'command'",
            } as ErrorResponse);
            return;
          }

          // Validate cwd if provided
          let workingDir = projectRoot;
          if (cwd) {
            const resolved = resolveSafePath(projectRoot, cwd);
            if (!resolved) {
              res.status(400).json({
                error: "INVALID_CWD",
                message: "Working directory escapes project root",
              } as ErrorResponse);
              return;
            }
            workingDir = resolved;
          }

          // Generate run ID
          const runId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const logDir = getCmdLogDir(stateDir, namespace);

          // Create run info
          const runInfo: CmdRunInfo = {
            runId,
            command,
            cwd: path.relative(projectRoot, workingDir) || ".",
            status: "running",
            startedAt: new Date().toISOString(),
          };

          saveCmdRun(logDir, runInfo);

          // Log start
          appendCmdLog(logDir, runId, {
            timestamp: new Date().toISOString(),
            stream: "system",
            text: `$ ${command}`,
          });

          // Spawn process
          const spawnOptions: SpawnOptions = {
            cwd: workingDir,
            shell: true,
            env: { ...process.env, FORCE_COLOR: "0" },
          };

          const child = spawn(command, [], spawnOptions);
          runningProcesses.set(runId, child);

          // Capture stdout
          child.stdout?.on("data", (data: Buffer) => {
            appendCmdLog(logDir, runId, {
              timestamp: new Date().toISOString(),
              stream: "stdout",
              text: data.toString(),
            });
          });

          // Capture stderr
          child.stderr?.on("data", (data: Buffer) => {
            appendCmdLog(logDir, runId, {
              timestamp: new Date().toISOString(),
              stream: "stderr",
              text: data.toString(),
            });
          });

          // Handle completion
          child.on("close", (code) => {
            runningProcesses.delete(runId);

            const endedAt = new Date().toISOString();
            const updatedRun: CmdRunInfo = {
              ...runInfo,
              status: code === 0 ? "completed" : "failed",
              exitCode: code ?? -1,
              endedAt,
            };
            saveCmdRun(logDir, updatedRun);

            appendCmdLog(logDir, runId, {
              timestamp: endedAt,
              stream: "system",
              text: `Process exited with code ${code}`,
            });
          });

          // Handle error
          child.on("error", (err) => {
            runningProcesses.delete(runId);

            const endedAt = new Date().toISOString();
            const updatedRun: CmdRunInfo = {
              ...runInfo,
              status: "failed",
              exitCode: -1,
              endedAt,
            };
            saveCmdRun(logDir, updatedRun);

            appendCmdLog(logDir, runId, {
              timestamp: endedAt,
              stream: "system",
              text: `Error: ${err.message}`,
            });
          });

          // Return immediately with runId
          res.json({ runId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * GET /api/projects/:projectId/dev/cmd/:runId/log
   * Get logs for a command run
   */
  router.get(
    "/projects/:projectId/dev/cmd/:runId/log",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const runId = req.params.runId as string;

          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const logDir = getCmdLogDir(stateDir, namespace);

          const run = loadCmdRun(logDir, runId);
          if (!run) {
            res.status(404).json({
              error: "NOT_FOUND",
              message: "Command run not found: " + runId,
            } as ErrorResponse);
            return;
          }

          res.json(run);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  /**
   * GET /api/projects/:projectId/dev/cmd/list
   * List recent command runs
   */
  router.get(
    "/projects/:projectId/dev/cmd/list",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const limit = parseInt(req.query.limit as string) || 20;

          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const logDir = getCmdLogDir(stateDir, namespace);

          const runs = listCmdRuns(logDir, limit);
          res.json({ runs });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  return router;
}
