/**
 * Tests for REPLInterface
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { REPLInterface } from '../../../src/repl/repl-interface';

describe('REPLInterface', () => {
  let repl: REPLInterface;

  beforeEach(() => {
    repl = new REPLInterface({ projectPath: '/tmp' });
  });

  /**
   * Spec compliance tests (10_REPL_UX.md L66)
   * Unknown commands must return ERROR status (fail-closed principle)
   */
  describe('Spec Compliance: Unknown command fail-closed (10_REPL_UX.md L66)', () => {
    it('should return ERROR for unknown command', async () => {
      const result = await repl.processCommand('/unknowncommand');

      // Per spec: unknown commands must return ERROR status
      assert.ok(!result.success, 'Unknown command should return success: false');
    });

    it('should include error code for unknown command', async () => {
      const result = await repl.processCommand('/foobar');

      // Per spec: must include error code (E2xx)
      assert.ok(result.error, 'Result should include error object');
      assert.ok(result.error?.code, 'Error should include code');
      assert.ok(result.error?.code.startsWith('E2'), 'Error code should be E2xx');
    });

    it('should include error message mentioning the unknown command', async () => {
      const result = await repl.processCommand('/unknowncmd');

      assert.ok(result.error?.message, 'Error should include message');
      assert.ok(
        result.error?.message.includes('unknowncmd') || result.error?.message.includes('Unknown'),
        'Error message should mention the unknown command or be descriptive'
      );
    });

    it('should return SUCCESS for known commands', async () => {
      // /help is a valid command that should return success
      const result = await repl.processCommand('/help');

      assert.ok(result.success, '/help should return success: true');
    });
  });
});
