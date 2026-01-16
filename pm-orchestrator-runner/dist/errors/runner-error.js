"use strict";
/**
 * Runner Error - Base error class for PM Orchestrator Runner
 * Based on 07_ERROR_HANDLING.md specification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnerError = void 0;
const error_codes_1 = require("./error-codes");
/**
 * Base error class for PM Orchestrator Runner
 */
class RunnerError extends Error {
    code;
    context;
    constructor(code, context) {
        const baseMessage = (0, error_codes_1.getErrorMessage)(code);
        const fullMessage = context
            ? `[${code}] ${baseMessage}: ${context}`
            : `[${code}] ${baseMessage}`;
        super(fullMessage);
        this.name = 'RunnerError';
        this.code = code;
        this.context = context;
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, RunnerError.prototype);
        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RunnerError);
        }
    }
}
exports.RunnerError = RunnerError;
//# sourceMappingURL=runner-error.js.map