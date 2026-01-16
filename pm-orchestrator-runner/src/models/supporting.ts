/**
 * Supporting Structures
 * Based on 05_DATA_MODELS.md L79-101
 */

/**
 * Task limits range constraints (from 04_COMPONENTS.md L70-72)
 */
const LIMITS_RANGE = {
  max_files: { min: 1, max: 20 },
  max_tests: { min: 1, max: 50 },
  max_seconds: { min: 30, max: 900 },
};

/**
 * Default task limits
 */
const DEFAULT_LIMITS = {
  max_files: 5,
  max_tests: 10,
  max_seconds: 300,
};

/**
 * TaskLimits validation error
 */
export class TaskLimitsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskLimitsValidationError';
  }
}

/**
 * LimitViolation validation error
 */
export class LimitViolationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitViolationValidationError';
  }
}

/**
 * EvidenceInventory validation error
 */
export class EvidenceInventoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceInventoryValidationError';
  }
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
export function createTaskLimits(
  maxFiles: number = DEFAULT_LIMITS.max_files,
  maxTests: number = DEFAULT_LIMITS.max_tests,
  maxSeconds: number = DEFAULT_LIMITS.max_seconds
): TaskLimits {
  return {
    max_files: maxFiles,
    max_tests: maxTests,
    max_seconds: maxSeconds,
  };
}

/**
 * Validate task limits
 * @throws TaskLimitsValidationError if validation fails
 */
export function validateTaskLimits(limits: TaskLimits): boolean {
  if (
    limits.max_files < LIMITS_RANGE.max_files.min ||
    limits.max_files > LIMITS_RANGE.max_files.max
  ) {
    throw new TaskLimitsValidationError(
      `max_files must be between ${LIMITS_RANGE.max_files.min} and ${LIMITS_RANGE.max_files.max}`
    );
  }

  if (
    limits.max_tests < LIMITS_RANGE.max_tests.min ||
    limits.max_tests > LIMITS_RANGE.max_tests.max
  ) {
    throw new TaskLimitsValidationError(
      `max_tests must be between ${LIMITS_RANGE.max_tests.min} and ${LIMITS_RANGE.max_tests.max}`
    );
  }

  if (
    limits.max_seconds < LIMITS_RANGE.max_seconds.min ||
    limits.max_seconds > LIMITS_RANGE.max_seconds.max
  ) {
    throw new TaskLimitsValidationError(
      `max_seconds must be between ${LIMITS_RANGE.max_seconds.min} and ${LIMITS_RANGE.max_seconds.max}`
    );
  }

  return true;
}

/**
 * Create limit violation
 */
export function createLimitViolation(
  limitType: string,
  limitValue: number,
  actualValue: number
): LimitViolation {
  return {
    limit_type: limitType,
    limit_value: limitValue,
    actual_value: actualValue,
    timestamp: new Date().toISOString(),
    resolution_required: true,
  };
}

/**
 * Validate limit violation
 * @throws LimitViolationValidationError if validation fails
 */
export function validateLimitViolation(violation: LimitViolation): boolean {
  if (!violation.limit_type || violation.limit_type.length === 0) {
    throw new LimitViolationValidationError('limit_type is required');
  }

  if (violation.limit_value === undefined) {
    throw new LimitViolationValidationError('limit_value is required');
  }

  if (violation.actual_value === undefined) {
    throw new LimitViolationValidationError('actual_value is required');
  }

  if (!violation.timestamp || violation.timestamp.length === 0) {
    throw new LimitViolationValidationError('timestamp is required');
  }

  const timestamp = new Date(violation.timestamp);
  if (isNaN(timestamp.getTime())) {
    throw new LimitViolationValidationError('timestamp must be a valid ISO 8601 timestamp');
  }

  if (violation.resolution_required === undefined) {
    throw new LimitViolationValidationError('resolution_required is required');
  }

  return true;
}

/**
 * Create empty evidence inventory
 */
export function createEvidenceInventory(): EvidenceInventory {
  return {
    total_evidence_items: 0,
    missing_evidence_operations: [],
    integrity_failures: [],
    raw_evidence_files: [],
  };
}

/**
 * Validate evidence inventory
 * @throws EvidenceInventoryValidationError if validation fails
 */
export function validateEvidenceInventory(inventory: EvidenceInventory): boolean {
  if (inventory.total_evidence_items === undefined) {
    throw new EvidenceInventoryValidationError('total_evidence_items is required');
  }

  if (inventory.total_evidence_items < 0) {
    throw new EvidenceInventoryValidationError('total_evidence_items must be non-negative');
  }

  if (!Array.isArray(inventory.missing_evidence_operations)) {
    throw new EvidenceInventoryValidationError('missing_evidence_operations must be an array');
  }

  if (!Array.isArray(inventory.integrity_failures)) {
    throw new EvidenceInventoryValidationError('integrity_failures must be an array');
  }

  if (!Array.isArray(inventory.raw_evidence_files)) {
    throw new EvidenceInventoryValidationError('raw_evidence_files must be an array');
  }

  return true;
}

/**
 * Add missing evidence operation
 */
export function addMissingEvidenceOperation(
  inventory: EvidenceInventory,
  operationId: string
): EvidenceInventory {
  return {
    ...inventory,
    missing_evidence_operations: [...inventory.missing_evidence_operations, operationId],
  };
}

/**
 * Add integrity failure
 */
export function addIntegrityFailure(
  inventory: EvidenceInventory,
  evidenceId: string
): EvidenceInventory {
  return {
    ...inventory,
    integrity_failures: [...inventory.integrity_failures, evidenceId],
  };
}

/**
 * Add raw evidence file
 */
export function addRawEvidenceFile(
  inventory: EvidenceInventory,
  filePath: string
): EvidenceInventory {
  return {
    ...inventory,
    raw_evidence_files: [...inventory.raw_evidence_files, filePath],
  };
}

/**
 * Increment evidence item count
 */
export function incrementEvidenceCount(
  inventory: EvidenceInventory,
  count: number = 1
): EvidenceInventory {
  return {
    ...inventory,
    total_evidence_items: inventory.total_evidence_items + count,
  };
}

/**
 * Check if inventory has issues (missing evidence or integrity failures)
 */
export function hasInventoryIssues(inventory: EvidenceInventory): boolean {
  return (
    inventory.missing_evidence_operations.length > 0 ||
    inventory.integrity_failures.length > 0
  );
}
