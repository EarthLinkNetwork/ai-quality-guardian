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

import * as fs from 'fs';
import * as path from 'path';
import {
  Provider,
  ReplState,
  VALID_PROVIDERS,
  validateProvider,
} from '../../models/repl';
import {
  ModelInfo,
  getModelsForProvider,
  getProviderInfo,
} from '../../models/repl/model-registry';

/**
 * Models command result
 */
export interface ModelsResult {
  success: boolean;
  message: string;
  provider?: string;
  models?: ModelInfo[];
  currentModel?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * REPL state file path
 */
const REPL_STATE_FILE = 'repl.json';

/**
 * Models Command class
 */
export class ModelsCommand {
  /**
   * List models for current or specified provider
   *
   * @param projectPath - Project path
   * @param providerId - Optional provider ID (uses current if not specified)
   * @returns Models result
   */
  async listModels(projectPath: string, providerId?: string): Promise<ModelsResult> {
    let targetProvider: Provider | null = null;
    let currentModel: string | null = null;

    // If provider specified, validate it
    if (providerId) {
      const validation = validateProvider(providerId);
      if (!validation.valid) {
        const validList = VALID_PROVIDERS.join(', ');
        return {
          success: false,
          message: 'Invalid provider',
          error: {
            code: 'E102',
            message: 'Invalid provider: ' + providerId + '. Valid providers: ' + validList,
          },
        };
      }
      targetProvider = providerId as Provider;
    } else {
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
          const state: ReplState = JSON.parse(content);
          targetProvider = state.selected_provider;
          currentModel = state.selected_model;
        } catch {
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
    const models = getModelsForProvider(targetProvider);
    const providerInfo = getProviderInfo(targetProvider);

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
  formatModelList(models: ModelInfo[], currentModel?: string, provider?: string): string {
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
