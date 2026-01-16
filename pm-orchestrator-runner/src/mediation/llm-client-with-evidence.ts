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

import * as crypto from 'crypto';
import {
  LLMClient,
  LLMProvider,
  ChatMessage,
  LLMResponse,
  APIKeyMissingError,
} from './llm-client';
import {
  LLMEvidenceManager,
  LLMEvidence,
  hashRequest,
  hashResponse,
} from './llm-evidence-manager';

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
export class LLMClientWithEvidence {
  private readonly client: LLMClient;
  private readonly evidenceManager: LLMEvidenceManager;
  private readonly provider: LLMProvider;
  private readonly model: string;
  private gateCheckPerformed = false;
  private gateResult: ExecutionGateResult | null = null;

  constructor(config: LLMClientWithEvidenceConfig) {
    // Gate 1: API key validation (fail-closed)
    // This will throw APIKeyMissingError if key is not set
    this.client = LLMClient.fromEnv(
      config.provider ?? 'openai',
      config.model,
      { temperature: config.temperature ?? 0.7 }
    );

    // Gate 2: Evidence directory initialization
    this.evidenceManager = new LLMEvidenceManager(config.evidenceDir);

    this.provider = config.provider ?? 'openai';
    this.model = config.model ?? (config.provider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini');
  }

  /**
   * Create client from environment with evidence recording
   * @throws APIKeyMissingError if API key is not set (fail-closed)
   */
  static fromEnv(
    evidenceDir: string,
    provider: LLMProvider = 'openai',
    model?: string,
    options?: { temperature?: number }
  ): LLMClientWithEvidence {
    return new LLMClientWithEvidence({
      provider,
      model,
      temperature: options?.temperature,
      evidenceDir,
    });
  }

  /**
   * Check Double Execution Gate
   *
   * Gate 1: API key is valid (already checked in constructor)
   * Gate 2: Evidence directory is ready
   *
   * @returns Gate check result
   */
  checkExecutionGate(): ExecutionGateResult {
    // Gate 1 passed if we got here (constructor would throw otherwise)
    const gate1Pass = true;

    // Gate 2: Evidence directory ready
    const evidenceDir = this.evidenceManager.getEvidenceDir();
    const gate2Pass = evidenceDir !== null && evidenceDir !== undefined;

    this.gateResult = {
      gate1_api_key: gate1Pass ? 'PASS' : 'FAIL',
      gate2_evidence_ready: gate2Pass ? 'PASS' : 'FAIL',
      can_execute: gate1Pass && gate2Pass,
      failure_reason: !gate1Pass
        ? 'API key not configured'
        : !gate2Pass
          ? 'Evidence directory not ready'
          : undefined,
    };

    this.gateCheckPerformed = true;
    return this.gateResult;
  }

  /**
   * Send chat completion request with automatic evidence recording
   *
   * @throws Error if Double Execution Gate not passed
   */
  async chat(messages: ChatMessage[]): Promise<LLMResponse & { evidence_id: string }> {
    // Enforce Double Execution Gate check
    if (!this.gateCheckPerformed) {
      this.checkExecutionGate();
    }

    if (!this.gateResult?.can_execute) {
      throw new Error(`LLM execution blocked by Double Execution Gate: ${this.gateResult?.failure_reason}`);
    }

    const callId = this.generateCallId();
    const requestHash = hashRequest(messages);
    const startTime = Date.now();

    try {
      // Make the actual API call
      const response = await this.client.chat(messages);
      const endTime = Date.now();

      // Record success evidence
      const evidence: LLMEvidence = {
        call_id: callId,
        provider: this.provider,
        model: this.model,
        request_hash: requestHash,
        response_hash: hashResponse(response.content),
        timestamp: new Date().toISOString(),
        duration_ms: endTime - startTime,
        success: true,
      };

      this.evidenceManager.recordEvidence(evidence);

      return {
        ...response,
        evidence_id: callId,
      };
    } catch (error) {
      const endTime = Date.now();

      // Record failure evidence
      const evidence: LLMEvidence = {
        call_id: callId,
        provider: this.provider,
        model: this.model,
        request_hash: requestHash,
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: endTime - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      this.evidenceManager.recordEvidence(evidence);

      // Re-throw the error
      throw error;
    }
  }

  /**
   * Check if COMPLETE status can be asserted
   *
   * This is the fail-closed check:
   * - Returns true only if at least one successful LLM call has evidence
   * - Returns false if no evidence exists or all calls failed
   */
  canAssertComplete(): boolean {
    return this.evidenceManager.canAssertComplete();
  }

  /**
   * Get evidence statistics
   */
  getEvidenceStats() {
    return this.evidenceManager.getStats();
  }

  /**
   * Get evidence by call ID
   */
  getEvidence(callId: string): LLMEvidence | null {
    return this.evidenceManager.getEvidence(callId);
  }

  /**
   * Verify evidence integrity
   */
  verifyEvidence(callId: string): boolean {
    return this.evidenceManager.verifyIntegrity(callId);
  }

  /**
   * List all evidence
   */
  listEvidence(): LLMEvidence[] {
    return this.evidenceManager.listEvidence();
  }

  /**
   * Get the underlying evidence manager
   */
  getEvidenceManager(): LLMEvidenceManager {
    return this.evidenceManager;
  }

  /**
   * Get the configured provider
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Get the configured model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `llm-${timestamp}-${random}`;
  }
}

/**
 * Create LLM Client with Evidence (convenience function)
 *
 * @param evidenceDir - Directory to store evidence files
 * @param provider - LLM provider (default: openai)
 * @param model - Model name (optional)
 * @throws APIKeyMissingError if API key is not configured
 */
export function createLLMClientWithEvidence(
  evidenceDir: string,
  provider: LLMProvider = 'openai',
  model?: string
): LLMClientWithEvidence {
  return LLMClientWithEvidence.fromEnv(evidenceDir, provider, model);
}
