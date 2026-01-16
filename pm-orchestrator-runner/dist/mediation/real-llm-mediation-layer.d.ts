/**
 * Real LLM Mediation Layer
 *
 * Uses REAL LLM API calls (no stubs/mocks) to:
 * 1. Generate natural language questions from structured reason codes
 * 2. Normalize free-form user input into structured tasks
 *
 * ARCHITECTURAL RULES:
 * - This layer sits ABOVE Runner Core
 * - Runner Core returns ONLY structured signals (no conversational text)
 * - This layer generates ALL human-readable text via LLM
 * - Output structure is ALWAYS stable regardless of LLM text variation
 */
import { LLMClient, LLMProvider } from './llm-client';
import { ClarificationReason, RunnerSignal, ParsedUserResponse, NormalizedTask, MediationOutput } from './llm-mediation-layer';
/**
 * Configuration for Real LLM Mediation Layer
 */
export interface RealLLMConfig {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
}
/**
 * Real LLM Mediation Layer
 *
 * IMPORTANT: This class makes REAL API calls to LLM providers.
 * - No stubs or mocks
 * - temperature > 0 for non-deterministic output
 * - Output varies every call, but structure remains stable
 */
export declare class RealLLMMediationLayer {
    private readonly client;
    constructor(config?: RealLLMConfig);
    /**
     * Get the LLM client (for testing/inspection)
     */
    getClient(): LLMClient;
    /**
     * Process Runner signal and generate appropriate output using LLM
     *
     * @param signal - Structured signal from Runner Core
     * @returns Mediation output with LLM-generated question
     */
    processRunnerSignal(signal: RunnerSignal): Promise<MediationOutput>;
    /**
     * Parse and normalize user response using LLM
     *
     * @param userInput - Raw user input string
     * @param context - Context from previous clarification
     * @returns Parsed user response (structure is stable regardless of LLM variation)
     */
    parseUserResponse(userInput: string, context: {
        clarification_reason?: ClarificationReason;
        target_file?: string;
        original_prompt?: string;
    }): Promise<ParsedUserResponse>;
    /**
     * Normalize user response into explicit task for Runner
     *
     * @param originalPrompt - Original user prompt
     * @param signal - Runner signal that triggered clarification
     * @param parsedResponse - Parsed user response
     * @returns Normalized task (structure is always stable)
     */
    normalizeToTask(originalPrompt: string, signal: RunnerSignal, parsedResponse: ParsedUserResponse): Promise<NormalizedTask | null>;
    /**
     * Generate question via LLM from clarification reason
     *
     * Each call may produce different text, but conveys the same meaning.
     */
    private generateQuestion;
    /**
     * Generate status message via LLM
     */
    private generateStatusMessage;
    /**
     * Generate explicit prompt for Runner
     */
    private generateExplicitPrompt;
    /**
     * Get human-readable description for clarification reason
     */
    private getReasonDescription;
    /**
     * Get suggested responses for clarification reason
     */
    private getSuggestedResponses;
    /**
     * Build prompt for parsing user response
     */
    private buildParsePrompt;
    /**
     * Parse LLM classification response into ParsedUserResponse
     *
     * This is the NORMALIZATION step - ensures stable structure regardless of LLM variation
     */
    private parseClassificationResponse;
    /**
     * Generate alternative file name (deterministic, no LLM)
     */
    private generateAlternativeName;
}
//# sourceMappingURL=real-llm-mediation-layer.d.ts.map