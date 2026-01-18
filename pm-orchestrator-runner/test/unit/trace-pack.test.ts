/**
 * Trace Pack Unit Tests
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TracePack, verifyTraceFile, readTraceFile } from '../../src/trace/trace-pack';

describe('Trace Pack', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-pack-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('TracePack class', () => {
    it('should create trace file on first write', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: false,
      });

      tracePack.sessionStart({ test: true });

      const outputPath = tracePack.getOutputPath();
      assert.ok(fs.existsSync(outputPath), 'Trace file should exist');
    });

    it('should write valid JSONL format', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: false,
      });

      tracePack.sessionStart();
      tracePack.taskGroupStart('tg-1');
      tracePack.taskStart('tg-1', 'task-1');
      tracePack.taskStateChange('tg-1', 'task-1', 'PENDING', 'IN_PROGRESS');
      tracePack.executorCall('tg-1', 'task-1', { prompt: 'test' });
      tracePack.executorResult('tg-1', 'task-1', 'COMPLETE');
      tracePack.verificationResult('tg-1', 'task-1', true, [
        { name: 'file_exists', passed: true },
      ]);
      tracePack.taskEnd('tg-1', 'task-1', 'COMPLETE');
      tracePack.taskGroupEnd('tg-1');
      tracePack.sessionEnd();

      // Verify file format
      const verifyResult = verifyTraceFile(tracePack.getOutputPath());
      assert.ok(verifyResult.valid, 'Trace file should be valid');
      assert.equal(verifyResult.entryCount, 10, 'Should have 10 entries');
      assert.equal(verifyResult.errors.length, 0, 'Should have no errors');
    });

    it('should buffer entries when buffered=true', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: true,
        maxBufferSize: 5,
      });

      // Write 3 entries (less than buffer size)
      tracePack.sessionStart();
      tracePack.taskGroupStart('tg-1');
      tracePack.taskStart('tg-1', 'task-1');

      // File should not exist yet (buffered)
      const outputPath = tracePack.getOutputPath();
      
      // Flush manually
      tracePack.flush();

      // Now file should exist
      assert.ok(fs.existsSync(outputPath), 'Trace file should exist after flush');

      const entries = readTraceFile(outputPath);
      assert.equal(entries.length, 3, 'Should have 3 entries after flush');
    });

    it('should auto-flush when buffer is full', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: true,
        maxBufferSize: 3,
      });

      // Write 4 entries (exceeds buffer size of 3)
      tracePack.sessionStart();
      tracePack.taskGroupStart('tg-1');
      tracePack.taskStart('tg-1', 'task-1');
      tracePack.taskEnd('tg-1', 'task-1', 'COMPLETE');

      // File should exist and have entries (auto-flushed)
      const entries = readTraceFile(tracePack.getOutputPath());
      assert.ok(entries.length >= 3, 'Should have at least 3 entries after auto-flush');
    });

    it('should include all required fields', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'my-session-123',
        buffered: false,
      });

      tracePack.sessionStart({ version: '1.0' });
      tracePack.flush();

      const entries = readTraceFile(tracePack.getOutputPath());
      assert.equal(entries.length, 1);

      const entry = entries[0];
      assert.ok(entry.timestamp, 'Should have timestamp');
      assert.equal(entry.session_id, 'my-session-123', 'Should have session_id');
      assert.equal(entry.event, 'SESSION_START', 'Should have event type');
      assert.deepEqual(entry.data, { version: '1.0' }, 'Should have data');
    });

    it('should log errors with details', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: false,
      });

      tracePack.error('Something went wrong', 'ERR_001', 'tg-1', 'task-1');

      const entries = readTraceFile(tracePack.getOutputPath());
      assert.equal(entries.length, 1);

      const entry = entries[0];
      assert.equal(entry.event, 'ERROR');
      assert.ok(entry.error, 'Should have error details');
      assert.equal(entry.error?.message, 'Something went wrong');
      assert.equal(entry.error?.code, 'ERR_001');
    });
  });

  describe('verifyTraceFile', () => {
    it('should return invalid for non-existent file', () => {
      const result = verifyTraceFile('/nonexistent/file.jsonl');
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.error.includes('does not exist')));
    });

    it('should return invalid for malformed JSON', () => {
      const filePath = path.join(tempDir, 'malformed.jsonl');
      fs.writeFileSync(filePath, '{"valid": true}\n{invalid json}\n{"also": "valid"}\n');

      const result = verifyTraceFile(filePath);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.error.includes('Invalid JSON')));
    });

    it('should return invalid for missing required fields', () => {
      const filePath = path.join(tempDir, 'missing-fields.jsonl');
      fs.writeFileSync(filePath, '{"event": "TEST"}\n');

      const result = verifyTraceFile(filePath);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.error.includes('Missing timestamp')));
      assert.ok(result.errors.some((e) => e.error.includes('Missing session_id')));
    });

    it('should count event types correctly', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: false,
      });

      tracePack.sessionStart();
      tracePack.taskGroupStart('tg-1');
      tracePack.taskStart('tg-1', 'task-1');
      tracePack.taskStateChange('tg-1', 'task-1', 'PENDING', 'COMPLETE');
      tracePack.taskEnd('tg-1', 'task-1', 'COMPLETE');
      tracePack.taskGroupEnd('tg-1');
      tracePack.sessionEnd();

      const result = verifyTraceFile(tracePack.getOutputPath());
      assert.equal(result.summary.sessionStarts, 1);
      assert.equal(result.summary.sessionEnds, 1);
      assert.equal(result.summary.taskGroupStarts, 1);
      assert.equal(result.summary.taskGroupEnds, 1);
      assert.equal(result.summary.taskStarts, 1);
      assert.equal(result.summary.taskEnds, 1);
      assert.equal(result.summary.stateChanges, 1);
    });

    it('should warn about unbalanced starts/ends', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: false,
      });

      // Only start, no end
      tracePack.sessionStart();
      tracePack.taskGroupStart('tg-1');
      // Missing taskGroupEnd and sessionEnd

      const result = verifyTraceFile(tracePack.getOutputPath());
      assert.ok(result.warnings.some((w) => w.warning.includes('Unbalanced sessions')));
      assert.ok(result.warnings.some((w) => w.warning.includes('Unbalanced task groups')));
    });
  });

  describe('readTraceFile', () => {
    it('should return empty array for non-existent file', () => {
      const entries = readTraceFile('/nonexistent/file.jsonl');
      assert.deepEqual(entries, []);
    });

    it('should parse all entries correctly', () => {
      const tracePack = new TracePack({
        outputDir: tempDir,
        sessionId: 'test-session',
        buffered: false,
      });

      tracePack.sessionStart();
      tracePack.taskGroupStart('tg-1');
      tracePack.sessionEnd();

      const entries = readTraceFile(tracePack.getOutputPath());
      assert.equal(entries.length, 3);
      assert.equal(entries[0].event, 'SESSION_START');
      assert.equal(entries[1].event, 'TASK_GROUP_START');
      assert.equal(entries[2].event, 'SESSION_END');
    });
  });
});
