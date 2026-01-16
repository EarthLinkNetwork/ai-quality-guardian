"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MASKING_PATTERNS = void 0;
exports.maskSensitiveData = maskSensitiveData;
exports.containsSensitiveData = containsSensitiveData;
exports.maskSensitiveObject = maskSensitiveObject;
exports.getApiKeyStatus = getApiKeyStatus;
exports.checkApiKeyForProvider = checkApiKeyForProvider;
exports.getPatternsByPriority = getPatternsByPriority;
/**
 * Masking patterns ordered by priority (higher priority first)
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25 Section 3
 */
const MASKING_PATTERNS = [
    // Priority 1 - Critical Secrets
    {
        name: 'OpenAI API Key',
        regex: /sk-[A-Za-z0-9]{20,}/g,
        mask: '[MASKED:OPENAI_KEY]',
        priority: 1,
    },
    {
        name: 'Anthropic API Key',
        regex: /sk-ant-[A-Za-z0-9-]{20,}/g,
        mask: '[MASKED:ANTHROPIC_KEY]',
        priority: 1,
    },
    {
        name: 'Private Key',
        regex: /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
        mask: '[MASKED:PRIVATE_KEY]',
        priority: 1,
    },
    // Priority 2 - Tokens and Auth Headers
    {
        name: 'JWT Token',
        regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        mask: '[MASKED:JWT]',
        priority: 2,
    },
    {
        name: 'Authorization Header',
        regex: /Authorization:\s*(Basic|Digest|Bearer)?\s*[A-Za-z0-9+/=_.-]+/gi,
        mask: 'Authorization: [MASKED:AUTH_HEADER]',
        priority: 2,
    },
    {
        name: 'Cookie',
        regex: /Cookie:\s*[^\n\r]+/gi,
        mask: 'Cookie: [MASKED:COOKIE]',
        priority: 2,
    },
    {
        name: 'Set-Cookie',
        regex: /Set-Cookie:\s*[^\n\r]+/gi,
        mask: 'Set-Cookie: [MASKED:SET_COOKIE]',
        priority: 2,
    },
    // Priority 3 - Credentials
    {
        name: 'JSON Credential',
        regex: /"(?:apiKey|password|secret|token|api_key|auth_token|access_token|refresh_token)":\s*"[^"]+"/gi,
        mask: '"[key]": "[MASKED:JSON_CREDENTIAL]"',
        priority: 3,
    },
    {
        name: 'Environment Credential',
        regex: /[A-Z_]*(?:PASSWORD|SECRET|KEY|TOKEN|CREDENTIAL)[A-Z_]*=[^\s\n]+/gi,
        mask: '[MASKED:ENV_CREDENTIAL]',
        priority: 3,
    },
    {
        name: 'Bearer Token',
        regex: /Bearer\s+[A-Za-z0-9._-]+/g,
        mask: '[MASKED:BEARER_TOKEN]',
        priority: 3,
    },
    // Priority 4 - Generic Secrets
    {
        name: 'Generic Secret',
        regex: /(?:\b(?:password|secret|token|api_key|apikey|credential)[_\w]*|\bauth_[_\w]*)\s*[=:]\s*["']?[^\s"'\n,}]+["']?/gi,
        mask: '[MASKED:GENERIC_SECRET]',
        priority: 4,
    },
];
exports.MASKING_PATTERNS = MASKING_PATTERNS;
/**
 * Mask sensitive data in a string
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 4.3
 *
 * Patterns are applied in priority order (1 first, then 2, etc.)
 *
 * @param content - Content to mask
 * @returns Masked content
 */
function maskSensitiveData(content) {
    if (!content || typeof content !== 'string') {
        return content;
    }
    let masked = content;
    try {
        // Sort patterns by priority and apply in order
        const sortedPatterns = [...MASKING_PATTERNS].sort((a, b) => a.priority - b.priority);
        for (const pattern of sortedPatterns) {
            // Reset regex lastIndex for global patterns
            pattern.regex.lastIndex = 0;
            masked = masked.replace(pattern.regex, pattern.mask);
        }
        return masked;
    }
    catch {
        // Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 4.4:
        // On masking error, return a safe placeholder
        return '[MASKING_ERROR]';
    }
}
/**
 * Check if content contains sensitive data
 *
 * @param content - Content to check
 * @returns true if sensitive data is detected
 */
function containsSensitiveData(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }
    for (const pattern of MASKING_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(content)) {
            return true;
        }
    }
    return false;
}
/**
 * Mask sensitive data in an object (recursive)
 *
 * @param obj - Object to mask
 * @returns Masked object
 */
function maskSensitiveObject(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === 'string') {
        return maskSensitiveData(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => maskSensitiveObject(item));
    }
    if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = maskSensitiveObject(value);
        }
        return result;
    }
    return obj;
}
/**
 * Get API key status (SET/NOT SET) without revealing the value
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 24
 *
 * @param envVar - Environment variable name
 * @returns 'SET' or 'NOT SET'
 */
function getApiKeyStatus(envVar) {
    const value = process.env[envVar];
    return (value && value.trim() !== '') ? 'SET' : 'NOT SET';
}
/**
 * Check API key availability for a provider
 *
 * @param provider - Provider identifier
 * @returns Object with status and env variable name
 */
function checkApiKeyForProvider(provider) {
    const keyMapping = {
        'claude-code': null,
        'openai': 'OPENAI_API_KEY',
        'anthropic': 'ANTHROPIC_API_KEY',
    };
    const envVar = keyMapping[provider];
    if (envVar === null || envVar === undefined) {
        return { required: false, envVar: null, status: 'NOT_REQUIRED' };
    }
    return {
        required: true,
        envVar,
        status: getApiKeyStatus(envVar),
    };
}
/**
 * Get list of pattern names by priority
 */
function getPatternsByPriority(priority) {
    return MASKING_PATTERNS
        .filter(p => p.priority === priority)
        .map(p => p.name);
}
//# sourceMappingURL=sensitive-data-masker.js.map