"use strict";
/**
 * Retry Module
 *
 * Per spec 30_RETRY_AND_RECOVERY.md
 *
 * Exports:
 * - RetryManager class
 * - Retry decision functions
 * - Backoff calculation functions
 * - Escalation report generation
 * - Recovery strategy determination
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryManager = exports.determineRecoveryStrategy = exports.generateEscalationReport = exports.generateUserMessage = exports.decideRetry = exports.generateModificationHint = exports.classifyFailure = exports.calculateBackoff = exports.DEFAULT_RETRY_MANAGER_CONFIG = exports.DEFAULT_RETRY_CONFIG = void 0;
var retry_manager_1 = require("./retry-manager");
// Constants
Object.defineProperty(exports, "DEFAULT_RETRY_CONFIG", { enumerable: true, get: function () { return retry_manager_1.DEFAULT_RETRY_CONFIG; } });
Object.defineProperty(exports, "DEFAULT_RETRY_MANAGER_CONFIG", { enumerable: true, get: function () { return retry_manager_1.DEFAULT_RETRY_MANAGER_CONFIG; } });
// Functions
Object.defineProperty(exports, "calculateBackoff", { enumerable: true, get: function () { return retry_manager_1.calculateBackoff; } });
Object.defineProperty(exports, "classifyFailure", { enumerable: true, get: function () { return retry_manager_1.classifyFailure; } });
Object.defineProperty(exports, "generateModificationHint", { enumerable: true, get: function () { return retry_manager_1.generateModificationHint; } });
Object.defineProperty(exports, "decideRetry", { enumerable: true, get: function () { return retry_manager_1.decideRetry; } });
Object.defineProperty(exports, "generateUserMessage", { enumerable: true, get: function () { return retry_manager_1.generateUserMessage; } });
Object.defineProperty(exports, "generateEscalationReport", { enumerable: true, get: function () { return retry_manager_1.generateEscalationReport; } });
Object.defineProperty(exports, "determineRecoveryStrategy", { enumerable: true, get: function () { return retry_manager_1.determineRecoveryStrategy; } });
// Class
Object.defineProperty(exports, "RetryManager", { enumerable: true, get: function () { return retry_manager_1.RetryManager; } });
//# sourceMappingURL=index.js.map