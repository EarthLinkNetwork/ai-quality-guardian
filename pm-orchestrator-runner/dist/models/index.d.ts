/**
 * Models Index
 * Re-exports all model definitions for convenient importing
 */
export { OverallStatus, TaskStatus, Phase, LifecyclePhase, LockType, EvidenceType, getStatusPriority, aggregateStatus, isTerminalStatus, getNextPhase, isValidPhaseTransition, getPhaseIndex, getAllPhases, isFirstPhase, isLastPhase, BlockedReason, TerminatedBy, } from './enums';
export { Session, SessionStatus, SessionValidationError, createSession, validateSession, updateSessionPhase, updateSessionStatus, completeSession, failSession, } from './session';
export { Task, GranularityLimits, TaskValidationError, createTask, validateTask, updateTaskStatus, assignExecutor, addEvidenceRef, addModifiedFile, addTestRun, approveDecomposition, } from './task';
export { Evidence, Artifact, EvidenceValidationError, createEvidence, validateEvidence, addArtifact, markIntegrityValidated, addRawEvidenceRef, verifyEvidenceHash, } from './evidence';
export { FileLock, FileLockValidationError, createFileLock, validateFileLock, isLockHeldBy, isLockCompatible, extendLockExpiration, isExpired, } from './file-lock';
export { ExecutionResult, EvidenceSummary, EvidenceInventoryResult, Violation, IncompleteTaskReason, ExecutionResultValidationError, createExecutionResult, validateExecutionResult, addViolation, addIncompleteTaskReason, updateEvidenceInventory, markSpeculativeLanguageDetected, approveNextAction, } from './execution-result';
export { TaskLimits, LimitViolation, EvidenceInventory, TaskLimitsValidationError, LimitViolationValidationError, EvidenceInventoryValidationError, createTaskLimits, validateTaskLimits, createLimitViolation, validateLimitViolation, createEvidenceInventory, validateEvidenceInventory, addMissingEvidenceOperation, addIntegrityFailure, addRawEvidenceFile, incrementEvidenceCount, hasInventoryIssues, } from './supporting';
//# sourceMappingURL=index.d.ts.map