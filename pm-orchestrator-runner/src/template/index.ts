/**
 * Template Module Exports
 *
 * Per spec 32_TEMPLATE_INJECTION.md
 */

export {
  // Types
  type Template,
  type TemplateIndexEntry,
  type TemplateIndex,
  type TemplateStoreEvent,
  type TemplateStoreEventCallback,
  type TemplateValidationResult,
  type TemplateStoreConfig,

  // Constants
  TEMPLATE_LIMITS,
  NAME_PATTERN,
  BUILTIN_TEMPLATES,
  BUILTIN_MINIMAL,
  BUILTIN_STANDARD,
  BUILTIN_STRICT,
  DEFAULT_TEMPLATE_STORE_CONFIG,

  // Functions
  getDefaultStorageDir,
  validateTemplateName,
  validateTemplateContent,
  validateTemplate,
  generateId,
  formatRulesInjection,
  formatOutputInjection,

  // Class
  TemplateStore,
} from './template-store';
