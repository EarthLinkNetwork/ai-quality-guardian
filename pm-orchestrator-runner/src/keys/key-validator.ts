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
export async function validateOpenAIKey(key: string): Promise<KeyValidationResult> {
  const provider = 'openai' as const;

  if (!key || key.length < 10) {
    return { valid: false, provider, error: 'Key too short' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (response.status === 200) {
      return { valid: true, provider };
    }

    if (response.status === 401) {
      return { valid: false, provider, error: 'Invalid API key' };
    }

    if (response.status === 429) {
      return { valid: false, provider, error: 'Rate limited - please try again' };
    }

    return {
      valid: false,
      provider,
      error: `Unexpected response: ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    return { valid: false, provider, error: message };
  }
}

/**
 * Validate an Anthropic API key by calling the messages endpoint
 * with an invalid request. A 400 error means the key is valid
 * (auth passed, but request was invalid). A 401 means invalid key.
 */
export async function validateAnthropicKey(key: string): Promise<KeyValidationResult> {
  const provider = 'anthropic' as const;

  if (!key || key.length < 10) {
    return { valid: false, provider, error: 'Key too short' };
  }

  try {
    // Send an intentionally minimal/invalid request to check auth
    // A 400 error means auth passed, 401 means invalid key
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [],
      }),
    });

    // 400 = auth OK, invalid request (expected)
    // 200 = auth OK, request succeeded (unexpected but valid)
    if (response.status === 400 || response.status === 200) {
      return { valid: true, provider };
    }

    if (response.status === 401) {
      return { valid: false, provider, error: 'Invalid API key' };
    }

    if (response.status === 429) {
      return { valid: false, provider, error: 'Rate limited - please try again' };
    }

    return {
      valid: false,
      provider,
      error: `Unexpected response: ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    return { valid: false, provider, error: message };
  }
}

/**
 * Validate an API key for any supported provider.
 */
export async function validateApiKey(
  provider: string,
  key: string
): Promise<KeyValidationResult> {
  const normalizedProvider = provider.toLowerCase();

  switch (normalizedProvider) {
    case 'openai':
      return validateOpenAIKey(key);
    case 'anthropic':
      return validateAnthropicKey(key);
    default:
      return {
        valid: false,
        provider: 'openai', // fallback for type
        error: `Unknown provider: ${provider}`,
      };
  }
}

/**
 * Check if the key format looks valid (basic sanity check).
 * Does NOT validate against the API.
 */
export function isKeyFormatValid(provider: string, key: string): boolean {
  if (!key || key.length < 10) {
    return false;
  }

  const normalizedProvider = provider.toLowerCase();

  switch (normalizedProvider) {
    case 'openai':
      // OpenAI keys typically start with 'sk-'
      return key.startsWith('sk-');
    case 'anthropic':
      // Anthropic keys typically start with 'sk-ant-'
      return key.startsWith('sk-ant-');
    default:
      return key.length >= 10;
  }
}
