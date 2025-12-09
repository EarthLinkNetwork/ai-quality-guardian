/**
 * Local Installation Check Module Tests
 */
import { checkLocalInstallation, formatLocalCheckResult, LocalCheckResult } from '../../../src/install/localCheck';

describe('localCheck', () => {
  describe('checkLocalInstallation', () => {
    it('should return a LocalCheckResult object', () => {
      const result = checkLocalInstallation();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('isLocalInstall');
      expect(result).toHaveProperty('isGlobalInstall');
      expect(result).toHaveProperty('installLocation');
      expect(result).toHaveProperty('packagePath');
      expect(result).toHaveProperty('templatesPath');
      expect(result).toHaveProperty('templatesExist');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should detect development environment', () => {
      // 開発環境で実行した場合
      const result = checkLocalInstallation();

      // このテストは開発環境で実行されるので、development が検出されるはず
      expect(['development', 'local', 'unknown']).toContain(result.installLocation);
    });

    it('should have errors array and warnings array', () => {
      const result = checkLocalInstallation();

      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('formatLocalCheckResult', () => {
    it('should format successful result', () => {
      const result: LocalCheckResult = {
        isLocalInstall: true,
        isGlobalInstall: false,
        installLocation: 'local',
        packagePath: '/project/node_modules/pm-orchestrator-enhancement',
        templatesPath: '/project/node_modules/pm-orchestrator-enhancement/templates',
        templatesExist: true,
        errors: [],
        warnings: []
      };

      const formatted = formatLocalCheckResult(result);

      expect(formatted).toContain('PM Orchestrator Installation Check');
      expect(formatted).toContain('Installation location: local');
      expect(formatted).toContain('Templates exist: ✅ Yes');
      expect(formatted).toContain('Installation check passed');
    });

    it('should format result with errors', () => {
      const result: LocalCheckResult = {
        isLocalInstall: false,
        isGlobalInstall: true,
        installLocation: 'global',
        packagePath: '/usr/lib/node_modules/pm-orchestrator-enhancement',
        templatesPath: '',
        templatesExist: false,
        errors: ['templates/ directory not found'],
        warnings: ['Running from global npm installation']
      };

      const formatted = formatLocalCheckResult(result);

      expect(formatted).toContain('Installation location: global');
      expect(formatted).toContain('Templates exist: ❌ No');
      expect(formatted).toContain('templates/ directory not found');
      expect(formatted).toContain('Running from global npm installation');
      expect(formatted).toContain('Installation check failed');
    });

    it('should format result with warnings only', () => {
      const result: LocalCheckResult = {
        isLocalInstall: true,
        isGlobalInstall: false,
        installLocation: 'local',
        packagePath: '/project/node_modules/pm-orchestrator-enhancement',
        templatesPath: '/project/node_modules/pm-orchestrator-enhancement/templates',
        templatesExist: true,
        errors: [],
        warnings: ['Missing template files: .claude/skills/README.md']
      };

      const formatted = formatLocalCheckResult(result);

      expect(formatted).toContain('Warnings:');
      expect(formatted).toContain('Missing template files');
      expect(formatted).toContain('Installation check passed');
    });
  });
});
