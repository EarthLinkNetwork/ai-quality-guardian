"use strict";
/**
 * Config Module
 * Per spec/21_STABLE_DEV.md
 *
 * Exports:
 * - Namespace configuration utilities for state separation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NamespaceUtils = exports.buildNamespaceConfig = exports.getDefaultPort = exports.getStateDir = exports.getTableName = exports.validateNamespace = exports.DEFAULT_NAMESPACE = void 0;
var namespace_1 = require("./namespace");
Object.defineProperty(exports, "DEFAULT_NAMESPACE", { enumerable: true, get: function () { return namespace_1.DEFAULT_NAMESPACE; } });
Object.defineProperty(exports, "validateNamespace", { enumerable: true, get: function () { return namespace_1.validateNamespace; } });
Object.defineProperty(exports, "getTableName", { enumerable: true, get: function () { return namespace_1.getTableName; } });
Object.defineProperty(exports, "getStateDir", { enumerable: true, get: function () { return namespace_1.getStateDir; } });
Object.defineProperty(exports, "getDefaultPort", { enumerable: true, get: function () { return namespace_1.getDefaultPort; } });
Object.defineProperty(exports, "buildNamespaceConfig", { enumerable: true, get: function () { return namespace_1.buildNamespaceConfig; } });
Object.defineProperty(exports, "NamespaceUtils", { enumerable: true, get: function () { return namespace_1.NamespaceUtils; } });
//# sourceMappingURL=index.js.map