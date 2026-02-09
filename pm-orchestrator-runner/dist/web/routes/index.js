"use strict";
/**
 * Routes - Barrel Export
 *
 * Export all route factory functions for use in Express applications.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunnerControlsRoutes = exports.createDevconsoleRoutes = exports.createSelfhostRoutes = exports.createSettingsRoutes = void 0;
var settings_1 = require("./settings");
Object.defineProperty(exports, "createSettingsRoutes", { enumerable: true, get: function () { return settings_1.createSettingsRoutes; } });
var selfhost_1 = require("./selfhost");
Object.defineProperty(exports, "createSelfhostRoutes", { enumerable: true, get: function () { return selfhost_1.createSelfhostRoutes; } });
var devconsole_1 = require("./devconsole");
Object.defineProperty(exports, "createDevconsoleRoutes", { enumerable: true, get: function () { return devconsole_1.createDevconsoleRoutes; } });
var runner_controls_1 = require("./runner-controls");
Object.defineProperty(exports, "createRunnerControlsRoutes", { enumerable: true, get: function () { return runner_controls_1.createRunnerControlsRoutes; } });
//# sourceMappingURL=index.js.map