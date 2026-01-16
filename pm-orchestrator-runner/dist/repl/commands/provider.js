"use strict";
/**
 * Provider Command
 *
 * Per spec 10_REPL_UX.md Section 2.1:
 * - /provider: show current selected_provider or "UNSET"
 * - /provider show: list all providers
 * - /provider select: interactive selection UI
 * - /provider <name>: set provider directly
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 23:
 * - Provider/Model configuration under user control
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPL_STATE_FILE = exports.ProviderCommand = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const repl_1 = require("../../models/repl");
const model_registry_1 = require("../../models/repl/model-registry");
const sensitive_data_masker_1 = require("../../logging/sensitive-data-masker");
/**
 * REPL state file path
 */
const REPL_STATE_FILE = 'repl.json';
exports.REPL_STATE_FILE = REPL_STATE_FILE;
/**
 * Provider Command class
 */
class ProviderCommand {
    /**
     * Get current provider
     * Per spec 10_REPL_UX.md: Display "UNSET" if not configured
     *
     * @param projectPath - Project path
     * @returns Provider result
     */
    async getProvider(projectPath) {
        const claudeDir = path.join(projectPath, '.claude');
        const statePath = path.join(claudeDir, REPL_STATE_FILE);
        // Check if .claude directory exists
        if (!fs.existsSync(claudeDir)) {
            return {
                success: false,
                message: '.claude directory not found',
                error: {
                    code: 'E101',
                    message: '.claude directory not found. Run /init first.',
                },
            };
        }
        // Read current state
        if (!fs.existsSync(statePath)) {
            return {
                success: true,
                message: 'Provider not configured',
                provider: 'UNSET',
                configPath: statePath,
            };
        }
        try {
            const content = fs.readFileSync(statePath, 'utf-8');
            const state = JSON.parse(content);
            if (!state.selected_provider) {
                return {
                    success: true,
                    message: 'Provider not configured',
                    provider: 'UNSET',
                    configPath: statePath,
                };
            }
            // Get provider info
            const providerInfo = (0, model_registry_1.getProviderInfo)(state.selected_provider);
            return {
                success: true,
                message: 'Provider configured',
                provider: state.selected_provider,
                configPath: statePath,
            };
        }
        catch (err) {
            // Per spec 10_REPL_UX.md: E105 for JSON parse error
            return {
                success: false,
                message: 'Failed to parse repl.json',
                error: {
                    code: 'E105',
                    message: 'Failed to parse repl.json: ' + err.message,
                },
            };
        }
    }
    /**
     * Set provider
     * Per spec 10_REPL_UX.md: Save to .claude/repl.json and generate Evidence
     * Per spec 12_LLM_PROVIDER_AND_MODELS.md: Provider change resets model selection
     *
     * @param projectPath - Project path
     * @param providerName - Provider name to set
     * @returns Provider result
     */
    async setProvider(projectPath, providerName) {
        const claudeDir = path.join(projectPath, '.claude');
        const statePath = path.join(claudeDir, REPL_STATE_FILE);
        const evidenceDir = path.join(claudeDir, 'evidence');
        // Check if .claude directory exists
        if (!fs.existsSync(claudeDir)) {
            return {
                success: false,
                message: '.claude directory not found',
                error: {
                    code: 'E101',
                    message: '.claude directory not found. Run /init first.',
                },
            };
        }
        // Validate provider name
        const validationResult = (0, repl_1.validateProvider)(providerName);
        if (!validationResult.valid) {
            const validList = repl_1.VALID_PROVIDERS.join(', ');
            return {
                success: false,
                message: 'Invalid provider: ' + providerName,
                error: {
                    code: 'E102',
                    message: 'Invalid provider: ' + providerName + '. Valid providers: ' + validList,
                },
            };
        }
        // Read current state or create new
        let state = { ...repl_1.INITIAL_REPL_STATE };
        if (fs.existsSync(statePath)) {
            try {
                const content = fs.readFileSync(statePath, 'utf-8');
                state = JSON.parse(content);
            }
            catch {
                // Ignore parse errors, start fresh
            }
        }
        // Update state
        // Per spec 12_LLM_PROVIDER_AND_MODELS.md: Provider change resets model
        const previousProvider = state.selected_provider;
        state.selected_provider = providerName;
        state.selected_model = null; // Reset model when provider changes
        state.updated_at = new Date().toISOString();
        // Save state
        try {
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        }
        catch (err) {
            return {
                success: false,
                message: 'Failed to save repl.json',
                error: {
                    code: 'E106',
                    message: 'Failed to save repl.json: ' + err.message,
                },
            };
        }
        // Generate Evidence
        let evidencePath;
        try {
            if (!fs.existsSync(evidenceDir)) {
                fs.mkdirSync(evidenceDir, { recursive: true });
            }
            const evidenceFilename = 'provider-change-' + Date.now() + '.json';
            evidencePath = path.join(evidenceDir, evidenceFilename);
            const evidence = {
                type: 'provider_change',
                timestamp: new Date().toISOString(),
                previous_provider: previousProvider || null,
                new_provider: providerName,
                model_reset: true,
                config_path: statePath,
            };
            fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');
        }
        catch {
            // Evidence generation is best-effort
        }
        return {
            success: true,
            message: 'Provider set to ' + providerName,
            provider: providerName,
            configPath: statePath,
            evidencePath,
        };
    }
    /**
     * List all available providers
     * Per spec 10_REPL_UX.md: /provider show lists all providers
     *
     * @returns Provider result with providers list
     */
    async listProviders() {
        const providers = (0, model_registry_1.getAllProviders)();
        return {
            success: true,
            message: 'Available providers',
            providers,
        };
    }
    /**
     * Format providers for display
     *
     * @param providers - Provider list
     * @param currentProvider - Current selected provider (optional)
     * @returns Formatted string
     */
    formatProviderList(providers, currentProvider) {
        let output = 'Available Providers:\n\n';
        for (const provider of providers) {
            const isCurrent = provider.id === currentProvider;
            const marker = isCurrent ? ' (current)' : '';
            const keyStatus = (0, sensitive_data_masker_1.checkApiKeyForProvider)(provider.id);
            output += '  ' + provider.displayName + marker + '\n';
            output += '    ID: ' + provider.id + '\n';
            output += '    ' + provider.description + '\n';
            if (keyStatus.required) {
                output += '    API Key: ' + keyStatus.status + '\n';
            }
            else {
                output += '    API Key: Not required\n';
            }
            output += '\n';
        }
        output += 'Use /provider <id> to select a provider.';
        return output;
    }
    /**
     * Format current provider for display
     *
     * @param provider - Provider ID or "UNSET"
     * @returns Formatted string
     */
    formatCurrentProvider(provider) {
        if (provider === 'UNSET') {
            return 'Current provider: UNSET\n\nUse /provider show to see available providers.';
        }
        const info = (0, model_registry_1.getProviderInfo)(provider);
        if (!info) {
            return 'Current provider: ' + provider + ' (unknown)';
        }
        const keyStatus = (0, sensitive_data_masker_1.checkApiKeyForProvider)(provider);
        let output = 'Current provider: ' + info.displayName + '\n';
        output += '  ID: ' + info.id + '\n';
        output += '  ' + info.description + '\n';
        if (keyStatus.required) {
            output += '  API Key: ' + keyStatus.status;
        }
        else {
            output += '  API Key: Not required';
        }
        return output;
    }
}
exports.ProviderCommand = ProviderCommand;
//# sourceMappingURL=provider.js.map