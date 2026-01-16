/**
 * Supporting Structures
 * Based on 05_DATA_MODELS.md L79-101
 */
/**
 * TaskLimits validation error
 */
export declare class TaskLimitsValidationError extends Error {
    constructor(message: string);
}
/**
 * LimitViolation validation error
 */
export declare class LimitViolationValidationError extends Error {
    constructor(message: string);
}
/**
 * EvidenceInventory validation error
 */
export declare class EvidenceInventoryValidationError extends Error {
    constructor(message: string);
}
/**
 * TaskLimits structure (L81-86)
 */
export interface TaskLimits {
    max_files: number;
    max_tests: number;
    max_seconds: number;
}
/**
 * LimitViolation structure (L88-94)
 */
export interface LimitViolation {
    limit_type: string;
    limit_value: number;
    actual_value: number;
    timestamp: string;
    resolution_required: boolean;
}
/**
 * EvidenceInventory structure (L96-101)
 */
export interface EvidenceInventory {
    total_evidence_items: number;
    missing_evidence_operations: string[];
    integrity_failures: string[];
    raw_evidence_files: string[];
}
/**
 * Create task limits with defaults
 */
export declare function createTaskLimits(maxFiles?: number, maxTests?: number, maxSeconds?: number): TaskLimits;
/**
 * Validate task limits
 * @throws TaskLimitsValidationError if validation fails
 */
export declare function validateTaskLimits(limits: TaskLimits): boolean;
/**
 * Create limit violation
 */
export declare function createLimitViolation(limitType: string, limitValue: number, actualValue: number): LimitViolation;
/**
 * Validate limit violation
 * @throws LimitViolationValidationError if validation fails
 */
export declare function validateLimitViolation(violation: LimitViolation): boolean;
/**
 * Create empty evidence inventory
 */
export declare function createEvidenceInventory(): EvidenceInventory;
/**
 * Validate evidence inventory
 * @throws EvidenceInventoryValidationError if validation fails
 */
export declare function validateEvidenceInventory(inventory: EvidenceInventory): boolean;
/**
 * Add missing evidence operation
 */
export declare function addMissingEvidenceOperation(inventory: EvidenceInventory, operationId: string): EvidenceInventory;
/**
 * Add integrity failure
 */
export declare function addIntegrityFailure(inventory: EvidenceInventory, evidenceId: string): EvidenceInventory;
/**
 * Add raw evidence file
 */
export declare function addRawEvidenceFile(inventory: EvidenceInventory, filePath: string): EvidenceInventory;
/**
 * Increment evidence item count
 */
export declare function incrementEvidenceCount(inventory: EvidenceInventory, count?: number): EvidenceInventory;
/**
 * Check if inventory has issues (missing evidence or integrity failures)
 */
export declare function hasInventoryIssues(inventory: EvidenceInventory): boolean;
//# sourceMappingURL=supporting.d.ts.map