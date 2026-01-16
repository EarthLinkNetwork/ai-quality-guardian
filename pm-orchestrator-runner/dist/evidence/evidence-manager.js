"use strict";
/**
 * Evidence Manager
 * Based on 04_COMPONENTS.md L133-154
 *
 * Responsible for:
 * - Evidence collection and storage
 * - Hash verification
 * - Evidence index management
 * - Atomic evidence recording
 * - Evidence inventory tracking
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
exports.EvidenceManager = exports.EvidenceManagerError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const error_codes_1 = require("../errors/error-codes");
/**
 * Evidence Manager Error
 */
class EvidenceManagerError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'EvidenceManagerError';
        this.code = code;
        this.details = details;
    }
}
exports.EvidenceManagerError = EvidenceManagerError;
/**
 * Evidence Manager class
 */
class EvidenceManager {
    baseDir;
    sessions;
    /**
     * Create a new EvidenceManager
     * @param baseDir Base directory for evidence storage
     */
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.sessions = new Map();
    }
    /**
     * Initialize evidence directory for a session
     */
    initializeSession(sessionId) {
        const sessionDir = path.join(this.baseDir, sessionId);
        const rawLogsDir = path.join(sessionDir, 'raw_logs');
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.mkdirSync(rawLogsDir, { recursive: true });
        // Initialize session data
        this.sessions.set(sessionId, {
            evidenceMap: new Map(),
            registeredOperations: new Set(),
            operationToEvidence: new Map(),
            integrityFailures: new Set(),
            rawLogFiles: [],
        });
    }
    /**
     * Record evidence for a session
     * @throws EvidenceManagerError with E301 if session not found or validation fails
     */
    recordEvidence(sessionId, evidence) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE, `Session not initialized: ${sessionId}`, { sessionId });
        }
        // Check for atomic operation requirement (Property 18)
        if (!evidence.atomic_operation) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE, 'Evidence must be from atomic operation (atomic_operation must be true)', { evidenceId: evidence.evidence_id });
        }
        // Reject aggregated evidence (Property 18)
        if (evidence.aggregated === true) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE, 'Evidence aggregation is prohibited', { evidenceId: evidence.evidence_id });
        }
        // Store evidence
        sessionData.evidenceMap.set(evidence.evidence_id, evidence);
        // Associate with operation if operation_id provided
        if (evidence.operation_id) {
            sessionData.operationToEvidence.set(evidence.operation_id, evidence.evidence_id);
        }
        // Persist evidence to disk
        const sessionDir = path.join(this.baseDir, sessionId);
        const evidencePath = path.join(sessionDir, `${evidence.evidence_id}.json`);
        fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');
    }
    /**
     * Get evidence by ID
     * @throws EvidenceManagerError if evidence not found
     */
    getEvidence(sessionId, evidenceId) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE, `Session not initialized: ${sessionId}`, { sessionId });
        }
        const evidence = sessionData.evidenceMap.get(evidenceId);
        if (!evidence) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE, `Evidence not found: ${evidenceId}`, { sessionId, evidenceId });
        }
        return evidence;
    }
    /**
     * List all evidence for a session
     */
    listEvidence(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            return [];
        }
        return Array.from(sessionData.evidenceMap.values());
    }
    /**
     * Verify evidence hash
     * @throws EvidenceManagerError with E304 on hash mismatch
     */
    verifyEvidence(sessionId, evidenceId) {
        const sessionData = this.sessions.get(sessionId);
        const evidence = this.getEvidence(sessionId, evidenceId);
        // Calculate hash from artifacts content
        const content = this.getEvidenceContent(evidence);
        const calculatedHash = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
        if (calculatedHash !== evidence.hash) {
            // Track integrity failure
            sessionData?.integrityFailures.add(evidenceId);
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E304_EVIDENCE_HASH_MISMATCH, `Hash mismatch for evidence: ${evidenceId}`, { evidenceId, expectedHash: evidence.hash, calculatedHash });
        }
        return true;
    }
    /**
     * Get content for hash calculation
     */
    getEvidenceContent(evidence) {
        if (evidence.artifacts.length === 0) {
            return '';
        }
        // Concatenate artifact contents
        return evidence.artifacts
            .map((a) => a.content || '')
            .join('');
    }
    /**
     * Finalize session - create evidence_index.json and evidence_index.sha256
     */
    finalizeSession(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E301_EVIDENCE_COLLECTION_FAILURE, `Session not initialized: ${sessionId}`, { sessionId });
        }
        const sessionDir = path.join(this.baseDir, sessionId);
        // Create evidence index
        const evidenceItems = Array.from(sessionData.evidenceMap.values()).map(e => ({
            evidence_id: e.evidence_id,
            operation_type: e.operation_type,
            timestamp: e.timestamp,
            hash: e.hash,
        }));
        const index = {
            session_id: sessionId,
            created_at: new Date().toISOString(),
            finalized_at: new Date().toISOString(),
            evidence_items: evidenceItems,
            total_items: evidenceItems.length,
        };
        // Write evidence_index.json
        const indexPath = path.join(sessionDir, 'evidence_index.json');
        const indexContent = JSON.stringify(index, null, 2);
        fs.writeFileSync(indexPath, indexContent, 'utf-8');
        // Write evidence_index.sha256 (hash of evidence_index.json ONLY - user clarification)
        const indexHash = crypto.createHash('sha256').update(indexContent).digest('hex');
        const sha256Path = path.join(sessionDir, 'evidence_index.sha256');
        fs.writeFileSync(sha256Path, indexHash, 'utf-8');
        // Create report.json
        const reportPath = path.join(sessionDir, 'report.json');
        const report = {
            session_id: sessionId,
            generated_at: new Date().toISOString(),
            total_evidence_items: evidenceItems.length,
            integrity_verified: sessionData.integrityFailures.size === 0,
            summary: {
                operations: evidenceItems.map(e => e.operation_type),
            },
        };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    }
    /**
     * Verify session integrity (check evidence_index.json hash)
     * @throws EvidenceManagerError with E304 if tampered
     */
    verifySessionIntegrity(sessionId) {
        const sessionDir = path.join(this.baseDir, sessionId);
        const indexPath = path.join(sessionDir, 'evidence_index.json');
        const sha256Path = path.join(sessionDir, 'evidence_index.sha256');
        if (!fs.existsSync(indexPath) || !fs.existsSync(sha256Path)) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E302_EVIDENCE_INDEX_CORRUPTION, 'Evidence index files missing', { sessionId });
        }
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        const storedHash = fs.readFileSync(sha256Path, 'utf-8').trim();
        const calculatedHash = crypto.createHash('sha256').update(indexContent).digest('hex');
        if (storedHash !== calculatedHash) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E304_EVIDENCE_HASH_MISMATCH, 'Evidence index has been modified after finalization', { sessionId, expectedHash: storedHash, calculatedHash });
        }
        return true;
    }
    /**
     * Load evidence index from disk
     * @throws EvidenceManagerError with E302 if corrupted
     */
    loadEvidenceIndex(sessionId) {
        const sessionDir = path.join(this.baseDir, sessionId);
        const indexPath = path.join(sessionDir, 'evidence_index.json');
        if (!fs.existsSync(indexPath)) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E302_EVIDENCE_INDEX_CORRUPTION, 'Evidence index not found', { sessionId });
        }
        try {
            const content = fs.readFileSync(indexPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E302_EVIDENCE_INDEX_CORRUPTION, 'Evidence index is corrupted', { sessionId, error: error.message });
        }
    }
    /**
     * Store raw log for an executor
     */
    storeRawLog(sessionId, executorId, content) {
        const sessionData = this.sessions.get(sessionId);
        const sessionDir = path.join(this.baseDir, sessionId);
        const rawLogsDir = path.join(sessionDir, 'raw_logs');
        // Ensure raw_logs directory exists
        if (!fs.existsSync(rawLogsDir)) {
            fs.mkdirSync(rawLogsDir, { recursive: true });
        }
        const timestamp = Date.now();
        const logFileName = `${executorId}-${timestamp}.log`;
        const logPath = path.join(rawLogsDir, logFileName);
        fs.writeFileSync(logPath, content, 'utf-8');
        // Track raw log file
        if (sessionData) {
            sessionData.rawLogFiles.push(logPath);
        }
        return logPath;
    }
    /**
     * Verify raw logs exist
     * @throws EvidenceManagerError with E303 if raw log missing
     */
    verifyRawLogs(sessionId, evidenceId) {
        const evidence = this.getEvidence(sessionId, evidenceId);
        // Check main raw_logs path
        if (evidence.raw_logs && !fs.existsSync(evidence.raw_logs)) {
            throw new EvidenceManagerError(error_codes_1.ErrorCode.E303_RAW_LOG_MISSING, `Raw log file not found: ${evidence.raw_logs}`, { sessionId, evidenceId, rawLogs: evidence.raw_logs });
        }
        // Check raw_evidence_refs
        for (const ref of evidence.raw_evidence_refs) {
            if (!fs.existsSync(ref)) {
                throw new EvidenceManagerError(error_codes_1.ErrorCode.E303_RAW_LOG_MISSING, `Raw evidence reference not found: ${ref}`, { sessionId, evidenceId, missingRef: ref });
            }
        }
        return true;
    }
    /**
     * Register an operation for evidence tracking
     */
    registerOperation(sessionId, operationId) {
        const sessionData = this.sessions.get(sessionId);
        if (sessionData) {
            sessionData.registeredOperations.add(operationId);
        }
    }
    /**
     * Get evidence inventory for a session
     */
    getEvidenceInventory(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            return {
                total_evidence_items: 0,
                missing_evidence_operations: [],
                integrity_failures: [],
                raw_evidence_files: [],
            };
        }
        // Find operations without evidence
        const missingOperations = [];
        for (const opId of sessionData.registeredOperations) {
            if (!sessionData.operationToEvidence.has(opId)) {
                missingOperations.push(opId);
            }
        }
        return {
            total_evidence_items: sessionData.evidenceMap.size,
            missing_evidence_operations: missingOperations,
            integrity_failures: Array.from(sessionData.integrityFailures),
            raw_evidence_files: sessionData.rawLogFiles,
        };
    }
}
exports.EvidenceManager = EvidenceManager;
//# sourceMappingURL=evidence-manager.js.map