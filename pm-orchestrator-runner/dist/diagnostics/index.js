"use strict";
/**
 * Diagnostics Module
 *
 * Generic diagnostic/audit/verification framework.
 * Problems are expressed as DiagnosticDefinitions.
 * DiagnosticRunner executes them uniformly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.distIntegrityDiagnostic = exports.builtinDiagnostics = exports.GenericPicker = exports.DiagnosticRegistry = exports.DiagnosticRunner = void 0;
var runner_1 = require("./runner");
Object.defineProperty(exports, "DiagnosticRunner", { enumerable: true, get: function () { return runner_1.DiagnosticRunner; } });
Object.defineProperty(exports, "DiagnosticRegistry", { enumerable: true, get: function () { return runner_1.DiagnosticRegistry; } });
var picker_1 = require("./picker");
Object.defineProperty(exports, "GenericPicker", { enumerable: true, get: function () { return picker_1.GenericPicker; } });
var definitions_1 = require("./definitions");
Object.defineProperty(exports, "builtinDiagnostics", { enumerable: true, get: function () { return definitions_1.builtinDiagnostics; } });
Object.defineProperty(exports, "distIntegrityDiagnostic", { enumerable: true, get: function () { return definitions_1.distIntegrityDiagnostic; } });
//# sourceMappingURL=index.js.map