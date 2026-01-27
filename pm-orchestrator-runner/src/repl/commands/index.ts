/**
 * REPL Commands Index
 */

export { InitCommand, InitResult } from './init';
export { ModelCommand, ModelResult, AVAILABLE_MODELS, ModelName } from './model';
export { SessionCommands, SessionResult } from './session';
export { StatusCommands } from './status';

// New commands per spec 10_REPL_UX.md
export { ProviderCommand, ProviderResult, REPL_STATE_FILE } from './provider';
export { ModelsCommand, ModelsResult } from './models';
export { KeysCommand, KeysResult, KeyStatus } from './keys';
export { LogsCommand, LogsResult } from './logs';
export { TraceCommand, TraceResult, TraceOptions } from './trace';

// Template and Config commands per spec 32 and 33
export { TemplateCommand, TemplateResult } from './template';
export { ConfigCommand, ConfigResult, CONFIG_KEYS, ConfigKey } from './config';

// Unified event inspection command (replaces symptom-specific commands)
export { InspectCommand, InspectCommandResult } from './inspect';
