"use strict";
/**
 * Global Configuration Manager
 *
 * Manages user-level global settings stored in ~/.pm-orchestrator-runner/config.json
 * This is NOT environment variables - it's a persistent config file.
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
exports.loadGlobalConfig = loadGlobalConfig;
exports.saveGlobalConfig = saveGlobalConfig;
exports.getApiKey = getApiKey;
exports.setApiKey = setApiKey;
exports.hasAnyApiKey = hasAnyApiKey;
exports.getDefaultProvider = getDefaultProvider;
exports.setDefaultProvider = setDefaultProvider;
exports.getConfigFilePath = getConfigFilePath;
exports.getConfigDirPath = getConfigDirPath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * Global config directory path
 */
const CONFIG_DIR = path.join(os.homedir(), '.pm-orchestrator-runner');
/**
 * Global config file path
 */
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
}
/**
 * Load global config
 * @returns Global config object (empty object if file doesn't exist)
 */
function loadGlobalConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
            return JSON.parse(content);
        }
    }
    catch (err) {
        console.error('Warning: Failed to load global config:', err.message);
    }
    return {};
}
/**
 * Save global config
 * @param config - Config object to save
 */
function saveGlobalConfig(config) {
    ensureConfigDir();
    // Write with restricted permissions (owner read/write only)
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
    });
}
/**
 * Get API key for a provider (environment variable OR config file)
 * Environment variables take precedence over config file.
 * @param provider - Provider name (openai, anthropic)
 * @returns API key or undefined
 */
function getApiKey(provider) {
    // Check environment variables first (higher priority)
    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
        return process.env.OPENAI_API_KEY;
    }
    else if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
        return process.env.ANTHROPIC_API_KEY;
    }
    // Then check config file
    const config = loadGlobalConfig();
    if (provider === 'openai') {
        return config.apiKeys?.openai;
    }
    else if (provider === 'anthropic') {
        return config.apiKeys?.anthropic;
    }
    return undefined;
}
/**
 * Set API key for a provider
 * @param provider - Provider name (openai, anthropic)
 * @param key - API key to set
 */
function setApiKey(provider, key) {
    const config = loadGlobalConfig();
    if (!config.apiKeys) {
        config.apiKeys = {};
    }
    if (provider === 'openai') {
        config.apiKeys.openai = key;
    }
    else if (provider === 'anthropic') {
        config.apiKeys.anthropic = key;
    }
    saveGlobalConfig(config);
}
/**
 * Check if any API key is configured (environment variable OR config file)
 * @returns true if at least one API key is set
 */
function hasAnyApiKey() {
    // Check environment variables first
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
        return true;
    }
    // Then check config file
    const config = loadGlobalConfig();
    return !!(config.apiKeys?.openai || config.apiKeys?.anthropic);
}
/**
 * Get default provider
 * @returns Default provider name or 'openai'
 */
function getDefaultProvider() {
    const config = loadGlobalConfig();
    return config.defaultProvider || 'openai';
}
/**
 * Set default provider
 * @param provider - Provider name
 */
function setDefaultProvider(provider) {
    const config = loadGlobalConfig();
    config.defaultProvider = provider;
    saveGlobalConfig(config);
}
/**
 * Get config file path (for display purposes)
 */
function getConfigFilePath() {
    return CONFIG_FILE;
}
/**
 * Get config directory path
 */
function getConfigDirPath() {
    return CONFIG_DIR;
}
//# sourceMappingURL=global-config.js.map