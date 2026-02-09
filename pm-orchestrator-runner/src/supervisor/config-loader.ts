/**
 * Supervisor Config Loader
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-4, SUP-5
 *
 * Locations:
 * - Global: .claude/global-config.json
 * - Project: .claude/projects/{projectId}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  GlobalConfig,
  ProjectConfig,
  MergedConfig,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROJECT_CONFIG,
  TIMEOUT_PROFILES,
} from './types';

// =============================================================================
// Path Resolution
// =============================================================================

function getGlobalConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'global-config.json');
}

function getProjectConfigPath(projectRoot: string, projectId: string): string {
  return path.join(projectRoot, '.claude', 'projects', `${projectId}.json`);
}

// =============================================================================
// Global Config (SUP-5)
// =============================================================================

export function loadGlobalConfig(projectRoot: string): GlobalConfig {
  const configPath = getGlobalConfigPath(projectRoot);

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_GLOBAL_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<GlobalConfig>;

    // Merge with defaults
    return {
      global_input_template: parsed.global_input_template ?? DEFAULT_GLOBAL_CONFIG.global_input_template,
      global_output_template: parsed.global_output_template ?? DEFAULT_GLOBAL_CONFIG.global_output_template,
      supervisor_rules: {
        enabled: parsed.supervisor_rules?.enabled ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.enabled,
        timeout_default_ms: parsed.supervisor_rules?.timeout_default_ms ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.timeout_default_ms,
        max_retries: parsed.supervisor_rules?.max_retries ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.max_retries,
        fail_on_violation: parsed.supervisor_rules?.fail_on_violation ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.fail_on_violation,
      },
    };
  } catch (error) {
    console.error(`[Supervisor] Failed to load global config: ${error}`);
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
}

export function saveGlobalConfig(projectRoot: string, config: GlobalConfig): void {
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

export function loadProjectConfig(projectRoot: string, projectId: string): ProjectConfig {
  const configPath = getProjectConfigPath(projectRoot, projectId);

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_PROJECT_CONFIG, projectId };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<ProjectConfig>;

    // Merge with defaults
    return {
      projectId: parsed.projectId ?? projectId,
      input_template: parsed.input_template ?? DEFAULT_PROJECT_CONFIG.input_template,
      output_template: parsed.output_template ?? DEFAULT_PROJECT_CONFIG.output_template,
      supervisor_rules: {
        timeout_profile: parsed.supervisor_rules?.timeout_profile ?? DEFAULT_PROJECT_CONFIG.supervisor_rules.timeout_profile,
        allow_raw_output: parsed.supervisor_rules?.allow_raw_output ?? DEFAULT_PROJECT_CONFIG.supervisor_rules.allow_raw_output,
        require_format_validation: parsed.supervisor_rules?.require_format_validation ?? DEFAULT_PROJECT_CONFIG.supervisor_rules.require_format_validation,
      },
    };
  } catch (error) {
    console.error(`[Supervisor] Failed to load project config for ${projectId}: ${error}`);
    return { ...DEFAULT_PROJECT_CONFIG, projectId };
  }
}

export function saveProjectConfig(projectRoot: string, config: ProjectConfig): void {
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

export function mergeConfigs(global: GlobalConfig, project: ProjectConfig): MergedConfig {
  // Project timeout profile overrides global default
  const timeoutMs = TIMEOUT_PROFILES[project.supervisor_rules.timeout_profile]
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

export class SupervisorConfigManager {
  private projectRoot: string;
  private globalConfigCache: GlobalConfig | null = null;
  private projectConfigCache: Map<string, ProjectConfig> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  getGlobalConfig(): GlobalConfig {
    if (!this.globalConfigCache) {
      this.globalConfigCache = loadGlobalConfig(this.projectRoot);
    }
    return this.globalConfigCache;
  }

  getProjectConfig(projectId: string): ProjectConfig {
    if (!this.projectConfigCache.has(projectId)) {
      const config = loadProjectConfig(this.projectRoot, projectId);
      this.projectConfigCache.set(projectId, config);
    }
    return this.projectConfigCache.get(projectId)!;
  }

  getMergedConfig(projectId: string): MergedConfig {
    const global = this.getGlobalConfig();
    const project = this.getProjectConfig(projectId);
    return mergeConfigs(global, project);
  }

  updateGlobalConfig(config: GlobalConfig): void {
    saveGlobalConfig(this.projectRoot, config);
    this.globalConfigCache = config;
  }

  updateProjectConfig(config: ProjectConfig): void {
    saveProjectConfig(this.projectRoot, config);
    this.projectConfigCache.set(config.projectId, config);
  }

  clearCache(): void {
    this.globalConfigCache = null;
    this.projectConfigCache.clear();
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  getGlobalConfigPath,
  getProjectConfigPath,
};
