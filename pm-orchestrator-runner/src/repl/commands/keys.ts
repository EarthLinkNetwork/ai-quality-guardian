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

import {
  getApiKeyStatus,
  checkApiKeyForProvider,
} from '../../logging/sensitive-data-masker';
import { VALID_PROVIDERS, Provider } from '../../models/repl';
import { getAllProviders, ProviderInfo } from '../../models/repl/model-registry';
import {
  getApiKey,
  setApiKey,
  hasAnyApiKey,
  getConfigFilePath,
} from '../../config/global-config';

/**
 * Key status result
 */
export interface KeyStatus {
  provider: string;
  envVar: string | null;
  required: boolean;
  status: 'SET' | 'NOT SET' | 'NOT_REQUIRED';
}

/**
 * Keys command result
 */
export interface KeysResult {
  success: boolean;
  message: string;
  keys?: KeyStatus[];
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Keys Command class
 */
export class KeysCommand {
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
  async getKeyStatus(): Promise<KeysResult> {
    const providers = getAllProviders();
    const keys: KeyStatus[] = [];

    for (const provider of providers) {
      // Check global config first
      const globalKey = getApiKey(provider.id);
      // Then check environment variables (legacy)
      const keyCheck = checkApiKeyForProvider(provider.id);

      // Use global config if set, otherwise fall back to env var
      const isSet = !!globalKey || keyCheck.status === 'SET';

      // Determine status: NOT_REQUIRED for providers that don't need keys
      let status: 'SET' | 'NOT SET' | 'NOT_REQUIRED';
      if (!keyCheck.required) {
        status = 'NOT_REQUIRED';
      } else {
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
  async setKey(provider: string, key: string): Promise<KeysResult> {
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
    setApiKey(provider.toLowerCase(), key);

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
  async checkProviderKey(providerId: string): Promise<KeysResult> {
    // Validate provider
    if (!VALID_PROVIDERS.includes(providerId as Provider)) {
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

    const keyCheck = checkApiKeyForProvider(providerId);
    const providers = getAllProviders();
    const providerInfo = providers.find(p => p.id === providerId);

    const keys: KeyStatus[] = [{
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
  formatKeyStatus(keys: KeyStatus[]): string {
    let output = 'API Key Status:\n\n';

    for (const key of keys) {
      output += '  ' + key.provider + '\n';

      if (!key.required) {
        output += '    Status: Not required (uses Claude Code CLI)\n';
      } else {
        const statusIcon = key.status === 'SET' ? '[OK]' : '[MISSING]';
        output += '    Status: ' + statusIcon + ' ' + key.status + '\n';
        if (key.envVar) {
          output += '    Legacy Env Var: ' + key.envVar + '\n';
        }
      }

      output += '\n';
    }

    // Add config file info
    output += 'Config file: ' + getConfigFilePath() + '\n\n';

    // Add help text
    output += 'To set an API key:\n';
    output += '  /keys set openai <your-api-key>\n';
    output += '  /keys set anthropic <your-api-key>\n';
    output += '\n';
    output += 'Note: API keys are NEVER displayed for security reasons.';

    return output;
  }
}
