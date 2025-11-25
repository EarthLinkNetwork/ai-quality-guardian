/**
 * Permission - ユニットテスト
 */

import { Permission, OperationType, PermissionLevel } from '../../../lib/security/Permission';

describe('Permission', () => {
  let permission: Permission;

  beforeEach(() => {
    permission = new Permission();
  });

  describe('デフォルト権限ルール', () => {
    it('should have default rules for rule-checker', () => {
      expect(permission.isAllowed('rule-checker', OperationType.READ_FILE)).toBe(true);
      expect(permission.isAllowed('rule-checker', OperationType.WRITE_FILE)).toBe(false);
    });

    it('should have default rules for implementer', () => {
      expect(permission.isAllowed('implementer', OperationType.READ_FILE)).toBe(true);
      expect(permission.isAllowed('implementer', OperationType.WRITE_FILE)).toBe(true);
      expect(permission.isAllowed('implementer', OperationType.EXECUTE_COMMAND)).toBe(true);
    });

    it('should deny access to .git directory for implementer', () => {
      expect(permission.isAllowed('implementer', OperationType.WRITE_FILE, '.git/config')).toBe(false);
    });

    it('should allow test file access for tester', () => {
      expect(permission.isAllowed('tester', OperationType.WRITE_FILE, 'tests/example.test.ts')).toBe(true);
      expect(permission.isAllowed('tester', OperationType.WRITE_FILE, 'src/example.ts')).toBe(false);
    });
  });

  describe('権限レベル', () => {
    it('should return correct permission level', () => {
      expect(permission.getLevel('rule-checker')).toBe(PermissionLevel.READ);
      expect(permission.getLevel('implementer')).toBe(PermissionLevel.EXECUTE);
      expect(permission.getLevel('non-existent')).toBe(PermissionLevel.READ); // default
    });
  });

  describe('カスタム権限ルール', () => {
    it('should allow setting custom rules', () => {
      permission.setRule({
        subagentName: 'custom-agent',
        operations: new Set([OperationType.READ_FILE, OperationType.WRITE_FILE]),
        level: PermissionLevel.WRITE
      });

      expect(permission.isAllowed('custom-agent', OperationType.READ_FILE)).toBe(true);
      expect(permission.isAllowed('custom-agent', OperationType.WRITE_FILE)).toBe(true);
      expect(permission.isAllowed('custom-agent', OperationType.DELETE_FILE)).toBe(false);
    });

    it('should support allowed paths', () => {
      permission.setRule({
        subagentName: 'restricted-agent',
        operations: new Set([OperationType.WRITE_FILE]),
        allowedPaths: ['docs/**', 'README.md'],
        level: PermissionLevel.WRITE
      });

      expect(permission.isAllowed('restricted-agent', OperationType.WRITE_FILE, 'docs/guide.md')).toBe(true);
      expect(permission.isAllowed('restricted-agent', OperationType.WRITE_FILE, 'README.md')).toBe(true);
      expect(permission.isAllowed('restricted-agent', OperationType.WRITE_FILE, 'src/code.ts')).toBe(false);
    });

    it('should support denied paths', () => {
      permission.setRule({
        subagentName: 'safe-agent',
        operations: new Set([OperationType.WRITE_FILE]),
        deniedPaths: ['.env', 'secrets/**'],
        level: PermissionLevel.WRITE
      });

      expect(permission.isAllowed('safe-agent', OperationType.WRITE_FILE, 'src/code.ts')).toBe(true);
      expect(permission.isAllowed('safe-agent', OperationType.WRITE_FILE, '.env')).toBe(false);
      expect(permission.isAllowed('safe-agent', OperationType.WRITE_FILE, 'secrets/api-key.txt')).toBe(false);
    });
  });

  describe('パターンマッチング', () => {
    it('should match glob patterns', () => {
      permission.setRule({
        subagentName: 'pattern-agent',
        operations: new Set([OperationType.READ_FILE]),
        allowedPaths: ['**/*.ts', 'docs/*.md'],
        level: PermissionLevel.READ
      });

      expect(permission.isAllowed('pattern-agent', OperationType.READ_FILE, 'src/code.ts')).toBe(true);
      expect(permission.isAllowed('pattern-agent', OperationType.READ_FILE, 'src/nested/code.ts')).toBe(true);
      expect(permission.isAllowed('pattern-agent', OperationType.READ_FILE, 'docs/guide.md')).toBe(true);
      expect(permission.isAllowed('pattern-agent', OperationType.READ_FILE, 'docs/nested/guide.md')).toBe(false);
    });
  });

  describe('全権限ルール取得', () => {
    it('should return all rules', () => {
      const allRules = permission.getAllRules();
      expect(allRules.size).toBeGreaterThan(0);
      expect(allRules.has('rule-checker')).toBe(true);
      expect(allRules.has('implementer')).toBe(true);
    });
  });

  describe('クリア機能', () => {
    it('should clear and reinitialize rules', () => {
      permission.setRule({
        subagentName: 'temp-agent',
        operations: new Set([OperationType.READ_FILE]),
        level: PermissionLevel.READ
      });

      expect(permission.getAllRules().has('temp-agent')).toBe(true);

      permission.clear();

      expect(permission.getAllRules().has('temp-agent')).toBe(false);
      expect(permission.getAllRules().has('rule-checker')).toBe(true); // default
    });
  });
});
