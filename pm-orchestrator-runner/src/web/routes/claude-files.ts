/**
 * Claude Files Routes
 *
 * Provides CRUD API endpoints for .claude/commands/*.md and
 * .claude/agents/*.md + .claude/skills/*.md files at both
 * project and global (~/.claude) levels.
 *
 * Follows the same patterns as claude-settings.ts.
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getGlobalClaudeDir(): string {
  return path.join(os.homedir(), ".claude");
}

function readTextFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function writeTextFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * List .md files in a directory, returning name (without .md) and path
 */
function listMdFiles(dirPath: string): Array<{ name: string; path: string }> {
  try {
    if (!fs.existsSync(dirPath)) return [];
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".md"));
    return files.map(f => ({
      name: f.replace(/\.md$/, ""),
      path: path.join(dirPath, f),
    }));
  } catch {
    return [];
  }
}

/**
 * Validate a filename: must be non-empty, no path traversal, only safe chars
 */
function isValidFilename(name: string): boolean {
  if (!name || name.length === 0 || name.length > 200) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  // Allow alphanumeric, dash, underscore, dot (no leading dot)
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

export interface ClaudeFilesConfig {
  projectRoot: string;
  globalClaudeDir?: string;
}

export function createClaudeFilesRoutes(config: ClaudeFilesConfig): Router {
  const router = Router();
  const { projectRoot } = config;
  const globalDir = config.globalClaudeDir || getGlobalClaudeDir();

  /**
   * Resolve a directory path for a given scope and subdirectory.
   * When scope is "project" and a projectPath query param is provided,
   * use that path instead of the default projectRoot.
   */
  function resolveDir(scope: string, subDir: string, overrideProjectPath?: string): string | null {
    if (scope === "global") return path.join(globalDir, subDir);
    if (scope === "project") {
      const root = overrideProjectPath || projectRoot;
      return path.join(root, ".claude", subDir);
    }
    return null;
  }

  /**
   * Extract projectPath from query params (validated: must be absolute path)
   */
  function getProjectPathOverride(req: Request): string | undefined {
    const pp = req.query.projectPath as string | undefined;
    if (pp && path.isAbsolute(pp)) return pp;
    return undefined;
  }

  // =========================================================================
  // Commands CRUD: /api/claude-files/commands/:scope
  // =========================================================================

  /**
   * GET /api/claude-files/commands/:scope
   * List all commands for a scope (global or project)
   */
  router.get("/commands/:scope", (req: Request, res: Response) => {
    const dirPath = resolveDir(req.params.scope as string, "commands", getProjectPathOverride(req));
    if (!dirPath) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const files = listMdFiles(dirPath);
    res.json({ dirPath, files });
  });

  /**
   * GET /api/claude-files/commands/:scope/:name
   * Read a single command file
   */
  router.get("/commands/:scope/:name", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const name = req.params.name as string;
    const dirPath = resolveDir(scope, "commands", getProjectPathOverride(req));
    if (!dirPath) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const filePath = path.join(dirPath, name + ".md");
    const content = readTextFile(filePath);
    res.json({
      exists: content !== null,
      name,
      path: filePath,
      content: content || "",
    });
  });

  /**
   * PUT /api/claude-files/commands/:scope/:name
   * Create or update a command file
   * Body: { content: string }
   */
  router.put("/commands/:scope/:name", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const name = req.params.name as string;
    const { content } = req.body;
    if (!isValidFilename(name)) {
      res.status(400).json({ error: "INVALID_NAME", message: "Invalid filename. Use alphanumeric, dash, underscore only." });
      return;
    }
    if (content === undefined || content === null) {
      res.status(400).json({ error: "MISSING_CONTENT", message: "content field is required" });
      return;
    }
    const dirPath = resolveDir(scope, "commands", getProjectPathOverride(req));
    if (!dirPath) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const filePath = path.join(dirPath, name + ".md");
    try {
      writeTextFile(filePath, content);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "WRITE_FAILED", message });
    }
  });

  /**
   * DELETE /api/claude-files/commands/:scope/:name
   * Delete a command file
   */
  router.delete("/commands/:scope/:name", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const name = req.params.name as string;
    if (!isValidFilename(name)) {
      res.status(400).json({ error: "INVALID_NAME", message: "Invalid filename" });
      return;
    }
    const dirPath = resolveDir(scope, "commands", getProjectPathOverride(req));
    if (!dirPath) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const filePath = path.join(dirPath, name + ".md");
    try {
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "NOT_FOUND", message: "File not found: " + name + ".md" });
        return;
      }
      fs.unlinkSync(filePath);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "DELETE_FAILED", message });
    }
  });

  // =========================================================================
  // Agents CRUD: /api/claude-files/agents/:scope
  // (covers both .claude/agents/*.md and .claude/skills/*.md)
  // =========================================================================

  /**
   * GET /api/claude-files/agents/:scope
   * List all agents and skills for a scope
   */
  router.get("/agents/:scope", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const pp = getProjectPathOverride(req);
    const agentsDir = resolveDir(scope, "agents", pp);
    const skillsDir = resolveDir(scope, "skills", pp);
    if (!agentsDir || !skillsDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const agents = listMdFiles(agentsDir).map(f => ({ ...f, type: "agent" as const }));
    const skills = listMdFiles(skillsDir).map(f => ({ ...f, type: "skill" as const }));
    res.json({
      agentsDir,
      skillsDir,
      files: [...agents, ...skills],
    });
  });

  /**
   * GET /api/claude-files/agents/:scope/:type/:name
   * Read a single agent or skill file
   * :type must be "agent" or "skill"
   */
  router.get("/agents/:scope/:type/:name", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const type = req.params.type as string;
    const name = req.params.name as string;
    const subDir = type === "skill" ? "skills" : "agents";
    const dirPath = resolveDir(scope, subDir, getProjectPathOverride(req));
    if (!dirPath) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    if (type !== "agent" && type !== "skill") {
      res.status(400).json({ error: "INVALID_TYPE", message: "type must be 'agent' or 'skill'" });
      return;
    }
    const filePath = path.join(dirPath, name + ".md");
    const content = readTextFile(filePath);
    res.json({
      exists: content !== null,
      name,
      type,
      path: filePath,
      content: content || "",
    });
  });

  /**
   * PUT /api/claude-files/agents/:scope/:type/:name
   * Create or update an agent or skill file
   * Body: { content: string }
   */
  router.put("/agents/:scope/:type/:name", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const type = req.params.type as string;
    const name = req.params.name as string;
    const { content } = req.body;
    if (type !== "agent" && type !== "skill") {
      res.status(400).json({ error: "INVALID_TYPE", message: "type must be 'agent' or 'skill'" });
      return;
    }
    if (!isValidFilename(name)) {
      res.status(400).json({ error: "INVALID_NAME", message: "Invalid filename. Use alphanumeric, dash, underscore only." });
      return;
    }
    if (content === undefined || content === null) {
      res.status(400).json({ error: "MISSING_CONTENT", message: "content field is required" });
      return;
    }
    const subDir = type === "skill" ? "skills" : "agents";
    const dirPath = resolveDir(scope, subDir, getProjectPathOverride(req));
    if (!dirPath) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const filePath = path.join(dirPath, name + ".md");
    try {
      writeTextFile(filePath, content);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "WRITE_FAILED", message });
    }
  });

  /**
   * DELETE /api/claude-files/agents/:scope/:type/:name
   * Delete an agent or skill file
   */
  router.delete("/agents/:scope/:type/:name", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const type = req.params.type as string;
    const name = req.params.name as string;
    if (type !== "agent" && type !== "skill") {
      res.status(400).json({ error: "INVALID_TYPE", message: "type must be 'agent' or 'skill'" });
      return;
    }
    if (!isValidFilename(name)) {
      res.status(400).json({ error: "INVALID_NAME", message: "Invalid filename" });
      return;
    }
    const subDir = type === "skill" ? "skills" : "agents";
    const dirPath = resolveDir(scope, subDir, getProjectPathOverride(req));
    if (!dirPath) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const filePath = path.join(dirPath, name + ".md");
    try {
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "NOT_FOUND", message: "File not found: " + name + ".md" });
        return;
      }
      fs.unlinkSync(filePath);
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "DELETE_FAILED", message });
    }
  });

  return router;
}
