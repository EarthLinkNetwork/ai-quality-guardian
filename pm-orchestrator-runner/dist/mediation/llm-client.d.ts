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
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
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
export declare class APIKeyMissingError extends Error {
    constructor(provider: LLMProvider);
}
/**
 * Error thrown when LLM API call fails
 */
export declare class LLMAPIError extends Error {
    readonly provider: LLMProvider;
    readonly statusCode: number;
    readonly responseBody: string;
    constructor(provider: LLMProvider, statusCode: number, responseBody: string);
}
/**
 * Get API key from environment variable
 * @throws APIKeyMissingError if key is not set (fail-closed)
 */
export declare function getAPIKeyFromEnv(provider: LLMProvider): string;
/**
 * LLM Client class - Makes real API calls to LLM providers
 *
 * IMPORTANT: This class NEVER uses stubs or mocks.
 * All calls go to the real LLM API.
 */
export declare class LLMClient {
    private readonly config;
    constructor(config: LLMClientConfig);
    /**
     * Create LLM client from environment variables
     * @throws APIKeyMissingError if API key is not set (fail-closed)
     */
    static fromEnv(provider?: LLMProvider, model?: string, options?: {
        temperature?: number;
        maxTokens?: number;
    }): LLMClient;
    /**
     * Send chat completion request to LLM
     */
    chat(messages: ChatMessage[]): Promise<LLMResponse>;
    /**
     * OpenAI API call
     */
    private chatOpenAI;
    /**
     * Anthropic API call
     */
    private chatAnthropic;
    /**
     * Get the configured model name
     */
    getModel(): string;
    /**
     * Get the configured provider
     */
    getProvider(): LLMProvider;
}
//# sourceMappingURL=llm-client.d.ts.map