/**
 * Application Logger Tests
 *
 * Tests for centralized logging module (app-logger.ts):
 * - In-memory log buffer management
 * - Category filtering (app/sys)
 * - Level filtering
 * - Buffer size limits
 * - Convenience log functions
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';

import {
  addLogEntry,
  getLogEntries,
  clearLogBuffer,
  log,
  type AppLogEntry,
} from '../../../src/logging/app-logger';

describe('app-logger', () => {
  beforeEach(() => {
    clearLogBuffer();
  });

  describe('addLogEntry', () => {
    it('should add an entry with auto-generated id and timestamp', () => {
      const entry = addLogEntry({
        level: 'info',
        category: 'app',
        message: 'test message',
      });

      assert.ok(entry.id, 'should have an id');
      assert.ok(entry.timestamp, 'should have a timestamp');
      assert.equal(entry.level, 'info');
      assert.equal(entry.category, 'app');
      assert.equal(entry.message, 'test message');
    });

    it('should include optional data fields', () => {
      const entry = addLogEntry({
        level: 'info',
        category: 'app',
        message: 'with data',
        data: { key: 'value' },
        projectId: 'proj-1',
        taskId: 'task-1',
        sessionId: 'sess-1',
      });

      assert.deepEqual(entry.data, { key: 'value' });
      assert.equal(entry.projectId, 'proj-1');
      assert.equal(entry.taskId, 'task-1');
      assert.equal(entry.sessionId, 'sess-1');
    });
  });

  describe('getLogEntries', () => {
    it('should return entries in newest-first order', () => {
      addLogEntry({ level: 'info', category: 'app', message: 'first' });
      addLogEntry({ level: 'info', category: 'app', message: 'second' });
      addLogEntry({ level: 'info', category: 'app', message: 'third' });

      const entries = getLogEntries();
      assert.equal(entries[0].message, 'third');
      assert.equal(entries[1].message, 'second');
      assert.equal(entries[2].message, 'first');
    });

    it('should filter by category', () => {
      addLogEntry({ level: 'info', category: 'app', message: 'app msg' });
      addLogEntry({ level: 'info', category: 'sys', message: 'sys msg' });
      addLogEntry({ level: 'warn', category: 'app', message: 'app warn' });

      const appEntries = getLogEntries({ category: 'app' });
      assert.equal(appEntries.length, 2);
      assert.ok(appEntries.every(e => e.category === 'app'));

      const sysEntries = getLogEntries({ category: 'sys' });
      assert.equal(sysEntries.length, 1);
      assert.equal(sysEntries[0].message, 'sys msg');
    });

    it('should filter by level', () => {
      addLogEntry({ level: 'info', category: 'app', message: 'info' });
      addLogEntry({ level: 'warn', category: 'app', message: 'warn' });
      addLogEntry({ level: 'error', category: 'app', message: 'error' });

      const warnEntries = getLogEntries({ level: 'warn' });
      assert.equal(warnEntries.length, 1);
      assert.equal(warnEntries[0].message, 'warn');
    });

    it('should filter by projectId', () => {
      addLogEntry({ level: 'info', category: 'app', message: 'proj a', projectId: 'a' });
      addLogEntry({ level: 'info', category: 'app', message: 'proj b', projectId: 'b' });

      const entries = getLogEntries({ projectId: 'a' });
      assert.equal(entries.length, 1);
      assert.equal(entries[0].message, 'proj a');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        addLogEntry({ level: 'info', category: 'app', message: `msg ${i}` });
      }

      const entries = getLogEntries({ limit: 3 });
      assert.equal(entries.length, 3);
    });

    it('should return empty array when buffer is empty', () => {
      const entries = getLogEntries();
      assert.equal(entries.length, 0);
    });
  });

  describe('clearLogBuffer', () => {
    it('should remove all entries', () => {
      addLogEntry({ level: 'info', category: 'app', message: 'msg' });
      addLogEntry({ level: 'info', category: 'sys', message: 'msg' });
      assert.equal(getLogEntries().length, 2);

      clearLogBuffer();
      assert.equal(getLogEntries().length, 0);
    });
  });

  describe('buffer size limit', () => {
    it('should not exceed 500 entries', () => {
      for (let i = 0; i < 510; i++) {
        addLogEntry({ level: 'info', category: 'app', message: `msg ${i}` });
      }

      const entries = getLogEntries();
      assert.equal(entries.length, 500);
      // Oldest entries should have been dropped
      assert.equal(entries[entries.length - 1].message, 'msg 10');
    });
  });

  describe('log convenience functions', () => {
    it('log.app.info should add entry to buffer', () => {
      log.app.info('app info msg', { key: 'val' });

      const entries = getLogEntries({ category: 'app' });
      assert.equal(entries.length, 1);
      assert.equal(entries[0].level, 'info');
      assert.equal(entries[0].message, 'app info msg');
      assert.deepEqual(entries[0].data, { key: 'val' });
    });

    it('log.app.warn should add warn entry', () => {
      log.app.warn('app warning');

      const entries = getLogEntries({ category: 'app', level: 'warn' });
      assert.equal(entries.length, 1);
    });

    it('log.app.error should add error entry', () => {
      log.app.error('app error', { code: 500 });

      const entries = getLogEntries({ category: 'app', level: 'error' });
      assert.equal(entries.length, 1);
      assert.deepEqual(entries[0].data, { code: 500 });
    });

    it('log.sys.info should add sys entry', () => {
      log.sys.info('sys info', { port: 5678 });

      const entries = getLogEntries({ category: 'sys' });
      assert.equal(entries.length, 1);
      assert.equal(entries[0].message, 'sys info');
    });

    it('log.sys.debug should add debug entry', () => {
      log.sys.debug('sys debug');

      const entries = getLogEntries({ category: 'sys', level: 'debug' });
      assert.equal(entries.length, 1);
    });

    it('log.sys.error should add error entry', () => {
      log.sys.error('sys error');

      const entries = getLogEntries({ category: 'sys', level: 'error' });
      assert.equal(entries.length, 1);
    });
  });
});
