/**
 * Supervisor Core
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-1
 *
 * All tasks MUST pass through Supervisor.
 * Direct LLM execution is prohibited.
 */
import { ISupervisor, ComposedPrompt, SupervisedResult, ValidationResult, FormattedOutput, MergedConfig, RestartState } from './types';
import { SupervisorConfigManager } from './config-loader';
import { SupervisorLogger } from './supervisor-logger';
export interface IExecutor {
    execute(prompt: string, options: ExecutorOptions): Promise<ExecutorResult>;
}
export interface ExecutorOptions {
    timeoutMs: number;
    maxRetries: number;
}
export interface ExecutorResult {
    output: string;
    success: boolean;
    error?: string;
    executionTimeMs: number;
}
export declare class Supervisor implements ISupervisor {
    private configManager;
    private executor;
    private logger;
    constructor(projectRoot: string);
    /**
     * Get the logger instance for external access
     */
    getLogger(): SupervisorLogger;
    /**
     * Set the executor (dependency injection)
     */
    setExecutor(executor: IExecutor): void;
    /**
     * SUP-2: Compose prompt with templates
     *
     * Order: global → project → user (immutable)
     */
    compose(userPrompt: string, projectId: string): ComposedPrompt;
    /**
     * SUP-1: Execute through supervisor (never direct)
     */
    execute(composed: ComposedPrompt, projectId?: string, taskId?: string): Promise<SupervisedResult>;
    /**
     * SUP-7: Validate output against rules
     */
    validate(output: string): ValidationResult;
    /**
     * SUP-3: Format output with template
     */
    format(output: string, projectId: string): FormattedOutput;
    /**
     * Get merged config for a project
     */
    getConfig(projectId: string): MergedConfig;
    /**
     * Update global config
     */
    updateGlobalConfig(config: Parameters<SupervisorConfigManager['updateGlobalConfig']>[0]): void;
    /**
     * Update project config
     */
    updateProjectConfig(config: Parameters<SupervisorConfigManager['updateProjectConfig']>[0]): void;
    /**
     * Clear config cache (for testing or config reload)
     */
    clearCache(): void;
}
export interface TaskState {
    taskId: string;
    status: string;
    lastProgressTimestamp: string | null;
    hasCompleteArtifacts: boolean;
}
/**
 * SUP-6: Detect restart state and determine action
 */
export declare function detectRestartState(task: TaskState, staleThresholdMs?: number): RestartState;
export declare function getSupervisor(projectRoot: string): Supervisor;
export declare function resetSupervisor(): void;
//# sourceMappingURL=supervisor.d.ts.map