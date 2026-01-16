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
import { OverallStatus, TaskStatus } from '../models/enums';
import { ErrorCode } from '../errors/error-codes';
/**
 * Output Control Manager Error
 */
export declare class OutputControlError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Format options interface
 */
interface FormatOptions {
    compact?: boolean;
}
/**
 * Incomplete task interface
 */
interface IncompleteTask {
    task_id: string;
    reason: string;
}
/**
 * Evidence interface
 */
interface Evidence {
    files_collected: number;
    hash: string;
    index_hash?: string;
    location: string;
}
/**
 * Error info interface
 */
interface ErrorInfo {
    code: ErrorCode;
    message: string;
    stack?: string;
}
/**
 * Output result interface
 */
interface OutputResult {
    session_id: string;
    overall_status: OverallStatus;
    tasks_completed?: number;
    tasks_total?: number;
    evidence_hash?: string;
    incomplete_tasks?: IncompleteTask[];
    evidence?: Evidence;
    error?: ErrorInfo;
    error_message?: string;
    config?: Record<string, unknown>;
}
/**
 * Progress update interface
 */
interface ProgressUpdate {
    session_id: string;
    current_phase: string;
    tasks_completed: number;
    tasks_total: number;
    elapsed_seconds?: number;
    estimated_remaining_seconds?: number;
}
/**
 * Phase info interface
 */
interface PhaseInfo {
    name: string;
    status: string;
    duration_seconds: number;
}
/**
 * Task info interface
 */
interface TaskInfo {
    id: string;
    status: TaskStatus;
    duration_seconds: number;
}
/**
 * Execution result interface
 */
interface ExecutionResult {
    session_id: string;
    overall_status: OverallStatus;
    started_at: string;
    completed_at: string;
    tasks_completed: number;
    tasks_total: number;
    phases?: PhaseInfo[];
    tasks?: TaskInfo[];
}
/**
 * Report interface
 */
interface Report {
    session_id: string;
    overall_status: OverallStatus;
    duration_seconds: number;
    phases?: PhaseInfo[];
    task_summary?: {
        completed: number;
        total: number;
    };
}
/**
 * Output callback type
 */
type OutputCallback = (output: string) => void;
/**
 * Output Control Manager class
 */
export declare class OutputControlManager {
    private debugMode;
    private redactionEnabled;
    private streamingEnabled;
    private destination;
    private outputCallbacks;
    /**
     * Create a new OutputControlManager
     */
    constructor();
    /**
     * Set debug mode
     */
    setDebugMode(enabled: boolean): void;
    /**
     * Set redaction enabled
     */
    setRedactionEnabled(enabled: boolean): void;
    /**
     * Enable streaming output
     */
    enableStreaming(enabled: boolean): void;
    /**
     * Register output callback
     */
    onOutput(callback: OutputCallback): void;
    /**
     * Get default destination
     */
    getDefaultDestination(): string;
    /**
     * Set output destination
     * @throws OutputControlError if path is not writable
     */
    setDestination(filePath: string): void;
    /**
     * Get current destination
     */
    getDestination(): string;
    /**
     * Validate output result
     * @throws OutputControlError if validation fails
     */
    private validateResult;
    /**
     * Determine next_action based on status
     */
    private determineNextAction;
    /**
     * Get reason for next_action
     */
    private getNextActionReason;
    /**
     * Redact sensitive information from an object
     */
    private redactSensitiveData;
    /**
     * Format output result as JSON
     * @throws OutputControlError if validation fails
     */
    formatOutput(result: OutputResult, options?: FormatOptions): string;
    /**
     * Format progress update
     */
    formatProgress(progressUpdate: ProgressUpdate): string;
    /**
     * Emit progress in streaming mode
     */
    emitProgress(progressUpdate: ProgressUpdate): void;
    /**
     * Generate final execution report
     */
    generateReport(executionResult: ExecutionResult): Report;
    /**
     * Get exit code for a status
     */
    getExitCode(status: OverallStatus): number;
}
export {};
//# sourceMappingURL=output-control-manager.d.ts.map