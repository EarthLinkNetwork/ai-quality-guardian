/**
 * LLM Client with Evidence Recording
 *
 * Extends LLMClient with automatic evidence recording for fail-closed behavior.
 * Every API call generates a proof file that can be verified.
 *
 * ARCHITECTURAL RULES:
 * - Every LLM call MUST generate evidence
 * - COMPLETE status can only be asserted if evidence exists
 * - Double Execution Gate: API key check + Evidence file check
 */
import { LLMProvider, ChatMessage, LLMResponse } from './llm-client';
import { LLMEvidenceManager, LLMEvidence } from './llm-evidence-manager';
/**
 * Configuration for LLM Client with Evidence
 */
export interface LLMClientWithEvidenceConfig {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    evidenceDir: string;
}
/**
 * Double Execution Gate result
 */
export interface ExecutionGateResult {
    gate1_api_key: 'PASS' | 'FAIL';
    gate2_evidence_ready: 'PASS' | 'FAIL';
    can_execute: boolean;
    failure_reason?: string;
}
/**
 * LLM Client with automatic evidence recording
 *
 * Implements Double Execution Gate:
 * - Gate 1: API key validation (fail-closed)
 * - Gate 2: Evidence directory ready (fail-closed)
 *
 * Both gates must pass before any LLM call can be made.
 */
export declare class LLMClientWithEvidence {
    private readonly client;
    private readonly evidenceManager;
    private readonly provider;
    private readonly model;
    private gateCheckPerformed;
    private gateResult;
    constructor(config: LLMClientWithEvidenceConfig);
    /**
     * Create client from environment with evidence recording
     * @throws APIKeyMissingError if API key is not set (fail-closed)
     */
    static fromEnv(evidenceDir: string, provider?: LLMProvider, model?: string, options?: {
        temperature?: number;
    }): LLMClientWithEvidence;
    /**
     * Check Double Execution Gate
     *
     * Gate 1: API key is valid (already checked in constructor)
     * Gate 2: Evidence directory is ready
     *
     * @returns Gate check result
     */
    checkExecutionGate(): ExecutionGateResult;
    /**
     * Send chat completion request with automatic evidence recording
     *
     * @throws Error if Double Execution Gate not passed
     */
    chat(messages: ChatMessage[]): Promise<LLMResponse & {
        evidence_id: string;
    }>;
    /**
     * Check if COMPLETE status can be asserted
     *
     * This is the fail-closed check:
     * - Returns true only if at least one successful LLM call has evidence
     * - Returns false if no evidence exists or all calls failed
     */
    canAssertComplete(): boolean;
    /**
     * Get evidence statistics
     */
    getEvidenceStats(): import("./llm-evidence-manager").EvidenceStats;
    /**
     * Get evidence by call ID
     */
    getEvidence(callId: string): LLMEvidence | null;
    /**
     * Verify evidence integrity
     */
    verifyEvidence(callId: string): boolean;
    /**
     * List all evidence
     */
    listEvidence(): LLMEvidence[];
    /**
     * Get the underlying evidence manager
     */
    getEvidenceManager(): LLMEvidenceManager;
    /**
     * Get the configured provider
     */
    getProvider(): LLMProvider;
    /**
     * Get the configured model
     */
    getModel(): string;
    /**
     * Generate unique call ID
     */
    private generateCallId;
}
/**
 * Create LLM Client with Evidence (convenience function)
 *
 * @param evidenceDir - Directory to store evidence files
 * @param provider - LLM provider (default: openai)
 * @param model - Model name (optional)
 * @throws APIKeyMissingError if API key is not configured
 */
export declare function createLLMClientWithEvidence(evidenceDir: string, provider?: LLMProvider, model?: string): LLMClientWithEvidence;
//# sourceMappingURL=llm-client-with-evidence.d.ts.map