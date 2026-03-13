/**
 * Claude Settings Routes
 *
 * Provides API endpoints for reading/writing Claude Code's settings.json
 * and CLAUDE.md files at both project and global (~/.claude) levels.
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Global Claude directory path (~/.claude)
 */
function getGlobalClaudeDir(): string {
  return path.join(os.homedir(), ".claude");
}

/**
 * Read a JSON file safely, returning null on error
 */
function readJsonFile(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write a JSON file, creating parent directories as needed
 */
function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Read a text file safely, returning null on error
 */
function readTextFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write a text file, creating parent directories as needed
 */
function writeTextFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

export interface ClaudeSettingsConfig {
  projectRoot: string;
  /** Override global Claude directory (default: ~/.claude). Useful for testing. */
  globalClaudeDir?: string;
}

/**
 * Create Claude settings routes
 */
export function createClaudeSettingsRoutes(config: ClaudeSettingsConfig): Router {
  const router = Router();
  const { projectRoot } = config;
  const globalDir = config.globalClaudeDir || getGlobalClaudeDir();

  /**
   * Extract projectPath from query params (validated: must be absolute path)
   */
  function getProjectPathOverride(req: Request): string | undefined {
    const pp = req.query.projectPath as string | undefined;
    if (pp && path.isAbsolute(pp)) return pp;
    return undefined;
  }

  function resolveProjectRoot(req: Request): string {
    return getProjectPathOverride(req) || projectRoot;
  }

  // --- settings.json endpoints ---

  /**
   * GET /api/claude-settings/project
   * Read project-level .claude/settings.json
   */
  router.get("/project", (req: Request, res: Response) => {
    const filePath = path.join(resolveProjectRoot(req), ".claude", "settings.json");
    const data = readJsonFile(filePath);
    res.json({
      exists: data !== null,
      path: filePath,
      settings: data || {},
    });
  });

  /**
   * PUT /api/claude-settings/project
   * Write project-level .claude/settings.json
   * Body: { settings: object }
   */
  router.put("/project", (req: Request, res: Response) => {
    const { settings } = req.body;
    if (settings === undefined || settings === null) {
      res.status(400).json({ error: "MISSING_SETTINGS", message: "settings field is required" });
      return;
    }
    const filePath = path.join(resolveProjectRoot(req), ".claude", "settings.json");
    try {
      writeJsonFile(filePath, settings);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "WRITE_FAILED", message });
    }
  });

  /**
   * GET /api/claude-settings/global
   * Read global ~/.claude/settings.json
   */
  router.get("/global", (_req: Request, res: Response) => {
    const filePath = path.join(globalDir, "settings.json");
    const data = readJsonFile(filePath);
    res.json({
      exists: data !== null,
      path: filePath,
      settings: data || {},
    });
  });

  /**
   * PUT /api/claude-settings/global
   * Write global ~/.claude/settings.json
   * Body: { settings: object }
   */
  router.put("/global", (req: Request, res: Response) => {
    const { settings } = req.body;
    if (settings === undefined || settings === null) {
      res.status(400).json({ error: "MISSING_SETTINGS", message: "settings field is required" });
      return;
    }
    const filePath = path.join(globalDir, "settings.json");
    try {
      writeJsonFile(filePath, settings);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "WRITE_FAILED", message });
    }
  });

  // --- CLAUDE.md endpoints ---

  /**
   * GET /api/claude-settings/claude-md/project
   * Read project-level .claude/CLAUDE.md
   */
  router.get("/claude-md/project", (req: Request, res: Response) => {
    const filePath = path.join(resolveProjectRoot(req), ".claude", "CLAUDE.md");
    const content = readTextFile(filePath);
    res.json({
      exists: content !== null,
      path: filePath,
      content: content || "",
    });
  });

  /**
   * PUT /api/claude-settings/claude-md/project
   * Write project-level .claude/CLAUDE.md
   * Body: { content: string }
   */
  router.put("/claude-md/project", (req: Request, res: Response) => {
    const { content } = req.body;
    if (content === undefined || content === null) {
      res.status(400).json({ error: "MISSING_CONTENT", message: "content field is required" });
      return;
    }
    const filePath = path.join(resolveProjectRoot(req), ".claude", "CLAUDE.md");
    try {
      writeTextFile(filePath, content);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "WRITE_FAILED", message });
    }
  });

  /**
   * GET /api/claude-settings/claude-md/global
   * Read global ~/.claude/CLAUDE.md
   */
  router.get("/claude-md/global", (_req: Request, res: Response) => {
    const filePath = path.join(globalDir, "CLAUDE.md");
    const content = readTextFile(filePath);
    res.json({
      exists: content !== null,
      path: filePath,
      content: content || "",
    });
  });

  /**
   * PUT /api/claude-settings/claude-md/global
   * Write global ~/.claude/CLAUDE.md
   * Body: { content: string }
   */
  router.put("/claude-md/global", (req: Request, res: Response) => {
    const { content } = req.body;
    if (content === undefined || content === null) {
      res.status(400).json({ error: "MISSING_CONTENT", message: "content field is required" });
      return;
    }
    const filePath = path.join(globalDir, "CLAUDE.md");
    try {
      writeTextFile(filePath, content);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "WRITE_FAILED", message });
    }
  });

  return router;
}
