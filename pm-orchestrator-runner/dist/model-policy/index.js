"use strict";
/**
 * Model Policy Module
 *
 * Per spec 31_PROVIDER_MODEL_POLICY.md
 *
 * Exports:
 * - ModelPolicyManager class
 * - Phase-based model selection functions
 * - Model profiles and configurations
 * - Usage tracking and cost calculation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelPolicyManager = exports.calculateCost = exports.selectModel = exports.findLargerContextModel = exports.escalateModel = exports.getProviderForModel = exports.getModelByCategory = exports.getModelConfig = exports.getDefaultCategory = exports.DEFAULT_MODEL_POLICY_CONFIG = exports.PRESET_PROFILES = exports.FAST_PROFILE = exports.CHEAP_PROFILE = exports.STABLE_PROFILE = exports.MODEL_CONFIGS = void 0;
var model_policy_manager_1 = require("./model-policy-manager");
// Constants - Model Configurations
Object.defineProperty(exports, "MODEL_CONFIGS", { enumerable: true, get: function () { return model_policy_manager_1.MODEL_CONFIGS; } });
// Constants - Preset Profiles
Object.defineProperty(exports, "STABLE_PROFILE", { enumerable: true, get: function () { return model_policy_manager_1.STABLE_PROFILE; } });
Object.defineProperty(exports, "CHEAP_PROFILE", { enumerable: true, get: function () { return model_policy_manager_1.CHEAP_PROFILE; } });
Object.defineProperty(exports, "FAST_PROFILE", { enumerable: true, get: function () { return model_policy_manager_1.FAST_PROFILE; } });
Object.defineProperty(exports, "PRESET_PROFILES", { enumerable: true, get: function () { return model_policy_manager_1.PRESET_PROFILES; } });
// Constants - Default Config
Object.defineProperty(exports, "DEFAULT_MODEL_POLICY_CONFIG", { enumerable: true, get: function () { return model_policy_manager_1.DEFAULT_MODEL_POLICY_CONFIG; } });
// Functions - Category and Model Lookup
Object.defineProperty(exports, "getDefaultCategory", { enumerable: true, get: function () { return model_policy_manager_1.getDefaultCategory; } });
Object.defineProperty(exports, "getModelConfig", { enumerable: true, get: function () { return model_policy_manager_1.getModelConfig; } });
Object.defineProperty(exports, "getModelByCategory", { enumerable: true, get: function () { return model_policy_manager_1.getModelByCategory; } });
Object.defineProperty(exports, "getProviderForModel", { enumerable: true, get: function () { return model_policy_manager_1.getProviderForModel; } });
// Functions - Escalation and Selection
Object.defineProperty(exports, "escalateModel", { enumerable: true, get: function () { return model_policy_manager_1.escalateModel; } });
Object.defineProperty(exports, "findLargerContextModel", { enumerable: true, get: function () { return model_policy_manager_1.findLargerContextModel; } });
Object.defineProperty(exports, "selectModel", { enumerable: true, get: function () { return model_policy_manager_1.selectModel; } });
// Functions - Cost Calculation
Object.defineProperty(exports, "calculateCost", { enumerable: true, get: function () { return model_policy_manager_1.calculateCost; } });
// Class
Object.defineProperty(exports, "ModelPolicyManager", { enumerable: true, get: function () { return model_policy_manager_1.ModelPolicyManager; } });
//# sourceMappingURL=index.js.map