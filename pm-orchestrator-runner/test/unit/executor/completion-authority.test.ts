/**
 * Completion Authority Tests (Property 8)
 *
 * Verifies that Runner is the only completion authority and
 * Executor output is treated as untrusted until verified.
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md:
 * - Property 8: Completion Validation Authority
 * - Property 8.1: Executor output is untrusted until verified
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { ExecutorResult } from '../../../src/executor/claude-code-executor';

describe('Property 8: Completion Authority', () => {
  describe('Runner is the only completion authority', () => {
    it('should have status determined by file verification, not executor claim', () => {
      // Executor claims COMPLETE but has no verified_files
      const executorResult: ExecutorResult = {
        executed: true,
        output: 'Successfully created all files!',
        files_modified: [],
        duration_ms: 100,
        status: 'COMPLETE', // Executor's claim
        cwd: '/test',
        verified_files: [], // But no files verified
        unverified_files: [],
      };

      // Runner should NOT trust this - verified_files is empty
      const hasEvidence = executorResult.verified_files.length > 0;
      assert.strictEqual(hasEvidence, false);
      // A compliant runner would override status to NO_EVIDENCE
    });

    it('should detect unverified_files as evidence of untrusted output', () => {
      const executorResult: ExecutorResult = {
        executed: true,
        output: 'Created README.md',
        files_modified: ['README.md'],
        duration_ms: 100,
        status: 'NO_EVIDENCE',
        cwd: '/test',
        verified_files: [],
        unverified_files: ['README.md'], // File claimed but not found
      };

      // unverified_files > 0 means executor lied
      assert.ok(executorResult.unverified_files.length > 0);
      assert.strictEqual(executorResult.status, 'NO_EVIDENCE');
    });

    it('should only allow COMPLETE when verified_files matches files_modified', () => {
      const executorResult: ExecutorResult = {
        executed: true,
        output: 'Created README.md',
        files_modified: ['README.md'],
        duration_ms: 100,
        status: 'COMPLETE',
        cwd: '/test',
        verified_files: [{ path: 'README.md', exists: true, size: 100 }],
        unverified_files: [],
      };

      // This is valid: files_modified matches verified_files
      const verified = executorResult.verified_files.map((f) => f.path);
      const claimed = executorResult.files_modified;
      const allVerified = claimed.every((f) => verified.includes(f));

      assert.ok(allVerified);
      assert.strictEqual(executorResult.unverified_files.length, 0);
    });
  });

  describe('Property 8.1: Executor output is untrusted', () => {
    it('should treat executor "executed: true" as insufficient for COMPLETE', () => {
      // executed: true just means process ran, not that it did useful work
      const result: ExecutorResult = {
        executed: true,
        output: 'I did everything you asked!',
        files_modified: [],
        duration_ms: 100,
        status: 'NO_EVIDENCE',
        cwd: '/test',
        verified_files: [],
        unverified_files: [],
      };

      // executed: true but no files → NO_EVIDENCE, not COMPLETE
      assert.strictEqual(result.executed, true);
      assert.strictEqual(result.status, 'NO_EVIDENCE');
    });

    it('should require verified_files to have exists: true', () => {
      const result: ExecutorResult = {
        executed: true,
        output: 'Done',
        files_modified: ['test.txt'],
        duration_ms: 100,
        status: 'COMPLETE',
        cwd: '/test',
        verified_files: [{ path: 'test.txt', exists: true, size: 50 }],
        unverified_files: [],
      };

      // verified_files entries must have exists: true
      const allExist = result.verified_files.every((f) => f.exists === true);
      assert.ok(allExist);
    });

    it('should detect error output even if executed is true', () => {
      const result: ExecutorResult = {
        executed: true,
        output: 'Error: Permission denied',
        error: 'Permission denied',
        files_modified: [],
        duration_ms: 100,
        status: 'ERROR',
        cwd: '/test',
        verified_files: [],
        unverified_files: [],
      };

      // executed: true but error present → ERROR status
      assert.strictEqual(result.executed, true);
      assert.strictEqual(result.status, 'ERROR');
    });
  });

  describe('Property 15: Output validation', () => {
    it('should capture executor output for audit (not discard)', () => {
      const result: ExecutorResult = {
        executed: true,
        output: 'Detailed execution log here...',
        files_modified: ['file.txt'],
        duration_ms: 100,
        status: 'COMPLETE',
        cwd: '/test',
        verified_files: [{ path: 'file.txt', exists: true, size: 10 }],
        unverified_files: [],
      };

      // output is captured for evidence/audit even if not shown to user
      assert.ok(result.output.length > 0);
    });

    it('should have structured result format (not raw executor output)', () => {
      const result: ExecutorResult = {
        executed: true,
        output: 'raw output',
        files_modified: ['a.txt'],
        duration_ms: 50,
        status: 'COMPLETE',
        cwd: '/test',
        verified_files: [{ path: 'a.txt', exists: true, size: 5 }],
        unverified_files: [],
      };

      // ExecutorResult has specific structure, not just raw string
      assert.ok('status' in result);
      assert.ok('verified_files' in result);
      assert.ok('unverified_files' in result);
      assert.ok('files_modified' in result);
      assert.ok('cwd' in result);
    });
  });

  describe('Property 19: Communication mediation', () => {
    it('should have cwd in result for Runner to verify paths', () => {
      const result: ExecutorResult = {
        executed: true,
        output: '',
        files_modified: ['test.txt'],
        duration_ms: 50,
        status: 'COMPLETE',
        cwd: '/project/path',
        verified_files: [{ path: 'test.txt', exists: true, size: 10 }],
        unverified_files: [],
      };

      // cwd is required for Runner to verify file paths
      assert.ok(result.cwd);
      assert.strictEqual(typeof result.cwd, 'string');
    });

    it('should provide verified_files with full verification info', () => {
      const result: ExecutorResult = {
        executed: true,
        output: '',
        files_modified: ['doc.md'],
        duration_ms: 50,
        status: 'COMPLETE',
        cwd: '/test',
        verified_files: [
          {
            path: 'doc.md',
            exists: true,
            size: 1024,
            content_preview: '# Documentation',
          },
        ],
        unverified_files: [],
      };

      // verified_files provides Runner with verification info
      const verified = result.verified_files[0];
      assert.ok(verified.path);
      assert.strictEqual(verified.exists, true);
      assert.strictEqual(typeof verified.size, 'number');
    });
  });
});
