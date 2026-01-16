/**
 * Enumerations for PM Orchestrator Runner
 * Based on 05_DATA_MODELS.md and 03_LIFECYCLE.md specifications
 */

/**
 * Overall execution status
 * Priority order: INVALID > ERROR > NO_EVIDENCE > INCOMPLETE > COMPLETE
 */
export enum OverallStatus {
  COMPLETE = 'COMPLETE',
  INCOMPLETE = 'INCOMPLETE',
  ERROR = 'ERROR',
  INVALID = 'INVALID',
  NO_EVIDENCE = 'NO_EVIDENCE',
}

/**
 * Task-level status
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETE = 'COMPLETE',
  COMPLETED = 'COMPLETED',
  INCOMPLETE = 'INCOMPLETE',
  ERROR = 'ERROR',
  INVALID = 'INVALID',
  NO_EVIDENCE = 'NO_EVIDENCE',
}

/**
 * Phase status
 */
export enum PhaseStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/**
 * Agent types for L1/L2 pools
 */
export enum AgentType {
  READER = 'READER',
  WRITER = 'WRITER',
  EXECUTOR = 'EXECUTOR',
}

/**
 * Lifecycle phases in execution order
 * 7-phase lifecycle based on 03_LIFECYCLE.md
 */
export enum Phase {
  REQUIREMENT_ANALYSIS = 'REQUIREMENT_ANALYSIS',
  TASK_DECOMPOSITION = 'TASK_DECOMPOSITION',
  PLANNING = 'PLANNING',
  EXECUTION = 'EXECUTION',
  QA = 'QA',
  COMPLETION_VALIDATION = 'COMPLETION_VALIDATION',
  REPORT = 'REPORT',
}

/**
 * Alias for Phase for backward compatibility
 */
export const LifecyclePhase = Phase;
export type LifecyclePhase = Phase;

/**
 * Lock types for resource locking
 */
export enum LockType {
  READ = 'READ',
  WRITE = 'WRITE',
}

/**
 * Evidence types
 */
export enum EvidenceType {
  FILE = 'FILE',
  LOG = 'LOG',
  SCREENSHOT = 'SCREENSHOT',
  TEST_RESULT = 'TEST_RESULT',
  COMMAND_OUTPUT = 'COMMAND_OUTPUT',
  DIFF = 'DIFF',
  METRIC = 'METRIC',
}

/**
 * Status priority values (higher = more severe)
 */
const STATUS_PRIORITY: Record<OverallStatus, number> = {
  [OverallStatus.COMPLETE]: 0,
  [OverallStatus.INCOMPLETE]: 1,
  [OverallStatus.NO_EVIDENCE]: 2,
  [OverallStatus.ERROR]: 3,
  [OverallStatus.INVALID]: 4,
};

/**
 * Get the priority value for a status
 * Higher values indicate more severe/important status
 */
export function getStatusPriority(status: OverallStatus): number {
  return STATUS_PRIORITY[status];
}

/**
 * Aggregate multiple statuses into the highest priority status
 */
export function aggregateStatus(statuses: OverallStatus[]): OverallStatus {
  if (statuses.length === 0) {
    return OverallStatus.COMPLETE;
  }

  let highestStatus = OverallStatus.COMPLETE;
  let highestPriority = 0;

  for (const status of statuses) {
    const priority = getStatusPriority(status);
    if (priority > highestPriority) {
      highestPriority = priority;
      highestStatus = status;
    }
  }

  return highestStatus;
}

/**
 * Check if a status is terminal (cannot be changed)
 */
export function isTerminalStatus(status: OverallStatus): boolean {
  return status === OverallStatus.COMPLETE ||
         status === OverallStatus.ERROR ||
         status === OverallStatus.INVALID ||
         status === OverallStatus.NO_EVIDENCE;
}

/**
 * Phase order for transitions
 */
const PHASE_ORDER: Phase[] = [
  Phase.REQUIREMENT_ANALYSIS,
  Phase.TASK_DECOMPOSITION,
  Phase.PLANNING,
  Phase.EXECUTION,
  Phase.QA,
  Phase.COMPLETION_VALIDATION,
  Phase.REPORT,
];

/**
 * Get the next phase in the lifecycle
 * Returns null if already at the final phase
 */
export function getNextPhase(currentPhase: Phase): Phase | null {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
    return null;
  }
  return PHASE_ORDER[currentIndex + 1];
}

/**
 * Check if a phase transition is valid
 * Only allows moving to the immediate next phase
 */
export function isValidPhaseTransition(fromPhase: Phase, toPhase: Phase): boolean {
  const nextPhase = getNextPhase(fromPhase);
  return nextPhase === toPhase;
}

/**
 * Get the index of a phase in the lifecycle
 */
export function getPhaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Get all phases
 */
export function getAllPhases(): Phase[] {
  return [...PHASE_ORDER];
}

/**
 * Check if phase is the first phase
 */
export function isFirstPhase(phase: Phase): boolean {
  return phase === Phase.REQUIREMENT_ANALYSIS;
}

/**
 * Check if phase is the last phase
 */
export function isLastPhase(phase: Phase): boolean {
  return phase === Phase.REPORT;
}

/**
 * Executor blocking reasons
 * Per spec 05_DATA_MODELS.md - Property 34-36 non-interactive guarantees
 */
export type BlockedReason = 'INTERACTIVE_PROMPT' | 'TIMEOUT' | 'STDIN_REQUIRED';

/**
 * Executor termination triggers
 * Per spec 05_DATA_MODELS.md - Property 34-36 non-interactive guarantees
 */
export type TerminatedBy = 'REPL_FAIL_CLOSED' | 'USER' | 'TIMEOUT';
