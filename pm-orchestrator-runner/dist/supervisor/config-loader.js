"use strict";
/**
 * Supervisor Config Loader
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-4, SUP-5
 *
 * Locations:
 * - Global: .claude/global-config.json
 * - Project: .claude/projects/{projectId}.json
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
exports.SupervisorConfigManager = void 0;
exports.loadGlobalConfig = loadGlobalConfig;
exports.saveGlobalConfig = saveGlobalConfig;
exports.loadProjectConfig = loadProjectConfig;
exports.saveProjectConfig = saveProjectConfig;
exports.mergeConfigs = mergeConfigs;
exports.getGlobalConfigPath = getGlobalConfigPath;
exports.getProjectConfigPath = getProjectConfigPath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
// =============================================================================
// Path Resolution
// =============================================================================
function getGlobalConfigPath(projectRoot) {
    return path.join(projectRoot, '.claude', 'global-config.json');
}
function getProjectConfigPath(projectRoot, projectId) {
    return path.join(projectRoot, '.claude', 'projects', `${projectId}.json`);
}
// =============================================================================
// Global Config (SUP-5)
// =============================================================================
function loadGlobalConfig(projectRoot) {
    const configPath = getGlobalConfigPath(projectRoot);
    if (!fs.existsSync(configPath)) {
        return { ...types_1.DEFAULT_GLOBAL_CONFIG };
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Merge with defaults
        return {
            global_input_template: parsed.global_input_template ?? types_1.DEFAULT_GLOBAL_CONFIG.global_input_template,
            global_output_template: parsed.global_output_template ?? types_1.DEFAULT_GLOBAL_CONFIG.global_output_template,
            supervisor_rules: {
                enabled: parsed.supervisor_rules?.enabled ?? types_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.enabled,
                timeout_default_ms: parsed.supervisor_rules?.timeout_default_ms ?? types_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.timeout_default_ms,
                max_retries: parsed.supervisor_rules?.max_retries ?? types_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.max_retries,
                fail_on_violation: parsed.supervisor_rules?.fail_on_violation ?? types_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.fail_on_violation,
            },
        };
    }
    catch (error) {
        console.error(`[Supervisor] Failed to load global config: ${error}`);
        return { ...types_1.DEFAULT_GLOBAL_CONFIG };
    }
}
function saveGlobalConfig(projectRoot, config) {
    const configPath = getGlobalConfigPath(projectRoot);
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
// =============================================================================
// Project Config (SUP-4)
// =============================================================================
function loadProjectConfig(projectRoot, projectId) {
    const configPath = getProjectConfigPath(projectRoot, projectId);
    if (!fs.existsSync(configPath)) {
        return { ...types_1.DEFAULT_PROJECT_CONFIG, projectId };
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Merge with defaults
        return {
            projectId: parsed.projectId ?? projectId,
            input_template: parsed.input_template ?? types_1.DEFAULT_PROJECT_CONFIG.input_template,
            output_template: parsed.output_template ?? types_1.DEFAULT_PROJECT_CONFIG.output_template,
            supervisor_rules: {
                timeout_profile: parsed.supervisor_rules?.timeout_profile ?? types_1.DEFAULT_PROJECT_CONFIG.supervisor_rules.timeout_profile,
                allow_raw_output: parsed.supervisor_rules?.allow_raw_output ?? types_1.DEFAULT_PROJECT_CONFIG.supervisor_rules.allow_raw_output,
                require_format_validation: parsed.supervisor_rules?.require_format_validation ?? types_1.DEFAULT_PROJECT_CONFIG.supervisor_rules.require_format_validation,
            },
        };
    }
    catch (error) {
        console.error(`[Supervisor] Failed to load project config for ${projectId}: ${error}`);
        return { ...types_1.DEFAULT_PROJECT_CONFIG, projectId };
    }
}
function saveProjectConfig(projectRoot, config) {
    const configPath = getProjectConfigPath(projectRoot, config.projectId);
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
// =============================================================================
// Merged Config
// =============================================================================
function mergeConfigs(global, project) {
    // Project timeout profile overrides global default
    const timeoutMs = types_1.TIMEOUT_PROFILES[project.supervisor_rules.timeout_profile]
        ?? global.supervisor_rules.timeout_default_ms;
    return {
        globalInputTemplate: global.global_input_template,
        globalOutputTemplate: global.global_output_template,
        projectInputTemplate: project.input_template,
        projectOutputTemplate: project.output_template,
        supervisorEnabled: global.supervisor_rules.enabled,
        timeoutMs,
        maxRetries: global.supervisor_rules.max_retries,
        failOnViolation: global.supervisor_rules.fail_on_violation,
        allowRawOutput: project.supervisor_rules.allow_raw_output,
        requireFormatValidation: project.supervisor_rules.require_format_validation,
    };
}
// =============================================================================
// Config Manager (Singleton Pattern)
// =============================================================================
class SupervisorConfigManager {
    projectRoot;
    globalConfigCache = null;
    projectConfigCache = new Map();
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
    }
    getGlobalConfig() {
        if (!this.globalConfigCache) {
            this.globalConfigCache = loadGlobalConfig(this.projectRoot);
        }
        return this.globalConfigCache;
    }
    getProjectConfig(projectId) {
        if (!this.projectConfigCache.has(projectId)) {
            const config = loadProjectConfig(this.projectRoot, projectId);
            this.projectConfigCache.set(projectId, config);
        }
        return this.projectConfigCache.get(projectId);
    }
    getMergedConfig(projectId) {
        const global = this.getGlobalConfig();
        const project = this.getProjectConfig(projectId);
        return mergeConfigs(global, project);
    }
    updateGlobalConfig(config) {
        saveGlobalConfig(this.projectRoot, config);
        this.globalConfigCache = config;
    }
    updateProjectConfig(config) {
        saveProjectConfig(this.projectRoot, config);
        this.projectConfigCache.set(config.projectId, config);
    }
    clearCache() {
        this.globalConfigCache = null;
        this.projectConfigCache.clear();
    }
}
exports.SupervisorConfigManager = SupervisorConfigManager;
//# sourceMappingURL=config-loader.js.map