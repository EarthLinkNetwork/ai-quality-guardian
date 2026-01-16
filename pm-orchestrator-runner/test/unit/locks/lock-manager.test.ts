import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  LockManager,
  LockManagerError,
} from '../../../src/locks/lock-manager';
import { FileLock } from '../../../src/models/file-lock';
import { LockType } from '../../../src/models/enums';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Lock Manager (04_COMPONENTS.md L178-201)', () => {
  let tempDir: string;
  let lockManager: LockManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-lock-test-'));
    lockManager = new LockManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Lock Acquisition (04_COMPONENTS.md L183)', () => {
    it('should acquire lock for file', () => {
      const filePath = '/path/to/file.ts';
      const executorId = 'exec-001';

      const lock = lockManager.acquireLock(filePath, executorId, LockType.WRITE);

      assert.ok(lock);
      assert.equal(lock.file_path, filePath);
      assert.equal(lock.holder_executor_id, executorId);
      assert.equal(lock.lock_type, LockType.WRITE);
    });

    it('should generate unique lock IDs', () => {
      const lock1 = lockManager.acquireLock('/file1.ts', 'exec-001', LockType.WRITE);
      const lock2 = lockManager.acquireLock('/file2.ts', 'exec-002', LockType.WRITE);

      assert.notEqual(lock1.lock_id, lock2.lock_id);
    });

    it('should fail to acquire lock on already locked file', () => {
      const filePath = '/path/to/file.ts';

      lockManager.acquireLock(filePath, 'exec-001', LockType.WRITE);

      assert.throws(
        () => lockManager.acquireLock(filePath, 'exec-002', LockType.WRITE),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E401_LOCK_ACQUISITION_FAILURE;
        }
      );
    });

    it('should allow multiple READ locks on same file', () => {
      const filePath = '/path/to/file.ts';

      const lock1 = lockManager.acquireLock(filePath, 'exec-001', LockType.READ);
      const lock2 = lockManager.acquireLock(filePath, 'exec-002', LockType.READ);

      assert.ok(lock1);
      assert.ok(lock2);
      assert.notEqual(lock1.lock_id, lock2.lock_id);
    });

    it('should fail to acquire WRITE lock when READ locks exist', () => {
      const filePath = '/path/to/file.ts';

      lockManager.acquireLock(filePath, 'exec-001', LockType.READ);

      assert.throws(
        () => lockManager.acquireLock(filePath, 'exec-002', LockType.WRITE),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E401_LOCK_ACQUISITION_FAILURE;
        }
      );
    });

    it('should fail to acquire READ lock when WRITE lock exists', () => {
      const filePath = '/path/to/file.ts';

      lockManager.acquireLock(filePath, 'exec-001', LockType.WRITE);

      assert.throws(
        () => lockManager.acquireLock(filePath, 'exec-002', LockType.READ),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E401_LOCK_ACQUISITION_FAILURE;
        }
      );
    });
  });

  describe('Lock Release (04_COMPONENTS.md L183)', () => {
    it('should release lock', () => {
      const filePath = '/path/to/file.ts';
      const lock = lockManager.acquireLock(filePath, 'exec-001', LockType.WRITE);

      lockManager.releaseLock(lock.lock_id);

      // Should be able to acquire lock again
      const newLock = lockManager.acquireLock(filePath, 'exec-002', LockType.WRITE);
      assert.ok(newLock);
    });

    it('should fail to release non-existent lock', () => {
      assert.throws(
        () => lockManager.releaseLock('non-existent-lock-id'),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E402_LOCK_RELEASE_FAILURE;
        }
      );
    });

    it('should release all READ locks for a file', () => {
      const filePath = '/path/to/file.ts';

      const lock1 = lockManager.acquireLock(filePath, 'exec-001', LockType.READ);
      const lock2 = lockManager.acquireLock(filePath, 'exec-002', LockType.READ);

      lockManager.releaseLock(lock1.lock_id);
      lockManager.releaseLock(lock2.lock_id);

      // Should be able to acquire WRITE lock now
      const writeLock = lockManager.acquireLock(filePath, 'exec-003', LockType.WRITE);
      assert.ok(writeLock);
    });
  });

  describe('Deadlock Detection (04_COMPONENTS.md L184)', () => {
    it('should detect deadlock (E403)', () => {
      // Simulate deadlock scenario:
      // Executor A holds lock on file1, wants lock on file2
      // Executor B holds lock on file2, wants lock on file1

      const file1 = '/path/to/file1.ts';
      const file2 = '/path/to/file2.ts';

      // Executor A gets file1
      lockManager.acquireLock(file1, 'exec-A', LockType.WRITE);

      // Executor B gets file2
      lockManager.acquireLock(file2, 'exec-B', LockType.WRITE);

      // Executor A tries to get file2 (would wait)
      // Executor B tries to get file1 (would wait)
      // This creates a deadlock

      // Check if deadlock is detected
      const deadlockDetected = lockManager.detectDeadlock([
        { executor_id: 'exec-A', holds: [file1], wants: [file2] },
        { executor_id: 'exec-B', holds: [file2], wants: [file1] },
      ]);

      assert.ok(deadlockDetected);
    });

    it('should not detect deadlock when none exists', () => {
      const file1 = '/path/to/file1.ts';
      const file2 = '/path/to/file2.ts';

      lockManager.acquireLock(file1, 'exec-A', LockType.WRITE);

      const deadlockDetected = lockManager.detectDeadlock([
        { executor_id: 'exec-A', holds: [file1], wants: [] },
        { executor_id: 'exec-B', holds: [], wants: [file2] },
      ]);

      assert.ok(!deadlockDetected);
    });
  });

  describe('Lock Ordering (04_COMPONENTS.md L185-186)', () => {
    it('should enforce lock acquisition order', () => {
      const files = ['/path/z.ts', '/path/a.ts', '/path/m.ts'];

      // Lock Manager should sort files and acquire in deterministic order
      const locks = lockManager.acquireMultipleLocks(files, 'exec-001', LockType.WRITE);

      assert.equal(locks.length, 3);
      // Locks should be acquired in sorted order to prevent deadlocks
      const paths = locks.map(l => l.file_path);
      const sortedPaths = [...paths].sort();
      assert.deepEqual(paths, sortedPaths);
    });

    it('should release locks in reverse order', () => {
      const files = ['/path/a.ts', '/path/b.ts', '/path/c.ts'];
      const locks = lockManager.acquireMultipleLocks(files, 'exec-001', LockType.WRITE);

      const releaseOrder: string[] = [];
      for (const lock of [...locks].reverse()) {
        lockManager.releaseLock(lock.lock_id);
        releaseOrder.push(lock.file_path);
      }

      // Should release in reverse order (c, b, a)
      assert.deepEqual(releaseOrder, ['/path/c.ts', '/path/b.ts', '/path/a.ts']);
    });
  });

  describe('Lock Acquisition Protocol (04_COMPONENTS.md L189-195)', () => {
    it('should acquire global semaphore first', () => {
      const semaphoreAcquired = lockManager.acquireGlobalSemaphore('exec-001');
      assert.ok(semaphoreAcquired);
    });

    it('should respect executor limit (max 4)', () => {
      // Acquire semaphore for 4 executors
      for (let i = 1; i <= 4; i++) {
        const result = lockManager.acquireGlobalSemaphore(`exec-${i}`);
        assert.ok(result);
      }

      // 5th executor should fail
      assert.throws(
        () => lockManager.acquireGlobalSemaphore('exec-5'),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E404_EXECUTOR_LIMIT_EXCEEDED;
        }
      );
    });

    it('should release global semaphore', () => {
      for (let i = 1; i <= 4; i++) {
        lockManager.acquireGlobalSemaphore(`exec-${i}`);
      }

      lockManager.releaseGlobalSemaphore('exec-1');

      // Now 5th executor should succeed
      const result = lockManager.acquireGlobalSemaphore('exec-5');
      assert.ok(result);
    });

    it('should follow complete lock protocol', async () => {
      const executorId = 'exec-001';
      const files = ['/path/a.ts', '/path/b.ts'];

      // Step 1: Acquire global semaphore
      lockManager.acquireGlobalSemaphore(executorId);

      // Step 2: Acquire file locks in order
      const locks = lockManager.acquireMultipleLocks(files, executorId, LockType.WRITE);

      // Step 3: Execute operation (simulated)
      // ... operation here ...

      // Step 4: Release file locks in reverse order
      for (const lock of [...locks].reverse()) {
        lockManager.releaseLock(lock.lock_id);
      }

      // Step 5: Release global semaphore
      lockManager.releaseGlobalSemaphore(executorId);

      // Verify all locks are released
      const activeLocks = lockManager.getActiveLocks();
      assert.equal(activeLocks.length, 0);
    });
  });

  describe('Lock File Format (04_COMPONENTS.md L197-200)', () => {
    it('should contain lock_id', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);
      assert.ok(lock.lock_id);
      assert.ok(lock.lock_id.length > 0);
    });

    it('should contain holder_executor_id', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);
      assert.equal(lock.holder_executor_id, 'exec-001');
    });

    it('should contain acquired_at timestamp', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);
      assert.ok(lock.acquired_at);
      assert.ok(!isNaN(Date.parse(lock.acquired_at)));
    });

    it('should contain expires_at timestamp', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);
      assert.ok(lock.expires_at);
      assert.ok(!isNaN(Date.parse(lock.expires_at)));
    });

    it('should contain file_path', () => {
      const lock = lockManager.acquireLock('/path/to/file.ts', 'exec-001', LockType.WRITE);
      assert.equal(lock.file_path, '/path/to/file.ts');
    });
  });

  describe('expires_at is INFORMATIONAL ONLY (User Clarification)', () => {
    it('expires_at should NOT trigger automatic release', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);

      // Manually set expires_at to past
      const expiredLock: FileLock = {
        ...lock,
        expires_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      };

      // Update lock in manager (simulating time passing)
      lockManager.updateLockExpiry(lock.lock_id, expiredLock.expires_at);

      // Lock should still be held (NOT automatically released)
      const currentLock = lockManager.getLock(lock.lock_id);
      assert.ok(currentLock);
      assert.equal(currentLock.holder_executor_id, 'exec-001');
    });

    it('should throw E405 if auto-release based on expires_at is attempted', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);

      // Set expires_at to past
      lockManager.updateLockExpiry(lock.lock_id, new Date(Date.now() - 1000).toISOString());

      // Attempting automatic release based on expiry should fail with E405
      assert.throws(
        () => lockManager.autoReleaseExpiredLocks(),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E405_RESOURCE_RELEASE_FAILURE;
        }
      );
    });

    it('expires_at is used only for deadlock detection reference', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);

      // Deadlock detection can use expires_at as a reference for how long a lock has been held
      const lockAge = lockManager.getLockAge(lock.lock_id);
      assert.ok(lockAge >= 0);

      // But it should NOT use it for automatic release
      // This is just informational for debugging/monitoring
    });
  });

  describe('Error Handling', () => {
    it('should throw E401 for lock acquisition failure', () => {
      lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);

      assert.throws(
        () => lockManager.acquireLock('/file.ts', 'exec-002', LockType.WRITE),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E401_LOCK_ACQUISITION_FAILURE;
        }
      );
    });

    it('should throw E402 for lock release failure', () => {
      assert.throws(
        () => lockManager.releaseLock('non-existent'),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E402_LOCK_RELEASE_FAILURE;
        }
      );
    });

    it('should throw E403 for deadlock detected', () => {
      // Setup deadlock scenario
      const file1 = '/file1.ts';
      const file2 = '/file2.ts';

      lockManager.acquireLock(file1, 'exec-A', LockType.WRITE);
      lockManager.acquireLock(file2, 'exec-B', LockType.WRITE);

      // Simulate exec-A trying to acquire file2 with deadlock check
      assert.throws(
        () => lockManager.acquireLockWithDeadlockCheck(file2, 'exec-A', LockType.WRITE, [file1]),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E403_DEADLOCK_DETECTED;
        }
      );
    });

    it('should throw E404 for executor limit exceeded', () => {
      // Fill up executor slots
      for (let i = 1; i <= 4; i++) {
        lockManager.acquireGlobalSemaphore(`exec-${i}`);
      }

      assert.throws(
        () => lockManager.acquireGlobalSemaphore('exec-5'),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E404_EXECUTOR_LIMIT_EXCEEDED;
        }
      );
    });

    it('should throw E405 for resource release failure', () => {
      const lock = lockManager.acquireLock('/file.ts', 'exec-001', LockType.WRITE);
      lockManager.updateLockExpiry(lock.lock_id, new Date(Date.now() - 1000).toISOString());

      assert.throws(
        () => lockManager.autoReleaseExpiredLocks(),
        (err: Error) => {
          return err instanceof LockManagerError &&
            (err as LockManagerError).code === ErrorCode.E405_RESOURCE_RELEASE_FAILURE;
        }
      );
    });
  });

  describe('Lock State Queries', () => {
    it('should list all active locks', () => {
      lockManager.acquireLock('/file1.ts', 'exec-001', LockType.WRITE);
      lockManager.acquireLock('/file2.ts', 'exec-002', LockType.READ);
      lockManager.acquireLock('/file2.ts', 'exec-003', LockType.READ);

      const activeLocks = lockManager.getActiveLocks();
      assert.equal(activeLocks.length, 3);
    });

    it('should get locks by executor', () => {
      lockManager.acquireLock('/file1.ts', 'exec-001', LockType.WRITE);
      lockManager.acquireLock('/file2.ts', 'exec-001', LockType.WRITE);
      lockManager.acquireLock('/file3.ts', 'exec-002', LockType.WRITE);

      const exec1Locks = lockManager.getLocksByExecutor('exec-001');
      assert.equal(exec1Locks.length, 2);
    });

    it('should get locks by file', () => {
      lockManager.acquireLock('/file1.ts', 'exec-001', LockType.READ);
      lockManager.acquireLock('/file1.ts', 'exec-002', LockType.READ);

      const fileLocks = lockManager.getLocksByFile('/file1.ts');
      assert.equal(fileLocks.length, 2);
    });

    it('should check if file is locked', () => {
      lockManager.acquireLock('/file1.ts', 'exec-001', LockType.WRITE);

      assert.ok(lockManager.isFileLocked('/file1.ts'));
      assert.ok(!lockManager.isFileLocked('/file2.ts'));
    });
  });
});
