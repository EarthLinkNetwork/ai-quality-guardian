"use strict";
/**
 * FileLock Model
 * Based on 05_DATA_MODELS.md L54-63
 *
 * IMPORTANT: expires_at is INFORMATIONAL ONLY
 * Auto-release based on expires_at is forbidden (E405 RESOURCE_RELEASE_FAILURE)
 * Locks must be explicitly released by the holder.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileLockValidationError = void 0;
exports.createFileLock = createFileLock;
exports.validateFileLock = validateFileLock;
exports.isLockHeldBy = isLockHeldBy;
exports.isLockCompatible = isLockCompatible;
exports.extendLockExpiration = extendLockExpiration;
exports.isExpired = isExpired;
const uuid_1 = require("uuid");
const enums_1 = require("./enums");
/**
 * Default lock duration in milliseconds (5 minutes)
 */
const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000;
/**
 * FileLock validation error
 */
class FileLockValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FileLockValidationError';
    }
}
exports.FileLockValidationError = FileLockValidationError;
/**
 * Create a new file lock
 *
 * Note: expires_at is set but is INFORMATIONAL ONLY.
 * The lock manager should NOT automatically release locks based on expires_at.
 * Auto-release attempt triggers E405 RESOURCE_RELEASE_FAILURE.
 */
function createFileLock(filePath, holderExecutorId, lockType, durationMs = DEFAULT_LOCK_DURATION_MS) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);
    return {
        lock_id: `lock-${(0, uuid_1.v4)()}`,
        file_path: filePath,
        holder_executor_id: holderExecutorId,
        acquired_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        lock_type: lockType,
    };
}
/**
 * Validate a file lock object
 * @throws FileLockValidationError if validation fails
 */
function validateFileLock(lock) {
    if (!lock.lock_id || lock.lock_id.length === 0) {
        throw new FileLockValidationError('lock_id is required');
    }
    if (!lock.file_path || lock.file_path.length === 0) {
        throw new FileLockValidationError('file_path is required');
    }
    if (!lock.holder_executor_id || lock.holder_executor_id.length === 0) {
        throw new FileLockValidationError('holder_executor_id is required');
    }
    if (!lock.acquired_at || lock.acquired_at.length === 0) {
        throw new FileLockValidationError('acquired_at is required');
    }
    // Validate acquired_at timestamp format
    const acquiredAt = new Date(lock.acquired_at);
    if (isNaN(acquiredAt.getTime())) {
        throw new FileLockValidationError('acquired_at must be a valid ISO 8601 timestamp');
    }
    if (!lock.expires_at || lock.expires_at.length === 0) {
        throw new FileLockValidationError('expires_at is required');
    }
    // Validate expires_at timestamp format
    const expiresAt = new Date(lock.expires_at);
    if (isNaN(expiresAt.getTime())) {
        throw new FileLockValidationError('expires_at must be a valid ISO 8601 timestamp');
    }
    // Validate lock_type
    if (!Object.values(enums_1.LockType).includes(lock.lock_type)) {
        throw new FileLockValidationError('lock_type must be a valid LockType');
    }
    return true;
}
/**
 * Check if a lock is held by a specific executor
 */
function isLockHeldBy(lock, executorId) {
    return lock.holder_executor_id === executorId;
}
/**
 * Check if lock type is compatible with requested operation
 * READ locks allow multiple readers
 * WRITE locks are exclusive
 */
function isLockCompatible(existingLock, requestedType) {
    // WRITE lock is exclusive
    if (existingLock.lock_type === enums_1.LockType.WRITE) {
        return false;
    }
    // READ lock only allows other READ locks
    if (existingLock.lock_type === enums_1.LockType.READ) {
        return requestedType === enums_1.LockType.READ;
    }
    return false;
}
/**
 * Extend lock expiration (informational only)
 * Note: This does NOT change the behavior of the lock.
 * It only updates the informational expires_at field.
 */
function extendLockExpiration(lock, additionalMs = DEFAULT_LOCK_DURATION_MS) {
    const currentExpires = new Date(lock.expires_at);
    const newExpires = new Date(currentExpires.getTime() + additionalMs);
    return {
        ...lock,
        expires_at: newExpires.toISOString(),
    };
}
/**
 * Check if expires_at is in the past (informational only)
 * Note: This is informational only and should NOT be used for automatic release.
 * Auto-release based on this would trigger E405 RESOURCE_RELEASE_FAILURE.
 */
function isExpired(lock) {
    const expiresAt = new Date(lock.expires_at);
    return expiresAt < new Date();
}
//# sourceMappingURL=file-lock.js.map