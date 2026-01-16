/**
 * LLM Client with Evidence Tests
 *
 * Tests for Double Execution Gate and automatic evidence recording:
 * 1. Gate 1: API key validation (fail-closed)
 * 2. Gate 2: Evidence directory ready (fail-closed)
 * 3. Automatic evidence recording on every call
 * 4. canAssertComplete only returns true with successful evidence
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LLMClientWithEvidence - Double Execution Gate', () => {
  let tempDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-client-evidence-test-'));
    // Save original env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Restore original env
    process.env = originalEnv;
  });

  describe('Gate 1: API Key Validation', () => {
    it('should fail-closed when API key is missing', () => {
      // Remove API key
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // Import dynamically to test fail-closed behavior
      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');

      assert.throws(
        () => new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' }),
        (err: Error) => {
          return err.name === 'APIKeyMissingError' ||
            err.message.includes('API key not found');
        }
      );
    });

    it('should pass Gate 1 when API key is configured', () => {
      // Set API key
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');
      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });

      const gateResult = client.checkExecutionGate();
      assert.equal(gateResult.gate1_api_key, 'PASS');
    });
  });

  describe('Gate 2: Evidence Directory', () => {
    it('should pass Gate 2 when evidence directory is ready', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');
      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });

      const gateResult = client.checkExecutionGate();
      assert.equal(gateResult.gate2_evidence_ready, 'PASS');
    });

    it('should create evidence subdirectory', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');
      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });

      const evidenceDir = client.getEvidenceManager().getEvidenceDir();
      assert.ok(fs.existsSync(evidenceDir));
    });
  });

  describe('Double Gate Check', () => {
    it('should pass both gates when properly configured', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');
      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });

      const gateResult = client.checkExecutionGate();
      assert.equal(gateResult.gate1_api_key, 'PASS');
      assert.equal(gateResult.gate2_evidence_ready, 'PASS');
      assert.equal(gateResult.can_execute, true);
      assert.equal(gateResult.failure_reason, undefined);
    });
  });

  describe('canAssertComplete - Fail-Closed', () => {
    it('should return false when no evidence exists', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');
      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });

      // No LLM calls made = no evidence = cannot assert COMPLETE
      assert.equal(client.canAssertComplete(), false);
    });

    it('should return false when only failed evidence exists', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');
      const { LLMEvidenceManager } = require('../../../src/mediation/llm-evidence-manager');

      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });

      // Manually record a failed evidence
      const evidenceManager = client.getEvidenceManager();
      evidenceManager.recordEvidence({
        call_id: 'test-fail',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: false,
        error: 'Test error',
      });

      // Only failed evidence = cannot assert COMPLETE
      assert.equal(client.canAssertComplete(), false);
    });

    it('should return true when successful evidence exists', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');

      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });

      // Manually record a successful evidence
      const evidenceManager = client.getEvidenceManager();
      evidenceManager.recordEvidence({
        call_id: 'test-success',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      // Successful evidence = can assert COMPLETE
      assert.equal(client.canAssertComplete(), true);
    });
  });

  describe('Evidence Management', () => {
    it('should list all evidence', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');

      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });
      const evidenceManager = client.getEvidenceManager();

      // Record multiple evidence
      evidenceManager.recordEvidence({
        call_id: 'call-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:a',
        response_hash: 'sha256:b',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });
      evidenceManager.recordEvidence({
        call_id: 'call-2',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:c',
        response_hash: 'sha256:d',
        timestamp: new Date().toISOString(),
        duration_ms: 200,
        success: true,
      });

      const allEvidence = client.listEvidence();
      assert.equal(allEvidence.length, 2);
    });

    it('should get evidence statistics', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');

      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });
      const evidenceManager = client.getEvidenceManager();

      // Record mixed evidence
      evidenceManager.recordEvidence({
        call_id: 'success-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:a',
        response_hash: 'sha256:b',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });
      evidenceManager.recordEvidence({
        call_id: 'fail-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:c',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 50,
        success: false,
        error: 'Test error',
      });

      const stats = client.getEvidenceStats();
      assert.equal(stats.total_calls, 2);
      assert.equal(stats.successful_calls, 1);
      assert.equal(stats.failed_calls, 1);
    });

    it('should verify evidence integrity', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const { LLMClientWithEvidence } = require('../../../src/mediation/llm-client-with-evidence');

      const client = new LLMClientWithEvidence({ evidenceDir: tempDir, provider: 'openai' });
      const evidenceManager = client.getEvidenceManager();

      evidenceManager.recordEvidence({
        call_id: 'verify-test',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      assert.ok(client.verifyEvidence('verify-test'));
    });
  });
});
