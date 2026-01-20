/**
 * Fail-Closed Runner Integration Tests
 *
 * Tests for fail-closed behavior:
 * 1. provider=openai + missing key = ERROR (no fallback)
 * 2. COMPLETE requires evidence
 * 3. Double Execution Gate enforcement
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import the module statically at the top level
import {
  FailClosedRunner,
  createFailClosedRunner,
  validateFailClosedRequirements,
} from '../../../src/mediation/fail-closed-runner';

describe('FailClosedRunner - Integration Tests', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fail-closed-runner-test-'));
    // Create .claude/evidence directory
    fs.mkdirSync(path.join(tempDir, '.claude', 'evidence'), { recursive: true });
    // Save original env
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Restore original env
    process.env = originalEnv;
  });

  describe('Fail-Closed API Key Requirement', () => {
    it('should fail when API key is missing (no claude-code fallback)', () => {
      // Remove API keys
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      // Runner should not be ready
      assert.equal(runner.isReady(), false);

      // Should have init error
      const error = runner.getInitError();
      assert.ok(error);
      assert.ok(error.message.includes('API key'));
    });

    it('should succeed when API key is configured', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      assert.equal(runner.isReady(), true);
      assert.equal(runner.getInitError(), null);
    });
  });

  describe('Double Execution Gate', () => {
    it('should fail gate check when not initialized', () => {
      delete process.env.OPENAI_API_KEY;

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      const gateResult = runner.checkExecutionGate();
      assert.equal(gateResult.can_execute, false);
      assert.equal(gateResult.gate1_api_key, 'FAIL');
    });

    it('should pass both gates when properly configured', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      const gateResult = runner.checkExecutionGate();
      assert.equal(gateResult.can_execute, true);
      assert.equal(gateResult.gate1_api_key, 'PASS');
      assert.equal(gateResult.gate2_evidence_ready, 'PASS');
    });
  });

  describe('Status Determination', () => {
    it('should not assert COMPLETE without evidence', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      const status = runner.determineStatus();
      assert.equal(status.canAssertComplete, false);
      assert.ok(status.failureReason);
    });

    it('should assert COMPLETE with successful evidence', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      // Manually add evidence
      const evidenceManager = runner.getEvidenceManager();
      assert.ok(evidenceManager, 'Evidence manager should not be null');
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

      const status = runner.determineStatus();
      assert.equal(status.canAssertComplete, true);
      assert.equal(status.failureReason, undefined);
    });

    it('should not assert COMPLETE with only failed evidence', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      // Manually add failed evidence
      const evidenceManager = runner.getEvidenceManager();
      assert.ok(evidenceManager, 'Evidence manager should not be null');
      evidenceManager.recordEvidence({
        call_id: 'test-fail',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 50,
        success: false,
        error: 'Test error',
      });

      const status = runner.determineStatus();
      assert.equal(status.canAssertComplete, false);
    });
  });

  describe('Quick canAssertComplete Check', () => {
    it('should return false without evidence', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      assert.equal(runner.canAssertComplete(), false);
    });

    it('should return true with successful evidence', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      // Add successful evidence
      const evidenceManager = runner.getEvidenceManager();
      assert.ok(evidenceManager, 'Evidence manager should not be null');
      evidenceManager.recordEvidence({
        call_id: 'quick-check-success',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      });

      assert.equal(runner.canAssertComplete(), true);
    });
  });

  describe('Report Generation', () => {
    it('should generate report', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = new FailClosedRunner({
        projectPath: tempDir,
        provider: 'openai',
      });

      const report = runner.generateReport();
      assert.ok(report.includes('LLM Sentinel Verification Report'));
    });
  });

  describe('Convenience Functions', () => {
    it('createFailClosedRunner should create valid runner', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const runner = createFailClosedRunner(tempDir, 'openai');
      assert.ok(runner.isReady());
    });

    it('validateFailClosedRequirements should validate requirements', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';

      const result = validateFailClosedRequirements(tempDir, 'openai');
      assert.equal(result.valid, true);
    });

    it('validateFailClosedRequirements should fail without API key', () => {
      delete process.env.OPENAI_API_KEY;

      const result = validateFailClosedRequirements(tempDir, 'openai');
      assert.equal(result.valid, false);
      assert.ok(result.error);
    });
  });
});
