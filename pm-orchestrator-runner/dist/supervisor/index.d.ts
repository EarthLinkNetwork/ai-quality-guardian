/**
 * Supervisor System Exports
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md
 */
export * from './types';
export { loadGlobalConfig, saveGlobalConfig, loadProjectConfig, saveProjectConfig, mergeConfigs, SupervisorConfigManager, getGlobalConfigPath, getProjectConfigPath, } from './config-loader';
export { mergePrompt, mergePromptWithMarkers, applyOutputTemplate, applyOutputTemplateWithMarkers, substituteVariables, validateTemplate, extractComponents, TEMPLATE_MARKERS, } from './template-engine';
export { Supervisor, getSupervisor, resetSupervisor, detectRestartState, } from './supervisor';
export type { IExecutor, ExecutorOptions, ExecutorResult, TaskState, } from './supervisor';
export { RestartHandler, } from './restart-handler';
export type { RestartHandlerOptions, RestartCheckResult, } from './restart-handler';
export { ProcessSupervisor, createProcessSupervisor, } from './process-supervisor';
export type { BuildMeta, WebProcessState, ProcessSupervisorOptions, ProcessSupervisorEvents, } from './process-supervisor';
//# sourceMappingURL=index.d.ts.map