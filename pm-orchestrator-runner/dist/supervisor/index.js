"use strict";
/**
 * Supervisor System Exports
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProcessSupervisor = exports.ProcessSupervisor = exports.RestartHandler = exports.detectRestartState = exports.resetSupervisor = exports.getSupervisor = exports.Supervisor = exports.TEMPLATE_MARKERS = exports.extractComponents = exports.validateTemplate = exports.substituteVariables = exports.applyOutputTemplateWithMarkers = exports.applyOutputTemplate = exports.mergePromptWithMarkers = exports.mergePrompt = exports.getProjectConfigPath = exports.getGlobalConfigPath = exports.SupervisorConfigManager = exports.mergeConfigs = exports.saveProjectConfig = exports.loadProjectConfig = exports.saveGlobalConfig = exports.loadGlobalConfig = void 0;
// Types
__exportStar(require("./types"), exports);
// Config Loader
var config_loader_1 = require("./config-loader");
Object.defineProperty(exports, "loadGlobalConfig", { enumerable: true, get: function () { return config_loader_1.loadGlobalConfig; } });
Object.defineProperty(exports, "saveGlobalConfig", { enumerable: true, get: function () { return config_loader_1.saveGlobalConfig; } });
Object.defineProperty(exports, "loadProjectConfig", { enumerable: true, get: function () { return config_loader_1.loadProjectConfig; } });
Object.defineProperty(exports, "saveProjectConfig", { enumerable: true, get: function () { return config_loader_1.saveProjectConfig; } });
Object.defineProperty(exports, "mergeConfigs", { enumerable: true, get: function () { return config_loader_1.mergeConfigs; } });
Object.defineProperty(exports, "SupervisorConfigManager", { enumerable: true, get: function () { return config_loader_1.SupervisorConfigManager; } });
Object.defineProperty(exports, "getGlobalConfigPath", { enumerable: true, get: function () { return config_loader_1.getGlobalConfigPath; } });
Object.defineProperty(exports, "getProjectConfigPath", { enumerable: true, get: function () { return config_loader_1.getProjectConfigPath; } });
// Template Engine
var template_engine_1 = require("./template-engine");
Object.defineProperty(exports, "mergePrompt", { enumerable: true, get: function () { return template_engine_1.mergePrompt; } });
Object.defineProperty(exports, "mergePromptWithMarkers", { enumerable: true, get: function () { return template_engine_1.mergePromptWithMarkers; } });
Object.defineProperty(exports, "applyOutputTemplate", { enumerable: true, get: function () { return template_engine_1.applyOutputTemplate; } });
Object.defineProperty(exports, "applyOutputTemplateWithMarkers", { enumerable: true, get: function () { return template_engine_1.applyOutputTemplateWithMarkers; } });
Object.defineProperty(exports, "substituteVariables", { enumerable: true, get: function () { return template_engine_1.substituteVariables; } });
Object.defineProperty(exports, "validateTemplate", { enumerable: true, get: function () { return template_engine_1.validateTemplate; } });
Object.defineProperty(exports, "extractComponents", { enumerable: true, get: function () { return template_engine_1.extractComponents; } });
Object.defineProperty(exports, "TEMPLATE_MARKERS", { enumerable: true, get: function () { return template_engine_1.TEMPLATE_MARKERS; } });
// Supervisor Core
var supervisor_1 = require("./supervisor");
Object.defineProperty(exports, "Supervisor", { enumerable: true, get: function () { return supervisor_1.Supervisor; } });
Object.defineProperty(exports, "getSupervisor", { enumerable: true, get: function () { return supervisor_1.getSupervisor; } });
Object.defineProperty(exports, "resetSupervisor", { enumerable: true, get: function () { return supervisor_1.resetSupervisor; } });
Object.defineProperty(exports, "detectRestartState", { enumerable: true, get: function () { return supervisor_1.detectRestartState; } });
// Restart Handler (SUP-6)
var restart_handler_1 = require("./restart-handler");
Object.defineProperty(exports, "RestartHandler", { enumerable: true, get: function () { return restart_handler_1.RestartHandler; } });
// Process Supervisor (WEB_COMPLETE_OPERATION)
var process_supervisor_1 = require("./process-supervisor");
Object.defineProperty(exports, "ProcessSupervisor", { enumerable: true, get: function () { return process_supervisor_1.ProcessSupervisor; } });
Object.defineProperty(exports, "createProcessSupervisor", { enumerable: true, get: function () { return process_supervisor_1.createProcessSupervisor; } });
//# sourceMappingURL=index.js.map