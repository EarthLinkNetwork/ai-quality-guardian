"use strict";
/**
 * Logging Module Index
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETRY_BACKOFF_MULTIPLIER = exports.DEFAULT_RETRY_DELAY_MS = exports.DEFAULT_MAX_RETRIES = exports.trackPendingWrite = exports.getPendingWriteCount = exports.flushAllPendingWrites = exports.isNonInteractiveMode = exports.setNonInteractiveMode = exports.atomicWriteFileSync = exports.atomicWriteFile = exports.RAW_DIR = exports.TASKS_DIR = exports.INDEX_FILE = exports.LOG_DIR = exports.TaskLogManager = exports.MASKING_PATTERNS = exports.checkApiKeyForProvider = exports.getApiKeyStatus = exports.maskSensitiveObject = exports.containsSensitiveData = exports.maskSensitiveData = void 0;
var sensitive_data_masker_1 = require("./sensitive-data-masker");
Object.defineProperty(exports, "maskSensitiveData", { enumerable: true, get: function () { return sensitive_data_masker_1.maskSensitiveData; } });
Object.defineProperty(exports, "containsSensitiveData", { enumerable: true, get: function () { return sensitive_data_masker_1.containsSensitiveData; } });
Object.defineProperty(exports, "maskSensitiveObject", { enumerable: true, get: function () { return sensitive_data_masker_1.maskSensitiveObject; } });
Object.defineProperty(exports, "getApiKeyStatus", { enumerable: true, get: function () { return sensitive_data_masker_1.getApiKeyStatus; } });
Object.defineProperty(exports, "checkApiKeyForProvider", { enumerable: true, get: function () { return sensitive_data_masker_1.checkApiKeyForProvider; } });
Object.defineProperty(exports, "MASKING_PATTERNS", { enumerable: true, get: function () { return sensitive_data_masker_1.MASKING_PATTERNS; } });
var task_log_manager_1 = require("./task-log-manager");
Object.defineProperty(exports, "TaskLogManager", { enumerable: true, get: function () { return task_log_manager_1.TaskLogManager; } });
Object.defineProperty(exports, "LOG_DIR", { enumerable: true, get: function () { return task_log_manager_1.LOG_DIR; } });
Object.defineProperty(exports, "INDEX_FILE", { enumerable: true, get: function () { return task_log_manager_1.INDEX_FILE; } });
Object.defineProperty(exports, "TASKS_DIR", { enumerable: true, get: function () { return task_log_manager_1.TASKS_DIR; } });
Object.defineProperty(exports, "RAW_DIR", { enumerable: true, get: function () { return task_log_manager_1.RAW_DIR; } });
// Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3, 11.2
// Atomic file writing with fsync and retry
var atomic_file_writer_1 = require("./atomic-file-writer");
Object.defineProperty(exports, "atomicWriteFile", { enumerable: true, get: function () { return atomic_file_writer_1.atomicWriteFile; } });
Object.defineProperty(exports, "atomicWriteFileSync", { enumerable: true, get: function () { return atomic_file_writer_1.atomicWriteFileSync; } });
Object.defineProperty(exports, "setNonInteractiveMode", { enumerable: true, get: function () { return atomic_file_writer_1.setNonInteractiveMode; } });
Object.defineProperty(exports, "isNonInteractiveMode", { enumerable: true, get: function () { return atomic_file_writer_1.isNonInteractiveMode; } });
Object.defineProperty(exports, "flushAllPendingWrites", { enumerable: true, get: function () { return atomic_file_writer_1.flushAllPendingWrites; } });
Object.defineProperty(exports, "getPendingWriteCount", { enumerable: true, get: function () { return atomic_file_writer_1.getPendingWriteCount; } });
Object.defineProperty(exports, "trackPendingWrite", { enumerable: true, get: function () { return atomic_file_writer_1.trackPendingWrite; } });
Object.defineProperty(exports, "DEFAULT_MAX_RETRIES", { enumerable: true, get: function () { return atomic_file_writer_1.DEFAULT_MAX_RETRIES; } });
Object.defineProperty(exports, "DEFAULT_RETRY_DELAY_MS", { enumerable: true, get: function () { return atomic_file_writer_1.DEFAULT_RETRY_DELAY_MS; } });
Object.defineProperty(exports, "RETRY_BACKOFF_MULTIPLIER", { enumerable: true, get: function () { return atomic_file_writer_1.RETRY_BACKOFF_MULTIPLIER; } });
//# sourceMappingURL=index.js.map