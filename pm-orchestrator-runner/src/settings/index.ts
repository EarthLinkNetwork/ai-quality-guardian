/**
 * Settings Module Exports
 *
 * Per spec 33_PROJECT_SETTINGS_PERSISTENCE.md
 */

export {
  // Types
  type ProjectSettings,
  type ProjectIndexEntry,
  type ProjectIndex,
  type ProjectSettingsEvent,
  type ProjectSettingsEventCallback,
  type ProjectSettingsStoreConfig,

  // Constants
  CURRENT_SETTINGS_VERSION,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_STORE_CONFIG,
  SETTINGS_LIMITS,

  // Functions
  generateProjectHash,
  getDefaultStorageDir,

  // Class
  ProjectSettingsStore,
} from './project-settings-store';
