"use strict";
/**
 * Task Planning Module
 *
 * Per spec 29_TASK_PLANNING.md
 *
 * Exports:
 * - TaskPlanner class
 * - Size estimation functions
 * - Chunking decision functions
 * - Dependency analysis functions
 * - Execution plan generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskPlanner = exports.generateExecutionPlan = exports.analyzeDependencies = exports.determineChunking = exports.estimateTaskSize = exports.DEFAULT_TASK_PLANNER_CONFIG = void 0;
var task_planner_1 = require("./task-planner");
// Constants
Object.defineProperty(exports, "DEFAULT_TASK_PLANNER_CONFIG", { enumerable: true, get: function () { return task_planner_1.DEFAULT_TASK_PLANNER_CONFIG; } });
// Functions
Object.defineProperty(exports, "estimateTaskSize", { enumerable: true, get: function () { return task_planner_1.estimateTaskSize; } });
Object.defineProperty(exports, "determineChunking", { enumerable: true, get: function () { return task_planner_1.determineChunking; } });
Object.defineProperty(exports, "analyzeDependencies", { enumerable: true, get: function () { return task_planner_1.analyzeDependencies; } });
Object.defineProperty(exports, "generateExecutionPlan", { enumerable: true, get: function () { return task_planner_1.generateExecutionPlan; } });
// Class
Object.defineProperty(exports, "TaskPlanner", { enumerable: true, get: function () { return task_planner_1.TaskPlanner; } });
//# sourceMappingURL=index.js.map