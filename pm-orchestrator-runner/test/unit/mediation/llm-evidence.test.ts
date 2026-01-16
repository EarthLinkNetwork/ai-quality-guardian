/**
 * LLM Evidence Tests
 *
 * Tests for fail-closed LLM evidence tracking:
 * 1. Evidence file is created for every real LLM API call
 * 2. No evidence file = LLM call did not happen (fail-closed)
 * 3. Evidence includes request/response hash for verification
 * 4. COMPLETE status requires evidence file to exist
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  LLMEvidenceManager,
  LLMEvidence,
  hashRequest,
  hashResponse,
} from '../../../src/mediation/llm-evidence-manager';

describe('LLMEvidenceManager', () => {
  let tempDir: string;
  let evidenceManager: LLMEvidenceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-evidence-test-'));
    evidenceManager = new LLMEvidenceManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Evidence Recording', () => {
    it('should create evidence file for LLM call', () => {
      const evidence: LLMEvidence = {
        call_id: 'call-001',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc123',
        response_hash: 'sha256:def456',
        timestamp: new Date().toISOString(),
        duration_ms: 1234,
        success: true,
      };

      const evidencePath = evidenceManager.recordEvidence(evidence);

      assert.ok(fs.existsSync(evidencePath));
      const saved = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
      assert.equal(saved.evidence.call_id, 'call-001');
      assert.equal(saved.evidence.provider, 'openai');
      assert.equal(saved.evidence.success, true);
    });

    it('should include request and response hashes', () => {
      const evidence: LLMEvidence = {
        call_id: 'call-002',
        provider: 'anthropic',
        model: 'claude-3-haiku',
        request_hash: 'sha256:req123',
        response_hash: 'sha256:resp456',
        timestamp: new Date().toISOString(),
        duration_ms: 500,
        success: true,
      };

      const evidencePath = evidenceManager.recordEvidence(evidence);
      const saved = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));

      assert.equal(saved.evidence.request_hash, 'sha256:req123');
      assert.equal(saved.evidence.response_hash, 'sha256:resp456');
    });

    it('should record failed LLM calls with error details', () => {
      const evidence: LLMEvidence = {
        call_id: 'call-003',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:req789',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: false,
        error: 'API key invalid',
      };

      const evidencePath = evidenceManager.recordEvidence(evidence);
      const saved = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));

      assert.equal(saved.evidence.success, false);
      assert.equal(saved.evidence.error, 'API key invalid');
      assert.equal(saved.evidence.response_hash, null);
    });
  });

  describe('Evidence Verification', () => {
    it('should verify evidence exists by call_id', () => {
      const evidence: LLMEvidence = {
        call_id: 'call-verify-001',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:abc',
        response_hash: 'sha256:def',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      };

      evidenceManager.recordEvidence(evidence);

      assert.ok(evidenceManager.hasEvidence('call-verify-001'));
      assert.ok(!evidenceManager.hasEvidence('non-existent'));
    });

    it('should get evidence by call_id', () => {
      const evidence: LLMEvidence = {
        call_id: 'call-get-001',
        provider: 'anthropic',
        model: 'claude-3-haiku',
        request_hash: 'sha256:xyz',
        response_hash: 'sha256:uvw',
        timestamp: new Date().toISOString(),
        duration_ms: 200,
        success: true,
      };

      evidenceManager.recordEvidence(evidence);
      const retrieved = evidenceManager.getEvidence('call-get-001');

      assert.ok(retrieved !== null);
      assert.equal(retrieved?.call_id, 'call-get-001');
      assert.equal(retrieved?.provider, 'anthropic');
    });

    it('should return null for non-existent evidence', () => {
      const retrieved = evidenceManager.getEvidence('non-existent');
      assert.equal(retrieved, null);
    });
  });

  describe('Session Evidence Collection', () => {
    it('should list all evidence for session', () => {
      const evidence1: LLMEvidence = {
        call_id: 'session-call-001',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:a',
        response_hash: 'sha256:b',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      };
      const evidence2: LLMEvidence = {
        call_id: 'session-call-002',
        provider: 'anthropic',
        model: 'claude-3-haiku',
        request_hash: 'sha256:c',
        response_hash: 'sha256:d',
        timestamp: new Date().toISOString(),
        duration_ms: 200,
        success: true,
      };

      evidenceManager.recordEvidence(evidence1);
      evidenceManager.recordEvidence(evidence2);

      const allEvidence = evidenceManager.listEvidence();
      assert.equal(allEvidence.length, 2);
      assert.ok(allEvidence.some(e => e.call_id === 'session-call-001'));
      assert.ok(allEvidence.some(e => e.call_id === 'session-call-002'));
    });

    it('should count successful and failed calls', () => {
      const successEvidence: LLMEvidence = {
        call_id: 'count-success',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:a',
        response_hash: 'sha256:b',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      };
      const failEvidence: LLMEvidence = {
        call_id: 'count-fail',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:c',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 50,
        success: false,
        error: 'Rate limited',
      };

      evidenceManager.recordEvidence(successEvidence);
      evidenceManager.recordEvidence(failEvidence);

      const stats = evidenceManager.getStats();
      assert.equal(stats.total_calls, 2);
      assert.equal(stats.successful_calls, 1);
      assert.equal(stats.failed_calls, 1);
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('should require evidence for COMPLETE status assertion', () => {
      // If no evidence exists, we cannot assert COMPLETE
      assert.equal(evidenceManager.canAssertComplete(), false);

      // Record a successful call
      const evidence: LLMEvidence = {
        call_id: 'complete-check',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:a',
        response_hash: 'sha256:b',
        timestamp: new Date().toISOString(),
        duration_ms: 100,
        success: true,
      };
      evidenceManager.recordEvidence(evidence);

      // Now we can assert COMPLETE
      assert.equal(evidenceManager.canAssertComplete(), true);
    });

    it('should not assert COMPLETE if only failed calls exist', () => {
      const failEvidence: LLMEvidence = {
        call_id: 'fail-only',
        provider: 'openai',
        model: 'gpt-4o-mini',
        request_hash: 'sha256:x',
        response_hash: null,
        timestamp: new Date().toISOString(),
        duration_ms: 50,
        success: false,
        error: 'Connection failed',
      };
      evidenceManager.recordEvidence(failEvidence);

      // Even with evidence, cannot assert COMPLETE if all calls failed
      assert.equal(evidenceManager.canAssertComplete(), false);
    });
  });
});

describe('LLMEvidenceManager - Hash Verification', () => {
  let tempDir: string;
  let evidenceManager: LLMEvidenceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-hash-test-'));
    evidenceManager = new LLMEvidenceManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should verify evidence file integrity', () => {
    const evidence: LLMEvidence = {
      call_id: 'integrity-check',
      provider: 'openai',
      model: 'gpt-4o-mini',
      request_hash: 'sha256:abc',
      response_hash: 'sha256:def',
      timestamp: new Date().toISOString(),
      duration_ms: 100,
      success: true,
    };

    evidenceManager.recordEvidence(evidence);

    // File should pass integrity check
    assert.ok(evidenceManager.verifyIntegrity('integrity-check'));
  });

  it('should detect tampered evidence file', () => {
    const evidence: LLMEvidence = {
      call_id: 'tamper-check',
      provider: 'openai',
      model: 'gpt-4o-mini',
      request_hash: 'sha256:abc',
      response_hash: 'sha256:def',
      timestamp: new Date().toISOString(),
      duration_ms: 100,
      success: true,
    };

    const evidencePath = evidenceManager.recordEvidence(evidence);

    // Tamper with the file
    const content = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
    content.evidence.success = false; // Tamper
    fs.writeFileSync(evidencePath, JSON.stringify(content));

    // Should detect tampering
    assert.equal(evidenceManager.verifyIntegrity('tamper-check'), false);
  });
});

describe('Evidence No Raw Data (Property 24 - API keys NEVER in logs)', () => {
  let tempDir: string;
  let evidenceManager: LLMEvidenceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-noraw-test-'));
    evidenceManager = new LLMEvidenceManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should NOT store raw prompt/response content in evidence', () => {
    // Simulate what would be stored from a real LLM call
    const rawPrompt = 'This is a secret prompt with sensitive data';
    const rawResponse = 'This is the LLM response with confidential info';

    const evidence: LLMEvidence = {
      call_id: 'no-raw-test',
      provider: 'openai',
      model: 'gpt-4o-mini',
      request_hash: hashRequest([{ role: 'user', content: rawPrompt }]),
      response_hash: hashResponse(rawResponse),
      timestamp: new Date().toISOString(),
      duration_ms: 100,
      success: true,
    };

    const evidencePath = evidenceManager.recordEvidence(evidence);
    const fileContent = fs.readFileSync(evidencePath, 'utf-8');

    // Verify raw content is NOT in the file
    assert.ok(!fileContent.includes(rawPrompt), 'Raw prompt MUST NOT be in evidence file');
    assert.ok(!fileContent.includes(rawResponse), 'Raw response MUST NOT be in evidence file');
    assert.ok(!fileContent.includes('secret'), 'Sensitive words MUST NOT be in evidence file');
    assert.ok(!fileContent.includes('confidential'), 'Sensitive words MUST NOT be in evidence file');

    // Verify hashes ARE in the file
    assert.ok(fileContent.includes('sha256:'), 'Hashes MUST be in evidence file');
  });

  it('should only contain hashes (sha256:) for request/response', () => {
    const evidence: LLMEvidence = {
      call_id: 'hash-only-test',
      provider: 'anthropic',
      model: 'claude-3-haiku',
      request_hash: 'sha256:abc123def456',
      response_hash: 'sha256:789xyz000111',
      timestamp: new Date().toISOString(),
      duration_ms: 200,
      success: true,
    };

    const evidencePath = evidenceManager.recordEvidence(evidence);
    const fileContent = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));

    // Verify request_hash and response_hash are sha256 format
    assert.ok(fileContent.evidence.request_hash.startsWith('sha256:'), 'request_hash must be sha256 format');
    assert.ok(fileContent.evidence.response_hash.startsWith('sha256:'), 'response_hash must be sha256 format');
  });

  it('should verify Evidence JSON structure matches specification', () => {
    const evidence: LLMEvidence = {
      call_id: 'spec-test',
      provider: 'openai',
      model: 'gpt-4o-mini',
      request_hash: 'sha256:abcdef123456',
      response_hash: 'sha256:fedcba654321',
      timestamp: new Date().toISOString(),
      duration_ms: 150,
      success: true,
    };

    const evidencePath = evidenceManager.recordEvidence(evidence);
    const fileContent = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));

    // Verify structure matches specification
    assert.ok(fileContent.evidence, 'Must have evidence object');
    assert.ok(fileContent.integrity_hash, 'Must have integrity_hash');

    // Verify all required fields exist
    const e = fileContent.evidence;
    assert.ok(e.call_id, 'Must have call_id');
    assert.ok(e.provider, 'Must have provider');
    assert.ok(e.model, 'Must have model');
    assert.ok(e.request_hash, 'Must have request_hash');
    assert.ok(e.response_hash !== undefined, 'Must have response_hash (can be null)');
    assert.ok(e.timestamp, 'Must have timestamp');
    assert.ok(typeof e.duration_ms === 'number', 'Must have duration_ms as number');
    assert.ok(typeof e.success === 'boolean', 'Must have success as boolean');

    // Verify integrity_hash is sha256 format (64 hex chars)
    assert.equal(fileContent.integrity_hash.length, 64, 'integrity_hash must be 64 hex chars');
    assert.ok(/^[a-f0-9]{64}$/.test(fileContent.integrity_hash), 'integrity_hash must be valid hex');
  });
});

describe('Hash Utility Functions', () => {
  it('should hash request messages', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];

    const hash = hashRequest(messages);

    assert.ok(hash.startsWith('sha256:'));
    assert.equal(hash.length, 7 + 64); // 'sha256:' + 64 hex chars
  });

  it('should hash response content', () => {
    const content = 'This is the response from the LLM.';

    const hash = hashResponse(content);

    assert.ok(hash.startsWith('sha256:'));
    assert.equal(hash.length, 7 + 64); // 'sha256:' + 64 hex chars
  });

  it('should produce different hashes for different content', () => {
    const hash1 = hashResponse('Content A');
    const hash2 = hashResponse('Content B');

    assert.notEqual(hash1, hash2);
  });

  it('should produce same hash for same content', () => {
    const content = 'Same content';
    const hash1 = hashResponse(content);
    const hash2 = hashResponse(content);

    assert.equal(hash1, hash2);
  });
});
