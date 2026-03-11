import * as fs from 'fs';
import * as path from 'path';

const ERROR_LOG_PATH = path.resolve('error.log');

/**
 * Format an error into a timestamped log line.
 *
 * @param error  - A string message or an Error object.
 * @param prefix - Label such as "ERROR", "WARN", "CRITICAL". Defaults to "ERROR".
 * @returns The formatted line (no trailing newline).
 */
export function formatErrorMessage(
  error: string | Error,
  prefix: string = 'ERROR',
): string {
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : error;
  return `[${timestamp}] [${prefix}] ${message}`;
}

/**
 * Append a formatted error line to `error.log` in the current working directory.
 *
 * @param error  - A string message or an Error object.
 * @param prefix - Label such as "ERROR", "WARN", "CRITICAL". Defaults to "ERROR".
 */
export function logError(
  error: string | Error,
  prefix: string = 'ERROR',
): void {
  const line = formatErrorMessage(error, prefix);
  fs.appendFileSync(ERROR_LOG_PATH, line + '\n', 'utf-8');
}
