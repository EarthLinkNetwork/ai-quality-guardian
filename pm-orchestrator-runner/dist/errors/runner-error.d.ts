/**
 * Runner Error - Base error class for PM Orchestrator Runner
 * Based on 07_ERROR_HANDLING.md specification
 */
import { ErrorCode } from './error-codes';
/**
 * Base error class for PM Orchestrator Runner
 */
export declare class RunnerError extends Error {
    readonly code: ErrorCode;
    readonly context?: string;
    constructor(code: ErrorCode, context?: string);
}
//# sourceMappingURL=runner-error.d.ts.map