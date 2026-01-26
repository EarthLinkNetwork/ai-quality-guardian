/**
 * Global Configuration Manager
 *
 * Manages user-level global settings stored in ~/.pm-orchestrator-runner/config.json
 * This is NOT environment variables - it's a persistent config file.
 */
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
    /** Show verbose executor logs in REPL (default: false) */
    verboseExecutor?: boolean;
    /** Single-line input mode (Enter once to send, default: true) */
    singleLineMode?: boolean;
}
/**
 * Load global config
 * @returns Global config object (empty object if file doesn't exist)
 */
export declare function loadGlobalConfig(): GlobalConfig;
/**
 * Save global config
 * @param config - Config object to save
 */
export declare function saveGlobalConfig(config: GlobalConfig): void;
/**
 * Get API key for a provider (environment variable OR config file)
 * Environment variables take precedence over config file.
 * @param provider - Provider name (openai, anthropic)
 * @returns API key or undefined
 */
export declare function getApiKey(provider: string): string | undefined;
/**
 * Set API key for a provider
 * @param provider - Provider name (openai, anthropic)
 * @param key - API key to set
 */
export declare function setApiKey(provider: string, key: string): void;
/**
 * Check if any API key is configured (environment variable OR config file)
 * @returns true if at least one API key is set
 */
export declare function hasAnyApiKey(): boolean;
/**
 * Get default provider
 * @returns Default provider name or 'openai'
 */
export declare function getDefaultProvider(): string;
/**
 * Set default provider
 * @param provider - Provider name
 */
export declare function setDefaultProvider(provider: string): void;
/**
 * Get config file path (for display purposes)
 */
export declare function getConfigFilePath(): string;
/**
 * Get config directory path
 */
export declare function getConfigDirPath(): string;
/**
 * Get verbose executor setting
 * @returns true if executor should show verbose logs
 */
export declare function getVerboseExecutor(): boolean;
/**
 * Set verbose executor setting
 * @param verbose - true to show verbose executor logs
 */
export declare function setVerboseExecutor(verbose: boolean): void;
/**
 * Get single-line mode setting
 * @returns true if single-line input mode (Enter once to send, default: true)
 */
export declare function getSingleLineMode(): boolean;
/**
 * Set single-line mode setting
 * @param enabled - true for single-line mode, false for multi-line mode
 */
export declare function setSingleLineMode(enabled: boolean): void;
//# sourceMappingURL=global-config.d.ts.map