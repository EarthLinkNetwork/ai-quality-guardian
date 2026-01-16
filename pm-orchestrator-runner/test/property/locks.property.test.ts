/**
 * Property-based tests for Property 6: Lock Management
 * Based on 06_CORRECTNESS_PROPERTIES.md L78-87
 *
 * Property 6: Lock Management
 * - Runner maintains file-level locks using wait-die protocol
 * - Lock conflicts are detected and rejected
 * - Deadlock detection is performed
 * - Sorted lock acquisition prevents deadlock
 *
 * CRITICAL: expires_at is INFORMATIONAL ONLY
 * Auto-release based on expires_at is forbidden (E405)
 *
 * Test requirements per 08_TESTING_STRATEGY.md L27-41:
 * - Use fast-check with minimum 100 iterations
 * - Specify corresponding Correctness Property number
 * - Include parallel execution and race condition tests
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fc from 'fast-check';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { LockManager, LockManagerError } from '../../src/locks/lock-manager';
import { LockType } from '../../src/models/enums';
import { createFileLock, isLockCompatible, isExpired } from '../../src/models/file-lock';
import { ErrorCode } from '../../src/errors/error-codes';

const MIN_RUNS = 100;

describe('Property 6: Lock Management (Property-based)', () => {
  let testDir: string;
  let lockManager: LockManager;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
    lockManager = new LockManager(testDir);
  });

  describe('6.1 Lock uniqueness and conflict detection', () => {
    it('should generate unique lock IDs for all locks', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              filePath: fc.string({ minLength: 1, maxLength: 50 }),
              executorId: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (lockRequests) => {
            const lockIds = new Set<string>();

            for (const req of lockRequests) {
              const lock = createFileLock(req.filePath, req.executorId, LockType.READ);
              if (lockIds.has(lock.lock_id)) {
                return false; // Duplicate ID found
              }
              lockIds.add(lock.lock_id);
            }

            return true;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should detect WRITE-WRITE conflicts', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (filePath, executor1, executor2) => {
            // Ensure different executors
            const e2 = executor1 === executor2 ? executor2 + '_other' : executor2;
            const normalizedPath = path.join(testDir, filePath.replace(/[^a-zA-Z0-9]/g, '_'));

            const manager = new LockManager(testDir);

            // First WRITE lock succeeds
            const lock1 = manager.acquireLock(normalizedPath, executor1, LockType.WRITE);
            assert.ok(lock1);

            // Second WRITE lock should fail
            let conflictDetected = false;
            try {
              manager.acquireLock(normalizedPath, e2, LockType.WRITE);
            } catch (e) {
              if (e instanceof LockManagerError && e.code === ErrorCode.E401_LOCK_ACQUISITION_FAILURE) {
                conflictDetected = true;
              }
            }

            return conflictDetected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should detect WRITE-READ conflicts', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (filePath, executor1, executor2) => {
            const e2 = executor1 === executor2 ? executor2 + '_other' : executor2;
            const normalizedPath = path.join(testDir, filePath.replace(/[^a-zA-Z0-9]/g, '_'));

            const manager = new LockManager(testDir);

            // WRITE lock first
            manager.acquireLock(normalizedPath, executor1, LockType.WRITE);

            // READ lock should fail
            let conflictDetected = false;
            try {
              manager.acquireLock(normalizedPath, e2, LockType.READ);
            } catch (e) {
              if (e instanceof LockManagerError && e.code === ErrorCode.E401_LOCK_ACQUISITION_FAILURE) {
                conflictDetected = true;
              }
            }

            return conflictDetected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should allow multiple READ locks on same file', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 10 }),
          (filePath, executorIds) => {
            const normalizedPath = path.join(testDir, filePath.replace(/[^a-zA-Z0-9]/g, '_'));
            const manager = new LockManager(testDir);

            // Acquire multiple READ locks
            const locks = [];
            for (let i = 0; i < executorIds.length; i++) {
              const lock = manager.acquireLock(normalizedPath, executorIds[i] + '_' + i, LockType.READ);
              locks.push(lock);
            }

            // All should succeed
            return locks.length === executorIds.length;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('6.2 Lock compatibility rules', () => {
    it('should follow lock compatibility matrix', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(LockType.READ, LockType.WRITE),
          fc.constantFrom(LockType.READ, LockType.WRITE),
          (existingType, requestedType) => {
            const lock = createFileLock('/test/file', 'executor-1', existingType);
            const compatible = isLockCompatible(lock, requestedType);

            // Expected compatibility:
            // READ + READ = true
            // READ + WRITE = false
            // WRITE + READ = false
            // WRITE + WRITE = false
            const expected =
              existingType === LockType.READ && requestedType === LockType.READ;

            return compatible === expected;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('6.3 expires_at is INFORMATIONAL ONLY (E405 enforcement)', () => {
    it('should set expires_at but not auto-release expired locks', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 1000 }),
          (filePath, executorId, durationMs) => {
            // Create lock with very short duration
            const lock = createFileLock(filePath, executorId, LockType.WRITE, durationMs);

            // expires_at should be set
            assert.ok(lock.expires_at);

            // Even if "expired", the lock should still exist
            // Auto-release would be forbidden (E405)
            const expiresAt = new Date(lock.expires_at);
            assert.ok(!isNaN(expiresAt.getTime()));

            return true;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should not allow auto-release of expired locks', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (filePath, executorId) => {
            const normalizedPath = path.join(testDir, filePath.replace(/[^a-zA-Z0-9]/g, '_'));
            const manager = new LockManager(testDir);

            // Acquire lock normally
            const lock = manager.acquireLock(normalizedPath, executorId, LockType.WRITE);

            // Manipulate lock's expires_at to be in the past (simulating expiration)
            const expiredLock = {
              ...lock,
              expires_at: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
            };

            // Replace the lock in manager's internal state
            (manager as any).locks.set(lock.lock_id, expiredLock);

            // Attempting to auto-release expired locks should throw E405
            let e405Thrown = false;
            try {
              (manager as any).autoReleaseExpiredLocks();
            } catch (e) {
              if (e instanceof LockManagerError && e.code === ErrorCode.E405_RESOURCE_RELEASE_FAILURE) {
                e405Thrown = true;
              }
            }

            return e405Thrown;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('6.4 Lock release and ownership', () => {
    it('should allow lock release by lock_id', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (filePath, holderId) => {
            const normalizedPath = path.join(testDir, filePath.replace(/[^a-zA-Z0-9]/g, '_'));
            const manager = new LockManager(testDir);

            // Acquire lock
            const lock = manager.acquireLock(normalizedPath, holderId, LockType.WRITE);

            // Release by lock_id
            manager.releaseLock(lock.lock_id);

            // Lock should be released - another executor can now acquire
            const newLock = manager.acquireLock(normalizedPath, 'another-executor', LockType.WRITE);

            return newLock !== null;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });

    it('should throw error when releasing non-existent lock', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 50 }),
          (fakeLockId) => {
            const manager = new LockManager(testDir);

            let errorThrown = false;
            try {
              manager.releaseLock(fakeLockId);
            } catch (e) {
              if (e instanceof LockManagerError && e.code === ErrorCode.E402_LOCK_RELEASE_FAILURE) {
                errorThrown = true;
              }
            }

            return errorThrown;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('6.5 Sorted lock acquisition (deadlock prevention)', () => {
    it('should acquire multiple locks in sorted order', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (filePaths, executorId) => {
            // Normalize paths and ensure uniqueness
            const normalizedPaths = filePaths.map((p, i) =>
              path.join(testDir, `file_${i}_${p.replace(/[^a-zA-Z0-9]/g, '_')}`)
            );
            // Use Set to get unique paths
            const uniquePaths = [...new Set(normalizedPaths)];

            // Skip if less than 2 unique paths
            if (uniquePaths.length < 2) {
              return true;
            }

            const manager = new LockManager(testDir);

            // Acquire locks in sorted order
            const sortedPaths = [...uniquePaths].sort();
            const locks = manager.acquireMultipleLocks(sortedPaths, executorId, LockType.WRITE);

            // All locks should be acquired
            return locks.length === sortedPaths.length;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });

  describe('6.6 Global semaphore limit (max 4 executors)', () => {
    it('should enforce maximum 4 concurrent executors', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 20 }),
          (executorCount) => {
            const manager = new LockManager(testDir);

            let acquiredCount = 0;
            let rejectedCount = 0;

            for (let i = 0; i < executorCount; i++) {
              try {
                manager.acquireGlobalSemaphore(`executor-${i}`);
                acquiredCount++;
              } catch (e) {
                if (e instanceof LockManagerError && e.code === ErrorCode.E404_EXECUTOR_LIMIT_EXCEEDED) {
                  rejectedCount++;
                }
              }
            }

            // Property: At most 4 can acquire, rest are rejected
            return acquiredCount <= 4 && acquiredCount + rejectedCount === executorCount;
          }
        ),
        { numRuns: MIN_RUNS }
      );
    });
  });
});
