/**
 * Key Input - Interactive hidden input for API keys
 *
 * Provides secure input collection for API keys:
 * - Hidden input (characters not echoed)
 * - Double-entry confirmation
 * - SECURITY: Keys are NEVER logged
 */
/**
 * Result of key input operation
 */
export interface KeyInputResult {
    success: boolean;
    key?: string;
    error?: string;
    cancelled?: boolean;
}
/**
 * Read a single line with hidden input (password-style)
 * Characters are not echoed to the terminal
 */
export declare function readHiddenInput(prompt: string): Promise<string>;
/**
 * Interactively prompt for an API key with double-entry confirmation
 *
 * Flow:
 * 1. Prompt for API key (hidden input)
 * 2. Prompt to confirm (hidden input)
 * 3. Check if entries match
 * 4. Return key if matched, error if not
 *
 * SECURITY: The key is returned only in the result object, never logged
 */
export declare function promptForApiKey(provider: string): Promise<KeyInputResult>;
//# sourceMappingURL=key-input.d.ts.map