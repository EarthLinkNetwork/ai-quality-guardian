/**
 * Configuration Manager
 * Based on 04_COMPONENTS.md L52-82
 *
 * Responsible for:
 * - Loading and validating project configuration
 * - Enforcing configuration schema
 * - Applying default values
 */
import { ErrorCode } from '../errors/error-codes';
/**
 * Task limits configuration
 */
export interface TaskLimitsConfig {
    files: number;
    tests: number;
    seconds: number;
}
/**
 * Parallel limits configuration
 */
export interface ParallelLimitsConfig {
    subagents: number;
    executors: number;
}
/**
 * Timeouts configuration
 */
export interface TimeoutsConfig {
    deadlock_timeout_seconds: number;
    operation_timeout_seconds: number;
}
/**
 * Evidence settings configuration
 */
export interface EvidenceSettingsConfig {
    retention_days: number;
    compression_enabled: boolean;
}
/**
 * Full configuration structure
 */
export interface Configuration {
    task_limits: TaskLimitsConfig;
    parallel_limits: ParallelLimitsConfig;
    timeouts: TimeoutsConfig;
    evidence_settings: EvidenceSettingsConfig;
    project_path: string;
    claude_dir: string;
}
/**
 * Configuration error
 */
export declare class ConfigurationError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Default configuration values
 */
declare const DEFAULTS: {
    task_limits: {
        files: number;
        tests: number;
        seconds: number;
    };
    parallel_limits: {
        subagents: number;
        executors: number;
    };
    timeouts: {
        deadlock_timeout_seconds: number;
        operation_timeout_seconds: number;
    };
    evidence_settings: {
        retention_days: number;
        compression_enabled: boolean;
    };
};
/**
 * Validation ranges
 */
declare const RANGES: {
    task_limits: {
        files: {
            min: number;
            max: number;
        };
        tests: {
            min: number;
            max: number;
        };
        seconds: {
            min: number;
            max: number;
        };
    };
    parallel_limits: {
        subagents: {
            min: number;
            max: number;
        };
        executors: {
            min: number;
            max: number;
        };
    };
};
/**
 * Configuration Manager class
 */
export declare class ConfigurationManager {
    /**
     * Load configuration from project path
     * @throws ConfigurationError if configuration is invalid
     */
    loadConfiguration(projectPath: string): Configuration;
    /**
     * Validate required project structure
     */
    private validateRequiredStructure;
    /**
     * Load and parse settings.json
     */
    private loadSettingsJson;
    /**
     * Build and validate configuration
     */
    private buildConfiguration;
    /**
     * Validate task limits are within range
     */
    private validateTaskLimits;
    /**
     * Validate parallel limits are within range
     */
    private validateParallelLimits;
    /**
     * Get default configuration
     */
    getDefaults(): typeof DEFAULTS;
    /**
     * Get validation ranges
     */
    getRanges(): typeof RANGES;
}
export {};
//# sourceMappingURL=configuration-manager.d.ts.map