/**
 * ExecutionResult Model
 * Based on 05_DATA_MODELS.md L65-78
 */
import { OverallStatus } from './enums';
import { Task } from './task';
/**
 * Evidence summary structure
 */
export interface EvidenceSummary {
    total: number;
    collected: number;
}
/**
 * Evidence inventory structure
 */
export interface EvidenceInventoryResult {
    total_evidence_items: number;
    missing_evidence_operations: string[];
    integrity_failures: string[];
    raw_evidence_files: string[];
}
/**
 * Violation record
 */
export interface Violation {
    type: string;
    message: string;
    timestamp: string;
    task_id?: string;
}
/**
 * Incomplete task reason
 */
export interface IncompleteTaskReason {
    task_id: string;
    reason: string;
}
/**
 * ExecutionResult data structure
 */
export interface ExecutionResult {
    overall_status: OverallStatus;
    tasks: Task[];
    evidence_summary: EvidenceSummary;
    next_action: boolean;
    next_action_reason: string;
    violations: Violation[];
    session_id: string;
    incomplete_task_reasons: IncompleteTaskReason[];
    evidence_inventory: EvidenceInventoryResult;
    speculative_language_detected: boolean;
}
/**
 * ExecutionResult validation error
 */
export declare class ExecutionResultValidationError extends Error {
    constructor(message: string);
}
/**
 * Create a new execution result
 */
export declare function createExecutionResult(sessionId: string, status: OverallStatus, tasks: Task[]): ExecutionResult;
/**
 * Validate an execution result object
 * @throws ExecutionResultValidationError if validation fails
 */
export declare function validateExecutionResult(result: ExecutionResult): boolean;
/**
 * Add violation to execution result
 */
export declare function addViolation(result: ExecutionResult, type: string, message: string, taskId?: string): ExecutionResult;
/**
 * Add incomplete task reason
 */
export declare function addIncompleteTaskReason(result: ExecutionResult, taskId: string, reason: string): ExecutionResult;
/**
 * Update evidence inventory
 */
export declare function updateEvidenceInventory(result: ExecutionResult, inventory: Partial<EvidenceInventoryResult>): ExecutionResult;
/**
 * Mark speculative language detected
 */
export declare function markSpeculativeLanguageDetected(result: ExecutionResult): ExecutionResult;
/**
 * Update next action with explicit approval
 */
export declare function approveNextAction(result: ExecutionResult, reason: string): ExecutionResult;
//# sourceMappingURL=execution-result.d.ts.map