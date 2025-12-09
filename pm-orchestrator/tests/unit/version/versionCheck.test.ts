/**
 * Version Check Module Tests
 */
import { compareVersions, getCurrentVersion, formatVersionCheckResult, VersionCheckResult } from '../../../src/version/versionCheck';

describe('versionCheck', () => {
  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
    });

    it('should return 1 when first version is greater', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('should return -1 when first version is smaller', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should handle versions with different segment counts', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0')).toBe(0);
      expect(compareVersions('1.1', '1.0.0')).toBe(1);
    });

    it('should handle versions with v prefix', () => {
      expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(0);
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1);
      expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return a version string', () => {
      const version = getCurrentVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      // Version should match semver pattern or be 0.0.0
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('formatVersionCheckResult', () => {
    it('should format result when up to date', () => {
      const result: VersionCheckResult = {
        currentVersion: '2.3.0',
        latestVersion: '2.3.0',
        isUpToDate: true,
        updateAvailable: false,
        packageName: 'pm-orchestrator-enhancement',
        updateCommand: 'npm update pm-orchestrator-enhancement',
        checkSource: 'npm'
      };

      const formatted = formatVersionCheckResult(result);

      expect(formatted).toContain('PM Orchestrator Version Check');
      expect(formatted).toContain('Current version: 2.3.0');
      expect(formatted).toContain('Latest version: 2.3.0');
      expect(formatted).toContain('You are using the latest version');
    });

    it('should format result when update is available', () => {
      const result: VersionCheckResult = {
        currentVersion: '2.2.0',
        latestVersion: '2.3.0',
        isUpToDate: false,
        updateAvailable: true,
        packageName: 'pm-orchestrator-enhancement',
        updateCommand: 'npm update pm-orchestrator-enhancement',
        checkSource: 'npm'
      };

      const formatted = formatVersionCheckResult(result);

      expect(formatted).toContain('UPDATE AVAILABLE');
      expect(formatted).toContain('Current version: 2.2.0');
      expect(formatted).toContain('Latest version: 2.3.0');
      expect(formatted).toContain('npm update pm-orchestrator-enhancement');
    });

    it('should include error message if present', () => {
      const result: VersionCheckResult = {
        currentVersion: '2.3.0',
        latestVersion: '2.3.0',
        isUpToDate: true,
        updateAvailable: false,
        packageName: 'pm-orchestrator-enhancement',
        updateCommand: 'npm update pm-orchestrator-enhancement',
        checkSource: 'local_only',
        error: 'Failed to fetch from npm'
      };

      const formatted = formatVersionCheckResult(result);

      expect(formatted).toContain('Failed to fetch from npm');
    });
  });
});
