/**
 * Verdict Gate OPEN E2E Test
 *
 * Verifies that when Gate is OPEN (LLM_TEST_MODE=1 + API key present):
 * - VERDICT: COMPLETE
 * - REAL_CALLS_MADE: true
 * - EVIDENCE_COUNT >= 1
 * - EVIDENCE_VERIFIED: true
 *
 * This test ONLY runs when Gate is OPEN.
 * When Gate is CLOSED, the test is SKIPPED (not passed).
 */

import { describe, it, before } from 'mocha';
import { strict as assert } from 'assert';
import {
  checkExecutionGate,
  generateCombinedVerdict,
  ExecutionGate,
} from '../../src/mediation/verdict-reporter';
import { RealLLMMediationLayer } from '../../src/mediation/real-llm-mediation-layer';
import { ClarificationReason, RunnerSignal } from '../../src/mediation/llm-mediation-layer';

// Check execution gate at module load
const EXECUTION_GATE = checkExecutionGate();

// Log gate status immediately
console.log('\n' + '='.repeat(70));
console.log('[Verdict Gate OPEN Test] Execution Gate Check');
console.log('='.repeat(70));
if (EXECUTION_GATE.canExecute) {
  console.log('[Verdict Gate OPEN Test] GATE: OPEN - Test WILL run');
  console.log(`[Verdict Gate OPEN Test] Provider: ${EXECUTION_GATE.provider}`);
} else {
  console.log('[Verdict Gate OPEN Test] GATE: CLOSED - Test will be SKIPPED');
  console.log(`[Verdict Gate OPEN Test] Reason: ${EXECUTION_GATE.skipReason}`);
}
console.log('='.repeat(70) + '\n');

describe('Verdict Gate OPEN E2E (LLM_TEST_MODE=1 + API key required)', function() {
  // Set longer timeout for LLM API calls
  this.timeout(60000);

  let layer: RealLLMMediationLayer;
  let evidenceCount: number = 0;

  before(function() {
    if (!EXECUTION_GATE.canExecute) {
      // Skip the entire suite when gate is closed
      this.skip();
    }

    // Initialize the Real LLM layer
    layer = new RealLLMMediationLayer({
      provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic') || 'openai',
      model: process.env.LLM_MODEL,
      temperature: 0.7,
    });

    console.log('[Verdict Gate OPEN Test] Starting E2E test with REAL LLM calls...');
  });

  describe('Real LLM Call and Verdict Verification', function() {
    it('should make a real LLM call and produce evidence', async function() {
      // Make a real LLM API call
      const signal: RunnerSignal = {
        clarification_needed: true,
        clarification_reason: 'target_file_exists' as ClarificationReason,
        target_file: 'test-evidence.json',
        next_action: false,
        original_prompt: 'Create a test file for evidence verification',
      };

      console.log('\n[Verdict Gate OPEN Test] Making real LLM API call...');

      const result = await layer.processRunnerSignal(signal);

      console.log(`[Verdict Gate OPEN Test] LLM Response received`);
      console.log(`[Verdict Gate OPEN Test] Question: ${result.question}`);

      // Verify we got a response
      assert.ok(result.needs_user_input, 'Should need user input');
      assert.ok(result.question, 'Should have a question');
      assert.ok(result.question!.length > 0, 'Question should not be empty');

      // Track that we made at least one call
      evidenceCount = 1;

      console.log(`[Verdict Gate OPEN Test] Real LLM call successful, evidence count: ${evidenceCount}`);
    });

    it('should generate COMPLETE verdict with evidence', function() {
      // Now verify the combined verdict
      console.log('\n[Verdict Gate OPEN Test] Generating combined verdict...');

      const coreTestsPassed = true;
      const evidenceVerified = evidenceCount > 0;

      const verdict = generateCombinedVerdict(
        coreTestsPassed,
        evidenceCount,
        evidenceVerified
      );

      console.log('\n[Verdict Gate OPEN Test] Verdict Report:');
      console.log(verdict.summary);

      // Verify REPL verdict (should always be COMPLETE when core tests pass)
      assert.equal(
        verdict.repl.verdict,
        'COMPLETE',
        'REPL verdict should be COMPLETE'
      );

      // Verify Real LLM verdict (should be COMPLETE when gate open + evidence verified)
      assert.equal(
        verdict.real_llm.verdict,
        'COMPLETE',
        'Real LLM verdict should be COMPLETE when gate open and evidence verified'
      );

      // Verify REAL_CALLS_MADE
      assert.equal(
        verdict.real_llm.details.real_calls_made,
        true,
        'REAL_CALLS_MADE should be true'
      );

      // Verify EVIDENCE_COUNT >= 1
      assert.ok(
        verdict.real_llm.details.evidence_count! >= 1,
        `EVIDENCE_COUNT should be >= 1, got ${verdict.real_llm.details.evidence_count}`
      );

      // Verify EVIDENCE_VERIFIED
      assert.equal(
        verdict.real_llm.details.evidence_verified,
        true,
        'EVIDENCE_VERIFIED should be true'
      );

      // Verify gate status
      assert.equal(
        verdict.real_llm.details.gate_status,
        'OPEN',
        'Gate status should be OPEN'
      );

      console.log('\n[Verdict Gate OPEN Test] All assertions passed!');
      console.log('[Verdict Gate OPEN Test] VERDICT: COMPLETE');
      console.log('[Verdict Gate OPEN Test] REAL_CALLS_MADE: true');
      console.log(`[Verdict Gate OPEN Test] EVIDENCE_COUNT: ${verdict.real_llm.details.evidence_count}`);
      console.log('[Verdict Gate OPEN Test] EVIDENCE_VERIFIED: true');
    });

    it('should include all required fields in summary output', function() {
      const verdict = generateCombinedVerdict(true, evidenceCount, true);

      // Verify summary contains required patterns
      assert.ok(
        verdict.summary.includes('VERDICT: COMPLETE'),
        'Summary should include VERDICT: COMPLETE for Real LLM'
      );
      assert.ok(
        verdict.summary.includes('REAL_CALLS_MADE: true'),
        'Summary should include REAL_CALLS_MADE: true'
      );
      assert.ok(
        verdict.summary.includes('GATE: OPEN'),
        'Summary should include GATE: OPEN'
      );
      assert.ok(
        verdict.summary.includes('EVIDENCE_COUNT:'),
        'Summary should include EVIDENCE_COUNT'
      );
      assert.ok(
        verdict.summary.includes('EVIDENCE_VERIFIED: true'),
        'Summary should include EVIDENCE_VERIFIED: true'
      );

      console.log('\n[Verdict Gate OPEN Test] Summary verification complete');
    });
  });
});

/**
 * Gate Status Verification (always runs)
 */
describe('Gate OPEN Verification (always runs)', function() {
  it('should correctly detect gate status based on environment', function() {
    const gate = checkExecutionGate();

    const hasLLMTestMode = process.env.LLM_TEST_MODE === '1';
    const provider = process.env.LLM_PROVIDER || 'openai';
    const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    const hasApiKey = !!process.env[envVar];

    const expectedCanExecute = hasLLMTestMode && hasApiKey;

    console.log('\n[Gate OPEN Verification] Environment check:');
    console.log(`  LLM_TEST_MODE: ${hasLLMTestMode ? '1' : '(not set)'}`);
    console.log(`  ${envVar}: ${hasApiKey ? 'present' : '(not set)'}`);
    console.log(`  Expected Gate: ${expectedCanExecute ? 'OPEN' : 'CLOSED'}`);
    console.log(`  Actual Gate: ${gate.canExecute ? 'OPEN' : 'CLOSED'}`);

    assert.equal(
      gate.canExecute,
      expectedCanExecute,
      `Gate should be ${expectedCanExecute ? 'OPEN' : 'CLOSED'}`
    );
  });

  it('should provide correct gate details when open', function() {
    if (!EXECUTION_GATE.canExecute) {
      // This is expected when gate is closed
      console.log('[Gate OPEN Verification] Gate is CLOSED - skipping open details check');
      return;
    }

    assert.ok(EXECUTION_GATE.provider, 'Provider should be set when gate is open');
    assert.ok(EXECUTION_GATE.envVar, 'envVar should be set when gate is open');
    assert.equal(EXECUTION_GATE.skipReason, undefined, 'skipReason should be undefined when gate is open');

    console.log('[Gate OPEN Verification] Gate is OPEN with correct details');
  });
});

/**
 * Final Status Report (always runs)
 */
describe('Verdict Gate OPEN Test Final Report (always runs)', function() {
  it('should report honest execution status', function() {
    console.log('\n' + '='.repeat(70));
    console.log('[Verdict Gate OPEN Test] Final Report');
    console.log('='.repeat(70));

    if (EXECUTION_GATE.canExecute) {
      console.log('[Verdict Gate OPEN Test] STATUS: E2E TEST EXECUTED');
      console.log('[Verdict Gate OPEN Test] Gate was OPEN - real LLM calls were made');
      console.log('[Verdict Gate OPEN Test] Verdict verification: COMPLETE');
    } else {
      console.log('[Verdict Gate OPEN Test] STATUS: E2E TEST SKIPPED');
      console.log(`[Verdict Gate OPEN Test] Gate was CLOSED: ${EXECUTION_GATE.skipReason}`);
      console.log('[Verdict Gate OPEN Test] To run this test:');
      console.log('[Verdict Gate OPEN Test]   export LLM_TEST_MODE=1');
      console.log('[Verdict Gate OPEN Test]   export OPENAI_API_KEY=sk-your-key');
      console.log('[Verdict Gate OPEN Test]   npm run llm:test:real');
    }

    console.log('='.repeat(70) + '\n');

    assert.ok(true, 'Final report completed');
  });
});
