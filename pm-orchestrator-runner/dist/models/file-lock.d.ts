/**
 * FileLock Model
 * Based on 05_DATA_MODELS.md L54-63
 *
 * IMPORTANT: expires_at is INFORMATIONAL ONLY
 * Auto-release based on expires_at is forbidden (E405 RESOURCE_RELEASE_FAILURE)
 * Locks must be explicitly released by the holder.
 */
import { LockType } from './enums';
/**
 * FileLock data structure
 */
export interface FileLock {
    lock_id: string;
    file_path: string;
    holder_executor_id: string;
    acquired_at: string;
    expires_at: string;
    lock_type: LockType;
}
/**
 * FileLock validation error
 */
export declare class FileLockValidationError extends Error {
    constructor(message: string);
}
/**
 * Create a new file lock
 *
 * Note: expires_at is set but is INFORMATIONAL ONLY.
 * The lock manager should NOT automatically release locks based on expires_at.
 * Auto-release attempt triggers E405 RESOURCE_RELEASE_FAILURE.
 */
export declare function createFileLock(filePath: string, holderExecutorId: string, lockType: LockType, durationMs?: number): FileLock;
/**
 * Validate a file lock object
 * @throws FileLockValidationError if validation fails
 */
export declare function validateFileLock(lock: FileLock): boolean;
/**
 * Check if a lock is held by a specific executor
 */
export declare function isLockHeldBy(lock: FileLock, executorId: string): boolean;
/**
 * Check if lock type is compatible with requested operation
 * READ locks allow multiple readers
 * WRITE locks are exclusive
 */
export declare function isLockCompatible(existingLock: FileLock, requestedType: LockType): boolean;
/**
 * Extend lock expiration (informational only)
 * Note: This does NOT change the behavior of the lock.
 * It only updates the informational expires_at field.
 */
export declare function extendLockExpiration(lock: FileLock, additionalMs?: number): FileLock;
/**
 * Check if expires_at is in the past (informational only)
 * Note: This is informational only and should NOT be used for automatic release.
 * Auto-release based on this would trigger E405 RESOURCE_RELEASE_FAILURE.
 */
export declare function isExpired(lock: FileLock): boolean;
//# sourceMappingURL=file-lock.d.ts.map