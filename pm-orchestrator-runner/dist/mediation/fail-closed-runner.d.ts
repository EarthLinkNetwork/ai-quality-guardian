/**
 * Fail-Closed Runner Integration
 *
 * Integrates LLM evidence tracking with the Runner Core.
 * Ensures COMPLETE status can only be asserted when evidence exists.
 *
 * ARCHITECTURAL RULES:
 * - provider=openai/anthropic + missing key = ERROR (no claude-code fallback)
 * - Every LLM call generates evidence
 * - COMPLETE requires canAssertComplete() = true
 */
import { LLMClientWithEvidence, ExecutionGateResult } from './llm-client-with-evidence';
import { LLMSentinel, SentinelVerificationResult } from './llm-sentinel';
import { LLMEvidenceManager } from './llm-evidence-manager';
import { LLMProvider } from './llm-client';
/**
 * Fail-closed runner configuration
 */
export interface FailClosedRunnerConfig {
    /** Project path */
    projectPath: string;
    /** LLM provider (openai or anthropic) */
    provider: LLMProvider;
    /** Model name (optional) */
    model?: string;
    /** Evidence directory (optional, defaults to .claude/evidence) */
    evidenceDir?: string;
}
/**
 * Status determination result
 */
export interface StatusDeterminationResult {
    /** Can assert COMPLETE status */
    canAssertComplete: boolean;
    /** Execution gate result */
    executionGate: ExecutionGateResult;
    /** Sentinel verification result */
    sentinelVerification?: SentinelVerificationResult;
    /** Reason if cannot assert COMPLETE */
    failureReason?: string;
}
/**
 * Fail-Closed Runner Integration
 *
 * This class enforces fail-closed behavior for LLM-based operations:
 * - API key must be configured (no fallback to claude-code)
 * - Every LLM call generates evidence
 * - COMPLETE status requires evidence
 */
export declare class FailClosedRunner {
    private readonly config;
    private llmClient;
    private sentinel;
    private initError;
    constructor(config: FailClosedRunnerConfig);
    /**
     * Initialize LLM client and sentinel
     *
     * @throws APIKeyMissingError if API key is not configured
     */
    private initialize;
    /**
     * Check if runner is ready (fail-closed check)
     *
     * @returns true if runner is ready, false if initialization failed
     */
    isReady(): boolean;
    /**
     * Get initialization error if any
     */
    getInitError(): Error | null;
    /**
     * Check Double Execution Gate
     *
     * @returns Gate check result, or FAIL if not initialized
     */
    checkExecutionGate(): ExecutionGateResult;
    /**
     * Determine if COMPLETE status can be asserted
     *
     * This is the main fail-closed check that should be called
     * before reporting any task as COMPLETE.
     */
    determineStatus(): StatusDeterminationResult;
    /**
     * Quick check if COMPLETE can be asserted
     *
     * Lightweight version without full verification.
     */
    canAssertComplete(): boolean;
    /**
     * Get the LLM client for making API calls
     *
     * @returns LLM client, or null if not initialized
     */
    getLLMClient(): LLMClientWithEvidence | null;
    /**
     * Get the sentinel for verification
     *
     * @returns Sentinel, or null if not initialized
     */
    getSentinel(): LLMSentinel | null;
    /**
     * Get evidence manager
     */
    getEvidenceManager(): LLMEvidenceManager | null;
    /**
     * Generate verification report
     */
    generateReport(): string;
}
/**
 * Create fail-closed runner for a project
 *
 * @param projectPath - Path to the project
 * @param provider - LLM provider (openai or anthropic)
 * @returns Fail-closed runner instance
 */
export declare function createFailClosedRunner(projectPath: string, provider?: LLMProvider): FailClosedRunner;
/**
 * Validate fail-closed requirements before task execution
 *
 * @param projectPath - Path to the project
 * @param provider - LLM provider
 * @returns Validation result
 */
export declare function validateFailClosedRequirements(projectPath: string, provider?: LLMProvider): {
    valid: boolean;
    error?: string;
};
//# sourceMappingURL=fail-closed-runner.d.ts.map