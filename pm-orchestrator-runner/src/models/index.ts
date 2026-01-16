/**
 * Models Index
 * Re-exports all model definitions for convenient importing
 */

// Enums
export {
  OverallStatus,
  TaskStatus,
  Phase,
  LifecyclePhase,
  LockType,
  EvidenceType,
  getStatusPriority,
  aggregateStatus,
  isTerminalStatus,
  getNextPhase,
  isValidPhaseTransition,
  getPhaseIndex,
  getAllPhases,
  isFirstPhase,
  isLastPhase,
  BlockedReason,
  TerminatedBy,
} from './enums';

// Session
export {
  Session,
  SessionStatus,
  SessionValidationError,
  createSession,
  validateSession,
  updateSessionPhase,
  updateSessionStatus,
  completeSession,
  failSession,
} from './session';

// Task
export {
  Task,
  GranularityLimits,
  TaskValidationError,
  createTask,
  validateTask,
  updateTaskStatus,
  assignExecutor,
  addEvidenceRef,
  addModifiedFile,
  addTestRun,
  approveDecomposition,
} from './task';

// Evidence
export {
  Evidence,
  Artifact,
  EvidenceValidationError,
  createEvidence,
  validateEvidence,
  addArtifact,
  markIntegrityValidated,
  addRawEvidenceRef,
  verifyEvidenceHash,
} from './evidence';

// FileLock
export {
  FileLock,
  FileLockValidationError,
  createFileLock,
  validateFileLock,
  isLockHeldBy,
  isLockCompatible,
  extendLockExpiration,
  isExpired,
} from './file-lock';

// ExecutionResult
export {
  ExecutionResult,
  EvidenceSummary,
  EvidenceInventoryResult,
  Violation,
  IncompleteTaskReason,
  ExecutionResultValidationError,
  createExecutionResult,
  validateExecutionResult,
  addViolation,
  addIncompleteTaskReason,
  updateEvidenceInventory,
  markSpeculativeLanguageDetected,
  approveNextAction,
} from './execution-result';

// Supporting Structures
export {
  TaskLimits,
  LimitViolation,
  EvidenceInventory,
  TaskLimitsValidationError,
  LimitViolationValidationError,
  EvidenceInventoryValidationError,
  createTaskLimits,
  validateTaskLimits,
  createLimitViolation,
  validateLimitViolation,
  createEvidenceInventory,
  validateEvidenceInventory,
  addMissingEvidenceOperation,
  addIntegrityFailure,
  addRawEvidenceFile,
  incrementEvidenceCount,
  hasInventoryIssues,
} from './supporting';
