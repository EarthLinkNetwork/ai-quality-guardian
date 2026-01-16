"use strict";
/**
 * Configuration Manager
 * Based on 04_COMPONENTS.md L52-82
 *
 * Responsible for:
 * - Loading and validating project configuration
 * - Enforcing configuration schema
 * - Applying default values
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
exports.ConfigurationManager = exports.ConfigurationError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const error_codes_1 = require("../errors/error-codes");
/**
 * Configuration error
 */
class ConfigurationError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'ConfigurationError';
        this.code = code;
        this.details = details;
    }
}
exports.ConfigurationError = ConfigurationError;
/**
 * Default configuration values
 */
const DEFAULTS = {
    task_limits: {
        files: 5,
        tests: 10,
        seconds: 300,
    },
    parallel_limits: {
        subagents: 9,
        executors: 4,
    },
    timeouts: {
        deadlock_timeout_seconds: 60,
        operation_timeout_seconds: 120,
    },
    evidence_settings: {
        retention_days: 30,
        compression_enabled: true,
    },
};
/**
 * Validation ranges
 */
const RANGES = {
    task_limits: {
        files: { min: 1, max: 20 },
        tests: { min: 1, max: 50 },
        seconds: { min: 30, max: 900 },
    },
    parallel_limits: {
        subagents: { min: 1, max: 9 },
        executors: { min: 1, max: 4 },
    },
};
/**
 * Configuration Manager class
 */
class ConfigurationManager {
    /**
     * Load configuration from project path
     * @throws ConfigurationError if configuration is invalid
     */
    loadConfiguration(projectPath) {
        // Validate project path exists
        if (!fs.existsSync(projectPath)) {
            throw new ConfigurationError(error_codes_1.ErrorCode.E102_INVALID_PROJECT_PATH, `Project path does not exist: ${projectPath}`, { projectPath });
        }
        // Check for .claude directory
        const claudeDir = path.join(projectPath, '.claude');
        if (!fs.existsSync(claudeDir)) {
            throw new ConfigurationError(error_codes_1.ErrorCode.E101_MISSING_CLAUDE_DIRECTORY, `Missing .claude directory in project path: ${projectPath}`, { projectPath, expectedPath: claudeDir });
        }
        // Check required files and directories
        this.validateRequiredStructure(claudeDir);
        // Load and parse settings.json
        const settingsPath = path.join(claudeDir, 'settings.json');
        const rawSettings = this.loadSettingsJson(settingsPath);
        // Validate and apply configuration
        const config = this.buildConfiguration(rawSettings, projectPath, claudeDir);
        return config;
    }
    /**
     * Validate required project structure
     */
    validateRequiredStructure(claudeDir) {
        const requiredFiles = ['CLAUDE.md', 'settings.json'];
        const requiredDirs = ['agents', 'rules'];
        for (const file of requiredFiles) {
            const filePath = path.join(claudeDir, file);
            if (!fs.existsSync(filePath)) {
                throw new ConfigurationError(error_codes_1.ErrorCode.E103_CONFIGURATION_FILE_MISSING, `Missing required file: ${file} in .claude directory`, { missingFile: file, claudeDir });
            }
        }
        for (const dir of requiredDirs) {
            const dirPath = path.join(claudeDir, dir);
            if (!fs.existsSync(dirPath)) {
                throw new ConfigurationError(error_codes_1.ErrorCode.E103_CONFIGURATION_FILE_MISSING, `Missing required directory: ${dir} in .claude directory`, { missingDir: dir, claudeDir });
            }
        }
    }
    /**
     * Load and parse settings.json
     */
    loadSettingsJson(settingsPath) {
        try {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                throw new ConfigurationError(error_codes_1.ErrorCode.E105_CRITICAL_CONFIGURATION_CORRUPTION, `Malformed JSON in settings.json: ${error.message}`, { settingsPath, parseError: error.message });
            }
            throw new ConfigurationError(error_codes_1.ErrorCode.E103_CONFIGURATION_FILE_MISSING, `Failed to read settings.json: ${error.message}`, { settingsPath });
        }
    }
    /**
     * Build and validate configuration
     */
    buildConfiguration(rawSettings, projectPath, claudeDir) {
        // Apply defaults and merge with provided settings
        const taskLimits = {
            files: rawSettings.task_limits?.files ?? DEFAULTS.task_limits.files,
            tests: rawSettings.task_limits?.tests ?? DEFAULTS.task_limits.tests,
            seconds: rawSettings.task_limits?.seconds ?? DEFAULTS.task_limits.seconds,
        };
        const parallelLimits = {
            subagents: rawSettings.parallel_limits?.subagents ?? DEFAULTS.parallel_limits.subagents,
            executors: rawSettings.parallel_limits?.executors ?? DEFAULTS.parallel_limits.executors,
        };
        const timeouts = {
            deadlock_timeout_seconds: rawSettings.timeouts?.deadlock_timeout_seconds ??
                DEFAULTS.timeouts.deadlock_timeout_seconds,
            operation_timeout_seconds: rawSettings.timeouts?.operation_timeout_seconds ??
                DEFAULTS.timeouts.operation_timeout_seconds,
        };
        const evidenceSettings = {
            retention_days: rawSettings.evidence_settings?.retention_days ??
                DEFAULTS.evidence_settings.retention_days,
            compression_enabled: rawSettings.evidence_settings?.compression_enabled ??
                DEFAULTS.evidence_settings.compression_enabled,
        };
        // Validate ranges
        this.validateTaskLimits(taskLimits);
        this.validateParallelLimits(parallelLimits);
        return {
            task_limits: taskLimits,
            parallel_limits: parallelLimits,
            timeouts,
            evidence_settings: evidenceSettings,
            project_path: projectPath,
            claude_dir: claudeDir,
        };
    }
    /**
     * Validate task limits are within range
     */
    validateTaskLimits(limits) {
        const { files, tests, seconds } = limits;
        const ranges = RANGES.task_limits;
        if (files < ranges.files.min || files > ranges.files.max) {
            throw new ConfigurationError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `task_limits.files must be between ${ranges.files.min} and ${ranges.files.max}, got ${files}`, { field: 'task_limits.files', value: files, range: ranges.files });
        }
        if (tests < ranges.tests.min || tests > ranges.tests.max) {
            throw new ConfigurationError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `task_limits.tests must be between ${ranges.tests.min} and ${ranges.tests.max}, got ${tests}`, { field: 'task_limits.tests', value: tests, range: ranges.tests });
        }
        if (seconds < ranges.seconds.min || seconds > ranges.seconds.max) {
            throw new ConfigurationError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `task_limits.seconds must be between ${ranges.seconds.min} and ${ranges.seconds.max}, got ${seconds}`, { field: 'task_limits.seconds', value: seconds, range: ranges.seconds });
        }
    }
    /**
     * Validate parallel limits are within range
     */
    validateParallelLimits(limits) {
        const { subagents, executors } = limits;
        const ranges = RANGES.parallel_limits;
        if (subagents < ranges.subagents.min || subagents > ranges.subagents.max) {
            throw new ConfigurationError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `parallel_limits.subagents must be between ${ranges.subagents.min} and ${ranges.subagents.max}, got ${subagents}`, { field: 'parallel_limits.subagents', value: subagents, range: ranges.subagents });
        }
        if (executors < ranges.executors.min || executors > ranges.executors.max) {
            throw new ConfigurationError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `parallel_limits.executors must be between ${ranges.executors.min} and ${ranges.executors.max}, got ${executors}`, { field: 'parallel_limits.executors', value: executors, range: ranges.executors });
        }
    }
    /**
     * Get default configuration
     */
    getDefaults() {
        return { ...DEFAULTS };
    }
    /**
     * Get validation ranges
     */
    getRanges() {
        return { ...RANGES };
    }
}
exports.ConfigurationManager = ConfigurationManager;
//# sourceMappingURL=configuration-manager.js.map