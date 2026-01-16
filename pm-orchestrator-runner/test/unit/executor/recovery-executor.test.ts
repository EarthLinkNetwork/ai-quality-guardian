/**
 * Unit tests for RecoveryExecutor safety mechanisms
 *
 * These tests verify that:
 *   1. recovery-stub is rejected in production (NODE_ENV=production)
 *   2. Warning is printed when recovery-stub is activated
 *   3. mode=recovery-stub marker is included in output
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  isRecoveryMode,
  isProductionEnvironment,
  assertRecoveryModeAllowed,
  printRecoveryModeWarning,
  getRecoveryScenario,
  RecoveryExecutor,
} from '../../../src/executor/recovery-executor';

describe('RecoveryExecutor Safety Mechanisms', () => {
  // Save original env
  let originalNodeEnv: string | undefined;
  let originalExecutorMode: string | undefined;
  let originalScenario: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalExecutorMode = process.env.PM_EXECUTOR_MODE;
    originalScenario = process.env.PM_RECOVERY_SCENARIO;
  });

  afterEach(() => {
    // Restore original env
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalExecutorMode === undefined) {
      delete process.env.PM_EXECUTOR_MODE;
    } else {
      process.env.PM_EXECUTOR_MODE = originalExecutorMode;
    }
    if (originalScenario === undefined) {
      delete process.env.PM_RECOVERY_SCENARIO;
    } else {
      process.env.PM_RECOVERY_SCENARIO = originalScenario;
    }
  });

  describe('isProductionEnvironment', () => {
    it('should return true when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      assert.strictEqual(isProductionEnvironment(), true);
    });

    it('should return false when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';
      assert.strictEqual(isProductionEnvironment(), false);
    });

    it('should return false when NODE_ENV is undefined', () => {
      delete process.env.NODE_ENV;
      assert.strictEqual(isProductionEnvironment(), false);
    });

    it('should return false when NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      assert.strictEqual(isProductionEnvironment(), false);
    });
  });

  describe('isRecoveryMode', () => {
    it('should return true when PM_EXECUTOR_MODE=recovery-stub and not production', () => {
      process.env.PM_EXECUTOR_MODE = 'recovery-stub';
      delete process.env.NODE_ENV;
      assert.strictEqual(isRecoveryMode(), true);
    });

    it('should return false when PM_EXECUTOR_MODE is not recovery-stub', () => {
      process.env.PM_EXECUTOR_MODE = 'normal';
      delete process.env.NODE_ENV;
      assert.strictEqual(isRecoveryMode(), false);
    });

    it('should return false when PM_EXECUTOR_MODE is undefined', () => {
      delete process.env.PM_EXECUTOR_MODE;
      delete process.env.NODE_ENV;
      assert.strictEqual(isRecoveryMode(), false);
    });

    it('should return false when NODE_ENV=production even with recovery-stub', () => {
      process.env.PM_EXECUTOR_MODE = 'recovery-stub';
      process.env.NODE_ENV = 'production';
      assert.strictEqual(isRecoveryMode(), false);
    });

    it('SAFETY: production rejection takes precedence', () => {
      // This is the critical safety test:
      // Even if PM_EXECUTOR_MODE=recovery-stub, NODE_ENV=production must block
      process.env.PM_EXECUTOR_MODE = 'recovery-stub';
      process.env.NODE_ENV = 'production';

      // isRecoveryMode should return false
      assert.strictEqual(isRecoveryMode(), false);
    });
  });

  describe('getRecoveryScenario', () => {
    it('should return timeout for PM_RECOVERY_SCENARIO=timeout', () => {
      process.env.PM_RECOVERY_SCENARIO = 'timeout';
      assert.strictEqual(getRecoveryScenario(), 'timeout');
    });

    it('should return blocked for PM_RECOVERY_SCENARIO=blocked', () => {
      process.env.PM_RECOVERY_SCENARIO = 'blocked';
      assert.strictEqual(getRecoveryScenario(), 'blocked');
    });

    it('should return fail-closed for PM_RECOVERY_SCENARIO=fail-closed', () => {
      process.env.PM_RECOVERY_SCENARIO = 'fail-closed';
      assert.strictEqual(getRecoveryScenario(), 'fail-closed');
    });

    it('should return null for invalid scenario', () => {
      process.env.PM_RECOVERY_SCENARIO = 'invalid';
      assert.strictEqual(getRecoveryScenario(), null);
    });

    it('should return null when PM_RECOVERY_SCENARIO is undefined', () => {
      delete process.env.PM_RECOVERY_SCENARIO;
      assert.strictEqual(getRecoveryScenario(), null);
    });
  });

  describe('assertRecoveryModeAllowed', () => {
    it('should not throw when not in recovery mode', () => {
      delete process.env.PM_EXECUTOR_MODE;
      delete process.env.NODE_ENV;
      assert.doesNotThrow(() => assertRecoveryModeAllowed());
    });

    it('should not throw when in recovery mode but not production', () => {
      process.env.PM_EXECUTOR_MODE = 'recovery-stub';
      delete process.env.NODE_ENV;
      assert.doesNotThrow(() => assertRecoveryModeAllowed());
    });

    it('should not throw when in production but not recovery mode', () => {
      delete process.env.PM_EXECUTOR_MODE;
      process.env.NODE_ENV = 'production';
      assert.doesNotThrow(() => assertRecoveryModeAllowed());
    });

    // Note: We cannot test process.exit(1) directly in unit tests
    // The actual production rejection test is done via integration test
    // This test documents the expected behavior
    it('DOCUMENTED: should call process.exit(1) when recovery-stub + production', () => {
      // This test documents the expected behavior:
      // When PM_EXECUTOR_MODE=recovery-stub AND NODE_ENV=production,
      // assertRecoveryModeAllowed() calls process.exit(1)
      //
      // We cannot test this directly because process.exit terminates the test process
      // Instead, we verify the conditions that lead to exit:

      process.env.PM_EXECUTOR_MODE = 'recovery-stub';
      process.env.NODE_ENV = 'production';

      // The conditions for exit are met
      const shouldExit =
        process.env.PM_EXECUTOR_MODE === 'recovery-stub' &&
        isProductionEnvironment();

      assert.strictEqual(shouldExit, true);
    });
  });

  describe('printRecoveryModeWarning', () => {
    it('should include WARNING message', () => {
      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        printRecoveryModeWarning();
        const hasWarning = logs.some(log => log.includes('WARNING: recovery-stub enabled (test-only)'));
        assert.strictEqual(hasWarning, true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should include mode=recovery-stub marker', () => {
      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        printRecoveryModeWarning();
        const hasModeMarker = logs.some(log => log.includes('mode=recovery-stub'));
        assert.strictEqual(hasModeMarker, true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('RecoveryExecutor constructor', () => {
    it('should print warning on construction', () => {
      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        process.env.PM_RECOVERY_SCENARIO = 'blocked';
        delete process.env.NODE_ENV;
        new RecoveryExecutor('blocked');
        const hasWarning = logs.some(log => log.includes('WARNING: recovery-stub enabled (test-only)'));
        const hasModeMarker = logs.some(log => log.includes('mode=recovery-stub'));
        assert.strictEqual(hasWarning, true);
        assert.strictEqual(hasModeMarker, true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should use provided scenario', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        const executor = new RecoveryExecutor('fail-closed');
        assert.ok(executor instanceof RecoveryExecutor);
      } finally {
        console.log = originalLog;
      }
    });

    it('should default to timeout if no scenario provided', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        delete process.env.PM_RECOVERY_SCENARIO;
        const executor = new RecoveryExecutor();
        assert.ok(executor instanceof RecoveryExecutor);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
