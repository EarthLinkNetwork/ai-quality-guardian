"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClientWithEvidence = void 0;
exports.createLLMClientWithEvidence = createLLMClientWithEvidence;
const crypto = __importStar(require("crypto"));
const llm_client_1 = require("./llm-client");
const llm_evidence_manager_1 = require("./llm-evidence-manager");
/**
 * LLM Client with automatic evidence recording
 *
 * Implements Double Execution Gate:
 * - Gate 1: API key validation (fail-closed)
 * - Gate 2: Evidence directory ready (fail-closed)
 *
 * Both gates must pass before any LLM call can be made.
 */
class LLMClientWithEvidence {
    client;
    evidenceManager;
    provider;
    model;
    gateCheckPerformed = false;
    gateResult = null;
    constructor(config) {
        // Gate 1: API key validation (fail-closed)
        // This will throw APIKeyMissingError if key is not set
        this.client = llm_client_1.LLMClient.fromEnv(config.provider ?? 'openai', config.model, { temperature: config.temperature ?? 0.7 });
        // Gate 2: Evidence directory initialization
        this.evidenceManager = new llm_evidence_manager_1.LLMEvidenceManager(config.evidenceDir);
        this.provider = config.provider ?? 'openai';
        this.model = config.model ?? (config.provider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini');
    }
    /**
     * Create client from environment with evidence recording
     * @throws APIKeyMissingError if API key is not set (fail-closed)
     */
    static fromEnv(evidenceDir, provider = 'openai', model, options) {
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
    checkExecutionGate() {
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
    async chat(messages) {
        // Enforce Double Execution Gate check
        if (!this.gateCheckPerformed) {
            this.checkExecutionGate();
        }
        if (!this.gateResult?.can_execute) {
            throw new Error(`LLM execution blocked by Double Execution Gate: ${this.gateResult?.failure_reason}`);
        }
        const callId = this.generateCallId();
        const requestHash = (0, llm_evidence_manager_1.hashRequest)(messages);
        const startTime = Date.now();
        try {
            // Make the actual API call
            const response = await this.client.chat(messages);
            const endTime = Date.now();
            // Record success evidence
            const evidence = {
                call_id: callId,
                provider: this.provider,
                model: this.model,
                request_hash: requestHash,
                response_hash: (0, llm_evidence_manager_1.hashResponse)(response.content),
                timestamp: new Date().toISOString(),
                duration_ms: endTime - startTime,
                success: true,
            };
            this.evidenceManager.recordEvidence(evidence);
            return {
                ...response,
                evidence_id: callId,
            };
        }
        catch (error) {
            const endTime = Date.now();
            // Record failure evidence
            const evidence = {
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
    canAssertComplete() {
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
    getEvidence(callId) {
        return this.evidenceManager.getEvidence(callId);
    }
    /**
     * Verify evidence integrity
     */
    verifyEvidence(callId) {
        return this.evidenceManager.verifyIntegrity(callId);
    }
    /**
     * List all evidence
     */
    listEvidence() {
        return this.evidenceManager.listEvidence();
    }
    /**
     * Get the underlying evidence manager
     */
    getEvidenceManager() {
        return this.evidenceManager;
    }
    /**
     * Get the configured provider
     */
    getProvider() {
        return this.provider;
    }
    /**
     * Get the configured model
     */
    getModel() {
        return this.model;
    }
    /**
     * Generate unique call ID
     */
    generateCallId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        return `llm-${timestamp}-${random}`;
    }
}
exports.LLMClientWithEvidence = LLMClientWithEvidence;
/**
 * Create LLM Client with Evidence (convenience function)
 *
 * @param evidenceDir - Directory to store evidence files
 * @param provider - LLM provider (default: openai)
 * @param model - Model name (optional)
 * @throws APIKeyMissingError if API key is not configured
 */
function createLLMClientWithEvidence(evidenceDir, provider = 'openai', model) {
    return LLMClientWithEvidence.fromEnv(evidenceDir, provider, model);
}
//# sourceMappingURL=llm-client-with-evidence.js.map