"use strict";
/**
 * Task Chunking Module
 *
 * Per spec 26_TASK_CHUNKING.md: Automatic task splitting with parallel/sequential execution
 *
 * Exports:
 * - TaskChunkingExecutorWrapper: Main class for wrapping IExecutor
 * - Task analysis functions
 * - Retry logic functions
 * - Types and interfaces
 * - Default configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TASK_CHUNKING_CONFIG = exports.aggregateResults = exports.hasFailedSubtask = exports.isChunkedTaskComplete = exports.getReadySubtasks = exports.createChunkedTask = exports.createSubtaskDefinitions = exports.generateSubtaskId = exports.shouldRetry = exports.calculateRetryDelay = exports.analyzeTaskForChunking = exports.TaskChunkingExecutorWrapper = void 0;
var task_chunking_1 = require("./task-chunking");
// Main class
Object.defineProperty(exports, "TaskChunkingExecutorWrapper", { enumerable: true, get: function () { return task_chunking_1.TaskChunkingExecutorWrapper; } });
// Analysis functions
Object.defineProperty(exports, "analyzeTaskForChunking", { enumerable: true, get: function () { return task_chunking_1.analyzeTaskForChunking; } });
// Retry functions
Object.defineProperty(exports, "calculateRetryDelay", { enumerable: true, get: function () { return task_chunking_1.calculateRetryDelay; } });
Object.defineProperty(exports, "shouldRetry", { enumerable: true, get: function () { return task_chunking_1.shouldRetry; } });
// Utility functions
Object.defineProperty(exports, "generateSubtaskId", { enumerable: true, get: function () { return task_chunking_1.generateSubtaskId; } });
Object.defineProperty(exports, "createSubtaskDefinitions", { enumerable: true, get: function () { return task_chunking_1.createSubtaskDefinitions; } });
Object.defineProperty(exports, "createChunkedTask", { enumerable: true, get: function () { return task_chunking_1.createChunkedTask; } });
Object.defineProperty(exports, "getReadySubtasks", { enumerable: true, get: function () { return task_chunking_1.getReadySubtasks; } });
Object.defineProperty(exports, "isChunkedTaskComplete", { enumerable: true, get: function () { return task_chunking_1.isChunkedTaskComplete; } });
Object.defineProperty(exports, "hasFailedSubtask", { enumerable: true, get: function () { return task_chunking_1.hasFailedSubtask; } });
Object.defineProperty(exports, "aggregateResults", { enumerable: true, get: function () { return task_chunking_1.aggregateResults; } });
// Configuration
Object.defineProperty(exports, "DEFAULT_TASK_CHUNKING_CONFIG", { enumerable: true, get: function () { return task_chunking_1.DEFAULT_TASK_CHUNKING_CONFIG; } });
//# sourceMappingURL=index.js.map