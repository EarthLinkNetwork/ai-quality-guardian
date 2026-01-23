"use strict";
/**
 * Template Module Exports
 *
 * Per spec 32_TEMPLATE_INJECTION.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateStore = exports.formatOutputInjection = exports.formatRulesInjection = exports.generateId = exports.validateTemplate = exports.validateTemplateContent = exports.validateTemplateName = exports.getDefaultStorageDir = exports.DEFAULT_TEMPLATE_STORE_CONFIG = exports.BUILTIN_STRICT = exports.BUILTIN_STANDARD = exports.BUILTIN_MINIMAL = exports.BUILTIN_TEMPLATES = exports.NAME_PATTERN = exports.TEMPLATE_LIMITS = void 0;
var template_store_1 = require("./template-store");
// Constants
Object.defineProperty(exports, "TEMPLATE_LIMITS", { enumerable: true, get: function () { return template_store_1.TEMPLATE_LIMITS; } });
Object.defineProperty(exports, "NAME_PATTERN", { enumerable: true, get: function () { return template_store_1.NAME_PATTERN; } });
Object.defineProperty(exports, "BUILTIN_TEMPLATES", { enumerable: true, get: function () { return template_store_1.BUILTIN_TEMPLATES; } });
Object.defineProperty(exports, "BUILTIN_MINIMAL", { enumerable: true, get: function () { return template_store_1.BUILTIN_MINIMAL; } });
Object.defineProperty(exports, "BUILTIN_STANDARD", { enumerable: true, get: function () { return template_store_1.BUILTIN_STANDARD; } });
Object.defineProperty(exports, "BUILTIN_STRICT", { enumerable: true, get: function () { return template_store_1.BUILTIN_STRICT; } });
Object.defineProperty(exports, "DEFAULT_TEMPLATE_STORE_CONFIG", { enumerable: true, get: function () { return template_store_1.DEFAULT_TEMPLATE_STORE_CONFIG; } });
// Functions
Object.defineProperty(exports, "getDefaultStorageDir", { enumerable: true, get: function () { return template_store_1.getDefaultStorageDir; } });
Object.defineProperty(exports, "validateTemplateName", { enumerable: true, get: function () { return template_store_1.validateTemplateName; } });
Object.defineProperty(exports, "validateTemplateContent", { enumerable: true, get: function () { return template_store_1.validateTemplateContent; } });
Object.defineProperty(exports, "validateTemplate", { enumerable: true, get: function () { return template_store_1.validateTemplate; } });
Object.defineProperty(exports, "generateId", { enumerable: true, get: function () { return template_store_1.generateId; } });
Object.defineProperty(exports, "formatRulesInjection", { enumerable: true, get: function () { return template_store_1.formatRulesInjection; } });
Object.defineProperty(exports, "formatOutputInjection", { enumerable: true, get: function () { return template_store_1.formatOutputInjection; } });
// Class
Object.defineProperty(exports, "TemplateStore", { enumerable: true, get: function () { return template_store_1.TemplateStore; } });
//# sourceMappingURL=index.js.map