/**
 * Supervisor System Exports
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md
 */

// Types
export * from './types';

// Config Loader
export {
  loadGlobalConfig,
  saveGlobalConfig,
  loadProjectConfig,
  saveProjectConfig,
  mergeConfigs,
  SupervisorConfigManager,
  getGlobalConfigPath,
  getProjectConfigPath,
} from './config-loader';

// Template Engine
export {
  mergePrompt,
  mergePromptWithMarkers,
  applyOutputTemplate,
  applyOutputTemplateWithMarkers,
  substituteVariables,
  validateTemplate,
  extractComponents,
  TEMPLATE_MARKERS,
} from './template-engine';

// Supervisor Core
export {
  Supervisor,
  getSupervisor,
  resetSupervisor,
  detectRestartState,
} from './supervisor';

export type {
  IExecutor,
  ExecutorOptions,
  ExecutorResult,
  TaskState,
} from './supervisor';

// Restart Handler (SUP-6)
export {
  RestartHandler,
} from './restart-handler';

export type {
  RestartHandlerOptions,
  RestartCheckResult,
} from './restart-handler';

// Process Supervisor (WEB_COMPLETE_OPERATION)
export {
  ProcessSupervisor,
  createProcessSupervisor,
} from './process-supervisor';

export type {
  BuildMeta,
  WebProcessState,
  ProcessSupervisorOptions,
  ProcessSupervisorEvents,
} from './process-supervisor';

// Supervisor Logger (AC A.1 - Observability)
export {
  SupervisorLogger,
  getSupervisorLogger,
  resetSupervisorLogger,
} from './supervisor-logger';

export type {
  SupervisorLogLevel,
  SupervisorLogCategory,
  SupervisorLogEntry,
  SupervisorLogSubscriber,
} from './supervisor-logger';
