/**
 * Tests for REPL init-only mode
 *
 * Spec: 10_REPL_UX.md - init-only mode requirements
 *
 * When .claude is missing, REPL enters "init-only mode":
 * - Only /help, /init, /exit are allowed
 * - Other commands return ERROR with "run /init first" message
 * - After successful /init, re-validate and transition to normal mode
 *
 * TDD: These tests are written FIRST, before implementation.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { REPLInterface } from '../../../src/repl/repl-interface';

describe('REPL init-only mode (10_REPL_UX.md)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-initonly-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Mode Detection', () => {
    /**
     * When .claude is missing, REPL should be in init-only mode
     */
    it('should be in init-only mode when .claude is missing', async () => {
      assert.ok(!fs.existsSync(path.join(tempDir, '.claude')), 'Precondition: .claude should not exist');

      // Use fixed mode to test with specific projectRoot (without auto .claude creation)
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      // Check if isInitOnlyMode method exists
      assert.ok(typeof (repl as any).isInitOnlyMode === 'function',
        'REPLInterface must have isInitOnlyMode method');

      // Should detect init-only mode before start
      const isInitOnly = await (repl as any).isInitOnlyMode();
      assert.ok(isInitOnly, 'Should be in init-only mode when .claude is missing');
    });

    /**
     * When .claude exists, REPL should NOT be in init-only mode
     */
    it('should not be in init-only mode when .claude exists', async () => {
      // Setup: Create .claude with required structure
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');

      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const isInitOnly = await (repl as any).isInitOnlyMode();
      assert.ok(!isInitOnly, 'Should NOT be in init-only mode when .claude exists');
    });
  });

  describe('Allowed Commands in init-only mode', () => {
    /**
     * /help should work in init-only mode
     */
    it('should allow /help in init-only mode', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      // Process command in init-only mode
      const result = await repl.processCommand('/help');

      assert.ok(result.success, '/help should succeed in init-only mode');
    });

    /**
     * /init should work in init-only mode
     */
    it('should allow /init in init-only mode', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      // Process /init in init-only mode
      const result = await repl.processCommand('/init');

      // /init creates .claude directory
      assert.ok(result.success, '/init should succeed in init-only mode');
      assert.ok(fs.existsSync(path.join(tempDir, '.claude')), '.claude should be created');
    });

    /**
     * /exit should work in init-only mode
     */
    it('should allow /exit in init-only mode', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      // Process /exit in init-only mode (without starting REPL loop)
      const result = await repl.processCommand('/exit');

      assert.ok(result.success, '/exit should succeed in init-only mode');
    });
  });

  describe('Blocked Commands in init-only mode', () => {
    /**
     * /start should be blocked in init-only mode
     */
    it('should block /start in init-only mode with error', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const result = await repl.processCommand('/start');

      assert.ok(!result.success, '/start should fail in init-only mode');
      assert.ok(result.error, 'Should have error object');
      assert.ok(result.error?.code, 'Should have error code');
      assert.ok(
        result.error?.message.includes('/init') || result.error?.message.includes('init'),
        'Error message should mention /init'
      );
    });

    /**
     * /status should be blocked in init-only mode
     */
    it('should block /status in init-only mode with error', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const result = await repl.processCommand('/status');

      assert.ok(!result.success, '/status should fail in init-only mode');
      assert.ok(result.error?.message.includes('/init') || result.error?.message.includes('init'),
        'Error message should mention /init');
    });

    /**
     * /tasks should be blocked in init-only mode
     */
    it('should block /tasks in init-only mode with error', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const result = await repl.processCommand('/tasks');

      assert.ok(!result.success, '/tasks should fail in init-only mode');
      assert.ok(result.error?.message.includes('/init') || result.error?.message.includes('init'),
        'Error message should mention /init');
    });

    /**
     * /model should be blocked in init-only mode
     */
    it('should block /model in init-only mode with error', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const result = await repl.processCommand('/model');

      assert.ok(!result.success, '/model should fail in init-only mode');
      assert.ok(result.error?.message.includes('/init') || result.error?.message.includes('init'),
        'Error message should mention /init');
    });

    /**
     * /continue should be blocked in init-only mode
     */
    it('should block /continue in init-only mode with error', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const result = await repl.processCommand('/continue');

      assert.ok(!result.success, '/continue should fail in init-only mode');
      assert.ok(result.error?.message.includes('/init') || result.error?.message.includes('init'),
        'Error message should mention /init');
    });

    /**
     * /approve should be blocked in init-only mode
     */
    it('should block /approve in init-only mode with error', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const result = await repl.processCommand('/approve');

      assert.ok(!result.success, '/approve should fail in init-only mode');
      assert.ok(result.error?.message.includes('/init') || result.error?.message.includes('init'),
        'Error message should mention /init');
    });
  });

  describe('Mode Transition after /init', () => {
    /**
     * After successful /init, REPL should transition to normal mode
     */
    it('should transition to normal mode after successful /init', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      // Initially in init-only mode
      let isInitOnly = await (repl as any).isInitOnlyMode();
      assert.ok(isInitOnly, 'Should start in init-only mode');

      // Execute /init
      const initResult = await repl.processCommand('/init');
      assert.ok(initResult.success, '/init should succeed');

      // Should no longer be in init-only mode
      isInitOnly = await (repl as any).isInitOnlyMode();
      assert.ok(!isInitOnly, 'Should NOT be in init-only mode after /init');
    });

    /**
     * After /init, previously blocked commands should work
     */
    it('should allow /status after /init succeeds', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      // /status should fail initially
      const beforeInit = await repl.processCommand('/status');
      assert.ok(!beforeInit.success, '/status should fail before /init');

      // Execute /init
      await repl.processCommand('/init');

      // /status should work now
      const afterInit = await repl.processCommand('/status');
      assert.ok(afterInit.success, '/status should succeed after /init');
    });

    /**
     * After /init, /model should work
     */
    it('should allow /model after /init succeeds', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      // Execute /init
      await repl.processCommand('/init');

      // /model should work now (even without args, it shows current model)
      const result = await repl.processCommand('/model');
      assert.ok(result.success, '/model should succeed after /init');
    });
  });

  describe('Error Code Format', () => {
    /**
     * Blocked commands in init-only mode should use specific error code
     */
    it('should use E3xx error code for init-only mode blocks', async () => {
      const repl = new REPLInterface({ projectMode: 'fixed', projectRoot: tempDir });

      const result = await repl.processCommand('/start');

      assert.ok(result.error?.code, 'Should have error code');
      // E3xx series for init-only mode errors
      assert.ok(result.error?.code.startsWith('E3'),
        `Error code should be E3xx series, got ${result.error?.code}`);
    });
  });
});
