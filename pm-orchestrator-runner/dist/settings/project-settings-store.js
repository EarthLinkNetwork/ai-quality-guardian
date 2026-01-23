"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectSettingsStore = exports.SETTINGS_LIMITS = exports.DEFAULT_STORE_CONFIG = exports.DEFAULT_PROJECT_SETTINGS = exports.CURRENT_SETTINGS_VERSION = void 0;
exports.generateProjectHash = generateProjectHash;
exports.getDefaultStorageDir = getDefaultStorageDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
// ============================================================================
// Constants (Section 2.2)
// ============================================================================
/**
 * Current schema version
 */
exports.CURRENT_SETTINGS_VERSION = 1;
/**
 * Default project settings
 */
exports.DEFAULT_PROJECT_SETTINGS = {
    version: exports.CURRENT_SETTINGS_VERSION,
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
exports.DEFAULT_STORE_CONFIG = {
    storageDir: path.join(os.homedir(), '.pm-orchestrator', 'projects'),
    maxProjects: 1000,
    debounceMs: 100,
};
/**
 * Settings limits (Section 9)
 */
exports.SETTINGS_LIMITS = {
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
function generateProjectHash(projectPath) {
    // Normalize: resolve to absolute path and lowercase
    const normalized = path.resolve(projectPath).toLowerCase();
    // SHA-256 hash, first 16 characters
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    return hash.substring(0, 16);
}
/**
 * Get default storage directory
 */
function getDefaultStorageDir() {
    return exports.DEFAULT_STORE_CONFIG.storageDir;
}
/**
 * Create ISO 8601 timestamp
 */
function createTimestamp() {
    return new Date().toISOString();
}
/**
 * Validate project path
 */
function validateProjectPath(projectPath) {
    if (!projectPath || typeof projectPath !== 'string') {
        return false;
    }
    if (projectPath.length > exports.SETTINGS_LIMITS.MAX_PATH_LENGTH) {
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
function migrateV0ToV1(settings, projectPath, projectHash) {
    const now = createTimestamp();
    return {
        version: 1,
        projectPath: settings.projectPath || projectPath,
        projectHash: settings.projectHash || projectHash,
        template: {
            selectedId: settings.template?.selectedId ?? null,
            enabled: settings.template?.enabled ?? false,
        },
        llm: {
            provider: settings.llm?.provider ?? null,
            model: settings.llm?.model ?? null,
            customEndpoint: settings.llm?.customEndpoint ?? null,
        },
        preferences: {
            autoChunking: settings.preferences?.autoChunking ?? true,
            costWarningEnabled: settings.preferences?.costWarningEnabled ?? true,
            costWarningThreshold: settings.preferences?.costWarningThreshold ?? 0.5,
        },
        createdAt: settings.createdAt || now,
        updatedAt: settings.updatedAt || now,
        lastAccessedAt: now,
    };
}
/**
 * Migrate settings to current version
 */
function migrateSettings(settings, projectPath, projectHash, onEvent) {
    const settingsObj = settings;
    const version = settingsObj?.version ?? 0;
    switch (version) {
        case 0:
            onEvent?.({ type: 'SETTINGS_MIGRATION', fromVersion: 0, toVersion: 1 });
            return migrateV0ToV1(settingsObj, projectPath, projectHash);
        case 1:
            return settings;
        default:
            // Unknown version - return defaults
            console.warn(`[WARN] Unknown settings version: ${version} - using defaults`);
            return createDefaultSettings(projectPath, projectHash);
    }
}
/**
 * Create default settings for a project
 */
function createDefaultSettings(projectPath, projectHash) {
    const now = createTimestamp();
    return {
        ...exports.DEFAULT_PROJECT_SETTINGS,
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
class ProjectSettingsStore {
    storageDir;
    maxProjects;
    onEvent;
    settings = null;
    initialized = false;
    constructor(storageDir, onEvent) {
        this.storageDir = storageDir || exports.DEFAULT_STORE_CONFIG.storageDir;
        this.maxProjects = exports.DEFAULT_STORE_CONFIG.maxProjects;
        this.onEvent = onEvent;
    }
    /**
     * Initialize store for a project
     *
     * Loads existing settings or creates defaults
     */
    async initialize(projectPath) {
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
        let settings;
        try {
            if (fs.existsSync(settingsPath)) {
                const content = fs.readFileSync(settingsPath, 'utf-8');
                const parsed = JSON.parse(content);
                settings = migrateSettings(parsed, resolvedPath, projectHash, this.onEvent);
            }
            else {
                settings = createDefaultSettings(resolvedPath, projectHash);
            }
        }
        catch {
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
    get() {
        if (!this.initialized || !this.settings) {
            throw new Error('ProjectSettingsStore not initialized. Call initialize() first.');
        }
        return this.settings;
    }
    /**
     * Update settings (partial update)
     */
    async update(changes) {
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
    async setTemplate(templateId) {
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
    async enableTemplate(enabled) {
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
    async setLLM(provider, model) {
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
    async setPreference(key, value) {
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
    async save() {
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
    async reset() {
        if (!this.initialized || !this.settings) {
            throw new Error('ProjectSettingsStore not initialized');
        }
        const { projectPath, projectHash } = this.settings;
        const now = createTimestamp();
        this.settings = {
            ...exports.DEFAULT_PROJECT_SETTINGS,
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
    getSettingsPath(projectHash) {
        return path.join(this.storageDir, `${projectHash}.json`);
    }
    /**
     * Get path to index file
     */
    getIndexPath() {
        return path.join(this.storageDir, 'index.json');
    }
    /**
     * Ensure storage directory exists
     */
    async ensureStorageDir() {
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
        }
    }
    /**
     * Write settings to file
     */
    async writeSettings() {
        if (!this.settings)
            return;
        const settingsPath = this.getSettingsPath(this.settings.projectHash);
        try {
            const content = JSON.stringify(this.settings, null, 2);
            // Check size limit
            if (content.length > exports.SETTINGS_LIMITS.MAX_FILE_SIZE) {
                console.warn('[WARN] Settings file exceeds size limit');
                this.emitEvent({ type: 'SETTINGS_ERROR', error: 'Settings file exceeds size limit' });
                return;
            }
            fs.writeFileSync(settingsPath, content, { mode: 0o600 });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[WARN] Failed to save settings: ${message}`);
            this.emitEvent({ type: 'SETTINGS_ERROR', error: `Failed to save settings: ${message}` });
            // In-memory state is preserved even if write fails
        }
    }
    /**
     * Update the projects index
     */
    async updateIndex(projectPath, projectHash) {
        const indexPath = this.getIndexPath();
        let index;
        try {
            if (fs.existsSync(indexPath)) {
                const content = fs.readFileSync(indexPath, 'utf-8');
                index = JSON.parse(content);
            }
            else {
                index = { version: 1, projects: [] };
            }
        }
        catch {
            // Corrupted index - start fresh
            console.warn('[WARN] Project index corrupted - creating new index');
            index = { version: 1, projects: [] };
        }
        // Update or add project entry
        const existingIndex = index.projects.findIndex(p => p.hash === projectHash);
        const entry = {
            hash: projectHash,
            path: projectPath,
            lastAccessedAt: createTimestamp(),
        };
        if (existingIndex >= 0) {
            index.projects[existingIndex] = entry;
        }
        else {
            index.projects.push(entry);
        }
        // Enforce max projects limit
        if (index.projects.length > this.maxProjects) {
            // Sort by lastAccessedAt and keep most recent
            index.projects.sort((a, b) => new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime());
            index.projects = index.projects.slice(0, this.maxProjects);
        }
        try {
            fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), { mode: 0o600 });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[WARN] Failed to update index: ${message}`);
        }
    }
    /**
     * Deep merge two objects
     */
    deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            const sourceValue = source[key];
            const targetValue = target[key];
            if (sourceValue &&
                typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                targetValue &&
                typeof targetValue === 'object' &&
                !Array.isArray(targetValue)) {
                // Recursive merge for nested objects
                result[key] = this.deepMerge(targetValue, sourceValue);
            }
            else if (sourceValue !== undefined) {
                result[key] = sourceValue;
            }
        }
        return result;
    }
    /**
     * Emit an event
     */
    emitEvent(event) {
        if (this.onEvent) {
            try {
                this.onEvent(event);
            }
            catch (error) {
                console.error('[ERROR] Event handler error:', error);
            }
        }
    }
}
exports.ProjectSettingsStore = ProjectSettingsStore;
//# sourceMappingURL=project-settings-store.js.map