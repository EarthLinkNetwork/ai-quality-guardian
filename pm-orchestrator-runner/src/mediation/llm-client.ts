/**
 * LLM Client - Real API calls to LLM providers
 *
 * REQUIREMENTS:
 * - NO stubs, mocks, or fixed responses
 * - temperature > 0 required (non-deterministic output)
 * - API key from environment variables only
 * - fail-closed on missing API key
 */

/**
 * LLM Provider types
 */
export type LLMProvider = 'openai' | 'anthropic';

/**
 * LLM Client configuration
 */
export interface LLMClientConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  temperature?: number;  // Must be > 0, defaults to 0.7
  maxTokens?: number;
  baseUrl?: string;  // For custom endpoints
}

/**
 * Chat message format
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * LLM response
 */
export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Error thrown when API key is missing (fail-closed)
 */
export class APIKeyMissingError extends Error {
  constructor(provider: LLMProvider) {
    super(`API key not found for provider: ${provider}. Set ${getEnvVarName(provider)} environment variable.`);
    this.name = 'APIKeyMissingError';
  }
}

/**
 * Error thrown when LLM API call fails
 */
export class LLMAPIError extends Error {
  constructor(
    public readonly provider: LLMProvider,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(`LLM API error (${provider}): ${statusCode} - ${responseBody}`);
    this.name = 'LLMAPIError';
  }
}

/**
 * Get environment variable name for API key
 */
function getEnvVarName(provider: LLMProvider): string {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
  }
}

/**
 * Get API key from environment variable
 * @throws APIKeyMissingError if key is not set (fail-closed)
 */
export function getAPIKeyFromEnv(provider: LLMProvider): string {
  const envVar = getEnvVarName(provider);
  const apiKey = process.env[envVar];

  if (!apiKey || apiKey.trim() === '') {
    throw new APIKeyMissingError(provider);
  }

  return apiKey.trim();
}

/**
 * Default configuration for providers
 */
const DEFAULT_CONFIGS: Record<LLMProvider, { baseUrl: string; defaultModel: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-haiku-20240307',
  },
};

/**
 * LLM Client class - Makes real API calls to LLM providers
 *
 * IMPORTANT: This class NEVER uses stubs or mocks.
 * All calls go to the real LLM API.
 */
export class LLMClient {
  private readonly config: Required<LLMClientConfig>;

  constructor(config: LLMClientConfig) {
    // Validate temperature > 0 (required for non-determinism)
    const temperature = config.temperature ?? 0.7;
    if (temperature <= 0) {
      throw new Error('temperature must be > 0 to ensure non-deterministic output');
    }

    this.config = {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      temperature,
      maxTokens: config.maxTokens ?? 1024,
      baseUrl: config.baseUrl ?? DEFAULT_CONFIGS[config.provider].baseUrl,
    };
  }

  /**
   * Create LLM client from environment variables
   * @throws APIKeyMissingError if API key is not set (fail-closed)
   */
  static fromEnv(
    provider: LLMProvider = 'openai',
    model?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): LLMClient {
    const apiKey = getAPIKeyFromEnv(provider);
    return new LLMClient({
      provider,
      model: model ?? DEFAULT_CONFIGS[provider].defaultModel,
      apiKey,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 1024,
    });
  }

  /**
   * Send chat completion request to LLM
   */
  async chat(messages: ChatMessage[]): Promise<LLMResponse> {
    switch (this.config.provider) {
      case 'openai':
        return this.chatOpenAI(messages);
      case 'anthropic':
        return this.chatAnthropic(messages);
    }
  }

  /**
   * OpenAI API call
   */
  private async chatOpenAI(messages: ChatMessage[]): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new LLMAPIError('openai', response.status, body);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model,
      usage: data.usage,
    };
  }

  /**
   * Anthropic API call
   */
  private async chatAnthropic(messages: ChatMessage[]): Promise<LLMResponse> {
    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: systemMessage?.content,
        messages: conversationMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new LLMAPIError('anthropic', response.status, body);
    }

    const data = await response.json() as {
      content: Array<{ text: string }>;
      model: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content[0]?.text ?? '',
      model: data.model,
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
    };
  }

  /**
   * Get the configured model name
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Get the configured provider
   */
  getProvider(): LLMProvider {
    return this.config.provider;
  }
}
