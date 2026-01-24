"use strict";
/**
 * Review Loop Module
 *
 * Per spec 25_REVIEW_LOOP.md: Automatic quality judgment with PASS/REJECT/RETRY
 *
 * Exports:
 * - ReviewLoopExecutorWrapper: Main class for wrapping IExecutor
 * - Quality criteria checkers (Q1-Q6)
 * - Goal Drift Guard evaluator (GD1-GD5)
 * - Goal Drift Guard integration with Review Loop
 * - Types and interfaces
 * - Default configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoalDriftCriteriaName = exports.mapGoalDriftResultToReviewLoop = exports.mapGoalDriftToQCriteria = exports.generateGoalDriftModificationSection = exports.runGoalDriftIntegration = exports.CHECKLIST_PATTERNS = exports.VALID_COMPLETION_PATTERNS = exports.SCOPE_REDUCTION_PATTERNS = exports.PREMATURE_COMPLETION_PATTERNS = exports.ESCAPE_PHRASES = exports.GOAL_DRIFT_GUARD_TEMPLATE_ID = exports.safeEvaluateGoalDrift = exports.shouldRunGoalDriftEvaluator = exports.evaluateGoalDrift = exports.checkGD5NoScopeReduction = exports.checkGD4CompletionStatementValid = exports.checkGD3RequirementChecklistPresent = exports.checkGD2NoPrematureCompletion = exports.checkGD1NoEscapePhrases = exports.DEFAULT_REVIEW_LOOP_CONFIG = exports.generateIssuesFromCriteria = exports.generateModificationPrompt = exports.performQualityJudgment = exports.checkQ6NoEarlyTermination = exports.checkQ5EvidencePresent = exports.checkQ4NoIncompleteSyntax = exports.checkQ3NoOmissionMarkers = exports.checkQ2NoTodoLeft = exports.checkQ1FilesVerified = exports.ReviewLoopExecutorWrapper = void 0;
var review_loop_1 = require("./review-loop");
// Main class
Object.defineProperty(exports, "ReviewLoopExecutorWrapper", { enumerable: true, get: function () { return review_loop_1.ReviewLoopExecutorWrapper; } });
// Quality criteria checkers
Object.defineProperty(exports, "checkQ1FilesVerified", { enumerable: true, get: function () { return review_loop_1.checkQ1FilesVerified; } });
Object.defineProperty(exports, "checkQ2NoTodoLeft", { enumerable: true, get: function () { return review_loop_1.checkQ2NoTodoLeft; } });
Object.defineProperty(exports, "checkQ3NoOmissionMarkers", { enumerable: true, get: function () { return review_loop_1.checkQ3NoOmissionMarkers; } });
Object.defineProperty(exports, "checkQ4NoIncompleteSyntax", { enumerable: true, get: function () { return review_loop_1.checkQ4NoIncompleteSyntax; } });
Object.defineProperty(exports, "checkQ5EvidencePresent", { enumerable: true, get: function () { return review_loop_1.checkQ5EvidencePresent; } });
Object.defineProperty(exports, "checkQ6NoEarlyTermination", { enumerable: true, get: function () { return review_loop_1.checkQ6NoEarlyTermination; } });
// Core functions
Object.defineProperty(exports, "performQualityJudgment", { enumerable: true, get: function () { return review_loop_1.performQualityJudgment; } });
Object.defineProperty(exports, "generateModificationPrompt", { enumerable: true, get: function () { return review_loop_1.generateModificationPrompt; } });
Object.defineProperty(exports, "generateIssuesFromCriteria", { enumerable: true, get: function () { return review_loop_1.generateIssuesFromCriteria; } });
// Configuration
Object.defineProperty(exports, "DEFAULT_REVIEW_LOOP_CONFIG", { enumerable: true, get: function () { return review_loop_1.DEFAULT_REVIEW_LOOP_CONFIG; } });
// Goal Drift Guard Evaluator (per spec 32_TEMPLATE_INJECTION.md)
var goal_drift_evaluator_1 = require("./goal-drift-evaluator");
// Checker functions
Object.defineProperty(exports, "checkGD1NoEscapePhrases", { enumerable: true, get: function () { return goal_drift_evaluator_1.checkGD1NoEscapePhrases; } });
Object.defineProperty(exports, "checkGD2NoPrematureCompletion", { enumerable: true, get: function () { return goal_drift_evaluator_1.checkGD2NoPrematureCompletion; } });
Object.defineProperty(exports, "checkGD3RequirementChecklistPresent", { enumerable: true, get: function () { return goal_drift_evaluator_1.checkGD3RequirementChecklistPresent; } });
Object.defineProperty(exports, "checkGD4CompletionStatementValid", { enumerable: true, get: function () { return goal_drift_evaluator_1.checkGD4CompletionStatementValid; } });
Object.defineProperty(exports, "checkGD5NoScopeReduction", { enumerable: true, get: function () { return goal_drift_evaluator_1.checkGD5NoScopeReduction; } });
// Main evaluator
Object.defineProperty(exports, "evaluateGoalDrift", { enumerable: true, get: function () { return goal_drift_evaluator_1.evaluateGoalDrift; } });
Object.defineProperty(exports, "shouldRunGoalDriftEvaluator", { enumerable: true, get: function () { return goal_drift_evaluator_1.shouldRunGoalDriftEvaluator; } });
Object.defineProperty(exports, "safeEvaluateGoalDrift", { enumerable: true, get: function () { return goal_drift_evaluator_1.safeEvaluateGoalDrift; } });
// Constants
Object.defineProperty(exports, "GOAL_DRIFT_GUARD_TEMPLATE_ID", { enumerable: true, get: function () { return goal_drift_evaluator_1.GOAL_DRIFT_GUARD_TEMPLATE_ID; } });
Object.defineProperty(exports, "ESCAPE_PHRASES", { enumerable: true, get: function () { return goal_drift_evaluator_1.ESCAPE_PHRASES; } });
Object.defineProperty(exports, "PREMATURE_COMPLETION_PATTERNS", { enumerable: true, get: function () { return goal_drift_evaluator_1.PREMATURE_COMPLETION_PATTERNS; } });
Object.defineProperty(exports, "SCOPE_REDUCTION_PATTERNS", { enumerable: true, get: function () { return goal_drift_evaluator_1.SCOPE_REDUCTION_PATTERNS; } });
Object.defineProperty(exports, "VALID_COMPLETION_PATTERNS", { enumerable: true, get: function () { return goal_drift_evaluator_1.VALID_COMPLETION_PATTERNS; } });
Object.defineProperty(exports, "CHECKLIST_PATTERNS", { enumerable: true, get: function () { return goal_drift_evaluator_1.CHECKLIST_PATTERNS; } });
// Goal Drift Guard Integration (connects evaluator to Review Loop)
var goal_drift_integration_1 = require("./goal-drift-integration");
// Integration functions
Object.defineProperty(exports, "runGoalDriftIntegration", { enumerable: true, get: function () { return goal_drift_integration_1.runGoalDriftIntegration; } });
Object.defineProperty(exports, "generateGoalDriftModificationSection", { enumerable: true, get: function () { return goal_drift_integration_1.generateGoalDriftModificationSection; } });
Object.defineProperty(exports, "mapGoalDriftToQCriteria", { enumerable: true, get: function () { return goal_drift_integration_1.mapGoalDriftToQCriteria; } });
Object.defineProperty(exports, "mapGoalDriftResultToReviewLoop", { enumerable: true, get: function () { return goal_drift_integration_1.mapGoalDriftResultToReviewLoop; } });
Object.defineProperty(exports, "getGoalDriftCriteriaName", { enumerable: true, get: function () { return goal_drift_integration_1.getGoalDriftCriteriaName; } });
//# sourceMappingURL=index.js.map