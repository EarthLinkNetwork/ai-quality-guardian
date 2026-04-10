/**
 * Repo Profile Routes
 *
 * Scans project directory to build a repoProfile:
 * - package.json (name, deps, scripts, type)
 * - tsconfig.json presence + key options
 * - eslint / prettier configs
 * - test framework detection
 * - CI config detection (.github/workflows, etc.)
 * - Directory structure summary
 *
 * GET /api/repo/profile
 */

import { Router, Request, Response } from "express";
import * as path from "path";
import * as fs from "fs/promises";

export interface RepoProfile {
  name: string;
  type: string; // "node" | "python" | "unknown"
  language: string; // "typescript" | "javascript" | "python" | "unknown"
  packageManager: string; // "npm" | "yarn" | "pnpm" | "bun" | "unknown"
  testFramework: string; // "vitest" | "jest" | "mocha" | "playwright" | "unknown"
  hasTypeScript: boolean;
  hasEslint: boolean;
  hasPrettier: boolean;
  hasCI: boolean;
  ciProvider: string; // "github-actions" | "none"
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
  dirs: string[];
  detectedAt: string;
  /** Existing .claude/skills/*.md file names (for AI Generate context) */
  claudeSkills: string[];
  /** Existing .claude/agents/*.md file names */
  claudeAgents: string[];
  /** Existing .claude/commands/*.md file names */
  claudeCommands: string[];
  /** Existing .claude/hooks/*.sh file names */
  claudeHooks: string[];
}

export interface RepoProfileRoutesConfig {
  projectRoot: string;
}

export function createRepoProfileRoutes(
  config: RepoProfileRoutesConfig
): Router {
  const router = Router();
  const { projectRoot } = config;

  // GET /api/repo/profile
  router.get("/profile", async (_req: Request, res: Response) => {
    try {
      const profile = await scanRepoProfile(projectRoot);
      return res.json(profile);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to scan repo";
      return res.status(500).json({ error: "SCAN_ERROR", message });
    }
  });

  return router;
}

async function scanRepoProfile(projectRoot: string): Promise<RepoProfile> {
  const profile: RepoProfile = {
    name: path.basename(projectRoot),
    type: "unknown",
    language: "unknown",
    packageManager: "unknown",
    testFramework: "unknown",
    hasTypeScript: false,
    hasEslint: false,
    hasPrettier: false,
    hasCI: false,
    ciProvider: "none",
    scripts: {},
    dependencies: [],
    devDependencies: [],
    dirs: [],
    detectedAt: new Date().toISOString(),
    claudeSkills: [],
    claudeAgents: [],
    claudeCommands: [],
    claudeHooks: [],
  };

  // Read package.json
  const pkgJson = await readJsonSafe(
    path.join(projectRoot, "package.json")
  );
  if (pkgJson) {
    profile.type = "node";
    profile.name = (pkgJson.name as string) || profile.name;
    profile.scripts = (pkgJson.scripts as Record<string, string>) || {};
    profile.dependencies = Object.keys(pkgJson.dependencies || {});
    profile.devDependencies = Object.keys(pkgJson.devDependencies || {});

    const allDeps = [...profile.dependencies, ...profile.devDependencies];

    // Language detection
    if (allDeps.includes("typescript") || (await fileExists(path.join(projectRoot, "tsconfig.json")))) {
      profile.language = "typescript";
      profile.hasTypeScript = true;
    } else {
      profile.language = "javascript";
    }

    // Package manager detection
    if (await fileExists(path.join(projectRoot, "bun.lockb"))) {
      profile.packageManager = "bun";
    } else if (await fileExists(path.join(projectRoot, "pnpm-lock.yaml"))) {
      profile.packageManager = "pnpm";
    } else if (await fileExists(path.join(projectRoot, "yarn.lock"))) {
      profile.packageManager = "yarn";
    } else if (await fileExists(path.join(projectRoot, "package-lock.json"))) {
      profile.packageManager = "npm";
    }

    // Test framework detection
    if (allDeps.includes("vitest")) {
      profile.testFramework = "vitest";
    } else if (allDeps.includes("jest")) {
      profile.testFramework = "jest";
    } else if (allDeps.includes("mocha")) {
      profile.testFramework = "mocha";
    } else if (allDeps.includes("@playwright/test")) {
      profile.testFramework = "playwright";
    }

    // ESLint detection
    profile.hasEslint =
      allDeps.includes("eslint") ||
      (await fileExists(path.join(projectRoot, ".eslintrc.json"))) ||
      (await fileExists(path.join(projectRoot, ".eslintrc.js"))) ||
      (await fileExists(path.join(projectRoot, "eslint.config.js"))) ||
      (await fileExists(path.join(projectRoot, "eslint.config.mjs")));

    // Prettier detection
    profile.hasPrettier =
      allDeps.includes("prettier") ||
      (await fileExists(path.join(projectRoot, ".prettierrc"))) ||
      (await fileExists(path.join(projectRoot, ".prettierrc.json")));
  } else {
    // Check for Python
    if (
      (await fileExists(path.join(projectRoot, "pyproject.toml"))) ||
      (await fileExists(path.join(projectRoot, "setup.py"))) ||
      (await fileExists(path.join(projectRoot, "requirements.txt")))
    ) {
      profile.type = "python";
      profile.language = "python";
    }
  }

  // CI detection
  if (await fileExists(path.join(projectRoot, ".github", "workflows"))) {
    profile.hasCI = true;
    profile.ciProvider = "github-actions";
  }

  // Directory structure (top-level only, max 30 entries)
  try {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    profile.dirs = entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith(".") &&
          e.name !== "node_modules" &&
          e.name !== "dist" &&
          e.name !== "build" &&
          e.name !== "__pycache__"
      )
      .map((e) => e.name)
      .slice(0, 30);
  } catch {
    /* ignore */
  }

  // Scan .claude/ subdirectories for existing Claude Code configurations.
  // This context helps AI Generate avoid duplicates and understand existing setup.
  const scanClaudeSubdir = async (subDir: string): Promise<string[]> => {
    try {
      const dirPath = path.join(projectRoot, ".claude", subDir);
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      return [];
    }
  };
  [profile.claudeSkills, profile.claudeAgents, profile.claudeCommands, profile.claudeHooks] =
    await Promise.all([
      scanClaudeSubdir("skills"),
      scanClaudeSubdir("agents"),
      scanClaudeSubdir("commands"),
      scanClaudeSubdir("hooks"),
    ]);

  return profile;
}

async function readJsonSafe(
  filePath: string
): Promise<Record<string, unknown> | null> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
