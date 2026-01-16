/**
 * Configuration Manager
 * Based on 04_COMPONENTS.md L52-82
 *
 * Responsible for:
 * - Loading and validating project configuration
 * - Enforcing configuration schema
 * - Applying default values
 */

import * as fs from 'fs';
import * as path from 'path';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';

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
 * Raw settings from settings.json
 */
interface RawSettings {
  task_limits?: Partial<TaskLimitsConfig>;
  parallel_limits?: Partial<ParallelLimitsConfig>;
  timeouts?: Partial<TimeoutsConfig>;
  evidence_settings?: Partial<EvidenceSettingsConfig>;
}

/**
 * Configuration error
 */
export class ConfigurationError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'ConfigurationError';
    this.code = code;
    this.details = details;
  }
}

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
export class ConfigurationManager {
  /**
   * Load configuration from project path
   * @throws ConfigurationError if configuration is invalid
   */
  loadConfiguration(projectPath: string): Configuration {
    // Validate project path exists
    if (!fs.existsSync(projectPath)) {
      throw new ConfigurationError(
        ErrorCode.E102_INVALID_PROJECT_PATH,
        `Project path does not exist: ${projectPath}`,
        { projectPath }
      );
    }

    // Check for .claude directory
    const claudeDir = path.join(projectPath, '.claude');
    if (!fs.existsSync(claudeDir)) {
      throw new ConfigurationError(
        ErrorCode.E101_MISSING_CLAUDE_DIRECTORY,
        `Missing .claude directory in project path: ${projectPath}`,
        { projectPath, expectedPath: claudeDir }
      );
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
  private validateRequiredStructure(claudeDir: string): void {
    const requiredFiles = ['CLAUDE.md', 'settings.json'];
    const requiredDirs = ['agents', 'rules'];

    for (const file of requiredFiles) {
      const filePath = path.join(claudeDir, file);
      if (!fs.existsSync(filePath)) {
        throw new ConfigurationError(
          ErrorCode.E103_CONFIGURATION_FILE_MISSING,
          `Missing required file: ${file} in .claude directory`,
          { missingFile: file, claudeDir }
        );
      }
    }

    for (const dir of requiredDirs) {
      const dirPath = path.join(claudeDir, dir);
      if (!fs.existsSync(dirPath)) {
        throw new ConfigurationError(
          ErrorCode.E103_CONFIGURATION_FILE_MISSING,
          `Missing required directory: ${dir} in .claude directory`,
          { missingDir: dir, claudeDir }
        );
      }
    }
  }

  /**
   * Load and parse settings.json
   */
  private loadSettingsJson(settingsPath: string): RawSettings {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(content) as RawSettings;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigurationError(
          ErrorCode.E105_CRITICAL_CONFIGURATION_CORRUPTION,
          `Malformed JSON in settings.json: ${error.message}`,
          { settingsPath, parseError: error.message }
        );
      }
      throw new ConfigurationError(
        ErrorCode.E103_CONFIGURATION_FILE_MISSING,
        `Failed to read settings.json: ${(error as Error).message}`,
        { settingsPath }
      );
    }
  }

  /**
   * Build and validate configuration
   */
  private buildConfiguration(
    rawSettings: RawSettings,
    projectPath: string,
    claudeDir: string
  ): Configuration {
    // Apply defaults and merge with provided settings
    const taskLimits: TaskLimitsConfig = {
      files: rawSettings.task_limits?.files ?? DEFAULTS.task_limits.files,
      tests: rawSettings.task_limits?.tests ?? DEFAULTS.task_limits.tests,
      seconds: rawSettings.task_limits?.seconds ?? DEFAULTS.task_limits.seconds,
    };

    const parallelLimits: ParallelLimitsConfig = {
      subagents: rawSettings.parallel_limits?.subagents ?? DEFAULTS.parallel_limits.subagents,
      executors: rawSettings.parallel_limits?.executors ?? DEFAULTS.parallel_limits.executors,
    };

    const timeouts: TimeoutsConfig = {
      deadlock_timeout_seconds:
        rawSettings.timeouts?.deadlock_timeout_seconds ??
        DEFAULTS.timeouts.deadlock_timeout_seconds,
      operation_timeout_seconds:
        rawSettings.timeouts?.operation_timeout_seconds ??
        DEFAULTS.timeouts.operation_timeout_seconds,
    };

    const evidenceSettings: EvidenceSettingsConfig = {
      retention_days:
        rawSettings.evidence_settings?.retention_days ??
        DEFAULTS.evidence_settings.retention_days,
      compression_enabled:
        rawSettings.evidence_settings?.compression_enabled ??
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
  private validateTaskLimits(limits: TaskLimitsConfig): void {
    const { files, tests, seconds } = limits;
    const ranges = RANGES.task_limits;

    if (files < ranges.files.min || files > ranges.files.max) {
      throw new ConfigurationError(
        ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE,
        `task_limits.files must be between ${ranges.files.min} and ${ranges.files.max}, got ${files}`,
        { field: 'task_limits.files', value: files, range: ranges.files }
      );
    }

    if (tests < ranges.tests.min || tests > ranges.tests.max) {
      throw new ConfigurationError(
        ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE,
        `task_limits.tests must be between ${ranges.tests.min} and ${ranges.tests.max}, got ${tests}`,
        { field: 'task_limits.tests', value: tests, range: ranges.tests }
      );
    }

    if (seconds < ranges.seconds.min || seconds > ranges.seconds.max) {
      throw new ConfigurationError(
        ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE,
        `task_limits.seconds must be between ${ranges.seconds.min} and ${ranges.seconds.max}, got ${seconds}`,
        { field: 'task_limits.seconds', value: seconds, range: ranges.seconds }
      );
    }
  }

  /**
   * Validate parallel limits are within range
   */
  private validateParallelLimits(limits: ParallelLimitsConfig): void {
    const { subagents, executors } = limits;
    const ranges = RANGES.parallel_limits;

    if (subagents < ranges.subagents.min || subagents > ranges.subagents.max) {
      throw new ConfigurationError(
        ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE,
        `parallel_limits.subagents must be between ${ranges.subagents.min} and ${ranges.subagents.max}, got ${subagents}`,
        { field: 'parallel_limits.subagents', value: subagents, range: ranges.subagents }
      );
    }

    if (executors < ranges.executors.min || executors > ranges.executors.max) {
      throw new ConfigurationError(
        ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE,
        `parallel_limits.executors must be between ${ranges.executors.min} and ${ranges.executors.max}, got ${executors}`,
        { field: 'parallel_limits.executors', value: executors, range: ranges.executors }
      );
    }
  }

  /**
   * Get default configuration
   */
  getDefaults(): typeof DEFAULTS {
    return { ...DEFAULTS };
  }

  /**
   * Get validation ranges
   */
  getRanges(): typeof RANGES {
    return { ...RANGES };
  }
}
