/**
 * Settings Routes
 *
 * Provides API endpoints for settings management including API keys
 * and project settings (LLM config, preferences, etc.)
 * Uses file-based persistence for API keys (STATE_DIR/api-keys.json).
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

/**
 * Project Settings data structure
 */
interface ProjectSettingsData {
  llm: {
    provider: string | null;
    model: string | null;
  };
  preferences: {
    autoChunking: boolean;
    costWarningEnabled: boolean;
    costWarningThreshold: number;
  };
  updatedAt: string;
}

/**
 * API Key data structure
 */
interface ApiKeyData {
  key: string;
  configured: boolean;
  masked: string;
  savedAt: string;
}

/**
 * API Keys file structure
 */
interface ApiKeysFile {
  anthropic: ApiKeyData | null;
  openai: ApiKeyData | null;
}

/**
 * Mask an API key (show first 4 and last 4 characters)
 */
function maskApiKey(key: string): string {
  if (!key || key.length < 10) {
    return "****";
  }
  return key.substring(0, 4) + "****" + key.substring(key.length - 4);
}

/**
 * Get API keys file path
 */
function getApiKeysFilePath(stateDir: string): string {
  return path.join(stateDir, "api-keys.json");
}

/**
 * Load API keys from file
 */
function loadApiKeys(stateDir: string): ApiKeysFile {
  const filePath = getApiKeysFilePath(stateDir);

  if (!fs.existsSync(filePath)) {
    return {
      anthropic: null,
      openai: null,
    };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as ApiKeysFile;
  } catch {
    // If file is corrupted, return empty
    return {
      anthropic: null,
      openai: null,
    };
  }
}

/**
 * Save API keys to file
 */
function saveApiKeys(stateDir: string, keys: ApiKeysFile): void {
  const filePath = getApiKeysFilePath(stateDir);

  // Ensure directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), "utf-8");
}

/**
 * Default project settings
 */
const DEFAULT_PROJECT_SETTINGS: ProjectSettingsData = {
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  },
  preferences: {
    autoChunking: true,
    costWarningEnabled: true,
    costWarningThreshold: 0.5,
  },
  updatedAt: new Date().toISOString(),
};

/**
 * Get project settings file path
 */
function getProjectSettingsFilePath(stateDir: string): string {
  return path.join(stateDir, "project-settings.json");
}

/**
 * Load project settings from file
 */
function loadProjectSettings(stateDir: string): ProjectSettingsData {
  const filePath = getProjectSettingsFilePath(stateDir);

  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_PROJECT_SETTINGS };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const loaded = JSON.parse(content) as Partial<ProjectSettingsData>;
    return {
      llm: loaded.llm || DEFAULT_PROJECT_SETTINGS.llm,
      preferences: loaded.preferences || DEFAULT_PROJECT_SETTINGS.preferences,
      updatedAt: loaded.updatedAt || new Date().toISOString(),
    };
  } catch {
    return { ...DEFAULT_PROJECT_SETTINGS };
  }
}

/**
 * Save project settings to file
 */
function saveProjectSettings(stateDir: string, settings: ProjectSettingsData): void {
  const filePath = getProjectSettingsFilePath(stateDir);

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Create settings routes
 */
export function createSettingsRoutes(stateDir: string): Router {
  const router = Router();

  /**
   * GET /api/settings
   * Get all settings including project settings
   */
  router.get("/", (_req: Request, res: Response) => {
    const keys = loadApiKeys(stateDir);
    const projectSettings = loadProjectSettings(stateDir);

    res.json({
      settings: {
        api_key_configured: !!(keys.anthropic?.configured || keys.openai?.configured),
        anthropic_configured: !!keys.anthropic?.configured,
        openai_configured: !!keys.openai?.configured,
      },
      llm: projectSettings.llm,
      preferences: projectSettings.preferences,
    });
  });

  /**
   * GET /api/settings/project
   * Get project settings (LLM, preferences)
   */
  router.get("/project", (_req: Request, res: Response) => {
    const settings = loadProjectSettings(stateDir);
    res.json(settings);
  });

  /**
   * PUT /api/settings/project
   * Update project settings
   */
  router.put("/project", (req: Request, res: Response) => {
    const { llm, preferences } = req.body;
    const current = loadProjectSettings(stateDir);

    const updated: ProjectSettingsData = {
      llm: llm ? { ...current.llm, ...llm } : current.llm,
      preferences: preferences ? { ...current.preferences, ...preferences } : current.preferences,
      updatedAt: new Date().toISOString(),
    };

    saveProjectSettings(stateDir, updated);

    res.json({
      success: true,
      settings: updated,
    });
  });

  /**
   * GET /api/settings/api-key/status
   * Get API key status for all providers
   */
  router.get("/api-key/status", (_req: Request, res: Response) => {
    const keys = loadApiKeys(stateDir);

    res.json({
      anthropic: {
        configured: !!keys.anthropic?.configured,
        masked: keys.anthropic?.masked || null,
      },
      openai: {
        configured: !!keys.openai?.configured,
        masked: keys.openai?.masked || null,
      },
    });
  });

  /**
   * PUT /api/settings/api-key
   * Save an API key
   * Body: { provider: 'anthropic' | 'openai', api_key: string }
   */
  router.put("/api-key", (req: Request, res: Response) => {
    const { provider, api_key } = req.body;

    if (!provider || !["anthropic", "openai"].includes(provider)) {
      res.status(400).json({
        error: "INVALID_PROVIDER",
        message: "provider must be 'anthropic' or 'openai'",
      });
      return;
    }

    if (!api_key || typeof api_key !== "string" || api_key.trim() === "") {
      res.status(400).json({
        error: "INVALID_API_KEY",
        message: "api_key is required and must be a non-empty string",
      });
      return;
    }

    const keys = loadApiKeys(stateDir);
    const masked = maskApiKey(api_key);

    keys[provider as "anthropic" | "openai"] = {
      key: api_key,
      configured: true,
      masked,
      savedAt: new Date().toISOString(),
    };

    saveApiKeys(stateDir, keys);

    res.json({
      success: true,
      provider,
      masked,
    });
  });

  /**
   * DELETE /api/settings/api-key
   * Delete an API key
   * Body: { provider: 'anthropic' | 'openai' }
   */
  router.delete("/api-key", (req: Request, res: Response) => {
    const { provider } = req.body;

    if (!provider || !["anthropic", "openai"].includes(provider)) {
      res.status(400).json({
        error: "INVALID_PROVIDER",
        message: "provider must be 'anthropic' or 'openai'",
      });
      return;
    }

    const keys = loadApiKeys(stateDir);
    keys[provider as "anthropic" | "openai"] = null;
    saveApiKeys(stateDir, keys);

    res.json({
      success: true,
      provider,
      deleted: true,
    });
  });

  return router;
}
