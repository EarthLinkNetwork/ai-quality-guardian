"use strict";
/**
 * Models Command
 *
 * Per spec 10_REPL_UX.md Section 2.2:
 * - /models: list models for current provider
 * - /models <provider>: list models for specific provider
 *
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md:
 * - OpenAI models with pricing
 * - Anthropic models with pricing
 * - claude-code delegates model selection
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
exports.ModelsCommand = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const repl_1 = require("../../models/repl");
const model_registry_1 = require("../../models/repl/model-registry");
/**
 * REPL state file path
 */
const REPL_STATE_FILE = 'repl.json';
/**
 * Models Command class
 */
class ModelsCommand {
    /**
     * List models for current or specified provider
     *
     * @param projectPath - Project path
     * @param providerId - Optional provider ID (uses current if not specified)
     * @returns Models result
     */
    async listModels(projectPath, providerId) {
        let targetProvider = null;
        let currentModel = null;
        // If provider specified, validate it
        if (providerId) {
            const validation = (0, repl_1.validateProvider)(providerId);
            if (!validation.valid) {
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
            targetProvider = providerId;
        }
        else {
            // Get current provider from repl.json
            const claudeDir = path.join(projectPath, '.claude');
            const statePath = path.join(claudeDir, REPL_STATE_FILE);
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
            if (fs.existsSync(statePath)) {
                try {
                    const content = fs.readFileSync(statePath, 'utf-8');
                    const state = JSON.parse(content);
                    targetProvider = state.selected_provider;
                    currentModel = state.selected_model;
                }
                catch {
                    // Ignore parse errors
                }
            }
            if (!targetProvider) {
                return {
                    success: false,
                    message: 'No provider selected',
                    error: {
                        code: 'E109',
                        message: 'No provider selected. Use /provider <name> to select a provider first.',
                    },
                };
            }
        }
        // Get models for provider
        const models = (0, model_registry_1.getModelsForProvider)(targetProvider);
        const providerInfo = (0, model_registry_1.getProviderInfo)(targetProvider);
        // claude-code has no model list (delegated)
        if (targetProvider === 'claude-code') {
            return {
                success: true,
                message: 'claude-code delegates model selection to Claude Code CLI',
                provider: targetProvider,
                models: [],
            };
        }
        return {
            success: true,
            message: 'Models for ' + (providerInfo?.displayName || targetProvider),
            provider: targetProvider,
            models,
            currentModel: currentModel || undefined,
        };
    }
    /**
     * Format model list for display
     *
     * @param models - Model list
     * @param currentModel - Current selected model (optional)
     * @param provider - Provider name
     * @returns Formatted string
     */
    formatModelList(models, currentModel, provider) {
        if (models.length === 0) {
            if (provider === 'claude-code') {
                return 'claude-code delegates model selection to Claude Code CLI.\n\n' +
                    'No model configuration is needed - Claude Code CLI handles this automatically.';
            }
            return 'No models available for this provider.';
        }
        let output = 'Available Models:\n\n';
        output += '  Model ID                          | Display Name        | Input $/M | Output $/M | Context\n';
        output += '  ----------------------------------|---------------------|-----------|------------|--------\n';
        for (const model of models) {
            const isCurrent = model.id === currentModel;
            const marker = isCurrent ? '*' : ' ';
            const id = (model.id + marker).padEnd(33);
            const name = model.displayName.padEnd(19);
            const inputPrice = ('$' + model.inputPricePerMillion.toFixed(2)).padStart(9);
            const outputPrice = ('$' + model.outputPricePerMillion.toFixed(2)).padStart(10);
            output += '  ' + id + ' | ' + name + ' | ' + inputPrice + ' | ' + outputPrice + ' | ' + model.contextSize + '\n';
        }
        output += '\n';
        if (currentModel) {
            output += '* = currently selected\n\n';
        }
        output += 'Use /model <model-id> to select a model.';
        return output;
    }
}
exports.ModelsCommand = ModelsCommand;
//# sourceMappingURL=models.js.map