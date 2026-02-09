/**
 * Supervisor Config Loader
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-4, SUP-5
 *
 * Locations:
 * - Global: .claude/global-config.json
 * - Project: .claude/projects/{projectId}.json
 */
import { GlobalConfig, ProjectConfig, MergedConfig } from './types';
declare function getGlobalConfigPath(projectRoot: string): string;
declare function getProjectConfigPath(projectRoot: string, projectId: string): string;
export declare function loadGlobalConfig(projectRoot: string): GlobalConfig;
export declare function saveGlobalConfig(projectRoot: string, config: GlobalConfig): void;
export declare function loadProjectConfig(projectRoot: string, projectId: string): ProjectConfig;
export declare function saveProjectConfig(projectRoot: string, config: ProjectConfig): void;
export declare function mergeConfigs(global: GlobalConfig, project: ProjectConfig): MergedConfig;
export declare class SupervisorConfigManager {
    private projectRoot;
    private globalConfigCache;
    private projectConfigCache;
    constructor(projectRoot: string);
    getGlobalConfig(): GlobalConfig;
    getProjectConfig(projectId: string): ProjectConfig;
    getMergedConfig(projectId: string): MergedConfig;
    updateGlobalConfig(config: GlobalConfig): void;
    updateProjectConfig(config: ProjectConfig): void;
    clearCache(): void;
}
export { getGlobalConfigPath, getProjectConfigPath, };
//# sourceMappingURL=config-loader.d.ts.map