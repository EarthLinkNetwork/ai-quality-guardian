"use strict";
/**
 * /config Command Handler
 *
 * Per spec 33_PROJECT_SETTINGS_PERSISTENCE.md:
 * - /config show: Display current project settings
 * - /config set <key> <value>: Change a setting
 * - /config reset: Reset to defaults
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigCommand = exports.CONFIG_KEYS = void 0;
/**
 * Valid config keys for /config set
 */
exports.CONFIG_KEYS = [
    'autoChunking',
    'costWarningEnabled',
    'costWarningThreshold',
];
/**
 * Config command handler
 */
class ConfigCommand {
    settingsStore = null;
    templateStore = null;
    /**
     * Set the settings store instance
     */
    setSettingsStore(store) {
        this.settingsStore = store;
    }
    /**
     * Set the template store instance
     */
    setTemplateStore(store) {
        this.templateStore = store;
    }
    /**
     * Ensure settings store is initialized
     */
    ensureStore() {
        if (!this.settingsStore) {
            throw new Error('ProjectSettingsStore not initialized');
        }
        return this.settingsStore;
    }
    /**
     * Show current project settings
     */
    async show() {
        try {
            const store = this.ensureStore();
            const settings = store.get();
            return {
                success: true,
                settings,
                message: this.formatSettings(settings),
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E501',
                    message: error instanceof Error ? error.message : 'Failed to show settings',
                },
            };
        }
    }
    /**
     * Set a configuration value
     */
    async set(key, value) {
        try {
            const store = this.ensureStore();
            // Validate key
            if (!exports.CONFIG_KEYS.includes(key)) {
                return {
                    success: false,
                    error: {
                        code: 'E502',
                        message: `Unknown config key: ${key}. Valid keys: ${exports.CONFIG_KEYS.join(', ')}`,
                    },
                };
            }
            // Parse and validate value
            const parsedValue = this.parseValue(key, value);
            if (parsedValue === null) {
                return {
                    success: false,
                    error: {
                        code: 'E503',
                        message: `Invalid value for ${key}: ${value}`,
                    },
                };
            }
            // Update setting
            await store.setPreference(key, parsedValue);
            const settings = store.get();
            return {
                success: true,
                settings,
                message: `Set ${key} = ${parsedValue}`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E504',
                    message: error instanceof Error ? error.message : 'Failed to set config',
                },
            };
        }
    }
    /**
     * Reset settings to defaults
     */
    async reset() {
        try {
            const store = this.ensureStore();
            const settings = await store.reset();
            return {
                success: true,
                settings,
                message: 'Project settings reset to defaults',
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E505',
                    message: error instanceof Error ? error.message : 'Failed to reset settings',
                },
            };
        }
    }
    /**
     * Parse a string value to the appropriate type
     */
    parseValue(key, value) {
        switch (key) {
            case 'autoChunking':
            case 'costWarningEnabled':
                // Boolean parsing
                const lower = value.toLowerCase();
                if (lower === 'true' || lower === 'yes' || lower === '1' || lower === 'on') {
                    return true;
                }
                if (lower === 'false' || lower === 'no' || lower === '0' || lower === 'off') {
                    return false;
                }
                return null;
            case 'costWarningThreshold':
                // Number parsing
                const num = parseFloat(value);
                if (isNaN(num) || num < 0) {
                    return null;
                }
                return num;
            default:
                return null;
        }
    }
    /**
     * Format settings for display
     */
    formatSettings(settings) {
        const lines = [];
        lines.push('');
        lines.push('Project Settings');
        lines.push('----------------');
        lines.push(`  Project: ${settings.projectPath}`);
        lines.push(`  Hash: ${settings.projectHash}`);
        lines.push('');
        lines.push('  Template:');
        if (settings.template.selectedId) {
            let templateName = settings.template.selectedId;
            if (this.templateStore) {
                const template = this.templateStore.get(settings.template.selectedId);
                if (template) {
                    templateName = `${template.name} (${template.id})`;
                }
            }
            lines.push(`    Selected: ${templateName}`);
        }
        else {
            lines.push('    Selected: (none)');
        }
        lines.push(`    Enabled: ${settings.template.enabled ? 'Yes' : 'No'}`);
        lines.push('');
        lines.push('  LLM:');
        lines.push(`    Provider: ${settings.llm.provider || '(not set)'}`);
        lines.push(`    Model: ${settings.llm.model || '(not set)'}`);
        if (settings.llm.customEndpoint) {
            lines.push(`    Custom Endpoint: ${settings.llm.customEndpoint}`);
        }
        lines.push('');
        lines.push('  Preferences:');
        lines.push(`    Auto Chunking: ${settings.preferences.autoChunking ? 'Yes' : 'No'}`);
        lines.push(`    Cost Warning: ${settings.preferences.costWarningEnabled ? 'Yes' : 'No'} (threshold: $${settings.preferences.costWarningThreshold.toFixed(2)})`);
        lines.push('');
        lines.push(`  Last Updated: ${settings.updatedAt}`);
        lines.push('');
        return lines.join('\n');
    }
    /**
     * Format available config keys for help
     */
    formatAvailableKeys() {
        const lines = [];
        lines.push('');
        lines.push('Available config keys:');
        lines.push('  autoChunking        - Enable auto task chunking (true/false)');
        lines.push('  costWarningEnabled  - Enable cost warnings (true/false)');
        lines.push('  costWarningThreshold - Cost warning threshold in USD (number)');
        lines.push('');
        lines.push('Examples:');
        lines.push('  /config set autoChunking false');
        lines.push('  /config set costWarningThreshold 1.0');
        lines.push('');
        return lines.join('\n');
    }
}
exports.ConfigCommand = ConfigCommand;
//# sourceMappingURL=config.js.map