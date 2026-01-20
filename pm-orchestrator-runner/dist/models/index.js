"use strict";
/**
 * Models Index
 * Re-exports all model definitions for convenient importing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLockCompatible = exports.isLockHeldBy = exports.validateFileLock = exports.createFileLock = exports.FileLockValidationError = exports.verifyEvidenceHash = exports.addRawEvidenceRef = exports.markIntegrityValidated = exports.addArtifact = exports.validateEvidence = exports.createEvidence = exports.EvidenceValidationError = exports.approveDecomposition = exports.addTestRun = exports.addModifiedFile = exports.addEvidenceRef = exports.assignExecutor = exports.updateTaskStatus = exports.validateTask = exports.createTask = exports.TaskValidationError = exports.failSession = exports.completeSession = exports.updateSessionStatus = exports.updateSessionPhase = exports.validateSession = exports.createSession = exports.SessionValidationError = exports.SessionStatus = exports.isLastPhase = exports.isFirstPhase = exports.getAllPhases = exports.getPhaseIndex = exports.isValidPhaseTransition = exports.getNextPhase = exports.isTerminalStatus = exports.aggregateStatus = exports.getStatusPriority = exports.TaskGroupState = exports.RunTrigger = exports.RunStatus = exports.ThreadType = exports.EvidenceType = exports.LockType = exports.LifecyclePhase = exports.Phase = exports.AgentType = exports.PhaseStatus = exports.TaskStatus = exports.OverallStatus = void 0;
exports.activateTaskGroup = exports.createTaskGroup = exports.resetConversationEntryCounter = exports.generateConversationEntryId = exports.resetTaskGroupCounter = exports.generateTaskGroupId = exports.getRunDuration = exports.isTerminal = exports.isCancelled = exports.isFailed = exports.isCompleted = exports.isRunning = exports.validateRun = exports.cancelRun = exports.failRun = exports.completeRun = exports.createRun = exports.resetRunCounter = exports.generateRunId = exports.isSystemThread = exports.isBackgroundThread = exports.isMainThread = exports.validateThread = exports.createThread = exports.resetThreadCounter = exports.generateThreadId = exports.hasInventoryIssues = exports.incrementEvidenceCount = exports.addRawEvidenceFile = exports.addIntegrityFailure = exports.addMissingEvidenceOperation = exports.validateEvidenceInventory = exports.createEvidenceInventory = exports.validateLimitViolation = exports.createLimitViolation = exports.validateTaskLimits = exports.createTaskLimits = exports.EvidenceInventoryValidationError = exports.LimitViolationValidationError = exports.TaskLimitsValidationError = exports.approveNextAction = exports.markSpeculativeLanguageDetected = exports.updateEvidenceInventory = exports.addIncompleteTaskReason = exports.addViolation = exports.validateExecutionResult = exports.createExecutionResult = exports.ExecutionResultValidationError = exports.isExpired = exports.extendLockExpiration = void 0;
exports.isTaskGroupCompleted = exports.isTaskGroupActive = exports.validateTaskGroup = exports.updateLastTaskResult = exports.addFileChange = exports.addConversationEntry = exports.completeTaskGroup = exports.resumeTaskGroup = exports.pauseTaskGroup = void 0;
// Enums
var enums_1 = require("./enums");
Object.defineProperty(exports, "OverallStatus", { enumerable: true, get: function () { return enums_1.OverallStatus; } });
Object.defineProperty(exports, "TaskStatus", { enumerable: true, get: function () { return enums_1.TaskStatus; } });
Object.defineProperty(exports, "PhaseStatus", { enumerable: true, get: function () { return enums_1.PhaseStatus; } });
Object.defineProperty(exports, "AgentType", { enumerable: true, get: function () { return enums_1.AgentType; } });
Object.defineProperty(exports, "Phase", { enumerable: true, get: function () { return enums_1.Phase; } });
Object.defineProperty(exports, "LifecyclePhase", { enumerable: true, get: function () { return enums_1.LifecyclePhase; } });
Object.defineProperty(exports, "LockType", { enumerable: true, get: function () { return enums_1.LockType; } });
Object.defineProperty(exports, "EvidenceType", { enumerable: true, get: function () { return enums_1.EvidenceType; } });
Object.defineProperty(exports, "ThreadType", { enumerable: true, get: function () { return enums_1.ThreadType; } });
Object.defineProperty(exports, "RunStatus", { enumerable: true, get: function () { return enums_1.RunStatus; } });
Object.defineProperty(exports, "RunTrigger", { enumerable: true, get: function () { return enums_1.RunTrigger; } });
Object.defineProperty(exports, "TaskGroupState", { enumerable: true, get: function () { return enums_1.TaskGroupState; } });
Object.defineProperty(exports, "getStatusPriority", { enumerable: true, get: function () { return enums_1.getStatusPriority; } });
Object.defineProperty(exports, "aggregateStatus", { enumerable: true, get: function () { return enums_1.aggregateStatus; } });
Object.defineProperty(exports, "isTerminalStatus", { enumerable: true, get: function () { return enums_1.isTerminalStatus; } });
Object.defineProperty(exports, "getNextPhase", { enumerable: true, get: function () { return enums_1.getNextPhase; } });
Object.defineProperty(exports, "isValidPhaseTransition", { enumerable: true, get: function () { return enums_1.isValidPhaseTransition; } });
Object.defineProperty(exports, "getPhaseIndex", { enumerable: true, get: function () { return enums_1.getPhaseIndex; } });
Object.defineProperty(exports, "getAllPhases", { enumerable: true, get: function () { return enums_1.getAllPhases; } });
Object.defineProperty(exports, "isFirstPhase", { enumerable: true, get: function () { return enums_1.isFirstPhase; } });
Object.defineProperty(exports, "isLastPhase", { enumerable: true, get: function () { return enums_1.isLastPhase; } });
// Session
var session_1 = require("./session");
Object.defineProperty(exports, "SessionStatus", { enumerable: true, get: function () { return session_1.SessionStatus; } });
Object.defineProperty(exports, "SessionValidationError", { enumerable: true, get: function () { return session_1.SessionValidationError; } });
Object.defineProperty(exports, "createSession", { enumerable: true, get: function () { return session_1.createSession; } });
Object.defineProperty(exports, "validateSession", { enumerable: true, get: function () { return session_1.validateSession; } });
Object.defineProperty(exports, "updateSessionPhase", { enumerable: true, get: function () { return session_1.updateSessionPhase; } });
Object.defineProperty(exports, "updateSessionStatus", { enumerable: true, get: function () { return session_1.updateSessionStatus; } });
Object.defineProperty(exports, "completeSession", { enumerable: true, get: function () { return session_1.completeSession; } });
Object.defineProperty(exports, "failSession", { enumerable: true, get: function () { return session_1.failSession; } });
// Task
var task_1 = require("./task");
Object.defineProperty(exports, "TaskValidationError", { enumerable: true, get: function () { return task_1.TaskValidationError; } });
Object.defineProperty(exports, "createTask", { enumerable: true, get: function () { return task_1.createTask; } });
Object.defineProperty(exports, "validateTask", { enumerable: true, get: function () { return task_1.validateTask; } });
Object.defineProperty(exports, "updateTaskStatus", { enumerable: true, get: function () { return task_1.updateTaskStatus; } });
Object.defineProperty(exports, "assignExecutor", { enumerable: true, get: function () { return task_1.assignExecutor; } });
Object.defineProperty(exports, "addEvidenceRef", { enumerable: true, get: function () { return task_1.addEvidenceRef; } });
Object.defineProperty(exports, "addModifiedFile", { enumerable: true, get: function () { return task_1.addModifiedFile; } });
Object.defineProperty(exports, "addTestRun", { enumerable: true, get: function () { return task_1.addTestRun; } });
Object.defineProperty(exports, "approveDecomposition", { enumerable: true, get: function () { return task_1.approveDecomposition; } });
// Evidence
var evidence_1 = require("./evidence");
Object.defineProperty(exports, "EvidenceValidationError", { enumerable: true, get: function () { return evidence_1.EvidenceValidationError; } });
Object.defineProperty(exports, "createEvidence", { enumerable: true, get: function () { return evidence_1.createEvidence; } });
Object.defineProperty(exports, "validateEvidence", { enumerable: true, get: function () { return evidence_1.validateEvidence; } });
Object.defineProperty(exports, "addArtifact", { enumerable: true, get: function () { return evidence_1.addArtifact; } });
Object.defineProperty(exports, "markIntegrityValidated", { enumerable: true, get: function () { return evidence_1.markIntegrityValidated; } });
Object.defineProperty(exports, "addRawEvidenceRef", { enumerable: true, get: function () { return evidence_1.addRawEvidenceRef; } });
Object.defineProperty(exports, "verifyEvidenceHash", { enumerable: true, get: function () { return evidence_1.verifyEvidenceHash; } });
// FileLock
var file_lock_1 = require("./file-lock");
Object.defineProperty(exports, "FileLockValidationError", { enumerable: true, get: function () { return file_lock_1.FileLockValidationError; } });
Object.defineProperty(exports, "createFileLock", { enumerable: true, get: function () { return file_lock_1.createFileLock; } });
Object.defineProperty(exports, "validateFileLock", { enumerable: true, get: function () { return file_lock_1.validateFileLock; } });
Object.defineProperty(exports, "isLockHeldBy", { enumerable: true, get: function () { return file_lock_1.isLockHeldBy; } });
Object.defineProperty(exports, "isLockCompatible", { enumerable: true, get: function () { return file_lock_1.isLockCompatible; } });
Object.defineProperty(exports, "extendLockExpiration", { enumerable: true, get: function () { return file_lock_1.extendLockExpiration; } });
Object.defineProperty(exports, "isExpired", { enumerable: true, get: function () { return file_lock_1.isExpired; } });
// ExecutionResult
var execution_result_1 = require("./execution-result");
Object.defineProperty(exports, "ExecutionResultValidationError", { enumerable: true, get: function () { return execution_result_1.ExecutionResultValidationError; } });
Object.defineProperty(exports, "createExecutionResult", { enumerable: true, get: function () { return execution_result_1.createExecutionResult; } });
Object.defineProperty(exports, "validateExecutionResult", { enumerable: true, get: function () { return execution_result_1.validateExecutionResult; } });
Object.defineProperty(exports, "addViolation", { enumerable: true, get: function () { return execution_result_1.addViolation; } });
Object.defineProperty(exports, "addIncompleteTaskReason", { enumerable: true, get: function () { return execution_result_1.addIncompleteTaskReason; } });
Object.defineProperty(exports, "updateEvidenceInventory", { enumerable: true, get: function () { return execution_result_1.updateEvidenceInventory; } });
Object.defineProperty(exports, "markSpeculativeLanguageDetected", { enumerable: true, get: function () { return execution_result_1.markSpeculativeLanguageDetected; } });
Object.defineProperty(exports, "approveNextAction", { enumerable: true, get: function () { return execution_result_1.approveNextAction; } });
// Supporting Structures
var supporting_1 = require("./supporting");
Object.defineProperty(exports, "TaskLimitsValidationError", { enumerable: true, get: function () { return supporting_1.TaskLimitsValidationError; } });
Object.defineProperty(exports, "LimitViolationValidationError", { enumerable: true, get: function () { return supporting_1.LimitViolationValidationError; } });
Object.defineProperty(exports, "EvidenceInventoryValidationError", { enumerable: true, get: function () { return supporting_1.EvidenceInventoryValidationError; } });
Object.defineProperty(exports, "createTaskLimits", { enumerable: true, get: function () { return supporting_1.createTaskLimits; } });
Object.defineProperty(exports, "validateTaskLimits", { enumerable: true, get: function () { return supporting_1.validateTaskLimits; } });
Object.defineProperty(exports, "createLimitViolation", { enumerable: true, get: function () { return supporting_1.createLimitViolation; } });
Object.defineProperty(exports, "validateLimitViolation", { enumerable: true, get: function () { return supporting_1.validateLimitViolation; } });
Object.defineProperty(exports, "createEvidenceInventory", { enumerable: true, get: function () { return supporting_1.createEvidenceInventory; } });
Object.defineProperty(exports, "validateEvidenceInventory", { enumerable: true, get: function () { return supporting_1.validateEvidenceInventory; } });
Object.defineProperty(exports, "addMissingEvidenceOperation", { enumerable: true, get: function () { return supporting_1.addMissingEvidenceOperation; } });
Object.defineProperty(exports, "addIntegrityFailure", { enumerable: true, get: function () { return supporting_1.addIntegrityFailure; } });
Object.defineProperty(exports, "addRawEvidenceFile", { enumerable: true, get: function () { return supporting_1.addRawEvidenceFile; } });
Object.defineProperty(exports, "incrementEvidenceCount", { enumerable: true, get: function () { return supporting_1.incrementEvidenceCount; } });
Object.defineProperty(exports, "hasInventoryIssues", { enumerable: true, get: function () { return supporting_1.hasInventoryIssues; } });
// Thread (Per spec 05_DATA_MODELS.md L44-66)
var thread_1 = require("./thread");
Object.defineProperty(exports, "generateThreadId", { enumerable: true, get: function () { return thread_1.generateThreadId; } });
Object.defineProperty(exports, "resetThreadCounter", { enumerable: true, get: function () { return thread_1.resetThreadCounter; } });
Object.defineProperty(exports, "createThread", { enumerable: true, get: function () { return thread_1.createThread; } });
Object.defineProperty(exports, "validateThread", { enumerable: true, get: function () { return thread_1.validateThread; } });
Object.defineProperty(exports, "isMainThread", { enumerable: true, get: function () { return thread_1.isMainThread; } });
Object.defineProperty(exports, "isBackgroundThread", { enumerable: true, get: function () { return thread_1.isBackgroundThread; } });
Object.defineProperty(exports, "isSystemThread", { enumerable: true, get: function () { return thread_1.isSystemThread; } });
// Run (Per spec 05_DATA_MODELS.md L69-104)
var run_1 = require("./run");
Object.defineProperty(exports, "generateRunId", { enumerable: true, get: function () { return run_1.generateRunId; } });
Object.defineProperty(exports, "resetRunCounter", { enumerable: true, get: function () { return run_1.resetRunCounter; } });
Object.defineProperty(exports, "createRun", { enumerable: true, get: function () { return run_1.createRun; } });
Object.defineProperty(exports, "completeRun", { enumerable: true, get: function () { return run_1.completeRun; } });
Object.defineProperty(exports, "failRun", { enumerable: true, get: function () { return run_1.failRun; } });
Object.defineProperty(exports, "cancelRun", { enumerable: true, get: function () { return run_1.cancelRun; } });
Object.defineProperty(exports, "validateRun", { enumerable: true, get: function () { return run_1.validateRun; } });
Object.defineProperty(exports, "isRunning", { enumerable: true, get: function () { return run_1.isRunning; } });
Object.defineProperty(exports, "isCompleted", { enumerable: true, get: function () { return run_1.isCompleted; } });
Object.defineProperty(exports, "isFailed", { enumerable: true, get: function () { return run_1.isFailed; } });
Object.defineProperty(exports, "isCancelled", { enumerable: true, get: function () { return run_1.isCancelled; } });
Object.defineProperty(exports, "isTerminal", { enumerable: true, get: function () { return run_1.isTerminal; } });
Object.defineProperty(exports, "getRunDuration", { enumerable: true, get: function () { return run_1.getRunDuration; } });
// Task Group (Per spec 16_TASK_GROUP.md)
var task_group_1 = require("./task-group");
Object.defineProperty(exports, "generateTaskGroupId", { enumerable: true, get: function () { return task_group_1.generateTaskGroupId; } });
Object.defineProperty(exports, "resetTaskGroupCounter", { enumerable: true, get: function () { return task_group_1.resetTaskGroupCounter; } });
Object.defineProperty(exports, "generateConversationEntryId", { enumerable: true, get: function () { return task_group_1.generateConversationEntryId; } });
Object.defineProperty(exports, "resetConversationEntryCounter", { enumerable: true, get: function () { return task_group_1.resetConversationEntryCounter; } });
Object.defineProperty(exports, "createTaskGroup", { enumerable: true, get: function () { return task_group_1.createTaskGroup; } });
Object.defineProperty(exports, "activateTaskGroup", { enumerable: true, get: function () { return task_group_1.activateTaskGroup; } });
Object.defineProperty(exports, "pauseTaskGroup", { enumerable: true, get: function () { return task_group_1.pauseTaskGroup; } });
Object.defineProperty(exports, "resumeTaskGroup", { enumerable: true, get: function () { return task_group_1.resumeTaskGroup; } });
Object.defineProperty(exports, "completeTaskGroup", { enumerable: true, get: function () { return task_group_1.completeTaskGroup; } });
Object.defineProperty(exports, "addConversationEntry", { enumerable: true, get: function () { return task_group_1.addConversationEntry; } });
Object.defineProperty(exports, "addFileChange", { enumerable: true, get: function () { return task_group_1.addFileChange; } });
Object.defineProperty(exports, "updateLastTaskResult", { enumerable: true, get: function () { return task_group_1.updateLastTaskResult; } });
Object.defineProperty(exports, "validateTaskGroup", { enumerable: true, get: function () { return task_group_1.validateTaskGroup; } });
Object.defineProperty(exports, "isTaskGroupActive", { enumerable: true, get: function () { return task_group_1.isTaskGroupActive; } });
Object.defineProperty(exports, "isTaskGroupCompleted", { enumerable: true, get: function () { return task_group_1.isTaskGroupCompleted; } });
//# sourceMappingURL=index.js.map