import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { logError, formatErrorMessage } from '../../../src/utils/error-handler';

const ERROR_LOG_PATH = path.resolve('error.log');

describe('error-handler', () => {
  afterEach(() => {
    if (fs.existsSync(ERROR_LOG_PATH)) {
      fs.unlinkSync(ERROR_LOG_PATH);
    }
  });

  describe('formatErrorMessage', () => {
    it('formats a basic error message with timestamp prefix', () => {
      const result = formatErrorMessage('Something went wrong');
      assert.match(result, /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      assert.ok(result.includes('[ERROR] Something went wrong'));
    });

    it('formats an Error object', () => {
      const err = new Error('Test failure');
      const result = formatErrorMessage(err);
      assert.ok(result.includes('[ERROR] Test failure'));
    });

    it('includes a custom prefix when provided', () => {
      const result = formatErrorMessage('disk full', 'CRITICAL');
      assert.ok(result.includes('[CRITICAL] disk full'));
    });

    it('handles empty string', () => {
      const result = formatErrorMessage('');
      assert.ok(result.includes('[ERROR]'));
    });
  });

  describe('logError', () => {
    it('creates error.log and writes the formatted message', () => {
      logError('first error');
      assert.ok(fs.existsSync(ERROR_LOG_PATH));
      const content = fs.readFileSync(ERROR_LOG_PATH, 'utf-8');
      assert.ok(content.includes('first error'));
    });

    it('appends subsequent errors to the same file', () => {
      logError('error one');
      logError('error two');
      const content = fs.readFileSync(ERROR_LOG_PATH, 'utf-8');
      assert.ok(content.includes('error one'));
      assert.ok(content.includes('error two'));
    });

    it('logs an Error object', () => {
      const err = new Error('runtime crash');
      logError(err);
      const content = fs.readFileSync(ERROR_LOG_PATH, 'utf-8');
      assert.ok(content.includes('runtime crash'));
    });

    it('uses a custom prefix', () => {
      logError('timeout', 'WARN');
      const content = fs.readFileSync(ERROR_LOG_PATH, 'utf-8');
      assert.ok(content.includes('[WARN] timeout'));
    });
  });
});
