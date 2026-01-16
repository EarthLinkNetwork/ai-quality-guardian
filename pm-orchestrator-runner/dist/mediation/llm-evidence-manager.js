"use strict";
/**
 * LLM Evidence Manager
 *
 * Tracks and verifies evidence of real LLM API calls.
 * This is the fail-closed mechanism that ensures:
 * 1. Every LLM call generates a proof file
 * 2. COMPLETE status can only be asserted with evidence
 * 3. Evidence files are tamper-resistant (hash verification)
 *
 * ARCHITECTURAL RULES:
 * - No evidence file = LLM call did not happen
 * - Evidence must exist BEFORE asserting COMPLETE
 * - Failed calls are also recorded (to prove attempt)
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
exports.LLMEvidenceManager = void 0;
exports.hashRequest = hashRequest;
exports.hashResponse = hashResponse;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
/**
 * LLM Evidence Manager
 *
 * Manages evidence files for LLM API calls.
 * Uses file-based storage for durability and auditability.
 */
class LLMEvidenceManager {
    evidenceDir;
    evidenceMap = new Map();
    constructor(baseDir) {
        this.evidenceDir = path.join(baseDir, 'llm');
        // Ensure evidence directory exists
        if (!fs.existsSync(this.evidenceDir)) {
            fs.mkdirSync(this.evidenceDir, { recursive: true });
        }
        // Load existing evidence files
        this.loadExistingEvidence();
    }
    /**
     * Load existing evidence files from disk
     */
    loadExistingEvidence() {
        if (!fs.existsSync(this.evidenceDir)) {
            return;
        }
        const files = fs.readdirSync(this.evidenceDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(this.evidenceDir, file), 'utf-8');
                    const evidenceFile = JSON.parse(content);
                    if (evidenceFile.evidence && evidenceFile.evidence.call_id) {
                        this.evidenceMap.set(evidenceFile.evidence.call_id, evidenceFile.evidence);
                    }
                }
                catch {
                    // Skip invalid files
                }
            }
        }
    }
    /**
     * Record evidence for an LLM call
     * @returns Path to the evidence file
     */
    recordEvidence(evidence) {
        // Calculate integrity hash of the evidence
        const evidenceJson = JSON.stringify(evidence);
        const integrityHash = crypto.createHash('sha256').update(evidenceJson).digest('hex');
        const evidenceFile = {
            evidence,
            integrity_hash: integrityHash,
        };
        // Write to file
        const filename = `${evidence.call_id}.json`;
        const filepath = path.join(this.evidenceDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(evidenceFile, null, 2), 'utf-8');
        // Update in-memory map
        this.evidenceMap.set(evidence.call_id, evidence);
        return filepath;
    }
    /**
     * Check if evidence exists for a call
     */
    hasEvidence(callId) {
        // First check in-memory
        if (this.evidenceMap.has(callId)) {
            return true;
        }
        // Then check on disk
        const filepath = path.join(this.evidenceDir, `${callId}.json`);
        return fs.existsSync(filepath);
    }
    /**
     * Get evidence by call ID
     */
    getEvidence(callId) {
        // First check in-memory
        if (this.evidenceMap.has(callId)) {
            return this.evidenceMap.get(callId);
        }
        // Then check on disk
        const filepath = path.join(this.evidenceDir, `${callId}.json`);
        if (!fs.existsSync(filepath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(filepath, 'utf-8');
            const evidenceFile = JSON.parse(content);
            // Cache in memory
            this.evidenceMap.set(callId, evidenceFile.evidence);
            return evidenceFile.evidence;
        }
        catch {
            return null;
        }
    }
    /**
     * List all evidence
     */
    listEvidence() {
        // Reload from disk to ensure we have all evidence
        this.loadExistingEvidence();
        return Array.from(this.evidenceMap.values());
    }
    /**
     * Get evidence statistics
     */
    getStats() {
        const allEvidence = this.listEvidence();
        const successful = allEvidence.filter(e => e.success);
        const failed = allEvidence.filter(e => !e.success);
        return {
            total_calls: allEvidence.length,
            successful_calls: successful.length,
            failed_calls: failed.length,
        };
    }
    /**
     * Check if we can assert COMPLETE status
     * Requires at least one successful LLM call with evidence
     */
    canAssertComplete() {
        const allEvidence = this.listEvidence();
        // No evidence at all = cannot assert COMPLETE
        if (allEvidence.length === 0) {
            return false;
        }
        // At least one successful call required
        return allEvidence.some(e => e.success);
    }
    /**
     * Verify integrity of an evidence file
     * Detects tampering by comparing stored hash with recalculated hash
     */
    verifyIntegrity(callId) {
        const filepath = path.join(this.evidenceDir, `${callId}.json`);
        if (!fs.existsSync(filepath)) {
            return false;
        }
        try {
            const content = fs.readFileSync(filepath, 'utf-8');
            const evidenceFile = JSON.parse(content);
            // Recalculate hash
            const evidenceJson = JSON.stringify(evidenceFile.evidence);
            const calculatedHash = crypto.createHash('sha256').update(evidenceJson).digest('hex');
            // Compare with stored hash
            return calculatedHash === evidenceFile.integrity_hash;
        }
        catch {
            return false;
        }
    }
    /**
     * Get evidence directory path
     */
    getEvidenceDir() {
        return this.evidenceDir;
    }
}
exports.LLMEvidenceManager = LLMEvidenceManager;
/**
 * Create hash for request payload
 */
function hashRequest(messages) {
    const content = JSON.stringify(messages);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}
/**
 * Create hash for response content
 */
function hashResponse(content) {
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}
//# sourceMappingURL=llm-evidence-manager.js.map