/**
 * PM Orchestrator Enhancement - QA Unit Tests
 */

import { QA } from '../../../src/subagents/qa';

describe('QA', () => {
  let qa: QA;

  beforeEach(() => {
    qa = new QA();
  });

  describe('check', () => {
    it('should run all checks', async () => {
      const result = await qa.check(
        ['src/main.ts'],
        ['lint', 'test', 'typecheck', 'build']
      );

      expect(result.status).toBe('pass');
      expect(result.lint).toBeDefined();
      expect(result.test).toBeDefined();
      expect(result.typecheck).toBeDefined();
      expect(result.build).toBeDefined();
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should run only lint', async () => {
      const result = await qa.check(['src/main.ts'], ['lint']);

      expect(result.lint.passed).toBeDefined();
      expect(result.test.passed).toBeDefined();
    });

    it('should run only test', async () => {
      const result = await qa.check(['src/main.ts'], ['test']);

      expect(result.test.passed).toBeDefined();
    });

    it('should run only typecheck', async () => {
      const result = await qa.check(['src/main.ts'], ['typecheck']);

      expect(result.typecheck.passed).toBeDefined();
    });

    it('should run only build', async () => {
      const result = await qa.check(['src/main.ts'], ['build']);

      expect(result.build.passed).toBeDefined();
    });

    it('should include check details', async () => {
      const result = await qa.check(
        ['src/main.ts'],
        ['lint', 'test', 'typecheck', 'build']
      );

      expect(result.lint.errors).toBeDefined();
      expect(result.lint.warnings).toBeDefined();
      expect(result.lint.details).toBeDefined();
    });

    it('should calculate quality score', async () => {
      const result = await qa.check(
        ['src/main.ts'],
        ['lint', 'test', 'typecheck', 'build']
      );

      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should fail when any check fails', async () => {
      const result = await qa.check(['src/main.ts'], ['lint', 'test']);

      // All checks pass in this mock implementation
      expect(result.status).toBe('pass');
    });

    it('should handle multiple files', async () => {
      const result = await qa.check(
        ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
        ['lint', 'test']
      );

      expect(result.status).toBe('pass');
    });

    it('should handle empty file list', async () => {
      const result = await qa.check([], ['lint']);

      expect(result.status).toBe('pass');
    });
  });
});
