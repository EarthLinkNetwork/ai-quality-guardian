"use strict";
/**
 * Settings Module Exports
 *
 * Per spec 33_PROJECT_SETTINGS_PERSISTENCE.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectSettingsStore = exports.getDefaultStorageDir = exports.generateProjectHash = exports.SETTINGS_LIMITS = exports.DEFAULT_STORE_CONFIG = exports.DEFAULT_PROJECT_SETTINGS = exports.CURRENT_SETTINGS_VERSION = void 0;
var project_settings_store_1 = require("./project-settings-store");
// Constants
Object.defineProperty(exports, "CURRENT_SETTINGS_VERSION", { enumerable: true, get: function () { return project_settings_store_1.CURRENT_SETTINGS_VERSION; } });
Object.defineProperty(exports, "DEFAULT_PROJECT_SETTINGS", { enumerable: true, get: function () { return project_settings_store_1.DEFAULT_PROJECT_SETTINGS; } });
Object.defineProperty(exports, "DEFAULT_STORE_CONFIG", { enumerable: true, get: function () { return project_settings_store_1.DEFAULT_STORE_CONFIG; } });
Object.defineProperty(exports, "SETTINGS_LIMITS", { enumerable: true, get: function () { return project_settings_store_1.SETTINGS_LIMITS; } });
// Functions
Object.defineProperty(exports, "generateProjectHash", { enumerable: true, get: function () { return project_settings_store_1.generateProjectHash; } });
Object.defineProperty(exports, "getDefaultStorageDir", { enumerable: true, get: function () { return project_settings_store_1.getDefaultStorageDir; } });
// Class
Object.defineProperty(exports, "ProjectSettingsStore", { enumerable: true, get: function () { return project_settings_store_1.ProjectSettingsStore; } });
//# sourceMappingURL=index.js.map