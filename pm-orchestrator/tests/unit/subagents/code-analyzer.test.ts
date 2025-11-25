/**
 * PM Orchestrator Enhancement - CodeAnalyzer Unit Tests
 */

import { CodeAnalyzer } from '../../../src/subagents/code-analyzer';

describe('CodeAnalyzer', () => {
  let analyzer: CodeAnalyzer;

  beforeEach(() => {
    analyzer = new CodeAnalyzer();
  });

  describe('analyze', () => {
    it('should complete similarity analysis', async () => {
      const result = await analyzer.analyze(
        ['src/file1.ts', 'src/file2.ts'],
        'similarity'
      );

      expect(result.status).toBe('completed');
      expect(result.findings).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.complexity).toBeGreaterThanOrEqual(0);
      expect(result.metrics.maintainability).toBeGreaterThanOrEqual(0);
      expect(result.metrics.testCoverage).toBeGreaterThanOrEqual(0);
    });

    it('should complete quality analysis', async () => {
      const result = await analyzer.analyze(
        ['src/main.ts'],
        'quality'
      );

      expect(result.status).toBe('completed');
      expect(result.findings).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should complete architecture analysis', async () => {
      const result = await analyzer.analyze(
        ['src/index.ts', 'src/types.ts'],
        'architecture',
        'layered architecture'
      );

      expect(result.status).toBe('completed');
      expect(result.findings).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should provide recommendations based on metrics', async () => {
      const result = await analyzer.analyze(
        ['src/complex.ts'],
        'quality'
      );

      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should calculate complexity metrics', async () => {
      const result = await analyzer.analyze(
        ['src/main.ts'],
        'quality'
      );

      expect(result.metrics.complexity).toBeGreaterThanOrEqual(0);
      expect(result.metrics.complexity).toBeLessThanOrEqual(100);
    });

    it('should calculate maintainability metrics', async () => {
      const result = await analyzer.analyze(
        ['src/main.ts'],
        'quality'
      );

      expect(result.metrics.maintainability).toBeGreaterThanOrEqual(0);
      expect(result.metrics.maintainability).toBeLessThanOrEqual(100);
    });

    it('should calculate test coverage metrics', async () => {
      const result = await analyzer.analyze(
        ['src/main.ts'],
        'quality'
      );

      expect(result.metrics.testCoverage).toBeGreaterThanOrEqual(0);
      expect(result.metrics.testCoverage).toBeLessThanOrEqual(100);
    });
  });
});
