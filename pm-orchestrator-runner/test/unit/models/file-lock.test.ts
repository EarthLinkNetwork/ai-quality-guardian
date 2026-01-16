import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  FileLock,
  createFileLock,
  validateFileLock,
  FileLockValidationError,
} from '../../../src/models/file-lock';
import { LockType } from '../../../src/models/enums';

describe('FileLock (05_DATA_MODELS.md L54-63)', () => {
  describe('FileLock structure', () => {
    it('should contain all required fields', () => {
      const lock: FileLock = {
        lock_id: 'lock-001',
        file_path: '/path/to/file.ts',
        holder_executor_id: 'executor-1',
        acquired_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-01-01T00:05:00.000Z',
        lock_type: LockType.WRITE,
      };

      assert.equal(lock.lock_id, 'lock-001');
      assert.equal(lock.file_path, '/path/to/file.ts');
      assert.equal(lock.holder_executor_id, 'executor-1');
      assert.equal(lock.acquired_at, '2024-01-01T00:00:00.000Z');
      assert.equal(lock.expires_at, '2024-01-01T00:05:00.000Z');
      assert.equal(lock.lock_type, LockType.WRITE);
    });
  });

  describe('createFileLock', () => {
    it('should create lock with generated ID and timestamp', () => {
      const lock = createFileLock('/path/to/file.ts', 'executor-1', LockType.WRITE);
      assert.ok(lock.lock_id.length > 0);
      assert.equal(lock.file_path, '/path/to/file.ts');
      assert.equal(lock.holder_executor_id, 'executor-1');
      assert.ok(lock.acquired_at.length > 0);
      assert.ok(lock.expires_at.length > 0);
      assert.equal(lock.lock_type, LockType.WRITE);
    });

    it('should generate unique lock IDs', () => {
      const lock1 = createFileLock('/path1.ts', 'exec-1', LockType.READ);
      const lock2 = createFileLock('/path2.ts', 'exec-2', LockType.READ);
      assert.notEqual(lock1.lock_id, lock2.lock_id);
    });

    it('should set expires_at to future time', () => {
      const lock = createFileLock('/path.ts', 'exec-1', LockType.WRITE);
      const acquired = new Date(lock.acquired_at);
      const expires = new Date(lock.expires_at);
      assert.ok(expires > acquired);
    });
  });

  describe('validateFileLock', () => {
    it('should accept valid lock', () => {
      const lock: FileLock = {
        lock_id: 'lock-001',
        file_path: '/path/to/file.ts',
        holder_executor_id: 'executor-1',
        acquired_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-01-01T00:05:00.000Z',
        lock_type: LockType.WRITE,
      };
      assert.ok(validateFileLock(lock));
    });

    it('should reject lock without lock_id', () => {
      const lock = {
        file_path: '/path/to/file.ts',
        holder_executor_id: 'executor-1',
        acquired_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-01-01T00:05:00.000Z',
        lock_type: LockType.WRITE,
      } as FileLock;
      assert.throws(() => validateFileLock(lock), FileLockValidationError);
    });

    it('should reject lock without file_path', () => {
      const lock = {
        lock_id: 'lock-001',
        holder_executor_id: 'executor-1',
        acquired_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-01-01T00:05:00.000Z',
        lock_type: LockType.WRITE,
      } as FileLock;
      assert.throws(() => validateFileLock(lock), FileLockValidationError);
    });

    it('should reject lock without holder_executor_id', () => {
      const lock = {
        lock_id: 'lock-001',
        file_path: '/path/to/file.ts',
        acquired_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-01-01T00:05:00.000Z',
        lock_type: LockType.WRITE,
      } as FileLock;
      assert.throws(() => validateFileLock(lock), FileLockValidationError);
    });

    it('should reject lock with invalid acquired_at timestamp', () => {
      const lock: FileLock = {
        lock_id: 'lock-001',
        file_path: '/path/to/file.ts',
        holder_executor_id: 'executor-1',
        acquired_at: 'invalid-timestamp',
        expires_at: '2024-01-01T00:05:00.000Z',
        lock_type: LockType.WRITE,
      };
      assert.throws(() => validateFileLock(lock), FileLockValidationError);
    });

    it('should reject lock with invalid lock_type', () => {
      const lock = {
        lock_id: 'lock-001',
        file_path: '/path/to/file.ts',
        holder_executor_id: 'executor-1',
        acquired_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-01-01T00:05:00.000Z',
        lock_type: 'INVALID' as LockType,
      };
      assert.throws(() => validateFileLock(lock), FileLockValidationError);
    });
  });

  describe('expires_at is INFORMATIONAL ONLY (User Clarification)', () => {
    it('expires_at should be present but is informational only', () => {
      const lock = createFileLock('/path.ts', 'exec-1', LockType.WRITE);
      // expires_at must exist
      assert.ok(lock.expires_at);
      // But it should NOT be used for automatic release
      // This is tested in lock-manager.test.ts
    });

    it('expires_at can be in the past without automatic release', () => {
      // This test documents that expired locks are NOT automatically released
      // Auto-release based on expires_at is E405 RESOURCE_RELEASE_FAILURE
      const lock: FileLock = {
        lock_id: 'lock-001',
        file_path: '/path/to/file.ts',
        holder_executor_id: 'executor-1',
        acquired_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-01-01T00:00:01.000Z', // Past time
        lock_type: LockType.WRITE,
      };
      // Lock is still valid even if expires_at is in the past
      assert.ok(validateFileLock(lock));
    });
  });

  describe('LockType', () => {
    it('should support READ type', () => {
      const lock = createFileLock('/path.ts', 'exec-1', LockType.READ);
      assert.equal(lock.lock_type, LockType.READ);
    });

    it('should support WRITE type', () => {
      const lock = createFileLock('/path.ts', 'exec-1', LockType.WRITE);
      assert.equal(lock.lock_type, LockType.WRITE);
    });
  });
});
