/**
 * Claude Code CLI Availability Helper
 *
 * Provides robust detection of Claude Code CLI availability for tests.
 * Tests should use this helper to skip when Claude Code is not installed.
 */

import { spawnSync } from 'child_process';

/**
 * Check if Claude Code CLI is available and functional.
 *
 * Returns true only if:
 * 1. `claude` binary exists on PATH
 * 2. Running `claude --version` exits with code 0 within timeout
 *
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns true if Claude Code CLI is available and functional
 */
export function isClaudeAvailable(timeoutMs: number = 5000): boolean {
  try {
    // First check if claude binary exists on PATH
    const whichResult = spawnSync('command', ['-v', 'claude'], {
      shell: true,
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (whichResult.status !== 0) {
      return false;
    }

    // Then verify it can run with --version
    const versionResult = spawnSync('claude', ['--version'], {
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return versionResult.status === 0;
  } catch {
    return false;
  }
}

/**
 * Synchronous helper to conditionally skip a test suite or test case.
 *
 * Usage in Mocha:
 * ```typescript
 * import { skipIfClaudeUnavailable } from '../helpers/claude-availability';
 *
 * describe('Integration tests', function() {
 *   before(function() {
 *     skipIfClaudeUnavailable(this);
 *   });
 *
 *   it('should work with Claude', async () => { ... });
 * });
 * ```
 *
 * @param context - Mocha context (`this` in before/beforeEach/it)
 */
export function skipIfClaudeUnavailable(context: Mocha.Context): void {
  if (!isClaudeAvailable()) {
    context.skip();
  }
}
