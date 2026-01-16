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
export class ExecutionResultValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionResultValidationError';
  }
}

/**
 * Determine if next action is allowed based on status
 */
function determineNextAction(status: OverallStatus): boolean {
  switch (status) {
    case OverallStatus.COMPLETE:
      return true;
    case OverallStatus.INCOMPLETE:
      // Requires explicit continuation approval
      return false;
    case OverallStatus.ERROR:
    case OverallStatus.INVALID:
    case OverallStatus.NO_EVIDENCE:
      return false;
    default:
      return false;
  }
}

/**
 * Generate next action reason based on status
 */
function generateNextActionReason(status: OverallStatus, tasks: Task[]): string {
  switch (status) {
    case OverallStatus.COMPLETE:
      return 'All tasks completed successfully';
    case OverallStatus.INCOMPLETE:
      return 'Session incomplete - continuation approval required';
    case OverallStatus.ERROR:
      return 'Session terminated due to error';
    case OverallStatus.INVALID:
      return 'Session invalid - critical validation failure';
    case OverallStatus.NO_EVIDENCE:
      return 'Session incomplete - missing required evidence';
    default:
      return 'Unknown status';
  }
}

/**
 * Create a new execution result
 */
export function createExecutionResult(
  sessionId: string,
  status: OverallStatus,
  tasks: Task[]
): ExecutionResult {
  return {
    overall_status: status,
    tasks,
    evidence_summary: {
      total: tasks.reduce((sum, t) => sum + t.evidence_refs.length, 0),
      collected: tasks.reduce((sum, t) => sum + t.evidence_refs.length, 0),
    },
    next_action: determineNextAction(status),
    next_action_reason: generateNextActionReason(status, tasks),
    violations: [],
    session_id: sessionId,
    incomplete_task_reasons: [],
    evidence_inventory: {
      total_evidence_items: 0,
      missing_evidence_operations: [],
      integrity_failures: [],
      raw_evidence_files: [],
    },
    speculative_language_detected: false,
  };
}

/**
 * Validate an execution result object
 * @throws ExecutionResultValidationError if validation fails
 */
export function validateExecutionResult(result: ExecutionResult): boolean {
  if (!result.session_id || result.session_id.length === 0) {
    throw new ExecutionResultValidationError('session_id is required');
  }

  if (result.overall_status === undefined) {
    throw new ExecutionResultValidationError('overall_status is required');
  }

  if (!Array.isArray(result.tasks)) {
    throw new ExecutionResultValidationError('tasks must be an array');
  }

  if (!result.evidence_summary) {
    throw new ExecutionResultValidationError('evidence_summary is required');
  }

  if (result.next_action === undefined) {
    throw new ExecutionResultValidationError('next_action is required');
  }

  if (!result.next_action_reason || result.next_action_reason.length === 0) {
    throw new ExecutionResultValidationError('next_action_reason is required');
  }

  if (!Array.isArray(result.violations)) {
    throw new ExecutionResultValidationError('violations must be an array');
  }

  if (!Array.isArray(result.incomplete_task_reasons)) {
    throw new ExecutionResultValidationError('incomplete_task_reasons must be an array');
  }

  if (!result.evidence_inventory) {
    throw new ExecutionResultValidationError('evidence_inventory is required');
  }

  if (result.speculative_language_detected === undefined) {
    throw new ExecutionResultValidationError('speculative_language_detected is required');
  }

  // Property 8: Speculative language detection prevents COMPLETE status
  if (result.speculative_language_detected && result.overall_status === OverallStatus.COMPLETE) {
    throw new ExecutionResultValidationError(
      'Cannot have COMPLETE status when speculative_language_detected is true'
    );
  }

  return true;
}

/**
 * Add violation to execution result
 */
export function addViolation(
  result: ExecutionResult,
  type: string,
  message: string,
  taskId?: string
): ExecutionResult {
  const violation: Violation = {
    type,
    message,
    timestamp: new Date().toISOString(),
    task_id: taskId,
  };

  return {
    ...result,
    violations: [...result.violations, violation],
  };
}

/**
 * Add incomplete task reason
 */
export function addIncompleteTaskReason(
  result: ExecutionResult,
  taskId: string,
  reason: string
): ExecutionResult {
  return {
    ...result,
    incomplete_task_reasons: [
      ...result.incomplete_task_reasons,
      { task_id: taskId, reason },
    ],
  };
}

/**
 * Update evidence inventory
 */
export function updateEvidenceInventory(
  result: ExecutionResult,
  inventory: Partial<EvidenceInventoryResult>
): ExecutionResult {
  return {
    ...result,
    evidence_inventory: {
      ...result.evidence_inventory,
      ...inventory,
    },
  };
}

/**
 * Mark speculative language detected
 */
export function markSpeculativeLanguageDetected(result: ExecutionResult): ExecutionResult {
  return {
    ...result,
    speculative_language_detected: true,
    // Downgrade status if it was COMPLETE
    overall_status:
      result.overall_status === OverallStatus.COMPLETE
        ? OverallStatus.INVALID
        : result.overall_status,
    next_action: false,
    next_action_reason: 'Speculative language detected - validation required',
  };
}

/**
 * Update next action with explicit approval
 */
export function approveNextAction(result: ExecutionResult, reason: string): ExecutionResult {
  // Only allow approval for INCOMPLETE status
  if (result.overall_status !== OverallStatus.INCOMPLETE) {
    return result;
  }

  return {
    ...result,
    next_action: true,
    next_action_reason: reason,
  };
}
