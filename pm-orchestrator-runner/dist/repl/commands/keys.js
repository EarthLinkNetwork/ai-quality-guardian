"use strict";
/**
 * Keys Command
 *
 * Per spec 10_REPL_UX.md Section 2.3:
 * - /keys: show status of all API keys (SET/NOT SET)
 * - /keys set <provider> <key>: set API key in global config
 * - /keys check: validate API key format
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24:
 * - API keys must NEVER appear in logs or evidence
 * - Only "SET" or "NOT SET" status is allowed
 *
 * API keys are stored in global config file (~/.pm-orchestrator-runner/config.json)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeysCommand = void 0;
const sensitive_data_masker_1 = require("../../logging/sensitive-data-masker");
const repl_1 = require("../../models/repl");
const model_registry_1 = require("../../models/repl/model-registry");
const global_config_1 = require("../../config/global-config");
/**
 * Keys Command class
 */
class KeysCommand {
    /**
     * Get status of all API keys
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24:
     * - Only show SET/NOT SET, never the actual key value
     *
     * Checks both:
     * - Global config file (~/.pm-orchestrator-runner/config.json)
     * - Environment variables (legacy support)
     *
     * @returns Keys result
     */
    async getKeyStatus() {
        const providers = (0, model_registry_1.getAllProviders)();
        const keys = [];
        for (const provider of providers) {
            // Check global config first
            const globalKey = (0, global_config_1.getApiKey)(provider.id);
            // Then check environment variables (legacy)
            const keyCheck = (0, sensitive_data_masker_1.checkApiKeyForProvider)(provider.id);
            // Use global config if set, otherwise fall back to env var
            const isSet = !!globalKey || keyCheck.status === 'SET';
            // Determine status: NOT_REQUIRED for providers that don't need keys
            let status;
            if (!keyCheck.required) {
                status = 'NOT_REQUIRED';
            }
            else {
                status = isSet ? 'SET' : 'NOT SET';
            }
            keys.push({
                provider: provider.displayName,
                envVar: keyCheck.envVar,
                required: keyCheck.required,
                status,
            });
        }
        return {
            success: true,
            message: 'API key status',
            keys,
        };
    }
    /**
     * Set API key in global config
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24:
     * - API key value is stored but NEVER displayed
     *
     * @param provider - Provider ID (openai or anthropic)
     * @param key - API key value
     * @returns Keys result
     */
    async setKey(provider, key) {
        // Validate provider
        const validProviders = ['openai', 'anthropic'];
        if (!validProviders.includes(provider.toLowerCase())) {
            return {
                success: false,
                message: 'Invalid provider',
                error: {
                    code: 'E102',
                    message: 'Invalid provider: ' + provider + '. Valid providers: openai, anthropic',
                },
            };
        }
        // Validate key format
        if (!key || key.length < 10) {
            return {
                success: false,
                message: 'Invalid API key',
                error: {
                    code: 'E108',
                    message: 'API key appears to be invalid (too short)',
                },
            };
        }
        // Set the key in global config
        (0, global_config_1.setApiKey)(provider.toLowerCase(), key);
        return {
            success: true,
            message: 'API key set successfully for ' + provider,
            keys: [{
                    provider: provider,
                    envVar: null,
                    required: true,
                    status: 'SET',
                }],
        };
    }
    /**
     * Check if a specific provider's API key is configured
     *
     * @param providerId - Provider ID
     * @returns Keys result for specific provider
     */
    async checkProviderKey(providerId) {
        // Validate provider
        if (!repl_1.VALID_PROVIDERS.includes(providerId)) {
            const validList = repl_1.VALID_PROVIDERS.join(', ');
            return {
                success: false,
                message: 'Invalid provider',
                error: {
                    code: 'E102',
                    message: 'Invalid provider: ' + providerId + '. Valid providers: ' + validList,
                },
            };
        }
        const keyCheck = (0, sensitive_data_masker_1.checkApiKeyForProvider)(providerId);
        const providers = (0, model_registry_1.getAllProviders)();
        const providerInfo = providers.find(p => p.id === providerId);
        const keys = [{
                provider: providerInfo?.displayName || providerId,
                envVar: keyCheck.envVar,
                required: keyCheck.required,
                status: keyCheck.status,
            }];
        return {
            success: true,
            message: 'API key status for ' + providerId,
            keys,
        };
    }
    /**
     * Format key status for display
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24:
     * - NEVER show actual key values
     * - Only show SET/NOT SET status
     *
     * @param keys - Key status list
     * @returns Formatted string
     */
    formatKeyStatus(keys) {
        let output = 'API Key Status:\n\n';
        for (const key of keys) {
            output += '  ' + key.provider + '\n';
            if (!key.required) {
                output += '    Status: Not required (uses Claude Code CLI)\n';
            }
            else {
                const statusIcon = key.status === 'SET' ? '[OK]' : '[MISSING]';
                output += '    Status: ' + statusIcon + ' ' + key.status + '\n';
                if (key.envVar) {
                    output += '    Legacy Env Var: ' + key.envVar + '\n';
                }
            }
            output += '\n';
        }
        // Add config file info
        output += 'Config file: ' + (0, global_config_1.getConfigFilePath)() + '\n\n';
        // Add help text
        output += 'To set an API key:\n';
        output += '  /keys set openai <your-api-key>\n';
        output += '  /keys set anthropic <your-api-key>\n';
        output += '\n';
        output += 'Note: API keys are NEVER displayed for security reasons.';
        return output;
    }
}
exports.KeysCommand = KeysCommand;
//# sourceMappingURL=keys.js.map