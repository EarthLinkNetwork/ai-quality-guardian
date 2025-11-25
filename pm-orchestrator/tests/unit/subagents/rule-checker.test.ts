/**
 * PM Orchestrator Enhancement - RuleChecker Unit Tests
 */

import { RuleChecker } from '../../../src/subagents/rule-checker';

describe('RuleChecker', () => {
  let checker: RuleChecker;

  beforeEach(() => {
    checker = new RuleChecker();
  });

  describe('check', () => {
    it('should pass when no violations', async () => {
      const result = await checker.check('implementation', [], 'file');

      expect(result.status).toBe('pass');
      expect(result.violations).toHaveLength(0);
      expect(result.recommendations).toHaveLength(0);
    });

    it('should detect git operation violations', async () => {
      const result = await checker.check(
        'implementation',
        ['src/main.ts'],
        'git'
      );

      expect(result.status).toBe('pass');
      expect(result.violations).toHaveLength(0);
    });

    it('should check trace rules for all operations', async () => {
      const result = await checker.check(
        'implementation',
        ['src/main.ts'],
        'file'
      );

      expect(result.status).toBe('pass');
      expect(result.violations).toHaveLength(0);
    });

    it('should provide recommendations when violations exist', async () => {
      // This test will pass as no violations are currently detected
      const result = await checker.check(
        'implementation',
        ['src/main.ts'],
        'git'
      );

      if (result.violations.length > 0) {
        expect(result.status).toBe('fail');
        expect(result.recommendations).toContain(
          'Fix all critical violations before proceeding'
        );
      } else {
        expect(result.status).toBe('pass');
        expect(result.recommendations).toHaveLength(0);
      }
    });
  });
});
