"use strict";
/**
 * Output Control Manager
 * Based on 06_CORRECTNESS_PROPERTIES.md L141-147 (Property 15)
 *
 * Property 15: Output Control and Validation
 * - All Claude Code output must be validated by Runner
 * - Output without evidence, speculative expressions, direct communication are rejected
 *
 * Responsible for:
 * - JSON-structured output
 * - next_action field determination
 * - incomplete_task_reasons
 * - Output validation
 * - Evidence summary
 * - Error output formatting
 * - Progress output
 * - Output streaming (NDJSON)
 * - Output destinations
 * - Report generation
 * - Output redaction
 * - Exit codes
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
exports.OutputControlManager = exports.OutputControlError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const enums_1 = require("../models/enums");
const error_codes_1 = require("../errors/error-codes");
/**
 * Output Control Manager Error
 */
class OutputControlError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'OutputControlError';
        this.code = code;
        this.details = details;
    }
}
exports.OutputControlError = OutputControlError;
/**
 * Sensitive field patterns for redaction
 */
const SENSITIVE_PATTERNS = [
    'api_key',
    'apikey',
    'token',
    'secret',
    'password',
    'credential',
    'auth',
    'bearer',
];
/**
 * Exit codes for different statuses
 */
const EXIT_CODES = {
    [enums_1.OverallStatus.COMPLETE]: 0,
    [enums_1.OverallStatus.INCOMPLETE]: 1,
    [enums_1.OverallStatus.NO_EVIDENCE]: 2,
    [enums_1.OverallStatus.ERROR]: 3,
    [enums_1.OverallStatus.INVALID]: 4,
};
/**
 * Valid OverallStatus values
 */
const VALID_STATUSES = Object.values(enums_1.OverallStatus);
/**
 * Output Control Manager class
 */
class OutputControlManager {
    debugMode = false;
    redactionEnabled = true;
    streamingEnabled = false;
    destination = 'stdout';
    outputCallbacks = [];
    /**
     * Create a new OutputControlManager
     */
    constructor() {
        // Default configuration
    }
    /**
     * Set debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
    /**
     * Set redaction enabled
     */
    setRedactionEnabled(enabled) {
        this.redactionEnabled = enabled;
    }
    /**
     * Enable streaming output
     */
    enableStreaming(enabled) {
        this.streamingEnabled = enabled;
    }
    /**
     * Register output callback
     */
    onOutput(callback) {
        this.outputCallbacks.push(callback);
    }
    /**
     * Get default destination
     */
    getDefaultDestination() {
        return 'stdout';
    }
    /**
     * Set output destination
     * @throws OutputControlError if path is not writable
     */
    setDestination(filePath) {
        // Validate that the directory exists and is writable
        const dir = path.dirname(filePath);
        try {
            fs.accessSync(dir, fs.constants.W_OK);
        }
        catch {
            throw new OutputControlError(error_codes_1.ErrorCode.E208_OUTPUT_VALIDATION_FAILED, `Output destination is not writable: ${filePath}`, { path: filePath });
        }
        this.destination = filePath;
    }
    /**
     * Get current destination
     */
    getDestination() {
        return this.destination;
    }
    /**
     * Validate output result
     * @throws OutputControlError if validation fails
     */
    validateResult(result, strict = false) {
        // Check required fields
        if (!result.session_id) {
            throw new OutputControlError(error_codes_1.ErrorCode.E208_OUTPUT_VALIDATION_FAILED, 'Missing required field: session_id', { result });
        }
        if (result.overall_status === undefined) {
            throw new OutputControlError(error_codes_1.ErrorCode.E208_OUTPUT_VALIDATION_FAILED, 'Missing required field: overall_status', { result });
        }
        // Validate overall_status is a valid enum value
        if (!VALID_STATUSES.includes(result.overall_status)) {
            throw new OutputControlError(error_codes_1.ErrorCode.E208_OUTPUT_VALIDATION_FAILED, `Invalid overall_status: ${result.overall_status}`, { result });
        }
        // In strict mode, require tasks_completed and tasks_total
        if (strict) {
            if (result.tasks_completed === undefined) {
                throw new OutputControlError(error_codes_1.ErrorCode.E208_OUTPUT_VALIDATION_FAILED, 'Missing required field: tasks_completed', { result });
            }
            if (result.tasks_total === undefined) {
                throw new OutputControlError(error_codes_1.ErrorCode.E208_OUTPUT_VALIDATION_FAILED, 'Missing required field: tasks_total', { result });
            }
        }
        // Validate tasks_completed <= tasks_total when both are provided
        if (result.tasks_completed !== undefined && result.tasks_total !== undefined) {
            if (result.tasks_completed > result.tasks_total) {
                throw new OutputControlError(error_codes_1.ErrorCode.E208_OUTPUT_VALIDATION_FAILED, `tasks_completed (${result.tasks_completed}) cannot exceed tasks_total (${result.tasks_total})`, { result });
            }
        }
    }
    /**
     * Determine next_action based on status
     */
    determineNextAction(status) {
        return status === enums_1.OverallStatus.COMPLETE;
    }
    /**
     * Get reason for next_action
     */
    getNextActionReason(status, errorMessage) {
        switch (status) {
            case enums_1.OverallStatus.COMPLETE:
                return 'All tasks completed successfully';
            case enums_1.OverallStatus.INCOMPLETE:
                return 'Some tasks are incomplete';
            case enums_1.OverallStatus.ERROR:
                return errorMessage || 'An error occurred during execution';
            case enums_1.OverallStatus.INVALID:
                return 'Session status is invalid';
            case enums_1.OverallStatus.NO_EVIDENCE:
                return 'No evidence collected';
            default:
                return 'Unknown status';
        }
    }
    /**
     * Redact sensitive information from an object
     */
    redactSensitiveData(obj) {
        if (!this.redactionEnabled) {
            return obj;
        }
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase();
            const isSensitive = SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern));
            if (isSensitive && typeof value === 'string') {
                result[key] = '[REDACTED]';
            }
            else if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.redactSensitiveData(value);
            }
            else {
                result[key] = value;
            }
        }
        return result;
    }
    /**
     * Format output result as JSON
     * @throws OutputControlError if validation fails
     */
    formatOutput(result, options) {
        // Validate the result
        this.validateResult(result);
        // Build output object
        const output = {
            timestamp: new Date().toISOString(),
            session_id: result.session_id,
            overall_status: result.overall_status,
            tasks_completed: result.tasks_completed,
            tasks_total: result.tasks_total,
            next_action: this.determineNextAction(result.overall_status),
            next_action_reason: this.getNextActionReason(result.overall_status, result.error_message),
        };
        // Add evidence_hash if provided
        if (result.evidence_hash) {
            output.evidence_hash = result.evidence_hash;
        }
        // Add incomplete_task_reasons
        if (result.incomplete_tasks) {
            output.incomplete_task_reasons = result.incomplete_tasks;
        }
        else {
            output.incomplete_task_reasons = [];
        }
        // Add evidence_summary if provided
        if (result.evidence) {
            output.evidence_summary = {
                files_collected: result.evidence.files_collected,
                hash: result.evidence.hash,
                ...(result.evidence.index_hash && { index_hash: result.evidence.index_hash }),
                location: result.evidence.location,
            };
        }
        // Add error if provided
        if (result.error) {
            output.error = {
                code: result.error.code,
                message: result.error.message,
                ...(this.debugMode && result.error.stack && { stack: result.error.stack }),
            };
        }
        // Add config (redacted if needed)
        if (result.config) {
            output.config = this.redactSensitiveData(result.config);
        }
        // Format as JSON
        const indent = options?.compact ? 0 : 2;
        return JSON.stringify(output, null, indent);
    }
    /**
     * Format progress update
     */
    formatProgress(progressUpdate) {
        const progressPercent = progressUpdate.tasks_total > 0
            ? Math.round((progressUpdate.tasks_completed / progressUpdate.tasks_total) * 100)
            : 0;
        const output = {
            timestamp: new Date().toISOString(),
            type: 'progress',
            session_id: progressUpdate.session_id,
            current_phase: progressUpdate.current_phase,
            tasks_completed: progressUpdate.tasks_completed,
            tasks_total: progressUpdate.tasks_total,
            progress_percent: progressPercent,
        };
        if (progressUpdate.elapsed_seconds !== undefined) {
            output.elapsed_seconds = progressUpdate.elapsed_seconds;
        }
        if (progressUpdate.estimated_remaining_seconds !== undefined) {
            output.eta_seconds = progressUpdate.estimated_remaining_seconds;
        }
        return JSON.stringify(output, null, 2);
    }
    /**
     * Emit progress in streaming mode
     */
    emitProgress(progressUpdate) {
        if (!this.streamingEnabled) {
            return;
        }
        const output = JSON.stringify({
            timestamp: new Date().toISOString(),
            type: 'progress',
            session_id: progressUpdate.session_id,
            current_phase: progressUpdate.current_phase,
            tasks_completed: progressUpdate.tasks_completed,
            tasks_total: progressUpdate.tasks_total,
        });
        // Notify all callbacks
        for (const callback of this.outputCallbacks) {
            callback(output);
        }
    }
    /**
     * Generate final execution report
     */
    generateReport(executionResult) {
        const startedAt = new Date(executionResult.started_at);
        const completedAt = new Date(executionResult.completed_at);
        const durationSeconds = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);
        const report = {
            session_id: executionResult.session_id,
            overall_status: executionResult.overall_status,
            duration_seconds: durationSeconds,
        };
        if (executionResult.phases) {
            report.phases = executionResult.phases;
        }
        if (executionResult.tasks || executionResult.tasks_total !== undefined) {
            report.task_summary = {
                completed: executionResult.tasks_completed,
                total: executionResult.tasks_total,
            };
        }
        return report;
    }
    /**
     * Get exit code for a status
     */
    getExitCode(status) {
        return EXIT_CODES[status];
    }
}
exports.OutputControlManager = OutputControlManager;
//# sourceMappingURL=output-control-manager.js.map