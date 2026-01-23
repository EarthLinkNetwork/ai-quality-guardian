"use strict";
/**
 * Orchestration Module
 *
 * Provides unified task orchestration by integrating:
 * - TaskPlanner (spec/29_TASK_PLANNING.md)
 * - RetryManager (spec/30_RETRY_AND_RECOVERY.md)
 * - ModelPolicyManager (spec/31_PROVIDER_MODEL_POLICY.md)
 *
 * Exports:
 * - TaskOrchestrator class
 * - Orchestration types and events
 * - Configuration options
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODEL_POLICY_CONFIG = exports.FAST_PROFILE = exports.CHEAP_PROFILE = exports.STABLE_PROFILE = exports.ModelPolicyManager = exports.DEFAULT_RETRY_MANAGER_CONFIG = exports.DEFAULT_RETRY_CONFIG = exports.RetryManager = exports.DEFAULT_TASK_PLANNER_CONFIG = exports.TaskPlanner = exports.TaskOrchestrator = exports.DEFAULT_ORCHESTRATOR_CONFIG = void 0;
var task_orchestrator_1 = require("./task-orchestrator");
// Constants
Object.defineProperty(exports, "DEFAULT_ORCHESTRATOR_CONFIG", { enumerable: true, get: function () { return task_orchestrator_1.DEFAULT_ORCHESTRATOR_CONFIG; } });
// Class
Object.defineProperty(exports, "TaskOrchestrator", { enumerable: true, get: function () { return task_orchestrator_1.TaskOrchestrator; } });
// Re-export from sub-modules for convenience
var planning_1 = require("../planning");
Object.defineProperty(exports, "TaskPlanner", { enumerable: true, get: function () { return planning_1.TaskPlanner; } });
Object.defineProperty(exports, "DEFAULT_TASK_PLANNER_CONFIG", { enumerable: true, get: function () { return planning_1.DEFAULT_TASK_PLANNER_CONFIG; } });
var retry_1 = require("../retry");
Object.defineProperty(exports, "RetryManager", { enumerable: true, get: function () { return retry_1.RetryManager; } });
Object.defineProperty(exports, "DEFAULT_RETRY_CONFIG", { enumerable: true, get: function () { return retry_1.DEFAULT_RETRY_CONFIG; } });
Object.defineProperty(exports, "DEFAULT_RETRY_MANAGER_CONFIG", { enumerable: true, get: function () { return retry_1.DEFAULT_RETRY_MANAGER_CONFIG; } });
var model_policy_1 = require("../model-policy");
Object.defineProperty(exports, "ModelPolicyManager", { enumerable: true, get: function () { return model_policy_1.ModelPolicyManager; } });
Object.defineProperty(exports, "STABLE_PROFILE", { enumerable: true, get: function () { return model_policy_1.STABLE_PROFILE; } });
Object.defineProperty(exports, "CHEAP_PROFILE", { enumerable: true, get: function () { return model_policy_1.CHEAP_PROFILE; } });
Object.defineProperty(exports, "FAST_PROFILE", { enumerable: true, get: function () { return model_policy_1.FAST_PROFILE; } });
Object.defineProperty(exports, "DEFAULT_MODEL_POLICY_CONFIG", { enumerable: true, get: function () { return model_policy_1.DEFAULT_MODEL_POLICY_CONFIG; } });
//# sourceMappingURL=index.js.map