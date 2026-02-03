/**
 * Unit tests for docs-first.check.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as assert from 'assert';
import {
  extractAcNumbers,
  hasActualEvidence,
  isDeclarationOnly,
  extractEvidenceForAc,
  checkDocsFirst,
} from '../../../diagnostics/docs-first.check';

describe('Docs-First Gate', () => {
  describe('extractAcNumbers', () => {
    it('should extract AC-1, AC-2, etc. from content', () => {
      const content = '### AC-1: First criterion\nSome description\n### AC-2: Second criterion\n### AC-10: Tenth';
      const result = extractAcNumbers(content);
      assert.deepStrictEqual(result, ['AC-1', 'AC-2', 'AC-10']);
    });

    it('should return empty array when no AC numbers found', () => {
      const content = 'No acceptance criteria here';
      const result = extractAcNumbers(content);
      assert.deepStrictEqual(result, []);
    });

    it('should handle lowercase ac-n format', () => {
      const content = 'ac-1: test ac-2: another';
      const result = extractAcNumbers(content);
      assert.deepStrictEqual(result, ['AC-1', 'AC-2']);
    });

    it('should deduplicate repeated AC numbers', () => {
      const content = 'AC-1 mentioned here and AC-1 again AC-2 also';
      const result = extractAcNumbers(content);
      assert.deepStrictEqual(result, ['AC-1', 'AC-2']);
    });
  });

  describe('hasActualEvidence', () => {
    it('should return true for code blocks', () => {
      const section = '## AC-1\n```bash\n$ npm test\nAll tests passed\n```';
      assert.strictEqual(hasActualEvidence(section), true);
    });

    it('should return true for URLs', () => {
      const section = 'Evidence: https://github.com/example/pr/123';
      assert.strictEqual(hasActualEvidence(section), true);
    });

    it('should return true for image references', () => {
      const section = 'Screenshot: ![screenshot](./images/test.png)';
      assert.strictEqual(hasActualEvidence(section), true);
    });

    it('should return true for command execution', () => {
      const section = '$ ls -la\ndrwxr-xr-x 5 user staff 160';
      assert.strictEqual(hasActualEvidence(section), true);
    });

    it('should return false for plain text without evidence', () => {
      const section = 'This is just a description without any evidence';
      assert.strictEqual(hasActualEvidence(section), false);
    });
  });

  describe('isDeclarationOnly', () => {
    it('should return true for "done"', () => {
      assert.strictEqual(isDeclarationOnly('done'), true);
      assert.strictEqual(isDeclarationOnly('Done'), true);
      assert.strictEqual(isDeclarationOnly('- done'), true);
    });

    it('should return true for short text without evidence', () => {
      assert.strictEqual(isDeclarationOnly('OK'), true);
      assert.strictEqual(isDeclarationOnly('pass'), true);
    });

    it('should return false for content with code blocks', () => {
      const section = '## AC-1\n```\nactual output here\n```';
      assert.strictEqual(isDeclarationOnly(section), false);
    });
  });

  describe('extractEvidenceForAc', () => {
    it('should parse AC sections correctly', () => {
      const content = '## AC-1\n\nEvidence for AC-1 here\n\n## AC-2\n\nEvidence for AC-2 here';
      const result = extractEvidenceForAc(content);
      assert.strictEqual(result.has('AC-1'), true);
      assert.strictEqual(result.has('AC-2'), true);
      assert.ok(result.get('AC-1')!.includes('Evidence for AC-1'));
      assert.ok(result.get('AC-2')!.includes('Evidence for AC-2'));
    });
  });

  describe('checkDocsFirst', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-first-test-'));
      fs.mkdirSync(path.join(tempDir, 'docs'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should fail when docs are missing', () => {
      fs.writeFileSync(path.join(tempDir, 'docs/SPEC.md'), '# Spec');
      
      const result = checkDocsFirst(tempDir);
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.results[0].status, 'FAIL');
      assert.ok(result.results[0].reason!.includes('Missing'));
    });

    it('should fail when ACCEPTANCE.md has no AC-N format', () => {
      fs.writeFileSync(path.join(tempDir, 'docs/SPEC.md'), '# Spec');
      fs.writeFileSync(path.join(tempDir, 'docs/TASK_PLAN.md'), '# Tasks');
      fs.writeFileSync(path.join(tempDir, 'docs/TEST_PLAN.md'), '# Tests');
      fs.writeFileSync(path.join(tempDir, 'docs/ACCEPTANCE.md'), '# Acceptance\nNo numbered criteria');
      fs.writeFileSync(path.join(tempDir, 'docs/EVIDENCE.md'), '# Evidence');

      const result = checkDocsFirst(tempDir);
      assert.strictEqual(result.passed, false);
      assert.ok(result.results.some(r => r.rule === 'DOCS-2' && r.status === 'FAIL'));
    });

    it('should fail when EVIDENCE.md is missing AC references', () => {
      fs.writeFileSync(path.join(tempDir, 'docs/SPEC.md'), '# Spec');
      fs.writeFileSync(path.join(tempDir, 'docs/TASK_PLAN.md'), '# Tasks');
      fs.writeFileSync(path.join(tempDir, 'docs/TEST_PLAN.md'), '# Tests');
      fs.writeFileSync(path.join(tempDir, 'docs/ACCEPTANCE.md'), '# Acceptance\n## AC-1\n## AC-2');
      fs.writeFileSync(path.join(tempDir, 'docs/EVIDENCE.md'), '# Evidence\n## AC-1\n```output```');

      const result = checkDocsFirst(tempDir);
      assert.strictEqual(result.passed, false);
      assert.ok(result.results.some(r => r.rule === 'DOCS-3' && r.status === 'FAIL'));
      assert.ok(result.missingEvidence.includes('AC-2'));
    });

    it('should fail when evidence is declaration-only', () => {
      fs.writeFileSync(path.join(tempDir, 'docs/SPEC.md'), '# Spec');
      fs.writeFileSync(path.join(tempDir, 'docs/TASK_PLAN.md'), '# Tasks');
      fs.writeFileSync(path.join(tempDir, 'docs/TEST_PLAN.md'), '# Tests');
      fs.writeFileSync(path.join(tempDir, 'docs/ACCEPTANCE.md'), '# Acceptance\n## AC-1');
      fs.writeFileSync(path.join(tempDir, 'docs/EVIDENCE.md'), '# Evidence\n## AC-1\ndone');

      const result = checkDocsFirst(tempDir);
      assert.strictEqual(result.passed, false);
      assert.ok(result.results.some(r => r.rule === 'DOCS-4' && r.status === 'FAIL'));
    });

    it('should pass when all requirements are met', () => {
      fs.writeFileSync(path.join(tempDir, 'docs/SPEC.md'), '# Spec');
      fs.writeFileSync(path.join(tempDir, 'docs/TASK_PLAN.md'), '# Tasks');
      fs.writeFileSync(path.join(tempDir, 'docs/TEST_PLAN.md'), '# Tests');
      fs.writeFileSync(path.join(tempDir, 'docs/ACCEPTANCE.md'), '# Acceptance\n## AC-1\n## AC-2');
      fs.writeFileSync(path.join(tempDir, 'docs/EVIDENCE.md'), '# Evidence\n\n## AC-1\n\n```bash\n$ npm test\nAll tests passed\n```\n\n## AC-2\n\n```bash\n$ npm run lint\nNo errors\n```');

      const result = checkDocsFirst(tempDir);
      assert.strictEqual(result.passed, true);
      assert.ok(result.results.every(r => r.status === 'PASS'));
    });
  });
});
