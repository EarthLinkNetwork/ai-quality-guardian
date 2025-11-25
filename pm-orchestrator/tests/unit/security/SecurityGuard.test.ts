/**
 * SecurityGuard - ユニットテスト
 */

import { SecurityGuard, SecurityViolation } from '../../../lib/security/SecurityGuard';
import { Permission, OperationType } from '../../../lib/security/Permission';

describe('SecurityGuard', () => {
  let guard: SecurityGuard;
  let permission: Permission;

  beforeEach(() => {
    permission = new Permission();
    guard = new SecurityGuard(permission);
  });

  describe('入力検証', () => {
    it('should validate normal input', () => {
      const result = guard.validateInput('normal input string');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject too long input', () => {
      const longInput = 'a'.repeat(10001);
      const result = guard.validateInput(longInput);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Input too long (max 10000 characters)');
    });

    it('should detect dangerous patterns', () => {
      const result = guard.validateInput('rm -rf /');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should sanitize sensitive data', () => {
      const result = guard.validateInput('password=secret123');
      expect(result.sanitizedInput).toContain('[REDACTED]');
    });
  });

  describe('操作チェック', () => {
    it('should allow permitted operations', () => {
      expect(() => {
        guard.checkOperation('rule-checker', OperationType.READ_FILE);
      }).not.toThrow();
    });

    it('should deny unpermitted operations', () => {
      expect(() => {
        guard.checkOperation('rule-checker', OperationType.WRITE_FILE);
      }).toThrow(SecurityViolation);
    });

    it('should enforce path restrictions', () => {
      expect(() => {
        guard.checkOperation('implementer', OperationType.WRITE_FILE, '.git/config');
      }).toThrow(SecurityViolation);
    });
  });

  describe('ファイルパス検証', () => {
    it('should validate normal file paths', () => {
      const result = guard.validateFilePath('/home/user/project/file.ts');
      expect(result.valid).toBe(true);
    });

    it('should detect path traversal', () => {
      const result = guard.validateFilePath('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path traversal detected');
    });

    it('should warn about relative paths', () => {
      const result = guard.validateFilePath('relative/path/file.ts');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn about sensitive directories', () => {
      const result = guard.validateFilePath('/home/user/.env');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('コマンド検証', () => {
    it('should validate safe commands', () => {
      const result = guard.validateCommand('ls -la');
      expect(result.valid).toBe(true);
    });

    it('should detect dangerous commands', () => {
      const result = guard.validateCommand('rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about command chaining', () => {
      const result = guard.validateCommand('ls -la && cat file.txt');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('実行コンテキスト検証', () => {
    it('should validate normal execution context', () => {
      const context = { taskId: 'task-123', userInput: 'test' };
      const result = guard.validateExecutionContext('implementer', context);
      expect(result.valid).toBe(true);
    });

    it('should warn about large contexts', () => {
      const largeContext = { data: 'x'.repeat(1000001) };
      const result = guard.validateExecutionContext('implementer', largeContext);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('セキュリティレポート生成', () => {
    it('should generate security report', () => {
      const operations = [
        OperationType.READ_FILE,
        OperationType.WRITE_FILE,
        OperationType.DELETE_FILE
      ];
      // src/file.ts: 許可、 .git/config: 禁止
      const targetPaths = ['src/file.ts', '.git/config'];

      const report = guard.generateSecurityReport('implementer', operations, targetPaths);

      // 全ての操作が両方のパスで許可されている必要があるため、
      // .git/configが禁止なので全ての操作がdeniedになる
      expect(report.denied.length).toBe(3);
      expect(report.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('カスタム危険パターン', () => {
    it('should allow adding custom patterns', () => {
      guard.addDangerousPattern(/eval\(/);
      const result = guard.validateInput('eval("dangerous code")');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
