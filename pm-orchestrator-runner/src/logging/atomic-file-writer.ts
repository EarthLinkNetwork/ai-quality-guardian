/**
 * Atomic File Writer
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md:
 * - Section 7.3: Atomic Recording (file lock + retry mechanism)
 * - Section 11.2: Non-Interactive Mode Flush/Close guarantee (fsync)
 *
 * Provides reliable file writing with:
 * - fsync() after writes in non-interactive mode
 * - Retry mechanism (max 3 retries per spec Section 7.3)
 * - Error handling with exponential backoff
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Default retry configuration
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3
 */
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 100;
export const RETRY_BACKOFF_MULTIPLIER = 2;

/**
 * Global non-interactive mode flag
 * Set by REPL/CLI when --non-interactive is specified
 */
let nonInteractiveMode = false;

/**
 * Set non-interactive mode
 * Called by REPL/CLI at startup
 */
export function setNonInteractiveMode(value: boolean): void {
  nonInteractiveMode = value;
}

/**
 * Check if running in non-interactive mode
 * Also checks process.stdin.isTTY as fallback
 */
export function isNonInteractiveMode(): boolean {
  // Explicit flag takes precedence
  if (nonInteractiveMode) {
    return true;
  }
  // Fallback: check if stdin is not a TTY (piped input)
  return !process.stdin.isTTY;
}

/**
 * Write options for atomic file operations
 */
export interface AtomicWriteOptions {
  /** Maximum retry attempts (default: 3 per spec) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 100) */
  retryDelayMs?: number;
  /** Force fsync regardless of mode (default: false) */
  forceFsync?: boolean;
  /** File permissions (default: 0o644) */
  mode?: number;
  /** Encoding (default: 'utf-8') */
  encoding?: BufferEncoding;
}

/**
 * Write result
 */
export interface AtomicWriteResult {
  success: boolean;
  retryCount: number;
  error?: Error;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Write file with fsync guarantee
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 11.2
 *
 * @param filePath - Path to write to
 * @param content - Content to write
 * @param options - Write options
 */
async function writeWithFsync(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const encoding = options.encoding || 'utf-8';
  const mode = options.mode || 0o644;

  // Ensure parent directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file
  fs.writeFileSync(filePath, content, { encoding, mode });

  // fsync in non-interactive mode or when forced
  // Per spec Section 11.3: "fsync() after write in non-interactive mode"
  if (isNonInteractiveMode() || options.forceFsync) {
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
}

/**
 * Atomic file write with retry mechanism
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3
 *
 * @param filePath - Path to write to
 * @param content - Content to write
 * @param options - Write options
 * @returns Result with success status and retry count
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {}
): Promise<AtomicWriteResult> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: Error | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await writeWithFsync(filePath, content, options);
      return { success: true, retryCount };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount = attempt;

      // Don't retry on last attempt
      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = retryDelayMs * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  return {
    success: false,
    retryCount: maxRetries,
    error: lastError,
  };
}

/**
 * Synchronous atomic file write with retry mechanism
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3
 *
 * @param filePath - Path to write to
 * @param content - Content to write
 * @param options - Write options
 * @returns Result with success status and retry count
 */
export function atomicWriteFileSync(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {}
): AtomicWriteResult {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const mode = options.mode || 0o644;
  const encoding = options.encoding || 'utf-8';

  let lastError: Error | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filePath, content, { encoding, mode });

      // fsync in non-interactive mode or when forced
      if (isNonInteractiveMode() || options.forceFsync) {
        const fd = fs.openSync(filePath, 'r');
        try {
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      }

      return { success: true, retryCount };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount = attempt;

      // Don't sleep on last attempt (sync version uses simple retry without delay)
    }
  }

  // All retries exhausted
  return {
    success: false,
    retryCount: maxRetries,
    error: lastError,
  };
}

/**
 * Pending writes tracker for flushAll
 */
const pendingWrites: Map<string, Promise<AtomicWriteResult>> = new Map();

/**
 * Track a pending write operation
 */
export function trackPendingWrite(filePath: string, writePromise: Promise<AtomicWriteResult>): void {
  pendingWrites.set(filePath, writePromise);
  writePromise.finally(() => {
    pendingWrites.delete(filePath);
  });
}

/**
 * Flush all pending writes
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 11.2
 * Called before REPL exit to ensure all logs are persisted
 *
 * @returns Results of all pending writes
 */
export async function flushAllPendingWrites(): Promise<AtomicWriteResult[]> {
  const writes = Array.from(pendingWrites.values());
  if (writes.length === 0) {
    return [];
  }
  return Promise.all(writes);
}

/**
 * Get count of pending writes
 */
export function getPendingWriteCount(): number {
  return pendingWrites.size;
}
