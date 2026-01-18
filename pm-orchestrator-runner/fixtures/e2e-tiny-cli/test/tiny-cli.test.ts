/**
 * Tiny CLI Tests
 *
 * These tests verify the expected behavior of tiny-cli.
 * The initial buggy implementation should FAIL these tests.
 * After self-heal fixes, all tests should PASS.
 */

import { execSync } from 'child_process';
import { strict as assert } from 'assert';
import * as path from 'path';

const CLI_PATH = path.join(__dirname, '..', 'dist', 'tiny-cli.js');

function runCli(args: string[]): { stdout: string; exitCode: number } {
  try {
    const argsStr = args.join(' ');
    const stdout = execSync(`node "${CLI_PATH}" ${argsStr}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { status?: number; stdout?: Buffer | string };
    return {
      stdout: String(execError.stdout || '').trim(),
      exitCode: execError.status ?? 1,
    };
  }
}

describe('tiny-cli', () => {
  describe('sum command', () => {
    it('should return 5 for sum 2 3', () => {
      const result = runCli(['sum', '2', '3']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '5', 'sum(2, 3) should return 5');
    });

    it('should return 0 for sum 0 0', () => {
      const result = runCli(['sum', '0', '0']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '0', 'sum(0, 0) should return 0');
    });

    it('should return -3 for sum -5 2', () => {
      const result = runCli(['sum', '-5', '2']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '-3', 'sum(-5, 2) should return -3');
    });

    it('should return 100 for sum 50 50', () => {
      const result = runCli(['sum', '50', '50']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '100', 'sum(50, 50) should return 100');
    });

    it('should exit with code 2 for invalid arguments', () => {
      const result = runCli(['sum', 'abc', '3']);
      assert.equal(result.exitCode, 2, 'Exit code should be 2 for invalid args');
    });

    it('should exit with code 2 for missing arguments', () => {
      const result = runCli(['sum', '2']);
      assert.equal(result.exitCode, 2, 'Exit code should be 2 for missing args');
    });
  });

  describe('fib command', () => {
    it('should return 0 for fib 0', () => {
      const result = runCli(['fib', '0']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '0', 'fib(0) should return 0');
    });

    it('should return 1 for fib 1', () => {
      const result = runCli(['fib', '1']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '1', 'fib(1) should return 1');
    });

    it('should return 1 for fib 2', () => {
      const result = runCli(['fib', '2']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '1', 'fib(2) should return 1');
    });

    it('should return 55 for fib 10', () => {
      const result = runCli(['fib', '10']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '55', 'fib(10) should return 55');
    });

    it('should return 6765 for fib 20', () => {
      const result = runCli(['fib', '20']);
      assert.equal(result.exitCode, 0, 'Exit code should be 0');
      assert.equal(result.stdout, '6765', 'fib(20) should return 6765');
    });

    it('should exit with code 2 for negative argument', () => {
      const result = runCli(['fib', '-1']);
      assert.equal(result.exitCode, 2, 'Exit code should be 2 for negative arg');
    });

    it('should exit with code 2 for non-integer argument', () => {
      const result = runCli(['fib', 'abc']);
      assert.equal(result.exitCode, 2, 'Exit code should be 2 for non-integer arg');
    });
  });

  describe('error handling', () => {
    it('should exit with code 2 for unknown command', () => {
      const result = runCli(['unknown']);
      assert.equal(result.exitCode, 2, 'Exit code should be 2 for unknown command');
    });

    it('should exit with code 2 for no arguments', () => {
      const result = runCli([]);
      assert.equal(result.exitCode, 2, 'Exit code should be 2 for no arguments');
    });
  });
});
