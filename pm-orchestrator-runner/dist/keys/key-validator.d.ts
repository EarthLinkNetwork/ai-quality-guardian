/**
 * API Key Validator
 *
 * Validates API keys for OpenAI and Anthropic providers
 * by making lightweight API calls to verify authentication.
 *
 * SECURITY: Keys are NEVER logged. Validation results contain
 * only boolean status and error messages, never the key itself.
 */
export interface KeyValidationResult {
    valid: boolean;
    provider: 'openai' | 'anthropic';
    error?: string;
}
/**
 * Validate an OpenAI API key by calling the models list endpoint.
 * This is a lightweight, read-only endpoint that requires auth.
 */
export declare function validateOpenAIKey(key: string): Promise<KeyValidationResult>;
/**
 * Validate an Anthropic API key by calling the messages endpoint
 * with an invalid request. A 400 error means the key is valid
 * (auth passed, but request was invalid). A 401 means invalid key.
 */
export declare function validateAnthropicKey(key: string): Promise<KeyValidationResult>;
/**
 * Validate an API key for any supported provider.
 */
export declare function validateApiKey(provider: string, key: string): Promise<KeyValidationResult>;
/**
 * Check if the key format looks valid (basic sanity check).
 * Does NOT validate against the API.
 */
export declare function isKeyFormatValid(provider: string, key: string): boolean;
//# sourceMappingURL=key-validator.d.ts.map