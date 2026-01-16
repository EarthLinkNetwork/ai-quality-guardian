"use strict";
/**
 * Logging Module Index
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAW_DIR = exports.TASKS_DIR = exports.INDEX_FILE = exports.LOG_DIR = exports.TaskLogManager = exports.MASKING_PATTERNS = exports.checkApiKeyForProvider = exports.getApiKeyStatus = exports.maskSensitiveObject = exports.containsSensitiveData = exports.maskSensitiveData = void 0;
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
//# sourceMappingURL=index.js.map