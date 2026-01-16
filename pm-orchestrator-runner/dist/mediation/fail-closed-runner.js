"use strict";
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
exports.FailClosedRunner = void 0;
exports.createFailClosedRunner = createFailClosedRunner;
exports.validateFailClosedRequirements = validateFailClosedRequirements;
const path = __importStar(require("path"));
const llm_client_with_evidence_1 = require("./llm-client-with-evidence");
const llm_sentinel_1 = require("./llm-sentinel");
/**
 * Fail-Closed Runner Integration
 *
 * This class enforces fail-closed behavior for LLM-based operations:
 * - API key must be configured (no fallback to claude-code)
 * - Every LLM call generates evidence
 * - COMPLETE status requires evidence
 */
class FailClosedRunner {
    config;
    llmClient = null;
    sentinel = null;
    initError = null;
    constructor(config) {
        this.config = {
            projectPath: config.projectPath,
            provider: config.provider,
            model: config.model || (config.provider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini'),
            evidenceDir: config.evidenceDir || path.join(config.projectPath, '.claude', 'evidence'),
        };
        // Try to initialize - capture any error for fail-closed behavior
        try {
            this.initialize();
        }
        catch (error) {
            // Store error for later - this is fail-closed behavior
            this.initError = error;
        }
    }
    /**
     * Initialize LLM client and sentinel
     *
     * @throws APIKeyMissingError if API key is not configured
     */
    initialize() {
        // This will throw APIKeyMissingError if key is missing
        this.llmClient = llm_client_with_evidence_1.LLMClientWithEvidence.fromEnv(this.config.evidenceDir, this.config.provider, this.config.model);
        // Initialize sentinel from the same evidence directory
        this.sentinel = llm_sentinel_1.LLMSentinel.fromEvidenceManager(this.llmClient.getEvidenceManager());
    }
    /**
     * Check if runner is ready (fail-closed check)
     *
     * @returns true if runner is ready, false if initialization failed
     */
    isReady() {
        return this.llmClient !== null && this.initError === null;
    }
    /**
     * Get initialization error if any
     */
    getInitError() {
        return this.initError;
    }
    /**
     * Check Double Execution Gate
     *
     * @returns Gate check result, or FAIL if not initialized
     */
    checkExecutionGate() {
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
    determineStatus() {
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
    canAssertComplete() {
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
    getLLMClient() {
        return this.llmClient;
    }
    /**
     * Get the sentinel for verification
     *
     * @returns Sentinel, or null if not initialized
     */
    getSentinel() {
        return this.sentinel;
    }
    /**
     * Get evidence manager
     */
    getEvidenceManager() {
        return this.llmClient?.getEvidenceManager() || null;
    }
    /**
     * Generate verification report
     */
    generateReport() {
        if (!this.sentinel) {
            return 'ERROR: Sentinel not initialized - cannot generate report';
        }
        return this.sentinel.generateReport();
    }
}
exports.FailClosedRunner = FailClosedRunner;
/**
 * Create fail-closed runner for a project
 *
 * @param projectPath - Path to the project
 * @param provider - LLM provider (openai or anthropic)
 * @returns Fail-closed runner instance
 */
function createFailClosedRunner(projectPath, provider = 'openai') {
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
function validateFailClosedRequirements(projectPath, provider = 'openai') {
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
    }
    catch (error) {
        return {
            valid: false,
            error: error.message,
        };
    }
}
//# sourceMappingURL=fail-closed-runner.js.map