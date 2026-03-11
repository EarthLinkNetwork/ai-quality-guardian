/**
 * Claude Hooks Routes
 *
 * Provides dedicated CRUD API for hooks in .claude/settings.json
 * and script management for .claude/hooks/*.sh files at both
 * project and global (~/.claude) levels.
 *
 * Also provides inconsistency detection between settings.json hooks
 * and actual script files.
 *
 * IMPORTANT: Route ordering matters. More specific routes (scripts,
 * inconsistencies) must be registered BEFORE generic /:event routes
 * to avoid Express matching "scripts" as an event name.
 *
 * Follows the same patterns as claude-files.ts and claude-settings.ts.
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getGlobalClaudeDir(): string {
  return path.join(os.homedir(), ".claude");
}

function readJsonFile(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
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
 * Known Claude Code hook event types
 */
const KNOWN_HOOK_EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentStop",
] as const;

/**
 * A single hook command entry in settings.json
 */
interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

/**
 * The hooks section of settings.json
 */
type HooksConfig = Partial<Record<string, HookCommand[]>>;

/**
 * Validate a hook event name
 */
function isValidEventName(name: string): boolean {
  if (!name || name.length === 0 || name.length > 100) return false;
  // Allow known events plus custom PascalCase names
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * Validate a script filename: must be non-empty, no path traversal, .sh extension
 */
function isValidScriptFilename(name: string): boolean {
  if (!name || name.length === 0 || name.length > 200) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.sh$/.test(name);
}

export interface ClaudeHooksConfig {
  projectRoot: string;
  globalClaudeDir?: string;
}

export function createClaudeHooksRoutes(config: ClaudeHooksConfig): Router {
  const router = Router();
  const { projectRoot } = config;
  const globalDir = config.globalClaudeDir || getGlobalClaudeDir();

  /**
   * Resolve base .claude directory for a scope
   */
  function resolveClaudeDir(scope: string): string | null {
    if (scope === "global") return globalDir;
    if (scope === "project") return path.join(projectRoot, ".claude");
    return null;
  }

  /**
   * Read hooks from settings.json for a scope
   */
  function readHooks(scope: string): { hooks: HooksConfig; settingsPath: string; exists: boolean } {
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) return { hooks: {}, settingsPath: "", exists: false };
    const settingsPath = path.join(claudeDir, "settings.json");
    const data = readJsonFile(settingsPath) as Record<string, unknown> | null;
    return {
      hooks: (data?.hooks as HooksConfig) || {},
      settingsPath,
      exists: data !== null,
    };
  }

  /**
   * Write hooks back to settings.json for a scope
   * Preserves other settings, only replaces the hooks section
   */
  function writeHooks(scope: string, hooks: HooksConfig): { success: boolean; settingsPath: string; error?: string } {
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) return { success: false, settingsPath: "", error: "Invalid scope" };
    const settingsPath = path.join(claudeDir, "settings.json");
    try {
      const existing = (readJsonFile(settingsPath) as Record<string, unknown>) || {};
      // Clean up empty events
      const cleanedHooks: HooksConfig = {};
      for (const [key, cmds] of Object.entries(hooks)) {
        if (cmds && cmds.length > 0) {
          cleanedHooks[key] = cmds;
        }
      }
      if (Object.keys(cleanedHooks).length > 0) {
        existing.hooks = cleanedHooks;
      } else {
        delete existing.hooks;
      }
      writeJsonFile(settingsPath, existing);
      return { success: true, settingsPath };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, settingsPath, error: message };
    }
  }

  /**
   * List script files in .claude/hooks/ directory
   */
  function listScripts(scope: string): Array<{ name: string; path: string; size: number; executable: boolean }> {
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) return [];
    const hooksDir = path.join(claudeDir, "hooks");
    try {
      if (!fs.existsSync(hooksDir)) return [];
      const files = fs.readdirSync(hooksDir).filter(f => f.endsWith(".sh"));
      return files.map(f => {
        const filePath = path.join(hooksDir, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stat.size,
          executable: !!(stat.mode & 0o111),
        };
      });
    } catch {
      return [];
    }
  }

  // =========================================================================
  // IMPORTANT: Specific routes MUST come before generic /:scope/:event
  // =========================================================================

  // =========================================================================
  // Scripts CRUD: /api/claude-hooks/:scope/scripts
  // (Registered FIRST to avoid /:scope/:event matching "scripts")
  // =========================================================================

  /**
   * GET /api/claude-hooks/:scope/scripts
   * List all script files in .claude/hooks/
   */
  router.get("/:scope/scripts", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const scripts = listScripts(scope);
    const hooksDir = path.join(claudeDir, "hooks");
    res.json({ scope, hooksDir, scripts, scriptCount: scripts.length });
  });

  /**
   * GET /api/claude-hooks/:scope/scripts/:filename
   * Read a script file content
   */
  router.get("/:scope/scripts/:filename", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const filename = req.params.filename as string;
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    if (!isValidScriptFilename(filename)) {
      res.status(400).json({ error: "INVALID_FILENAME", message: "Invalid script filename. Must end with .sh" });
      return;
    }
    const filePath = path.join(claudeDir, "hooks", filename);
    const content = readTextFile(filePath);
    if (content === null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Script not found: " + filename });
      return;
    }
    let executable = false;
    try {
      const stat = fs.statSync(filePath);
      executable = !!(stat.mode & 0o111);
    } catch { /* ignore */ }
    res.json({
      scope,
      filename,
      path: filePath,
      content,
      executable,
    });
  });

  /**
   * PUT /api/claude-hooks/:scope/scripts/:filename
   * Create or update a script file
   * Body: { content: string, executable?: boolean }
   */
  router.put("/:scope/scripts/:filename", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const filename = req.params.filename as string;
    const { content, executable } = req.body;

    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    if (!isValidScriptFilename(filename)) {
      res.status(400).json({ error: "INVALID_FILENAME", message: "Invalid script filename. Must end with .sh" });
      return;
    }
    if (content === undefined || content === null) {
      res.status(400).json({ error: "MISSING_CONTENT", message: "content field is required" });
      return;
    }

    const filePath = path.join(claudeDir, "hooks", filename);
    try {
      writeTextFile(filePath, content);
      // Set executable permission if requested (default true for .sh files)
      if (executable !== false) {
        fs.chmodSync(filePath, 0o755);
      }
      res.json({ success: true, path: filePath });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "WRITE_FAILED", message });
    }
  });

  /**
   * DELETE /api/claude-hooks/:scope/scripts/:filename
   * Delete a script file
   */
  router.delete("/:scope/scripts/:filename", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const filename = req.params.filename as string;
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    if (!isValidScriptFilename(filename)) {
      res.status(400).json({ error: "INVALID_FILENAME", message: "Invalid script filename" });
      return;
    }
    const filePath = path.join(claudeDir, "hooks", filename);
    try {
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "NOT_FOUND", message: "Script not found: " + filename });
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
  // Inconsistency Detection: /api/claude-hooks/:scope/inconsistencies
  // (Registered BEFORE /:scope/:event)
  // =========================================================================

  /**
   * GET /api/claude-hooks/:scope/inconsistencies
   * Detect inconsistencies between settings.json hooks and script files
   */
  router.get("/:scope/inconsistencies", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }

    const { hooks } = readHooks(scope);
    const scripts = listScripts(scope);
    const scriptNames = new Set(scripts.map(s => s.name));

    const issues: Array<{ type: string; severity: "warning" | "error"; message: string; event?: string; script?: string }> = [];

    // Check 1: Commands that reference scripts not on disk
    for (const [event, commands] of Object.entries(hooks)) {
      if (!commands) continue;
      for (const cmd of commands) {
        if (!cmd.command) continue;
        // Extract script references from the command string
        // Common patterns: ".claude/hooks/script.sh", "bash .claude/hooks/script.sh"
        const scriptRefs = cmd.command.match(/\.claude\/hooks\/([a-zA-Z0-9._-]+\.sh)/g);
        if (scriptRefs) {
          for (const ref of scriptRefs) {
            const scriptName = ref.replace(".claude/hooks/", "");
            if (!scriptNames.has(scriptName)) {
              issues.push({
                type: "missing_script",
                severity: "error",
                message: `Hook "${event}" references script "${scriptName}" but file not found on disk`,
                event,
                script: scriptName,
              });
            }
          }
        }
      }
    }

    // Check 2: Script files not referenced by any hook
    const referencedScripts = new Set<string>();
    for (const commands of Object.values(hooks)) {
      if (!commands) continue;
      for (const cmd of commands) {
        if (!cmd.command) continue;
        const scriptRefs = cmd.command.match(/\.claude\/hooks\/([a-zA-Z0-9._-]+\.sh)/g);
        if (scriptRefs) {
          for (const ref of scriptRefs) {
            referencedScripts.add(ref.replace(".claude/hooks/", ""));
          }
        }
      }
    }
    for (const script of scripts) {
      if (!referencedScripts.has(script.name)) {
        issues.push({
          type: "orphan_script",
          severity: "warning",
          message: `Script "${script.name}" exists on disk but is not referenced by any hook`,
          script: script.name,
        });
      }
    }

    // Check 3: Non-executable scripts
    for (const script of scripts) {
      if (!script.executable) {
        issues.push({
          type: "not_executable",
          severity: "warning",
          message: `Script "${script.name}" is not executable (missing +x permission)`,
          script: script.name,
        });
      }
    }

    res.json({
      scope,
      issues,
      issueCount: issues.length,
      hasErrors: issues.some(i => i.severity === "error"),
      hasWarnings: issues.some(i => i.severity === "warning"),
    });
  });

  // =========================================================================
  // Hooks CRUD: /api/claude-hooks/:scope (and /:scope/:event)
  // (Generic routes LAST to avoid matching "scripts"/"inconsistencies")
  // =========================================================================

  /**
   * GET /api/claude-hooks/:scope
   * List all hook events and their commands for a scope
   */
  router.get("/:scope", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const { hooks, settingsPath, exists } = readHooks(scope);
    const events = Object.entries(hooks).map(([event, commands]) => ({
      event,
      commands: commands || [],
      commandCount: (commands || []).length,
    }));
    res.json({
      scope,
      settingsPath,
      settingsExists: exists,
      events,
      eventCount: events.length,
      knownEvents: [...KNOWN_HOOK_EVENTS],
    });
  });

  /**
   * GET /api/claude-hooks/:scope/:event
   * Read commands for a specific hook event
   */
  router.get("/:scope/:event", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const event = req.params.event as string;
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    const { hooks, settingsPath } = readHooks(scope);
    const commands = hooks[event] || [];
    res.json({
      scope,
      event,
      exists: !!hooks[event],
      commands,
      commandCount: commands.length,
      settingsPath,
    });
  });

  /**
   * PUT /api/claude-hooks/:scope/:event
   * Create or update commands for a hook event
   * Body: { commands: HookCommand[] }
   */
  router.put("/:scope/:event", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const event = req.params.event as string;
    const { commands } = req.body;

    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    if (!isValidEventName(event)) {
      res.status(400).json({ error: "INVALID_EVENT", message: "Invalid event name. Must be PascalCase (e.g. UserPromptSubmit)." });
      return;
    }
    if (!Array.isArray(commands)) {
      res.status(400).json({ error: "INVALID_COMMANDS", message: "commands must be an array" });
      return;
    }
    // Validate each command
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (!cmd || typeof cmd !== "object") {
        res.status(400).json({ error: "INVALID_COMMAND", message: `commands[${i}] must be an object` });
        return;
      }
      if (!cmd.command || typeof cmd.command !== "string") {
        res.status(400).json({ error: "INVALID_COMMAND", message: `commands[${i}].command is required and must be a string` });
        return;
      }
    }

    const { hooks } = readHooks(scope);
    hooks[event] = commands.map((cmd: HookCommand) => ({
      type: "command" as const,
      command: cmd.command,
      ...(cmd.timeout ? { timeout: cmd.timeout } : {}),
    }));

    const result = writeHooks(scope, hooks);
    if (!result.success) {
      res.status(500).json({ error: "WRITE_FAILED", message: result.error });
      return;
    }
    res.json({ success: true, event, commandCount: commands.length, settingsPath: result.settingsPath });
  });

  /**
   * DELETE /api/claude-hooks/:scope/:event
   * Delete all commands for a hook event
   */
  router.delete("/:scope/:event", (req: Request, res: Response) => {
    const scope = req.params.scope as string;
    const event = req.params.event as string;
    const claudeDir = resolveClaudeDir(scope);
    if (!claudeDir) {
      res.status(400).json({ error: "INVALID_SCOPE", message: "scope must be 'global' or 'project'" });
      return;
    }
    if (!isValidEventName(event)) {
      res.status(400).json({ error: "INVALID_EVENT", message: "Invalid event name" });
      return;
    }
    const { hooks } = readHooks(scope);
    if (!hooks[event]) {
      res.status(404).json({ error: "NOT_FOUND", message: "Hook event not found: " + event });
      return;
    }
    delete hooks[event];
    const result = writeHooks(scope, hooks);
    if (!result.success) {
      res.status(500).json({ error: "WRITE_FAILED", message: result.error });
      return;
    }
    res.json({ success: true, event, settingsPath: result.settingsPath });
  });

  return router;
}
