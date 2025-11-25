/**
 * Unit Tests for Security Features
 */

import { PermissionChecker } from '../../../src/security/permission-checker';
import { InputValidator } from '../../../src/security/input-validator';

describe('PermissionChecker', () => {
  let checker: PermissionChecker;

  beforeEach(() => {
    checker = new PermissionChecker();
  });

  describe('Role Management', () => {
    it('should define custom role', () => {
      checker.defineRole({
        name: 'custom-role',
        permissions: [
          { resource: 'src/**/*.ts', action: 'read' }
        ]
      });

      const roles = checker.getAllRoles();
      const customRole = roles.find(r => r.name === 'custom-role');

      expect(customRole).toBeDefined();
      expect(customRole?.permissions.length).toBe(1);
    });

    it('should assign role to agent', () => {
      checker.assignRole('test-agent', 'developer');

      const roles = checker.getAgentRoles('test-agent');
      expect(roles).toContain('developer');
    });

    it('should revoke role from agent', () => {
      checker.assignRole('test-agent', 'developer');
      checker.assignRole('test-agent', 'admin');

      const revoked = checker.revokeRole('test-agent', 'developer');
      expect(revoked).toBe(true);

      const roles = checker.getAgentRoles('test-agent');
      expect(roles).not.toContain('developer');
      expect(roles).toContain('admin');
    });

    it('should return false when revoking non-existent role', () => {
      const revoked = checker.revokeRole('test-agent', 'non-existent');
      expect(revoked).toBe(false);
    });
  });

  describe('Access Control', () => {
    beforeEach(() => {
      checker.assignRole('developer-agent', 'developer');
      checker.assignRole('readonly-agent', 'readonly');
      checker.assignRole('admin-agent', 'admin');
    });

    it('should allow read access for readonly role', () => {
      const allowed = checker.checkAccess({
        agentName: 'readonly-agent',
        resource: 'src/index.ts',
        action: 'read'
      });

      expect(allowed).toBe(true);
    });

    it('should deny write access for readonly role', () => {
      const allowed = checker.checkAccess({
        agentName: 'readonly-agent',
        resource: 'src/index.ts',
        action: 'write'
      });

      expect(allowed).toBe(false);
    });

    it('should allow developer to write to src files', () => {
      const allowed = checker.checkAccess({
        agentName: 'developer-agent',
        resource: 'src/modules/test.ts',
        action: 'write'
      });

      expect(allowed).toBe(true);
    });

    it('should deny developer from deleting files', () => {
      const allowed = checker.checkAccess({
        agentName: 'developer-agent',
        resource: 'src/index.ts',
        action: 'delete'
      });

      expect(allowed).toBe(false);
    });

    it('should allow admin full access', () => {
      const readAllowed = checker.checkAccess({
        agentName: 'admin-agent',
        resource: 'any/file.txt',
        action: 'read'
      });

      const writeAllowed = checker.checkAccess({
        agentName: 'admin-agent',
        resource: 'any/file.txt',
        action: 'write'
      });

      expect(readAllowed).toBe(true);
      expect(writeAllowed).toBe(true);
    });

    it('should apply condition-based permissions', () => {
      const deniedWithoutConfirmation = checker.checkAccess({
        agentName: 'admin-agent',
        resource: '.env',
        action: 'delete',
        metadata: { confirmed: false }
      });

      const allowedWithConfirmation = checker.checkAccess({
        agentName: 'admin-agent',
        resource: '.env',
        action: 'delete',
        metadata: { confirmed: true }
      });

      expect(deniedWithoutConfirmation).toBe(false);
      expect(allowedWithConfirmation).toBe(true);
    });

    it('should default to readonly for agents without roles', () => {
      const allowed = checker.checkAccess({
        agentName: 'unknown-agent',
        resource: 'src/index.ts',
        action: 'read'
      });

      const denied = checker.checkAccess({
        agentName: 'unknown-agent',
        resource: 'src/index.ts',
        action: 'write'
      });

      expect(allowed).toBe(true);
      expect(denied).toBe(false);
    });
  });

  describe('Resource Pattern Matching', () => {
    beforeEach(() => {
      checker.assignRole('test-agent', 'developer');
    });

    it('should match wildcard patterns', () => {
      const allowed = checker.checkAccess({
        agentName: 'test-agent',
        resource: 'src/modules/deeply/nested/file.ts',
        action: 'read'
      });

      expect(allowed).toBe(true);
    });

    it('should match exact file paths', () => {
      checker.defineRole({
        name: 'specific-access',
        permissions: [
          { resource: 'package.json', action: 'read' }
        ]
      });

      checker.assignRole('specific-agent', 'specific-access');

      const allowedExact = checker.checkAccess({
        agentName: 'specific-agent',
        resource: 'package.json',
        action: 'read'
      });

      const deniedOther = checker.checkAccess({
        agentName: 'specific-agent',
        resource: 'other.json',
        action: 'read'
      });

      expect(allowedExact).toBe(true);
      expect(deniedOther).toBe(false);
    });
  });

  describe('Access Reporting', () => {
    it('should generate denial reason', () => {
      checker.assignRole('test-agent', 'readonly');

      const reason = checker.getAccessDenialReason({
        agentName: 'test-agent',
        resource: 'src/index.ts',
        action: 'write'
      });

      expect(reason).toContain('test-agent');
      expect(reason).toContain('readonly');
      expect(reason).toContain('write');
    });

    it('should get accessible resources', () => {
      checker.assignRole('dev-agent', 'developer');

      const readableResources = checker.getAccessibleResources('dev-agent', 'read');
      const writableResources = checker.getAccessibleResources('dev-agent', 'write');

      expect(readableResources).toContain('src/**');
      expect(writableResources).toContain('src/**');
    });
  });
});

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('Basic Validation', () => {
    it('should validate normal input', () => {
      const result = validator.validate('Hello, World!');

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject empty input', () => {
      const result = validator.validate('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Input is empty');
    });

    it('should warn on very long input', () => {
      const longInput = 'a'.repeat(15000);
      const result = validator.validate(longInput);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Command Injection Prevention', () => {
    it('should detect command injection attempts', () => {
      const maliciousInputs = [
        'test; rm -rf /',
        'test || cat /etc/passwd',
        'test && echo hacked',
        'test `whoami`',
        'test $(ls -la)'
      ];

      for (const input of maliciousInputs) {
        const result = validator.validate(input);
        expect(result.valid).toBe(false);
      }
    });

    it('should validate safe commands', () => {
      const result = validator.validateCommand('npm test');

      expect(result.valid).toBe(true);
    });

    it('should detect dangerous commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'chmod 777 /etc/passwd',
        'dd if=/dev/zero of=/dev/sda'
      ];

      for (const cmd of dangerousCommands) {
        const result = validator.validateCommand(cmd);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should detect path traversal', () => {
      const result = validator.validate('../../../etc/passwd');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('path traversal'))).toBe(true);
    });

    it('should validate absolute paths', () => {
      const result = validator.validateFilePath('/home/user/file.txt');

      expect(result.valid).toBe(true);
    });

    it('should reject relative paths', () => {
      const result = validator.validateFilePath('relative/path/file.txt');

      expect(result.valid).toBe(false);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should detect SQL injection patterns', () => {
      const sqlInjections = [
        "' OR '1'='1",
        "' OR 1=1--",
        "'; DROP TABLE users;--",
        "' UNION SELECT * FROM users--"
      ];

      for (const injection of sqlInjections) {
        const result = validator.validate(injection);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe('XSS Prevention', () => {
    it('should detect XSS patterns', () => {
      const xssPatterns = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<iframe src="malicious.com"></iframe>'
      ];

      for (const xss of xssPatterns) {
        const result = validator.validate(xss);
        expect(result.valid).toBe(false);
      }
    });

    it('should sanitize HTML characters', () => {
      const input = '<div>Test & "quote"</div>';
      const sanitized = validator.sanitize(input);

      expect(sanitized).toContain('&lt;');
      expect(sanitized).toContain('&gt;');
      expect(sanitized).toContain('&amp;');
      expect(sanitized).toContain('&quot;');
    });
  });

  describe('Specialized Validators', () => {
    it('should validate JSON', () => {
      const validJson = validator.validateJson('{"key": "value"}');
      const invalidJson = validator.validateJson('{invalid json}');

      expect(validJson.valid).toBe(true);
      expect(invalidJson.valid).toBe(false);
    });

    it('should validate environment variable names', () => {
      const validName = validator.validateEnvVarName('MY_VAR_NAME');
      const invalidName = validator.validateEnvVarName('my-var-name');

      expect(validName.valid).toBe(true);
      expect(invalidName.valid).toBe(false);
    });

    it('should validate URLs', () => {
      const validUrl = validator.validateUrl('https://example.com');
      const invalidUrl = validator.validateUrl('not-a-url');

      expect(validUrl.valid).toBe(true);
      expect(invalidUrl.valid).toBe(false);
    });

    it('should warn on localhost URLs', () => {
      const result = validator.validateUrl('http://localhost:3000');

      expect(result.warnings.some(w => w.includes('localhost'))).toBe(true);
    });
  });

  describe('Report Generation', () => {
    it('should generate validation report', () => {
      const result = validator.validate('<script>alert("XSS")</script>');
      const report = validator.generateReport(result);

      expect(report).toContain('Validation Report');
      expect(report).toContain('INVALID');
      expect(report).toContain('Errors:');
    });
  });
});
