"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETRY_BACKOFF_MULTIPLIER = exports.DEFAULT_RETRY_DELAY_MS = exports.DEFAULT_MAX_RETRIES = void 0;
exports.setNonInteractiveMode = setNonInteractiveMode;
exports.isNonInteractiveMode = isNonInteractiveMode;
exports.atomicWriteFile = atomicWriteFile;
exports.atomicWriteFileSync = atomicWriteFileSync;
exports.trackPendingWrite = trackPendingWrite;
exports.flushAllPendingWrites = flushAllPendingWrites;
exports.getPendingWriteCount = getPendingWriteCount;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Default retry configuration
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3
 */
exports.DEFAULT_MAX_RETRIES = 3;
exports.DEFAULT_RETRY_DELAY_MS = 100;
exports.RETRY_BACKOFF_MULTIPLIER = 2;
/**
 * Global non-interactive mode flag
 * Set by REPL/CLI when --non-interactive is specified
 */
let nonInteractiveMode = false;
/**
 * Set non-interactive mode
 * Called by REPL/CLI at startup
 */
function setNonInteractiveMode(value) {
    nonInteractiveMode = value;
}
/**
 * Check if running in non-interactive mode
 * Also checks process.stdin.isTTY as fallback
 */
function isNonInteractiveMode() {
    // Explicit flag takes precedence
    if (nonInteractiveMode) {
        return true;
    }
    // Fallback: check if stdin is not a TTY (piped input)
    return !process.stdin.isTTY;
}
/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
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
async function writeWithFsync(filePath, content, options = {}) {
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
        }
        finally {
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
async function atomicWriteFile(filePath, content, options = {}) {
    const maxRetries = options.maxRetries ?? exports.DEFAULT_MAX_RETRIES;
    const retryDelayMs = options.retryDelayMs ?? exports.DEFAULT_RETRY_DELAY_MS;
    let lastError;
    let retryCount = 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await writeWithFsync(filePath, content, options);
            return { success: true, retryCount };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            retryCount = attempt;
            // Don't retry on last attempt
            if (attempt < maxRetries) {
                // Exponential backoff
                const delay = retryDelayMs * Math.pow(exports.RETRY_BACKOFF_MULTIPLIER, attempt);
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
function atomicWriteFileSync(filePath, content, options = {}) {
    const maxRetries = options.maxRetries ?? exports.DEFAULT_MAX_RETRIES;
    const mode = options.mode || 0o644;
    const encoding = options.encoding || 'utf-8';
    let lastError;
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
                }
                finally {
                    fs.closeSync(fd);
                }
            }
            return { success: true, retryCount };
        }
        catch (error) {
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
const pendingWrites = new Map();
/**
 * Track a pending write operation
 */
function trackPendingWrite(filePath, writePromise) {
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
async function flushAllPendingWrites() {
    const writes = Array.from(pendingWrites.values());
    if (writes.length === 0) {
        return [];
    }
    return Promise.all(writes);
}
/**
 * Get count of pending writes
 */
function getPendingWriteCount() {
    return pendingWrites.size;
}
//# sourceMappingURL=atomic-file-writer.js.map