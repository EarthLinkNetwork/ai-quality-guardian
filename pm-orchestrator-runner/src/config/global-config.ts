/**
 * Global Configuration Manager
 *
 * Manages user-level global settings stored in ~/.pm-orchestrator-runner/config.json
 * This is NOT environment variables - it's a persistent config file.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Global config structure
 */
export interface GlobalConfig {
  /** API keys for different providers */
  apiKeys?: {
    openai?: string;
    anthropic?: string;
  };
  /** Default provider (openai, anthropic) */
  defaultProvider?: string;
  /** Default model for each provider */
  defaultModels?: {
    openai?: string;
    anthropic?: string;
  };
}

/**
 * Global config directory path
 */
const CONFIG_DIR = path.join(os.homedir(), '.pm-orchestrator-runner');

/**
 * Global config file path
 */
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load global config
 * @returns Global config object (empty object if file doesn't exist)
 */
export function loadGlobalConfig(): GlobalConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Warning: Failed to load global config:', (err as Error).message);
  }
  return {};
}

/**
 * Save global config
 * @param config - Config object to save
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  ensureConfigDir();
  // Write with restricted permissions (owner read/write only)
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * Get API key for a provider
 * @param provider - Provider name (openai, anthropic)
 * @returns API key or undefined
 */
export function getApiKey(provider: string): string | undefined {
  const config = loadGlobalConfig();
  if (provider === 'openai') {
    return config.apiKeys?.openai;
  } else if (provider === 'anthropic') {
    return config.apiKeys?.anthropic;
  }
  return undefined;
}

/**
 * Set API key for a provider
 * @param provider - Provider name (openai, anthropic)
 * @param key - API key to set
 */
export function setApiKey(provider: string, key: string): void {
  const config = loadGlobalConfig();
  if (!config.apiKeys) {
    config.apiKeys = {};
  }
  if (provider === 'openai') {
    config.apiKeys.openai = key;
  } else if (provider === 'anthropic') {
    config.apiKeys.anthropic = key;
  }
  saveGlobalConfig(config);
}

/**
 * Check if any API key is configured
 * @returns true if at least one API key is set
 */
export function hasAnyApiKey(): boolean {
  const config = loadGlobalConfig();
  return !!(config.apiKeys?.openai || config.apiKeys?.anthropic);
}

/**
 * Get default provider
 * @returns Default provider name or 'openai'
 */
export function getDefaultProvider(): string {
  const config = loadGlobalConfig();
  return config.defaultProvider || 'openai';
}

/**
 * Set default provider
 * @param provider - Provider name
 */
export function setDefaultProvider(provider: string): void {
  const config = loadGlobalConfig();
  config.defaultProvider = provider;
  saveGlobalConfig(config);
}

/**
 * Get config file path (for display purposes)
 */
export function getConfigFilePath(): string {
  return CONFIG_FILE;
}

/**
 * Get config directory path
 */
export function getConfigDirPath(): string {
  return CONFIG_DIR;
}
