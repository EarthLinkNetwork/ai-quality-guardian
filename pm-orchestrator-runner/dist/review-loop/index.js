"use strict";
/**
 * Review Loop Module
 *
 * Per spec 25_REVIEW_LOOP.md: Automatic quality judgment with PASS/REJECT/RETRY
 *
 * Exports:
 * - ReviewLoopExecutorWrapper: Main class for wrapping IExecutor
 * - Quality criteria checkers (Q1-Q6)
 * - Types and interfaces
 * - Default configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REVIEW_LOOP_CONFIG = exports.generateIssuesFromCriteria = exports.generateModificationPrompt = exports.performQualityJudgment = exports.checkQ6NoEarlyTermination = exports.checkQ5EvidencePresent = exports.checkQ4NoIncompleteSyntax = exports.checkQ3NoOmissionMarkers = exports.checkQ2NoTodoLeft = exports.checkQ1FilesVerified = exports.ReviewLoopExecutorWrapper = void 0;
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
//# sourceMappingURL=index.js.map