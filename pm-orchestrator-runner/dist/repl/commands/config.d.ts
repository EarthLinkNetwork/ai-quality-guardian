/**
 * /config Command Handler
 *
 * Per spec 33_PROJECT_SETTINGS_PERSISTENCE.md:
 * - /config show: Display current project settings
 * - /config set <key> <value>: Change a setting
 * - /config reset: Reset to defaults
 */
import { ProjectSettingsStore, ProjectSettings } from '../../settings';
import { TemplateStore } from '../../template';
/**
 * Config command result
 */
export interface ConfigResult {
    success: boolean;
    message?: string;
    settings?: ProjectSettings;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Valid config keys for /config set
 */
export declare const CONFIG_KEYS: readonly ["autoChunking", "costWarningEnabled", "costWarningThreshold"];
export type ConfigKey = typeof CONFIG_KEYS[number];
/**
 * Config command handler
 */
export declare class ConfigCommand {
    private settingsStore;
    private templateStore;
    /**
     * Set the settings store instance
     */
    setSettingsStore(store: ProjectSettingsStore): void;
    /**
     * Set the template store instance
     */
    setTemplateStore(store: TemplateStore): void;
    /**
     * Ensure settings store is initialized
     */
    private ensureStore;
    /**
     * Show current project settings
     */
    show(): Promise<ConfigResult>;
    /**
     * Set a configuration value
     */
    set(key: string, value: string): Promise<ConfigResult>;
    /**
     * Reset settings to defaults
     */
    reset(): Promise<ConfigResult>;
    /**
     * Parse a string value to the appropriate type
     */
    private parseValue;
    /**
     * Format settings for display
     */
    formatSettings(settings: ProjectSettings): string;
    /**
     * Format available config keys for help
     */
    formatAvailableKeys(): string;
}
//# sourceMappingURL=config.d.ts.map