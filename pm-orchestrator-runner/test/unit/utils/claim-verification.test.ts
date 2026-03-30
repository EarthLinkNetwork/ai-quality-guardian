/**
 * Unit Tests for Claim Verification
 * Tests for verifyClaimsWithLlm in src/utils/question-detector.ts
 */

import * as assert from 'assert';
import { verifyClaimsWithLlm, ClaimVerificationResult } from '../../../src/utils/question-detector';

describe('Claim Verification', () => {
  describe('verifyClaimsWithLlm', () => {
    it('should return no claims for short output (< 200 chars)', async () => {
      const result = await verifyClaimsWithLlm('Done.', 'fix the bug');
      assert.strictEqual(result.hasUnverifiedClaims, false);
      assert.strictEqual(result.claims.length, 0);
    });

    it('should return no claims for empty output', async () => {
      const result = await verifyClaimsWithLlm('', 'explain the system');
      assert.strictEqual(result.hasUnverifiedClaims, false);
      assert.strictEqual(result.claims.length, 0);
    });

    it('should return no claims when no LLM provider is available', async () => {
      // Save and clear all API keys
      const originalOpenAI = process.env.OPENAI_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const result = await verifyClaimsWithLlm(
          'This is a longer output that discusses technical topics and might contain claims about how things work in the system. It needs to be over 200 characters to pass the length check so we keep typing more text here.',
          'explain the system'
        );
        assert.strictEqual(result.hasUnverifiedClaims, false);
        assert.deepStrictEqual(result.claims, []);
      } finally {
        // Restore keys
        if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
        if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
      }
    });

    it('should have correct ClaimVerificationResult interface shape', () => {
      const result: ClaimVerificationResult = {
        hasUnverifiedClaims: true,
        claims: [{ claim: 'test claim', reason: 'test reason' }],
      };
      assert.strictEqual(result.hasUnverifiedClaims, true);
      assert.strictEqual(result.claims.length, 1);
      assert.strictEqual(result.claims[0].claim, 'test claim');
      assert.strictEqual(result.claims[0].reason, 'test reason');
    });

    it('should handle exactly 200 char output (boundary - skipped)', async () => {
      // Exactly 200 chars should be short-circuited (output.length <= 200)
      const output = 'A'.repeat(200);
      const result = await verifyClaimsWithLlm(output, 'test');
      assert.strictEqual(result.hasUnverifiedClaims, false);
      assert.strictEqual(result.claims.length, 0);
    });

    it('should attempt LLM check for output > 200 chars (201 chars)', async () => {
      // 201 chars should NOT be short-circuited
      // Without a valid provider, it should still return gracefully
      const originalOpenAI = process.env.OPENAI_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const output = 'A'.repeat(201);
        const result = await verifyClaimsWithLlm(output, 'test');
        // Should return no claims (no provider available -> graceful fallback)
        assert.strictEqual(result.hasUnverifiedClaims, false);
        assert.strictEqual(result.claims.length, 0);
      } finally {
        if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
        if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
      }
    });

    it('should accept optional config parameter', async () => {
      // Verify the function signature accepts config without errors
      const result = await verifyClaimsWithLlm('short', 'test', { provider: 'openai', model: 'gpt-4o-mini' });
      assert.strictEqual(result.hasUnverifiedClaims, false);
    });
  });
});
