/**
 * REPL Models Index
 */

export {
  ReplState,
  INITIAL_REPL_STATE,
  VALID_PROVIDERS,
  Provider,
  validateProvider,
  validateModel,
  validateReplState,
  changeProvider,
  changeModel,
} from './repl-state';

export {
  ModelInfo,
  ProviderInfo,
  PROVIDER_REGISTRY,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  getModelsForProvider,
  getProviderInfo,
  getAllProviders,
  isValidModelForProvider,
} from './model-registry';

export {
  VisibilityLevel,
  LogEventType,
  LogEventContent,
  LogEvent,
  TaskLogSummary,
  TaskLog,
  TaskLogEntry,
  TaskLogIndex,
  SUMMARY_VISIBLE_EVENTS,
  FULL_ONLY_EVENTS,
  getEventVisibility,
  createTaskLogIndex,
  createTaskLog,
  createLogEvent,
  addEventToTaskLog,
  filterEventsByVisibility,
} from './task-log';
