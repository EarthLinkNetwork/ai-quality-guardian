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
export type ProjectSettingsEvent = {
    type: 'SETTINGS_LOADED';
    projectHash: string;
} | {
    type: 'SETTINGS_UPDATED';
    changes: Partial<ProjectSettings>;
} | {
    type: 'SETTINGS_SAVED';
    projectHash: string;
} | {
    type: 'SETTINGS_RESET';
    projectHash: string;
} | {
    type: 'SETTINGS_MIGRATION';
    fromVersion: number;
    toVersion: number;
} | {
    type: 'SETTINGS_ERROR';
    error: string;
};
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
/**
 * Current schema version
 */
export declare const CURRENT_SETTINGS_VERSION = 1;
/**
 * Default project settings
 */
export declare const DEFAULT_PROJECT_SETTINGS: Omit<ProjectSettings, 'projectPath' | 'projectHash' | 'createdAt' | 'updatedAt' | 'lastAccessedAt'>;
/**
 * Default store configuration
 */
export declare const DEFAULT_STORE_CONFIG: ProjectSettingsStoreConfig;
/**
 * Settings limits (Section 9)
 */
export declare const SETTINGS_LIMITS: {
    MAX_PATH_LENGTH: number;
    MAX_FILE_SIZE: number;
    MAX_PROJECTS: number;
};
/**
 * Generate a hash for the project path
 *
 * Uses SHA-256 and takes first 16 characters of hex string
 */
export declare function generateProjectHash(projectPath: string): string;
/**
 * Get default storage directory
 */
export declare function getDefaultStorageDir(): string;
/**
 * Store for project-specific settings
 */
export declare class ProjectSettingsStore {
    private readonly storageDir;
    private readonly maxProjects;
    private readonly onEvent?;
    private settings;
    private initialized;
    constructor(storageDir?: string, onEvent?: ProjectSettingsEventCallback);
    /**
     * Initialize store for a project
     *
     * Loads existing settings or creates defaults
     */
    initialize(projectPath: string): Promise<ProjectSettings>;
    /**
     * Get current settings
     *
     * Must be initialized first
     */
    get(): ProjectSettings;
    /**
     * Update settings (partial update)
     */
    update(changes: Partial<ProjectSettings>): Promise<ProjectSettings>;
    /**
     * Set template selection
     *
     * Setting a template ID also enables it
     * Setting null clears and disables
     */
    setTemplate(templateId: string | null): Promise<void>;
    /**
     * Enable or disable template injection
     */
    enableTemplate(enabled: boolean): Promise<void>;
    /**
     * Set LLM provider and model
     */
    setLLM(provider: string, model: string): Promise<void>;
    /**
     * Set a preference value
     */
    setPreference<K extends keyof ProjectSettings['preferences']>(key: K, value: ProjectSettings['preferences'][K]): Promise<void>;
    /**
     * Save settings to file
     *
     * Also updates lastAccessedAt
     */
    save(): Promise<void>;
    /**
     * Reset to default settings
     *
     * Preserves projectPath and projectHash
     */
    reset(): Promise<ProjectSettings>;
    /**
     * Get path to settings file
     */
    private getSettingsPath;
    /**
     * Get path to index file
     */
    private getIndexPath;
    /**
     * Ensure storage directory exists
     */
    private ensureStorageDir;
    /**
     * Write settings to file
     */
    private writeSettings;
    /**
     * Update the projects index
     */
    private updateIndex;
    /**
     * Deep merge two objects
     */
    private deepMerge;
    /**
     * Emit an event
     */
    private emitEvent;
}
//# sourceMappingURL=project-settings-store.d.ts.map