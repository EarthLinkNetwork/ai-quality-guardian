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

import { FileLock, createFileLock, isLockCompatible } from '../models/file-lock';
import { LockType } from '../models/enums';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';

/**
 * Lock Manager Error
 */
export class LockManagerError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'LockManagerError';
    this.code = code;
    this.details = details;
  }
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
export class LockManager {
  private readonly baseDir: string;
  private readonly locks: Map<string, FileLock>;
  private readonly fileLocks: Map<string, Set<string>>; // file_path -> Set<lock_id>
  private readonly executorSemaphores: Set<string>;
  private readonly maxExecutors: number = 4;

  /**
   * Create a new LockManager
   * @param baseDir Base directory for lock storage
   */
  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.locks = new Map();
    this.fileLocks = new Map();
    this.executorSemaphores = new Set();
  }

  /**
   * Acquire a lock on a file
   * @throws LockManagerError with E401 if lock cannot be acquired
   */
  acquireLock(filePath: string, executorId: string, lockType: LockType): FileLock {
    // Check existing locks on this file
    const existingLockIds = this.fileLocks.get(filePath);

    if (existingLockIds && existingLockIds.size > 0) {
      // Check if any existing lock conflicts
      for (const lockId of existingLockIds) {
        const existingLock = this.locks.get(lockId);
        if (existingLock && !isLockCompatible(existingLock, lockType)) {
          throw new LockManagerError(
            ErrorCode.E401_LOCK_ACQUISITION_FAILURE,
            `Cannot acquire ${lockType} lock on ${filePath}: conflicting lock exists`,
            { filePath, executorId, lockType, conflictingLockId: lockId }
          );
        }
      }
    }

    // Create the lock
    const lock = createFileLock(filePath, executorId, lockType);

    // Store the lock
    this.locks.set(lock.lock_id, lock);

    // Track file -> locks mapping
    if (!this.fileLocks.has(filePath)) {
      this.fileLocks.set(filePath, new Set());
    }
    this.fileLocks.get(filePath)!.add(lock.lock_id);

    return lock;
  }

  /**
   * Release a lock
   * @throws LockManagerError with E402 if lock not found
   */
  releaseLock(lockId: string): void {
    const lock = this.locks.get(lockId);

    if (!lock) {
      throw new LockManagerError(
        ErrorCode.E402_LOCK_RELEASE_FAILURE,
        `Lock not found: ${lockId}`,
        { lockId }
      );
    }

    // Remove from file -> locks mapping
    const fileLockIds = this.fileLocks.get(lock.file_path);
    if (fileLockIds) {
      fileLockIds.delete(lockId);
      if (fileLockIds.size === 0) {
        this.fileLocks.delete(lock.file_path);
      }
    }

    // Remove the lock
    this.locks.delete(lockId);
  }

  /**
   * Acquire multiple locks in sorted order (to prevent deadlocks)
   */
  acquireMultipleLocks(files: string[], executorId: string, lockType: LockType): FileLock[] {
    // Sort files to ensure consistent lock acquisition order
    const sortedFiles = [...files].sort();
    const acquiredLocks: FileLock[] = [];

    try {
      for (const filePath of sortedFiles) {
        const lock = this.acquireLock(filePath, executorId, lockType);
        acquiredLocks.push(lock);
      }
      return acquiredLocks;
    } catch (error) {
      // Rollback: release all acquired locks in reverse order
      for (const lock of acquiredLocks.reverse()) {
        try {
          this.releaseLock(lock.lock_id);
        } catch {
          // Ignore release errors during rollback
        }
      }
      throw error;
    }
  }

  /**
   * Acquire global semaphore for an executor
   * @throws LockManagerError with E404 if executor limit exceeded
   */
  acquireGlobalSemaphore(executorId: string): boolean {
    if (this.executorSemaphores.size >= this.maxExecutors) {
      throw new LockManagerError(
        ErrorCode.E404_EXECUTOR_LIMIT_EXCEEDED,
        `Executor limit exceeded: max ${this.maxExecutors} executors allowed`,
        { executorId, currentCount: this.executorSemaphores.size }
      );
    }

    this.executorSemaphores.add(executorId);
    return true;
  }

  /**
   * Release global semaphore for an executor
   */
  releaseGlobalSemaphore(executorId: string): void {
    this.executorSemaphores.delete(executorId);
  }

  /**
   * Detect deadlock from wait graph
   * Uses cycle detection in the wait-for graph
   */
  detectDeadlock(waitGraph: WaitGraphEntry[]): boolean {
    // Build adjacency list: executor -> set of executors it's waiting for
    const adjacencyList = new Map<string, Set<string>>();

    // Initialize all executors
    for (const entry of waitGraph) {
      adjacencyList.set(entry.executor_id, new Set());
    }

    // Build the wait-for graph
    for (const entry of waitGraph) {
      for (const wantedFile of entry.wants) {
        // Find who holds this file
        for (const other of waitGraph) {
          if (other.executor_id !== entry.executor_id && other.holds.includes(wantedFile)) {
            adjacencyList.get(entry.executor_id)!.add(other.executor_id);
          }
        }
      }
    }

    // Detect cycle using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = adjacencyList.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const executor of adjacencyList.keys()) {
      if (!visited.has(executor)) {
        if (hasCycle(executor)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Acquire lock with deadlock check
   * @throws LockManagerError with E403 if deadlock would occur
   */
  acquireLockWithDeadlockCheck(
    filePath: string,
    executorId: string,
    lockType: LockType,
    holdingFiles: string[]
  ): FileLock {
    // Check if acquiring this lock would cause a deadlock
    const existingLockIds = this.fileLocks.get(filePath);

    if (existingLockIds && existingLockIds.size > 0) {
      // Get the executor holding the wanted file
      for (const lockId of existingLockIds) {
        const existingLock = this.locks.get(lockId);
        if (existingLock && existingLock.holder_executor_id !== executorId) {
          // Check if that executor wants any file we're holding
          const otherExecutorId = existingLock.holder_executor_id;

          // Check all locks to see if the other executor wants our files
          for (const [lId, lock] of this.locks) {
            if (lock.holder_executor_id === otherExecutorId) {
              // The other executor holds some file, check if they're waiting for our files
              // This is a simplified deadlock check - in reality would need more context
            }
          }

          // Build wait graph to check for deadlock
          const waitGraph: WaitGraphEntry[] = [
            { executor_id: executorId, holds: holdingFiles, wants: [filePath] },
            { executor_id: otherExecutorId, holds: [filePath], wants: holdingFiles },
          ];

          if (this.detectDeadlock(waitGraph)) {
            throw new LockManagerError(
              ErrorCode.E403_DEADLOCK_DETECTED,
              `Deadlock detected: ${executorId} waiting for ${filePath} held by ${otherExecutorId}`,
              { executorId, filePath, otherExecutorId, holdingFiles }
            );
          }
        }
      }
    }

    return this.acquireLock(filePath, executorId, lockType);
  }

  /**
   * Update lock expiry (informational only)
   */
  updateLockExpiry(lockId: string, newExpiry: string): void {
    const lock = this.locks.get(lockId);
    if (lock) {
      const updatedLock: FileLock = {
        ...lock,
        expires_at: newExpiry,
      };
      this.locks.set(lockId, updatedLock);
    }
  }

  /**
   * Get a lock by ID
   */
  getLock(lockId: string): FileLock | undefined {
    return this.locks.get(lockId);
  }

  /**
   * Get lock age in milliseconds
   */
  getLockAge(lockId: string): number {
    const lock = this.locks.get(lockId);
    if (!lock) {
      return -1;
    }

    const acquiredAt = new Date(lock.acquired_at);
    return Date.now() - acquiredAt.getTime();
  }

  /**
   * Auto-release expired locks - FORBIDDEN
   * expires_at is INFORMATIONAL ONLY
   * @throws LockManagerError with E405 always
   */
  autoReleaseExpiredLocks(): void {
    // Check if there are any expired locks
    for (const [lockId, lock] of this.locks) {
      const expiresAt = new Date(lock.expires_at);
      if (expiresAt < new Date()) {
        // Auto-release is forbidden
        throw new LockManagerError(
          ErrorCode.E405_RESOURCE_RELEASE_FAILURE,
          'Auto-release based on expires_at is forbidden. Locks must be explicitly released.',
          { lockId, expires_at: lock.expires_at }
        );
      }
    }
  }

  /**
   * Get all active locks
   */
  getActiveLocks(): FileLock[] {
    return Array.from(this.locks.values());
  }

  /**
   * Get locks by executor
   */
  getLocksByExecutor(executorId: string): FileLock[] {
    return Array.from(this.locks.values()).filter(
      lock => lock.holder_executor_id === executorId
    );
  }

  /**
   * Get locks by file
   */
  getLocksByFile(filePath: string): FileLock[] {
    const lockIds = this.fileLocks.get(filePath);
    if (!lockIds) {
      return [];
    }

    return Array.from(lockIds)
      .map(lockId => this.locks.get(lockId))
      .filter((lock): lock is FileLock => lock !== undefined);
  }

  /**
   * Check if a file is locked
   */
  isFileLocked(filePath: string): boolean {
    const lockIds = this.fileLocks.get(filePath);
    return lockIds !== undefined && lockIds.size > 0;
  }
}
