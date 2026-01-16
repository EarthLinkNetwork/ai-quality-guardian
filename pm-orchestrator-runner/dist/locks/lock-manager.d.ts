/**
 * Lock Manager
 * Based on 04_COMPONENTS.md L178-201
 *
 * Responsible for:
 * - Lock acquisition and release
 * - Deadlock detection
 * - Lock ordering (sorted acquisition)
 * - Global semaphore management (max 4 executors)
 *
 * IMPORTANT: expires_at is INFORMATIONAL ONLY
 * Auto-release based on expires_at is forbidden (E405)
 */
import { FileLock } from '../models/file-lock';
import { LockType } from '../models/enums';
import { ErrorCode } from '../errors/error-codes';
/**
 * Lock Manager Error
 */
export declare class LockManagerError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Wait graph entry for deadlock detection
 */
interface WaitGraphEntry {
    executor_id: string;
    holds: string[];
    wants: string[];
}
/**
 * Lock Manager class
 */
export declare class LockManager {
    private readonly baseDir;
    private readonly locks;
    private readonly fileLocks;
    private readonly executorSemaphores;
    private readonly maxExecutors;
    /**
     * Create a new LockManager
     * @param baseDir Base directory for lock storage
     */
    constructor(baseDir: string);
    /**
     * Acquire a lock on a file
     * @throws LockManagerError with E401 if lock cannot be acquired
     */
    acquireLock(filePath: string, executorId: string, lockType: LockType): FileLock;
    /**
     * Release a lock
     * @throws LockManagerError with E402 if lock not found
     */
    releaseLock(lockId: string): void;
    /**
     * Acquire multiple locks in sorted order (to prevent deadlocks)
     */
    acquireMultipleLocks(files: string[], executorId: string, lockType: LockType): FileLock[];
    /**
     * Acquire global semaphore for an executor
     * @throws LockManagerError with E404 if executor limit exceeded
     */
    acquireGlobalSemaphore(executorId: string): boolean;
    /**
     * Release global semaphore for an executor
     */
    releaseGlobalSemaphore(executorId: string): void;
    /**
     * Detect deadlock from wait graph
     * Uses cycle detection in the wait-for graph
     */
    detectDeadlock(waitGraph: WaitGraphEntry[]): boolean;
    /**
     * Acquire lock with deadlock check
     * @throws LockManagerError with E403 if deadlock would occur
     */
    acquireLockWithDeadlockCheck(filePath: string, executorId: string, lockType: LockType, holdingFiles: string[]): FileLock;
    /**
     * Update lock expiry (informational only)
     */
    updateLockExpiry(lockId: string, newExpiry: string): void;
    /**
     * Get a lock by ID
     */
    getLock(lockId: string): FileLock | undefined;
    /**
     * Get lock age in milliseconds
     */
    getLockAge(lockId: string): number;
    /**
     * Auto-release expired locks - FORBIDDEN
     * expires_at is INFORMATIONAL ONLY
     * @throws LockManagerError with E405 always
     */
    autoReleaseExpiredLocks(): void;
    /**
     * Get all active locks
     */
    getActiveLocks(): FileLock[];
    /**
     * Get locks by executor
     */
    getLocksByExecutor(executorId: string): FileLock[];
    /**
     * Get locks by file
     */
    getLocksByFile(filePath: string): FileLock[];
    /**
     * Check if a file is locked
     */
    isFileLocked(filePath: string): boolean;
}
export {};
//# sourceMappingURL=lock-manager.d.ts.map