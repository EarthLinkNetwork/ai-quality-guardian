"use strict";
/**
 * Settings Routes
 *
 * Provides API endpoints for settings management including API keys
 * and project settings (LLM config, preferences, etc.)
 * Uses file-based persistence for API keys (STATE_DIR/api-keys.json).
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
exports.createSettingsRoutes = createSettingsRoutes;
const express_1 = require("express");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Mask an API key (show first 4 and last 4 characters)
 */
function maskApiKey(key) {
    if (!key || key.length < 10) {
        return "****";
    }
    return key.substring(0, 4) + "****" + key.substring(key.length - 4);
}
/**
 * Get API keys file path
 */
function getApiKeysFilePath(stateDir) {
    return path.join(stateDir, "api-keys.json");
}
/**
 * Load API keys from file
 */
function loadApiKeys(stateDir) {
    const filePath = getApiKeysFilePath(stateDir);
    if (!fs.existsSync(filePath)) {
        return {
            anthropic: null,
            openai: null,
        };
    }
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    }
    catch {
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
function saveApiKeys(stateDir, keys) {
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
const DEFAULT_PROJECT_SETTINGS = {
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
function getProjectSettingsFilePath(stateDir) {
    return path.join(stateDir, "project-settings.json");
}
/**
 * Load project settings from file
 */
function loadProjectSettings(stateDir) {
    const filePath = getProjectSettingsFilePath(stateDir);
    if (!fs.existsSync(filePath)) {
        return { ...DEFAULT_PROJECT_SETTINGS };
    }
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const loaded = JSON.parse(content);
        return {
            llm: loaded.llm || DEFAULT_PROJECT_SETTINGS.llm,
            preferences: loaded.preferences || DEFAULT_PROJECT_SETTINGS.preferences,
            updatedAt: loaded.updatedAt || new Date().toISOString(),
        };
    }
    catch {
        return { ...DEFAULT_PROJECT_SETTINGS };
    }
}
/**
 * Save project settings to file
 */
function saveProjectSettings(stateDir, settings) {
    const filePath = getProjectSettingsFilePath(stateDir);
    if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8");
}
/**
 * Create settings routes
 */
function createSettingsRoutes(stateDir) {
    const router = (0, express_1.Router)();
    /**
     * GET /api/settings
     * Get all settings including project settings
     */
    router.get("/", (_req, res) => {
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
    router.get("/project", (_req, res) => {
        const settings = loadProjectSettings(stateDir);
        res.json(settings);
    });
    /**
     * PUT /api/settings/project
     * Update project settings
     */
    router.put("/project", (req, res) => {
        const { llm, preferences } = req.body;
        const current = loadProjectSettings(stateDir);
        const updated = {
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
    router.get("/api-key/status", (_req, res) => {
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
    router.put("/api-key", (req, res) => {
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
        keys[provider] = {
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
    router.delete("/api-key", (req, res) => {
        const { provider } = req.body;
        if (!provider || !["anthropic", "openai"].includes(provider)) {
            res.status(400).json({
                error: "INVALID_PROVIDER",
                message: "provider must be 'anthropic' or 'openai'",
            });
            return;
        }
        const keys = loadApiKeys(stateDir);
        keys[provider] = null;
        saveApiKeys(stateDir, keys);
        res.json({
            success: true,
            provider,
            deleted: true,
        });
    });
    return router;
}
//# sourceMappingURL=settings.js.map