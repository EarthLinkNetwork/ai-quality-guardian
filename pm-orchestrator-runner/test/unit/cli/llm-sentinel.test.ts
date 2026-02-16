/**
 * LLM Sentinel CLI Tests
 *
 * Verifies CLI output contains required fields for fail-closed guarantee.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import { execSync } from 'child_process';
import * as path from 'path';

describe('LLM Sentinel CLI', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original values
    originalEnv.LLM_TEST_MODE = process.env.LLM_TEST_MODE;
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    // Restore original values
    if (originalEnv.LLM_TEST_MODE !== undefined) {
      process.env.LLM_TEST_MODE = originalEnv.LLM_TEST_MODE;
    }
    if (originalEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    }
    if (originalEnv.ANTHROPIC_API_KEY !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
    }
  });

  describe('Gate CLOSED output (Fail-Closed guarantee)', () => {
    it('should output VERDICT: INCOMPLETE and REAL_CALLS_MADE: false when gate is closed', function () {
      this.timeout(5000);
      const cliPath = path.join(__dirname, '../../../src/cli/llm-sentinel.ts');

      // Run CLI with gate closed (no LLM_TEST_MODE, no API key)
      const output = execSync(
        `unset LLM_TEST_MODE && unset OPENAI_API_KEY && npx ts-node ${cliPath}`,
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            LLM_TEST_MODE: undefined,
            OPENAI_API_KEY: undefined,
            ANTHROPIC_API_KEY: undefined,
          },
          shell: '/bin/bash',
        }
      );

      // Verify required fields for fail-closed
      assert.ok(
        output.includes('Gate: CLOSED'),
        'Output must include "Gate: CLOSED"'
      );
      assert.ok(
        output.includes('VERDICT: INCOMPLETE'),
        'Real LLM verdict must be INCOMPLETE when gate is closed'
      );
      assert.ok(
        output.includes('REAL_CALLS_MADE: false'),
        'REAL_CALLS_MADE must be false when gate is closed'
      );
      assert.ok(
        output.includes('EVIDENCE_COUNT:'),
        'Output must include EVIDENCE_COUNT'
      );

      // Verify NO false COMPLETE for Real LLM
      // REPL can be COMPLETE, but Real LLM must not be
      const realLlmSection = output.split('[Real LLM Mediation]')[1];
      assert.ok(realLlmSection, 'Output must include [Real LLM Mediation] section');
      assert.ok(
        realLlmSection.includes('VERDICT: INCOMPLETE'),
        'Real LLM section must show VERDICT: INCOMPLETE'
      );
    });
  });
});
