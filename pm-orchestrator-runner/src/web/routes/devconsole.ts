/**
 * Dev Console Routes - Self-hosted Runner Development Console
 *
 * Provides file system browsing, code search, patch application,
 * command execution with persistent logging, and git operations.
 *
 * SECURITY: Only available for projectType === "runner-dev"
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
  sessionId?: string; // Optional: link to session for Session Log Tree
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

/**
 * Git status response
 */
interface GitStatusResponse {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

/**
 * Git log entry
 */
interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

/**
 * Gate:all pass info
 */
interface GatePassInfo {
  runId: string;
  command: string;
  exitCode: number;
  startedAt: string;
  endedAt: string;
}

// In-memory running processes
const runningProcesses = new Map<string, ReturnType<typeof spawn>>();

// Track last commit hash for push validation
const lastCommitByProject = new Map<string, { hash: string; gatePassRunId: string }>();

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
  const resolved = path.resolve(basePath, relPath);
  const normalizedBase = path.resolve(basePath);

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
  const runPath = path.join(logDir, run.runId + ".json");
  fs.writeFileSync(runPath, JSON.stringify(run, null, 2));

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
  const logPath = path.join(logDir, runId + ".log.jsonl");
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

/**
 * Load command run with logs
 */
function loadCmdRun(logDir: string, runId: string): CmdRunWithLogs | null {
  const runPath = path.join(logDir, runId + ".json");
  if (!fs.existsSync(runPath)) {
    return null;
  }

  const run: CmdRunInfo = JSON.parse(fs.readFileSync(runPath, "utf-8"));
  const logs: CmdLogEntry[] = [];

  const logPath = path.join(logDir, runId + ".log.jsonl");
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

  const recentIds = index.slice(-limit).reverse();
  const runs: CmdRunInfo[] = [];

  for (const runId of recentIds) {
    const runPath = path.join(logDir, runId + ".json");
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
 * Find the latest gate:all PASS (exitCode === 0) from command logs
 * Source of truth for commit/push authorization
 */
function findLatestGateAllPass(logDir: string): GatePassInfo | null {
  const runs = listCmdRuns(logDir, 50);

  for (const run of runs) {
    const isGateAll = run.command.includes("gate:all");
    const isPassed = run.exitCode === 0 && run.status === "completed";

    if (isGateAll && isPassed && run.endedAt && run.exitCode !== undefined) {
      return {
        runId: run.runId,
        command: run.command,
        exitCode: run.exitCode,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
      };
    }
  }

  return null;
}

/**
 * Create Dev Console routes
 */
export function createDevconsoleRoutes(stateDir: string): Router {
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
          message: "Dev Console is only available for runner-dev projects",
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
  // FS API
  // =========================================================================

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

          try {
            const rgOutput = execSync(
              "rg --line-number --no-heading --color=never --max-count=100 -- " + JSON.stringify(query),
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
            if (rgError.status === 1 && rgError.stdout === "") {
              // No matches
            } else if (rgError.code === "ENOENT" || rgError.message?.includes("not found")) {
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

          const filePathPattern = /^(?:---|\+\+\+)\s+([ab]\/)?(.+?)(?:\t|$)/gm;
          const filePaths = new Set<string>();
          let match;

          while ((match = filePathPattern.exec(patch)) !== null) {
            const filePath = match[2];
            if (filePath !== "/dev/null") {
              filePaths.add(filePath);
            }
          }

          for (const filePath of filePaths) {
            const resolved = resolveSafePath(projectRoot, filePath);
            if (!resolved) {
              res.status(400).json({
                ok: false,
                error: "Path escapes project root: " + filePath,
              } as PatchResponse);
              return;
            }
          }

          try {
            execSync("patch -p1 --dry-run", {
              input: patch,
              cwd: projectRoot,
              encoding: "utf-8",
              timeout: 30000,
            });

            execSync("patch -p1", {
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
              error: "Patch failed: " + errorMsg,
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

  router.post(
    "/projects/:projectId/dev/cmd/run",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const projectRoot = (req as any).projectRoot as string;
          const { command, cwd, sessionId } = req.body as { command?: string; cwd?: string; sessionId?: string };

          if (!command) {
            res.status(400).json({
              error: "MISSING_COMMAND",
              message: "Request body must include 'command'",
            } as ErrorResponse);
            return;
          }

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

          const runId = "cmd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const logDir = getCmdLogDir(stateDir, namespace);

          const runInfo: CmdRunInfo = {
            runId,
            command,
            cwd: path.relative(projectRoot, workingDir) || ".",
            status: "running",
            startedAt: new Date().toISOString(),
            sessionId: sessionId || undefined, // Link to session for Session Log Tree
          };

          saveCmdRun(logDir, runInfo);

          appendCmdLog(logDir, runId, {
            timestamp: new Date().toISOString(),
            stream: "system",
            text: "$ " + command,
          });

          const spawnOptions: SpawnOptions = {
            cwd: workingDir,
            shell: true,
            env: { ...process.env, FORCE_COLOR: "0" },
          };

          const child = spawn(command, [], spawnOptions);
          runningProcesses.set(runId, child);

          child.stdout?.on("data", (data: Buffer) => {
            appendCmdLog(logDir, runId, {
              timestamp: new Date().toISOString(),
              stream: "stdout",
              text: data.toString(),
            });
          });

          child.stderr?.on("data", (data: Buffer) => {
            appendCmdLog(logDir, runId, {
              timestamp: new Date().toISOString(),
              stream: "stderr",
              text: data.toString(),
            });
          });

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
              text: "Process exited with code " + code,
            });
          });

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
              text: "Error: " + err.message,
            });
          });

          res.json({ runId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

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

  // =========================================================================
  // GIT API
  // =========================================================================

  router.get(
    "/projects/:projectId/dev/git/status",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const projectRoot = (req as any).projectRoot as string;

          let branch = "unknown";
          try {
            branch = execSync("git rev-parse --abbrev-ref HEAD", {
              cwd: projectRoot,
              encoding: "utf-8",
            }).trim();
          } catch {
            // Ignore
          }

          const staged: string[] = [];
          try {
            const stagedOutput = execSync("git diff --cached --name-only", {
              cwd: projectRoot,
              encoding: "utf-8",
            });
            staged.push(...stagedOutput.split("\n").filter(Boolean));
          } catch {
            // Ignore
          }

          const unstaged: string[] = [];
          try {
            const unstagedOutput = execSync("git diff --name-only", {
              cwd: projectRoot,
              encoding: "utf-8",
            });
            unstaged.push(...unstagedOutput.split("\n").filter(Boolean));
          } catch {
            // Ignore
          }

          const untracked: string[] = [];
          try {
            const untrackedOutput = execSync("git ls-files --others --exclude-standard", {
              cwd: projectRoot,
              encoding: "utf-8",
            });
            untracked.push(...untrackedOutput.split("\n").filter(Boolean));
          } catch {
            // Ignore
          }

          let ahead = 0;
          let behind = 0;
          try {
            const aheadBehind = execSync("git rev-list --left-right --count HEAD...@{upstream}", {
              cwd: projectRoot,
              encoding: "utf-8",
            }).trim();
            const parts = aheadBehind.split(/\s+/);
            ahead = parseInt(parts[0]) || 0;
            behind = parseInt(parts[1]) || 0;
          } catch {
            // No upstream or error
          }

          res.json({
            branch,
            staged,
            unstaged,
            untracked,
            ahead,
            behind,
          } as GitStatusResponse);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  router.get(
    "/projects/:projectId/dev/git/diff",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const projectRoot = (req as any).projectRoot as string;
          const staged = req.query.staged === "true";

          let diff = "";
          try {
            const diffCmd = staged ? "git diff --cached" : "git diff";
            diff = execSync(diffCmd, {
              cwd: projectRoot,
              encoding: "utf-8",
              maxBuffer: 10 * 1024 * 1024,
            });
          } catch {
            // Return empty diff
          }

          res.json({ diff, staged });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  router.get(
    "/projects/:projectId/dev/git/log",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const projectRoot = (req as any).projectRoot as string;
          const limit = parseInt(req.query.limit as string) || 10;

          const entries: GitLogEntry[] = [];
          try {
            const logOutput = execSync(
              "git log --format=\"%H|%h|%an|%aI|%s\" -n " + limit,
              {
                cwd: projectRoot,
                encoding: "utf-8",
              }
            );

            const lines = logOutput.split("\n").filter(Boolean);
            for (const line of lines) {
              const parts = line.split("|");
              if (parts.length >= 5) {
                entries.push({
                  hash: parts[0],
                  shortHash: parts[1],
                  author: parts[2],
                  date: parts[3],
                  message: parts.slice(4).join("|"),
                });
              }
            }
          } catch {
            // Ignore errors
          }

          res.json({ entries });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  router.get(
    "/projects/:projectId/dev/git/gateStatus",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const logDir = getCmdLogDir(stateDir, namespace);

          const gatePass = findLatestGateAllPass(logDir);

          if (gatePass) {
            res.json({
              hasPass: true,
              gatePass,
            });
          } else {
            res.json({
              hasPass: false,
              gatePass: null,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  router.post(
    "/projects/:projectId/dev/git/commit",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const projectRoot = (req as any).projectRoot as string;
          const { message: commitMessage } = req.body as { message?: string };

          if (!commitMessage || typeof commitMessage !== "string" || commitMessage.trim() === "") {
            res.status(400).json({
              error: "MISSING_MESSAGE",
              message: "Request body must include non-empty 'message'",
            } as ErrorResponse);
            return;
          }

          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const logDir = getCmdLogDir(stateDir, namespace);
          const gatePass = findLatestGateAllPass(logDir);

          if (!gatePass) {
            res.status(409).json({
              error: "GATE_NOT_PASSED",
              message: "Cannot commit: No gate:all PASS found. Run 'npm run gate:all' first.",
              reason: "Latest gate:all PASS not found in command history",
            });
            return;
          }

          let stagedCount = 0;
          try {
            const stagedOutput = execSync("git diff --cached --name-only", {
              cwd: projectRoot,
              encoding: "utf-8",
            });
            stagedCount = stagedOutput.split("\n").filter(Boolean).length;
          } catch {
            // Ignore
          }

          if (stagedCount === 0) {
            res.status(400).json({
              error: "NOTHING_STAGED",
              message: "No staged changes to commit. Use 'git add' first.",
            } as ErrorResponse);
            return;
          }

          let commitHash = "";
          try {
            execSync("git commit -m " + JSON.stringify(commitMessage.trim()), {
              cwd: projectRoot,
              encoding: "utf-8",
            });

            commitHash = execSync("git rev-parse HEAD", {
              cwd: projectRoot,
              encoding: "utf-8",
            }).trim();
          } catch (commitError: any) {
            const errorMsg = commitError.stderr || commitError.stdout || commitError.message;
            res.status(500).json({
              error: "COMMIT_FAILED",
              message: "Git commit failed: " + errorMsg,
            } as ErrorResponse);
            return;
          }

          lastCommitByProject.set(project.projectId, {
            hash: commitHash,
            gatePassRunId: gatePass.runId,
          });

          res.json({
            ok: true,
            commitHash,
            gatePassUsed: gatePass.runId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
        }
      });
    }
  );

  router.post(
    "/projects/:projectId/dev/git/push",
    async (req: Request, res: Response) => {
      await verifySelfhostRunner(req, res, () => {
        try {
          const project = (req as any).project as { projectId: string };
          const projectRoot = (req as any).projectRoot as string;

          const namespace = project.projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const logDir = getCmdLogDir(stateDir, namespace);
          const gatePass = findLatestGateAllPass(logDir);

          if (!gatePass) {
            res.status(409).json({
              error: "GATE_NOT_PASSED",
              message: "Cannot push: No gate:all PASS found.",
              reason: "Latest gate:all PASS not found in command history",
            });
            return;
          }

          let ahead = 0;
          try {
            const aheadBehind = execSync("git rev-list --left-right --count HEAD...@{upstream}", {
              cwd: projectRoot,
              encoding: "utf-8",
            }).trim();
            const parts = aheadBehind.split(/\s+/);
            ahead = parseInt(parts[0]) || 0;
          } catch {
            res.status(400).json({
              error: "NO_UPSTREAM",
              message: "No upstream branch configured. Use 'git push -u origin <branch>' first.",
            } as ErrorResponse);
            return;
          }

          if (ahead === 0) {
            res.status(400).json({
              error: "NOTHING_TO_PUSH",
              message: "No commits to push. Local and remote are in sync.",
            } as ErrorResponse);
            return;
          }

          try {
            execSync("git push", {
              cwd: projectRoot,
              encoding: "utf-8",
              timeout: 60000,
            });
          } catch (pushError: any) {
            const errorMsg = pushError.stderr || pushError.stdout || pushError.message;
            res.status(500).json({
              error: "PUSH_FAILED",
              message: "Git push failed: " + errorMsg,
            } as ErrorResponse);
            return;
          }

          res.json({
            ok: true,
            pushed: ahead,
            gatePassUsed: gatePass.runId,
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
