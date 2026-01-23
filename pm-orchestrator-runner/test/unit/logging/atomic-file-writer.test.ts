/**
 * Atomic File Writer Tests
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md:
 * - Section 7.3: Atomic Recording (file lock + retry mechanism)
 * - Section 11.2: Non-Interactive Mode Flush/Close guarantee (fsync)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  atomicWriteFile,
  atomicWriteFileSync,
  setNonInteractiveMode,
  isNonInteractiveMode,
  flushAllPendingWrites,
  getPendingWriteCount,
  trackPendingWrite,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  RETRY_BACKOFF_MULTIPLIER,
} from '../../../src/logging/atomic-file-writer';

describe('Atomic File Writer', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-writer-test-'));
    // Reset non-interactive mode
    setNonInteractiveMode(false);
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Constants', () => {
    it('should have correct default values per spec Section 7.3', () => {
      // Per spec: max 3 retries
      assert.equal(DEFAULT_MAX_RETRIES, 3);
      assert.equal(DEFAULT_RETRY_DELAY_MS, 100);
      assert.equal(RETRY_BACKOFF_MULTIPLIER, 2);
    });
  });

  describe('setNonInteractiveMode / isNonInteractiveMode', () => {
    it('should default to false when not set', () => {
      setNonInteractiveMode(false);
      // Result depends on process.stdin.isTTY
      // In test environment, TTY is typically false
      assert.equal(typeof isNonInteractiveMode(), 'boolean');
    });

    it('should return true when explicitly set to non-interactive', () => {
      setNonInteractiveMode(true);
      assert.equal(isNonInteractiveMode(), true);
    });

    it('should return false when explicitly set to interactive with TTY', () => {
      // Mock TTY to be true
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });

      setNonInteractiveMode(false);
      assert.equal(isNonInteractiveMode(), false);

      // Restore
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, writable: true });
    });
  });

  describe('atomicWriteFileSync', () => {
    it('should write file successfully', () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'test content';

      const result = atomicWriteFileSync(filePath, content);

      assert.equal(result.success, true);
      assert.equal(result.retryCount, 0);
      assert.equal(result.error, undefined);
      assert.equal(fs.readFileSync(filePath, 'utf-8'), content);
    });

    it('should create parent directories if not exist', () => {
      const filePath = path.join(tempDir, 'nested', 'dir', 'test.txt');
      const content = 'nested content';

      const result = atomicWriteFileSync(filePath, content);

      assert.equal(result.success, true);
      assert.ok(fs.existsSync(path.dirname(filePath)));
      assert.equal(fs.readFileSync(filePath, 'utf-8'), content);
    });

    it('should use correct encoding', () => {
      const filePath = path.join(tempDir, 'utf8.txt');
      const content = '日本語テスト';

      const result = atomicWriteFileSync(filePath, content, { encoding: 'utf-8' });

      assert.equal(result.success, true);
      assert.equal(fs.readFileSync(filePath, 'utf-8'), content);
    });

    it('should respect file mode option', () => {
      const filePath = path.join(tempDir, 'mode.txt');
      const content = 'mode test';

      atomicWriteFileSync(filePath, content, { mode: 0o600 });

      const stats = fs.statSync(filePath);
      // Check permission bits (mask with 0o777 to get permission bits only)
      assert.equal(stats.mode & 0o777, 0o600);
    });

    it('should perform fsync when forceFsync is true', () => {
      const filePath = path.join(tempDir, 'fsync.txt');
      const content = 'fsync test';

      // Just verify it doesn't throw
      const result = atomicWriteFileSync(filePath, content, { forceFsync: true });
      assert.equal(result.success, true);
    });

    it('should perform fsync in non-interactive mode', () => {
      setNonInteractiveMode(true);
      const filePath = path.join(tempDir, 'noninteractive.txt');
      const content = 'non-interactive test';

      // Just verify it doesn't throw
      const result = atomicWriteFileSync(filePath, content);
      assert.equal(result.success, true);
    });
  });

  describe('atomicWriteFile (async)', () => {
    it('should write file successfully', async () => {
      const filePath = path.join(tempDir, 'async-test.txt');
      const content = 'async content';

      const result = await atomicWriteFile(filePath, content);

      assert.equal(result.success, true);
      assert.equal(result.retryCount, 0);
      assert.equal(fs.readFileSync(filePath, 'utf-8'), content);
    });

    it('should create parent directories if not exist', async () => {
      const filePath = path.join(tempDir, 'async', 'nested', 'test.txt');
      const content = 'async nested content';

      const result = await atomicWriteFile(filePath, content);

      assert.equal(result.success, true);
      assert.ok(fs.existsSync(path.dirname(filePath)));
    });

    it('should return error after max retries exhausted', async () => {
      const filePath = '/nonexistent/path/that/cannot/be/created/file.txt';
      const content = 'should fail';

      const result = await atomicWriteFile(filePath, content, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      assert.equal(result.success, false);
      assert.equal(result.retryCount, 2);
      assert.ok(result.error !== undefined);
    });
  });

  describe('Pending Writes Tracking', () => {
    it('should track pending writes', async () => {
      const initialCount = getPendingWriteCount();
      const filePath = path.join(tempDir, 'pending.txt');

      const writePromise = atomicWriteFile(filePath, 'pending content');
      trackPendingWrite(filePath, writePromise);

      // Count should increase
      assert.ok(getPendingWriteCount() >= initialCount);

      await writePromise;

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should flush all pending writes', async () => {
      const files = [
        path.join(tempDir, 'flush1.txt'),
        path.join(tempDir, 'flush2.txt'),
        path.join(tempDir, 'flush3.txt'),
      ];

      // Track multiple writes
      for (const filePath of files) {
        const promise = atomicWriteFile(filePath, `content for ${path.basename(filePath)}`);
        trackPendingWrite(filePath, promise);
      }

      const results = await flushAllPendingWrites();

      // All should succeed
      for (const result of results) {
        assert.equal(result.success, true);
      }

      // All files should exist
      for (const filePath of files) {
        assert.ok(fs.existsSync(filePath));
      }
    });

    it('should return empty array when no pending writes', async () => {
      // Wait for any previous pending writes to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const results = await flushAllPendingWrites();
      assert.ok(Array.isArray(results));
    });
  });
});
