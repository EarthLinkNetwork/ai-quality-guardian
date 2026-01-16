/**
 * Runner Error - Base error class for PM Orchestrator Runner
 * Based on 07_ERROR_HANDLING.md specification
 */

import { ErrorCode, getErrorMessage } from './error-codes';

/**
 * Base error class for PM Orchestrator Runner
 */
export class RunnerError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: string;

  constructor(code: ErrorCode, context?: string) {
    const baseMessage = getErrorMessage(code);
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
