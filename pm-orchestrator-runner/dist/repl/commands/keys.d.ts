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
export declare class KeysCommand {
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
    getKeyStatus(): Promise<KeysResult>;
    /**
     * Set API key in global config
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24:
     * - API key value is stored but NEVER displayed
     *
     * @param provider - Provider ID (openai or anthropic)
     * @param key - API key value
     * @returns Keys result
     */
    setKey(provider: string, key: string): Promise<KeysResult>;
    /**
     * Check if a specific provider's API key is configured
     *
     * @param providerId - Provider ID
     * @returns Keys result for specific provider
     */
    checkProviderKey(providerId: string): Promise<KeysResult>;
    /**
     * Format key status for display
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24:
     * - NEVER show actual key values
     * - Only show SET/NOT SET status
     *
     * @param keys - Key status list
     * @returns Formatted string
     */
    formatKeyStatus(keys: KeyStatus[]): string;
}
//# sourceMappingURL=keys.d.ts.map