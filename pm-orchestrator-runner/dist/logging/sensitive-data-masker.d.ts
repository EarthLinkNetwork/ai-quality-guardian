/**
 * Sensitive Data Masker
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 4:
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24/25:
 *
 * 11 Masking Patterns across 4 Priority Levels:
 *
 * Priority 1 - Critical Secrets:
 *   1. OpenAI API Key: sk-[A-Za-z0-9]{20,}
 *   2. Anthropic API Key: sk-ant-[A-Za-z0-9-]{20,}
 *   3. Private Key blocks: -----BEGIN.*PRIVATE KEY-----
 *
 * Priority 2 - Tokens and Auth Headers:
 *   4. JWT Token: eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+
 *   5. Authorization Header: Authorization:\s*\S+
 *   6. Cookie: Cookie:\s*.+
 *   7. Set-Cookie: Set-Cookie:\s*.+
 *
 * Priority 3 - Credentials:
 *   8. JSON Credential: "(?:apiKey|password|secret|token)":\s*"[^"]+"
 *   9. Environment Credential: [A-Z_]+(?:PASSWORD|SECRET|KEY|TOKEN)=[^\s]+
 *   10. Bearer Token: Bearer\s+[A-Za-z0-9._-]+
 *
 * Priority 4 - Generic Secrets:
 *   11. Generic Secret: (?:password|secret|token)\s*[=:]\s*["']?[^\s"']+
 */
/**
 * Masking pattern definition with priority
 */
interface MaskingPattern {
    name: string;
    regex: RegExp;
    mask: string;
    priority: 1 | 2 | 3 | 4;
}
/**
 * Masking patterns ordered by priority (higher priority first)
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25 Section 3
 */
declare const MASKING_PATTERNS: MaskingPattern[];
/**
 * Mask sensitive data in a string
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 4.3
 *
 * Patterns are applied in priority order (1 first, then 2, etc.)
 *
 * @param content - Content to mask
 * @returns Masked content
 */
export declare function maskSensitiveData(content: string): string;
/**
 * Check if content contains sensitive data
 *
 * @param content - Content to check
 * @returns true if sensitive data is detected
 */
export declare function containsSensitiveData(content: string): boolean;
/**
 * Mask sensitive data in an object (recursive)
 *
 * @param obj - Object to mask
 * @returns Masked object
 */
export declare function maskSensitiveObject<T>(obj: T): T;
/**
 * Get API key status (SET/NOT SET) without revealing the value
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24
 *
 * @param envVar - Environment variable name
 * @returns 'SET' or 'NOT SET'
 */
export declare function getApiKeyStatus(envVar: string): 'SET' | 'NOT SET';
/**
 * Check API key availability for a provider
 *
 * @param provider - Provider identifier
 * @returns Object with status and env variable name
 */
export declare function checkApiKeyForProvider(provider: string): {
    required: boolean;
    envVar: string | null;
    status: 'SET' | 'NOT SET' | 'NOT_REQUIRED';
};
/**
 * Get list of pattern names by priority
 */
export declare function getPatternsByPriority(priority: 1 | 2 | 3 | 4): string[];
export { MASKING_PATTERNS };
//# sourceMappingURL=sensitive-data-masker.d.ts.map