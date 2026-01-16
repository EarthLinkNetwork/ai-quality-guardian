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
 * Get API key for a provider
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
 * Check if any API key is configured
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
//# sourceMappingURL=global-config.d.ts.map