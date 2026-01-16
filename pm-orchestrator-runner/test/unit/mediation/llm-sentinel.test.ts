/**
 * LLM Sentinel Tests
 *
 * Tests for file-based evidence verification:
 * 1. No evidence = cannot assert COMPLETE (fail-closed)
 * 2. Evidence integrity verification
 * 3. At least one success required
 * 4. Full verification with integrity checks
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LLMSentinel, verifyLLMEvidence, createSentinel } from '../../../src/mediation/llm-sentinel';
import { LLMEvidenceManager, LLMEvidence } from '../../../src/mediation/llm-evidence-manager';

describe('LLMSentinel - File Evidence Verification', () => {
  let tempDir: string;
  let evidenceManager: LLMEvidenceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-sentinel-test-'));
    evidenceManager = new LLMEvidenceManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Fail-Closed Behavior', () => {
    it('should fail when no evidence exists', () => {
      const sentinel = new LLMSentinel(tempDir);
      const result = sentinel.verify();

      assert.equal(result.passed, false);
      assert.equal(result.can_assert_complete, false);
      assert.equal(result.evidence_count, 0);
      assert.ok(result.failure_reason);
      assert.ok(result.failure_reason.includes('No LLM evidence found'));
    });

    it('should fail when only failed calls exist', () => {
      // Record a failed call
      evidenceManager.recordEvidence({
        call_id: 'fail-only',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: false,
        error: 'Test error',
      });

      const sentinel = LLMSentinel.fromEvidenceManager(evidenceManager);
      const result = sentinel.verify();

      assert.equal(result.passed, false);
      assert.equal(result.can_assert_complete, false);
      assert.equal(result.successful_calls, 0);
      assert.equal(result.failed_calls, 1);
      assert.ok(result.failure_reason);
      assert.ok(result.failure_reason.includes('No successful LLM calls'));
    });

    it('should pass when successful call with valid evidence exists', () => {
      // Record a successful call
      evidenceManager.recordEvidence({
        call_id: 'success-call',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      const sentinel = LLMSentinel.fromEvidenceManager(evidenceManager);
      const result = sentinel.verify();

      assert.equal(result.passed, true);
      assert.equal(result.can_assert_complete, true);
      assert.equal(result.successful_calls, 1);
      assert.equal(result.failure_reason, undefined);
    });
  });

  describe('Integrity Verification', () => {
    it('should pass integrity check for valid evidence', () => {
      evidenceManager.recordEvidence({
        call_id: 'valid-evidence',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      const sentinel = LLMSentinel.fromEvidenceManager(evidenceManager);
      const result = sentinel.verify();

      assert.equal(result.integrity_passed, true);
      assert.equal(result.integrity_checks.length, 1);
      assert.equal(result.integrity_checks[0].passed, true);
      assert.equal(result.integrity_checks[0].file_exists, true);
      assert.equal(result.integrity_checks[0].hash_valid, true);
    });

    it('should detect tampered evidence file', () => {
      // Record valid evidence
      const evidencePath = evidenceManager.recordEvidence({
        call_id: 'tampered',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      // Tamper with the file
      const content = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
      content.evidence.success = false; // Tamper
      fs.writeFileSync(evidencePath, JSON.stringify(content));

      const sentinel = LLMSentinel.fromEvidenceManager(evidenceManager);
      const result = sentinel.verify();

      assert.equal(result.integrity_passed, false);
      assert.equal(result.can_assert_complete, false);
      assert.ok(result.failure_reason);
      assert.ok(result.failure_reason.includes('integrity check failed'));
    });
  });

  describe('Quick Check vs Full Verification', () => {
    it('canAssertComplete should be lightweight check', () => {
      evidenceManager.recordEvidence({
        call_id: 'quick-check',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      const sentinel = LLMSentinel.fromEvidenceManager(evidenceManager);

      // Quick check
      assert.equal(sentinel.canAssertComplete(), true);

      // Full verification
      const result = sentinel.fullVerification();
      assert.equal(result.passed, true);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      // Record mixed results
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
        call_id: 'success-2',
        provider: 'anthropic',
        model: 'claude-3-haiku',
        request_hash: 'sha256:c',
        response_hash: 'sha256:d',
        timestamp: new Date().toISOString(),
        duration_ms: 200,
        success: true,
      });
      evidenceManager.recordEvidence({
        call_id: 'fail-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:e',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 50,
        success: false,
        error: 'Rate limited',
      });

      const sentinel = LLMSentinel.fromEvidenceManager(evidenceManager);
      const stats = sentinel.getStats();

      assert.equal(stats.total_calls, 3);
      assert.equal(stats.successful_calls, 2);
      assert.equal(stats.failed_calls, 1);
    });
  });

  describe('Report Generation', () => {
    it('should generate readable report', () => {
      evidenceManager.recordEvidence({
        call_id: 'report-test',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      const sentinel = LLMSentinel.fromEvidenceManager(evidenceManager);
      const report = sentinel.generateReport();

      assert.ok(report.includes('LLM Sentinel Verification Report'));
      assert.ok(report.includes('Evidence Count: 1'));
      assert.ok(report.includes('Successful Calls: 1'));
      assert.ok(report.includes('Overall Result: PASS'));
    });

    it('should include failure reason in report', () => {
      const sentinel = new LLMSentinel(tempDir);
      const report = sentinel.generateReport();

      assert.ok(report.includes('Overall Result: FAIL'));
      assert.ok(report.includes('Failure Reason:'));
    });
  });

  describe('Convenience Functions', () => {
    it('createSentinel should create valid sentinel', () => {
      evidenceManager.recordEvidence({
        call_id: 'convenience-test',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      const sentinel = createSentinel(tempDir);
      assert.ok(sentinel.canAssertComplete());
    });

    it('verifyLLMEvidence should return verification result', () => {
      evidenceManager.recordEvidence({
        call_id: 'verify-func-test',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      const result = verifyLLMEvidence(tempDir);
      assert.equal(result.passed, true);
      assert.equal(result.can_assert_complete, true);
    });
  });
});
