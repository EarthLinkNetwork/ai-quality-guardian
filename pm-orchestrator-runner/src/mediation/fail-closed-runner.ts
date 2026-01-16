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

import * as path from 'path';
import { LLMClientWithEvidence, ExecutionGateResult } from './llm-client-with-evidence';
import { LLMSentinel, SentinelVerificationResult } from './llm-sentinel';
import { LLMEvidenceManager, LLMEvidence } from './llm-evidence-manager';
import { APIKeyMissingError, LLMProvider } from './llm-client';

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
export class FailClosedRunner {
  private readonly config: Required<FailClosedRunnerConfig>;
  private llmClient: LLMClientWithEvidence | null = null;
  private sentinel: LLMSentinel | null = null;
  private initError: Error | null = null;

  constructor(config: FailClosedRunnerConfig) {
    this.config = {
      projectPath: config.projectPath,
      provider: config.provider,
      model: config.model || (config.provider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini'),
      evidenceDir: config.evidenceDir || path.join(config.projectPath, '.claude', 'evidence'),
    };

    // Try to initialize - capture any error for fail-closed behavior
    try {
      this.initialize();
    } catch (error) {
      // Store error for later - this is fail-closed behavior
      this.initError = error as Error;
    }
  }

  /**
   * Initialize LLM client and sentinel
   *
   * @throws APIKeyMissingError if API key is not configured
   */
  private initialize(): void {
    // This will throw APIKeyMissingError if key is missing
    this.llmClient = LLMClientWithEvidence.fromEnv(
      this.config.evidenceDir,
      this.config.provider,
      this.config.model
    );

    // Initialize sentinel from the same evidence directory
    this.sentinel = LLMSentinel.fromEvidenceManager(
      this.llmClient.getEvidenceManager()
    );
  }

  /**
   * Check if runner is ready (fail-closed check)
   *
   * @returns true if runner is ready, false if initialization failed
   */
  isReady(): boolean {
    return this.llmClient !== null && this.initError === null;
  }

  /**
   * Get initialization error if any
   */
  getInitError(): Error | null {
    return this.initError;
  }

  /**
   * Check Double Execution Gate
   *
   * @returns Gate check result, or FAIL if not initialized
   */
  checkExecutionGate(): ExecutionGateResult {
    if (!this.llmClient) {
      return {
        gate1_api_key: 'FAIL',
        gate2_evidence_ready: 'FAIL',
        can_execute: false,
        failure_reason: this.initError?.message || 'LLM client not initialized',
      };
    }

    return this.llmClient.checkExecutionGate();
  }

  /**
   * Determine if COMPLETE status can be asserted
   *
   * This is the main fail-closed check that should be called
   * before reporting any task as COMPLETE.
   */
  determineStatus(): StatusDeterminationResult {
    // Gate check first
    const executionGate = this.checkExecutionGate();

    if (!executionGate.can_execute) {
      return {
        canAssertComplete: false,
        executionGate,
        failureReason: executionGate.failure_reason,
      };
    }

    // Sentinel verification
    if (!this.sentinel) {
      return {
        canAssertComplete: false,
        executionGate,
        failureReason: 'Sentinel not initialized',
      };
    }

    const sentinelVerification = this.sentinel.verify();

    return {
      canAssertComplete: sentinelVerification.can_assert_complete,
      executionGate,
      sentinelVerification,
      failureReason: sentinelVerification.failure_reason,
    };
  }

  /**
   * Quick check if COMPLETE can be asserted
   *
   * Lightweight version without full verification.
   */
  canAssertComplete(): boolean {
    if (!this.sentinel) {
      return false;
    }
    return this.sentinel.canAssertComplete();
  }

  /**
   * Get the LLM client for making API calls
   *
   * @returns LLM client, or null if not initialized
   */
  getLLMClient(): LLMClientWithEvidence | null {
    return this.llmClient;
  }

  /**
   * Get the sentinel for verification
   *
   * @returns Sentinel, or null if not initialized
   */
  getSentinel(): LLMSentinel | null {
    return this.sentinel;
  }

  /**
   * Get evidence manager
   */
  getEvidenceManager(): LLMEvidenceManager | null {
    return this.llmClient?.getEvidenceManager() || null;
  }

  /**
   * Generate verification report
   */
  generateReport(): string {
    if (!this.sentinel) {
      return 'ERROR: Sentinel not initialized - cannot generate report';
    }
    return this.sentinel.generateReport();
  }
}

/**
 * Create fail-closed runner for a project
 *
 * @param projectPath - Path to the project
 * @param provider - LLM provider (openai or anthropic)
 * @returns Fail-closed runner instance
 */
export function createFailClosedRunner(
  projectPath: string,
  provider: LLMProvider = 'openai'
): FailClosedRunner {
  return new FailClosedRunner({
    projectPath,
    provider,
  });
}

/**
 * Validate fail-closed requirements before task execution
 *
 * @param projectPath - Path to the project
 * @param provider - LLM provider
 * @returns Validation result
 */
export function validateFailClosedRequirements(
  projectPath: string,
  provider: LLMProvider = 'openai'
): { valid: boolean; error?: string } {
  try {
    const runner = createFailClosedRunner(projectPath, provider);

    if (!runner.isReady()) {
      const error = runner.getInitError();
      return {
        valid: false,
        error: error?.message || 'Failed to initialize fail-closed runner',
      };
    }

    const gateResult = runner.checkExecutionGate();
    if (!gateResult.can_execute) {
      return {
        valid: false,
        error: gateResult.failure_reason,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: (error as Error).message,
    };
  }
}
