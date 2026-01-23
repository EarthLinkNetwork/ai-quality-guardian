/**
 * Project Settings Store
 *
 * Per spec 33_PROJECT_SETTINGS_PERSISTENCE.md
 *
 * Provides project-specific settings persistence including:
 * - Template selection and enabled state
 * - LLM provider and model selection
 * - User preferences
 * - Automatic restoration on startup
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

// ============================================================================
// Types and Interfaces (Section 2.1)
// ============================================================================

/**
 * Project Settings interface
 */
export interface ProjectSettings {
  version: number;
  projectPath: string;
  projectHash: string;

  template: {
    selectedId: string | null;
    enabled: boolean;
  };

  llm: {
    provider: string | null;
    model: string | null;
    customEndpoint: string | null;
  };

  preferences: {
    autoChunking: boolean;
    costWarningEnabled: boolean;
    costWarningThreshold: number;
  };

  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
}

/**
 * Index entry for tracking projects
 */
export interface ProjectIndexEntry {
  hash: string;
  path: string;
  lastAccessedAt: string;
}

/**
 * Projects index file structure
 */
export interface ProjectIndex {
  version: number;
  projects: ProjectIndexEntry[];
}

/**
 * Event types for project settings store
 */
export type ProjectSettingsEvent =
  | { type: 'SETTINGS_LOADED'; projectHash: string }
  | { type: 'SETTINGS_UPDATED'; changes: Partial<ProjectSettings> }
  | { type: 'SETTINGS_SAVED'; projectHash: string }
  | { type: 'SETTINGS_RESET'; projectHash: string }
  | { type: 'SETTINGS_MIGRATION'; fromVersion: number; toVersion: number }
  | { type: 'SETTINGS_ERROR'; error: string };

/**
 * Callback for settings events
 */
export type ProjectSettingsEventCallback = (event: ProjectSettingsEvent) => void;

/**
 * Configuration for ProjectSettingsStore
 */
export interface ProjectSettingsStoreConfig {
  storageDir: string;
  maxProjects: number;
  debounceMs: number;
}

// ============================================================================
// Constants (Section 2.2)
// ============================================================================

/**
 * Current schema version
 */
export const CURRENT_SETTINGS_VERSION = 1;

/**
 * Default project settings
 */
export const DEFAULT_PROJECT_SETTINGS: Omit<
  ProjectSettings,
  'projectPath' | 'projectHash' | 'createdAt' | 'updatedAt' | 'lastAccessedAt'
> = {
  version: CURRENT_SETTINGS_VERSION,
  template: {
    selectedId: null,
    enabled: false,
  },
  llm: {
    provider: null,
    model: null,
    customEndpoint: null,
  },
  preferences: {
    autoChunking: true,
    costWarningEnabled: true,
    costWarningThreshold: 0.5,
  },
};

/**
 * Default store configuration
 */
export const DEFAULT_STORE_CONFIG: ProjectSettingsStoreConfig = {
  storageDir: path.join(os.homedir(), '.pm-orchestrator', 'projects'),
  maxProjects: 1000,
  debounceMs: 100,
};

/**
 * Settings limits (Section 9)
 */
export const SETTINGS_LIMITS = {
  MAX_PATH_LENGTH: 4096,
  MAX_FILE_SIZE: 64 * 1024, // 64KB
  MAX_PROJECTS: 1000,
};

// ============================================================================
// Helper Functions (Section 3.2)
// ============================================================================

/**
 * Generate a hash for the project path
 *
 * Uses SHA-256 and takes first 16 characters of hex string
 */
export function generateProjectHash(projectPath: string): string {
  // Normalize: resolve to absolute path and lowercase
  const normalized = path.resolve(projectPath).toLowerCase();

  // SHA-256 hash, first 16 characters
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Get default storage directory
 */
export function getDefaultStorageDir(): string {
  return DEFAULT_STORE_CONFIG.storageDir;
}

/**
 * Create ISO 8601 timestamp
 */
function createTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate project path
 */
function validateProjectPath(projectPath: string): boolean {
  if (!projectPath || typeof projectPath !== 'string') {
    return false;
  }
  if (projectPath.length > SETTINGS_LIMITS.MAX_PATH_LENGTH) {
    return false;
  }
  return true;
}

// ============================================================================
// Migration Functions (Section 7.3)
// ============================================================================

/**
 * Migrate settings from v0 to v1
 */
function migrateV0ToV1(
  settings: Record<string, unknown>,
  projectPath: string,
  projectHash: string
): ProjectSettings {
  const now = createTimestamp();

  return {
    version: 1,
    projectPath: (settings.projectPath as string) || projectPath,
    projectHash: (settings.projectHash as string) || projectHash,
    template: {
      selectedId: (settings.template as Record<string, unknown>)?.selectedId as string | null ?? null,
      enabled: (settings.template as Record<string, unknown>)?.enabled as boolean ?? false,
    },
    llm: {
      provider: (settings.llm as Record<string, unknown>)?.provider as string | null ?? null,
      model: (settings.llm as Record<string, unknown>)?.model as string | null ?? null,
      customEndpoint: (settings.llm as Record<string, unknown>)?.customEndpoint as string | null ?? null,
    },
    preferences: {
      autoChunking: (settings.preferences as Record<string, unknown>)?.autoChunking as boolean ?? true,
      costWarningEnabled: (settings.preferences as Record<string, unknown>)?.costWarningEnabled as boolean ?? true,
      costWarningThreshold: (settings.preferences as Record<string, unknown>)?.costWarningThreshold as number ?? 0.5,
    },
    createdAt: (settings.createdAt as string) || now,
    updatedAt: (settings.updatedAt as string) || now,
    lastAccessedAt: now,
  };
}

/**
 * Migrate settings to current version
 */
function migrateSettings(
  settings: unknown,
  projectPath: string,
  projectHash: string,
  onEvent?: ProjectSettingsEventCallback
): ProjectSettings {
  const settingsObj = settings as Record<string, unknown>;
  const version = (settingsObj?.version as number) ?? 0;

  switch (version) {
    case 0:
      onEvent?.({ type: 'SETTINGS_MIGRATION', fromVersion: 0, toVersion: 1 });
      return migrateV0ToV1(settingsObj, projectPath, projectHash);
    case 1:
      return settings as ProjectSettings;
    default:
      // Unknown version - return defaults
      console.warn(`[WARN] Unknown settings version: ${version} - using defaults`);
      return createDefaultSettings(projectPath, projectHash);
  }
}

/**
 * Create default settings for a project
 */
function createDefaultSettings(projectPath: string, projectHash: string): ProjectSettings {
  const now = createTimestamp();

  return {
    ...DEFAULT_PROJECT_SETTINGS,
    projectPath: path.resolve(projectPath),
    projectHash,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  };
}

// ============================================================================
// ProjectSettingsStore Class (Section 5.1)
// ============================================================================

/**
 * Store for project-specific settings
 */
export class ProjectSettingsStore {
  private readonly storageDir: string;
  private readonly maxProjects: number;
  private readonly onEvent?: ProjectSettingsEventCallback;

  private settings: ProjectSettings | null = null;
  private initialized = false;

  constructor(storageDir?: string, onEvent?: ProjectSettingsEventCallback) {
    this.storageDir = storageDir || DEFAULT_STORE_CONFIG.storageDir;
    this.maxProjects = DEFAULT_STORE_CONFIG.maxProjects;
    this.onEvent = onEvent;
  }

  /**
   * Initialize store for a project
   *
   * Loads existing settings or creates defaults
   */
  async initialize(projectPath: string): Promise<ProjectSettings> {
    if (!validateProjectPath(projectPath)) {
      const error = `Invalid project path: ${projectPath}`;
      this.emitEvent({ type: 'SETTINGS_ERROR', error });
      throw new Error(error);
    }

    const resolvedPath = path.resolve(projectPath);
    const projectHash = generateProjectHash(resolvedPath);

    // Ensure storage directory exists
    await this.ensureStorageDir();

    // Try to load existing settings
    const settingsPath = this.getSettingsPath(projectHash);
    let settings: ProjectSettings;

    try {
      if (fs.existsSync(settingsPath)) {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const parsed = JSON.parse(content);
        settings = migrateSettings(parsed, resolvedPath, projectHash, this.onEvent);
      } else {
        settings = createDefaultSettings(resolvedPath, projectHash);
      }
    } catch {
      // Corrupted file - use defaults
      console.warn(`[WARN] Project settings corrupted: ${projectHash}.json - using defaults`);
      this.emitEvent({ type: 'SETTINGS_ERROR', error: `Corrupted settings file: ${settingsPath}` });
      settings = createDefaultSettings(resolvedPath, projectHash);
    }

    // Update lastAccessedAt
    settings.lastAccessedAt = createTimestamp();

    // Save settings
    this.settings = settings;
    await this.writeSettings();

    // Update index
    await this.updateIndex(resolvedPath, projectHash);

    this.initialized = true;
    this.emitEvent({ type: 'SETTINGS_LOADED', projectHash });

    return settings;
  }

  /**
   * Get current settings
   *
   * Must be initialized first
   */
  get(): ProjectSettings {
    if (!this.initialized || !this.settings) {
      throw new Error('ProjectSettingsStore not initialized. Call initialize() first.');
    }
    return this.settings;
  }

  /**
   * Update settings (partial update)
   */
  async update(changes: Partial<ProjectSettings>): Promise<ProjectSettings> {
    if (!this.initialized || !this.settings) {
      throw new Error('ProjectSettingsStore not initialized. Call initialize() first.');
    }

    // Deep merge changes
    this.settings = this.deepMerge(this.settings, changes);
    this.settings.updatedAt = createTimestamp();

    await this.writeSettings();

    this.emitEvent({ type: 'SETTINGS_UPDATED', changes });

    return this.settings;
  }

  /**
   * Set template selection
   *
   * Setting a template ID also enables it
   * Setting null clears and disables
   */
  async setTemplate(templateId: string | null): Promise<void> {
    await this.update({
      template: {
        selectedId: templateId,
        enabled: templateId !== null,
      },
    });
  }

  /**
   * Enable or disable template injection
   */
  async enableTemplate(enabled: boolean): Promise<void> {
    if (!this.settings) {
      throw new Error('ProjectSettingsStore not initialized');
    }

    await this.update({
      template: {
        selectedId: this.settings.template.selectedId,
        enabled,
      },
    });
  }

  /**
   * Set LLM provider and model
   */
  async setLLM(provider: string, model: string): Promise<void> {
    if (!this.settings) {
      throw new Error('ProjectSettingsStore not initialized');
    }

    await this.update({
      llm: {
        provider,
        model,
        customEndpoint: this.settings.llm.customEndpoint,
      },
    });
  }

  /**
   * Set a preference value
   */
  async setPreference<K extends keyof ProjectSettings['preferences']>(
    key: K,
    value: ProjectSettings['preferences'][K]
  ): Promise<void> {
    if (!this.settings) {
      throw new Error('ProjectSettingsStore not initialized');
    }

    await this.update({
      preferences: {
        ...this.settings.preferences,
        [key]: value,
      },
    });
  }

  /**
   * Save settings to file
   *
   * Also updates lastAccessedAt
   */
  async save(): Promise<void> {
    if (!this.initialized || !this.settings) {
      throw new Error('ProjectSettingsStore not initialized');
    }

    this.settings.lastAccessedAt = createTimestamp();
    await this.writeSettings();

    this.emitEvent({ type: 'SETTINGS_SAVED', projectHash: this.settings.projectHash });
  }

  /**
   * Reset to default settings
   *
   * Preserves projectPath and projectHash
   */
  async reset(): Promise<ProjectSettings> {
    if (!this.initialized || !this.settings) {
      throw new Error('ProjectSettingsStore not initialized');
    }

    const { projectPath, projectHash } = this.settings;
    const now = createTimestamp();

    this.settings = {
      ...DEFAULT_PROJECT_SETTINGS,
      projectPath,
      projectHash,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };

    await this.writeSettings();

    this.emitEvent({ type: 'SETTINGS_RESET', projectHash });

    return this.settings;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get path to settings file
   */
  private getSettingsPath(projectHash: string): string {
    return path.join(this.storageDir, `${projectHash}.json`);
  }

  /**
   * Get path to index file
   */
  private getIndexPath(): string {
    return path.join(this.storageDir, 'index.json');
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Write settings to file
   */
  private async writeSettings(): Promise<void> {
    if (!this.settings) return;

    const settingsPath = this.getSettingsPath(this.settings.projectHash);

    try {
      const content = JSON.stringify(this.settings, null, 2);

      // Check size limit
      if (content.length > SETTINGS_LIMITS.MAX_FILE_SIZE) {
        console.warn('[WARN] Settings file exceeds size limit');
        this.emitEvent({ type: 'SETTINGS_ERROR', error: 'Settings file exceeds size limit' });
        return;
      }

      fs.writeFileSync(settingsPath, content, { mode: 0o600 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[WARN] Failed to save settings: ${message}`);
      this.emitEvent({ type: 'SETTINGS_ERROR', error: `Failed to save settings: ${message}` });
      // In-memory state is preserved even if write fails
    }
  }

  /**
   * Update the projects index
   */
  private async updateIndex(projectPath: string, projectHash: string): Promise<void> {
    const indexPath = this.getIndexPath();
    let index: ProjectIndex;

    try {
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf-8');
        index = JSON.parse(content);
      } else {
        index = { version: 1, projects: [] };
      }
    } catch {
      // Corrupted index - start fresh
      console.warn('[WARN] Project index corrupted - creating new index');
      index = { version: 1, projects: [] };
    }

    // Update or add project entry
    const existingIndex = index.projects.findIndex(p => p.hash === projectHash);
    const entry: ProjectIndexEntry = {
      hash: projectHash,
      path: projectPath,
      lastAccessedAt: createTimestamp(),
    };

    if (existingIndex >= 0) {
      index.projects[existingIndex] = entry;
    } else {
      index.projects.push(entry);
    }

    // Enforce max projects limit
    if (index.projects.length > this.maxProjects) {
      // Sort by lastAccessedAt and keep most recent
      index.projects.sort((a, b) =>
        new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
      );
      index.projects = index.projects.slice(0, this.maxProjects);
    }

    try {
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), { mode: 0o600 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[WARN] Failed to update index: ${message}`);
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T extends object>(target: T, source: Partial<T>): T {
    const result = { ...target } as T;

    for (const key of Object.keys(source) as Array<keyof T>) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursive merge for nested objects
        (result as Record<string, unknown>)[key as string] = this.deepMerge(
          targetValue as object,
          sourceValue as Partial<typeof targetValue>
        );
      } else if (sourceValue !== undefined) {
        (result as Record<string, unknown>)[key as string] = sourceValue;
      }
    }

    return result;
  }

  /**
   * Emit an event
   */
  private emitEvent(event: ProjectSettingsEvent): void {
    if (this.onEvent) {
      try {
        this.onEvent(event);
      } catch (error) {
        console.error('[ERROR] Event handler error:', error);
      }
    }
  }
}
