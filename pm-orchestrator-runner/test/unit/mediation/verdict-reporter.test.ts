/**
 * Verdict Reporter Tests
 *
 * Verifies:
 * 1. REPL verdict is independent of Real LLM (COMPLETE when core tests pass)
 * 2. Real LLM verdict requires GATE OPEN + evidence
 * 3. Real LLM is INCOMPLETE (not COMPLETE) when gate is closed (Fail-Closed)
 * 4. REAL_CALLS_MADE is always reported
 * 5. SKIP reason is explicit when gate is closed
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  checkExecutionGate,
  generateREPLVerdict,
  generateRealLLMVerdict,
  generateCombinedVerdict,
  formatVerdictSummary,
  VerdictResult,
  ExecutionGate,
} from '../../../src/mediation/verdict-reporter';

describe('VerdictReporter', () => {
  // Save original env vars
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original values
    originalEnv.LLM_TEST_MODE = process.env.LLM_TEST_MODE;
    originalEnv.LLM_PROVIDER = process.env.LLM_PROVIDER;
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    // Restore original values
    if (originalEnv.LLM_TEST_MODE === undefined) {
      delete process.env.LLM_TEST_MODE;
    } else {
      process.env.LLM_TEST_MODE = originalEnv.LLM_TEST_MODE;
    }

    if (originalEnv.LLM_PROVIDER === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = originalEnv.LLM_PROVIDER;
    }

    if (originalEnv.OPENAI_API_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    }

    if (originalEnv.ANTHROPIC_API_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
    }
  });

  describe('checkExecutionGate', () => {
    it('should return CLOSED when LLM_TEST_MODE is not set', () => {
      delete process.env.LLM_TEST_MODE;
      delete process.env.OPENAI_API_KEY;

      const gate = checkExecutionGate();

      assert.equal(gate.canExecute, false);
      assert.ok(gate.skipReason?.includes('LLM_TEST_MODE'));
    });

    it('should return CLOSED when API key is not set', () => {
      process.env.LLM_TEST_MODE = '1';
      delete process.env.OPENAI_API_KEY;
      delete process.env.LLM_PROVIDER;

      const gate = checkExecutionGate();

      assert.equal(gate.canExecute, false);
      assert.ok(gate.skipReason?.includes('OPENAI_API_KEY'));
    });

    it('should return OPEN when both conditions are met', () => {
      process.env.LLM_TEST_MODE = '1';
      process.env.OPENAI_API_KEY = 'sk-test-key';
      delete process.env.LLM_PROVIDER;

      const gate = checkExecutionGate();

      assert.equal(gate.canExecute, true);
      assert.equal(gate.provider, 'openai');
      assert.equal(gate.envVar, 'OPENAI_API_KEY');
    });
  });

  describe('generateREPLVerdict', () => {
    it('should return COMPLETE when core tests pass', () => {
      const verdict = generateREPLVerdict(true);

      assert.equal(verdict.category, 'REPL');
      assert.equal(verdict.verdict, 'COMPLETE');
      assert.equal(verdict.details.real_calls_made, false);
    });

    it('should return INCOMPLETE when core tests fail', () => {
      const verdict = generateREPLVerdict(false);

      assert.equal(verdict.category, 'REPL');
      assert.equal(verdict.verdict, 'INCOMPLETE');
    });
  });

  describe('generateRealLLMVerdict', () => {
    it('should return INCOMPLETE when gate is closed (Fail-Closed)', () => {
      const gate: ExecutionGate = {
        canExecute: false,
        skipReason: 'LLM_TEST_MODE is not set to 1',
      };

      const verdict = generateRealLLMVerdict(gate, 0, false);

      assert.equal(verdict.category, 'REAL_LLM');
      assert.equal(verdict.verdict, 'INCOMPLETE'); // Fail-Closed: no execution = INCOMPLETE
      assert.notEqual(verdict.verdict, 'COMPLETE'); // Critical: NOT COMPLETE
      assert.equal(verdict.details.gate_status, 'CLOSED');
      assert.equal(verdict.details.real_calls_made, false);
      assert.ok(verdict.details.skip_reason);
    });

    it('should return INCOMPLETE when gate is open but no evidence', () => {
      const gate: ExecutionGate = {
        canExecute: true,
        provider: 'openai',
        envVar: 'OPENAI_API_KEY',
      };

      const verdict = generateRealLLMVerdict(gate, 0, false);

      assert.equal(verdict.verdict, 'INCOMPLETE');
      assert.equal(verdict.details.gate_status, 'OPEN');
      assert.equal(verdict.details.real_calls_made, false);
      assert.equal(verdict.details.evidence_count, 0);
    });

    it('should return INCOMPLETE when evidence exists but not verified', () => {
      const gate: ExecutionGate = {
        canExecute: true,
        provider: 'openai',
        envVar: 'OPENAI_API_KEY',
      };

      const verdict = generateRealLLMVerdict(gate, 5, false);

      assert.equal(verdict.verdict, 'INCOMPLETE');
      assert.equal(verdict.details.real_calls_made, true);
      assert.equal(verdict.details.evidence_count, 5);
      assert.equal(verdict.details.evidence_verified, false);
    });

    it('should return COMPLETE only when gate open + evidence verified', () => {
      const gate: ExecutionGate = {
        canExecute: true,
        provider: 'openai',
        envVar: 'OPENAI_API_KEY',
      };

      const verdict = generateRealLLMVerdict(gate, 5, true);

      assert.equal(verdict.verdict, 'COMPLETE');
      assert.equal(verdict.details.gate_status, 'OPEN');
      assert.equal(verdict.details.real_calls_made, true);
      assert.equal(verdict.details.evidence_count, 5);
      assert.equal(verdict.details.evidence_verified, true);
    });
  });

  describe('generateCombinedVerdict', () => {
    it('should show REPL: COMPLETE / Real LLM: INCOMPLETE when API key missing', () => {
      delete process.env.LLM_TEST_MODE;
      delete process.env.OPENAI_API_KEY;

      const verdict = generateCombinedVerdict(true, 0, false);

      assert.equal(verdict.repl.verdict, 'COMPLETE');
      assert.equal(verdict.real_llm.verdict, 'INCOMPLETE'); // Fail-Closed
      assert.equal(verdict.real_llm.details.real_calls_made, false);
    });

    it('should show both COMPLETE when all conditions met', () => {
      process.env.LLM_TEST_MODE = '1';
      process.env.OPENAI_API_KEY = 'sk-test-key';

      const verdict = generateCombinedVerdict(true, 5, true);

      assert.equal(verdict.repl.verdict, 'COMPLETE');
      assert.equal(verdict.real_llm.verdict, 'COMPLETE');
      assert.equal(verdict.real_llm.details.real_calls_made, true);
    });
  });

  describe('formatVerdictSummary', () => {
    it('should include REAL_CALLS_MADE: false when gate closed', () => {
      const repl: VerdictResult = {
        category: 'REPL',
        verdict: 'COMPLETE',
        reason: 'Core tests passed',
        details: { real_calls_made: false },
      };

      const real_llm: VerdictResult = {
        category: 'REAL_LLM',
        verdict: 'INCOMPLETE',
        reason: 'Gate closed',
        details: {
          gate_status: 'CLOSED',
          real_calls_made: false,
          skip_reason: 'LLM_TEST_MODE not set',
        },
      };

      const summary = formatVerdictSummary(repl, real_llm);

      assert.ok(summary.includes('REAL_CALLS_MADE: false'));
      assert.ok(summary.includes('INCOMPLETE'));
      assert.ok(summary.includes('GATE: CLOSED'));
      assert.ok(summary.includes('SKIP_REASON:')); // SKIP_REASON is still shown
    });

    it('should include REAL_CALLS_MADE: true when gate open and calls made', () => {
      const repl: VerdictResult = {
        category: 'REPL',
        verdict: 'COMPLETE',
        reason: 'Core tests passed',
        details: { real_calls_made: false },
      };

      const real_llm: VerdictResult = {
        category: 'REAL_LLM',
        verdict: 'COMPLETE',
        reason: 'Evidence verified',
        details: {
          gate_status: 'OPEN',
          real_calls_made: true,
          evidence_count: 5,
          evidence_verified: true,
        },
      };

      const summary = formatVerdictSummary(repl, real_llm);

      assert.ok(summary.includes('REAL_CALLS_MADE: true'));
      assert.ok(summary.includes('GATE: OPEN'));
      assert.ok(summary.includes('EVIDENCE_COUNT: 5'));
    });
  });
});

describe('Verdict API Key Missing Behavior (Critical)', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.LLM_TEST_MODE = process.env.LLM_TEST_MODE;
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    // Ensure no API key is set
    delete process.env.LLM_TEST_MODE;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    // Restore
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

  it('should NEVER return Real LLM COMPLETE without API key', () => {
    const verdict = generateCombinedVerdict(true, 0, false);

    // This is the critical assertion
    assert.notEqual(
      verdict.real_llm.verdict,
      'COMPLETE',
      'Real LLM verdict must NOT be COMPLETE without API key'
    );
  });

  it('should explicitly show INCOMPLETE with reason (Fail-Closed)', () => {
    const verdict = generateCombinedVerdict(true, 0, false);

    assert.equal(verdict.real_llm.verdict, 'INCOMPLETE');
    assert.ok(verdict.real_llm.details.skip_reason);
    assert.ok(verdict.real_llm.details.skip_reason!.length > 0);
  });

  it('should show REAL_CALLS_MADE: false', () => {
    const verdict = generateCombinedVerdict(true, 0, false);

    assert.equal(verdict.real_llm.details.real_calls_made, false);
  });

  it('should format summary with all required fields', () => {
    const verdict = generateCombinedVerdict(true, 0, false);

    // Summary must contain these exact patterns
    assert.ok(verdict.summary.includes('REAL_CALLS_MADE: false'), 'Must show REAL_CALLS_MADE: false');
    assert.ok(verdict.summary.includes('INCOMPLETE'), 'Must show INCOMPLETE (Fail-Closed)');
    assert.ok(verdict.summary.includes('GATE: CLOSED'), 'Must show GATE: CLOSED');
    assert.ok(verdict.summary.includes('SKIP_REASON:'), 'Must show SKIP_REASON');
  });
});
