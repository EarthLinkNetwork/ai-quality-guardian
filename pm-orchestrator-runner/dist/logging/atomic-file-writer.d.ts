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
/**
 * Default retry configuration
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3
 */
export declare const DEFAULT_MAX_RETRIES = 3;
export declare const DEFAULT_RETRY_DELAY_MS = 100;
export declare const RETRY_BACKOFF_MULTIPLIER = 2;
/**
 * Set non-interactive mode
 * Called by REPL/CLI at startup
 */
export declare function setNonInteractiveMode(value: boolean): void;
/**
 * Check if running in non-interactive mode
 * Also checks process.stdin.isTTY as fallback
 */
export declare function isNonInteractiveMode(): boolean;
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
 * Atomic file write with retry mechanism
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3
 *
 * @param filePath - Path to write to
 * @param content - Content to write
 * @param options - Write options
 * @returns Result with success status and retry count
 */
export declare function atomicWriteFile(filePath: string, content: string, options?: AtomicWriteOptions): Promise<AtomicWriteResult>;
/**
 * Synchronous atomic file write with retry mechanism
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3
 *
 * @param filePath - Path to write to
 * @param content - Content to write
 * @param options - Write options
 * @returns Result with success status and retry count
 */
export declare function atomicWriteFileSync(filePath: string, content: string, options?: AtomicWriteOptions): AtomicWriteResult;
/**
 * Track a pending write operation
 */
export declare function trackPendingWrite(filePath: string, writePromise: Promise<AtomicWriteResult>): void;
/**
 * Flush all pending writes
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 11.2
 * Called before REPL exit to ensure all logs are persisted
 *
 * @returns Results of all pending writes
 */
export declare function flushAllPendingWrites(): Promise<AtomicWriteResult[]>;
/**
 * Get count of pending writes
 */
export declare function getPendingWriteCount(): number;
//# sourceMappingURL=atomic-file-writer.d.ts.map