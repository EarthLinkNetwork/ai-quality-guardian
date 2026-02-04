"use strict";
/**
 * Routes - Barrel Export
 *
 * Export all route factory functions for use in Express applications.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSelfhostRoutes = exports.createSettingsRoutes = void 0;
var settings_1 = require("./settings");
Object.defineProperty(exports, "createSettingsRoutes", { enumerable: true, get: function () { return settings_1.createSettingsRoutes; } });
var selfhost_1 = require("./selfhost");
Object.defineProperty(exports, "createSelfhostRoutes", { enumerable: true, get: function () { return selfhost_1.createSelfhostRoutes; } });
//# sourceMappingURL=index.js.map