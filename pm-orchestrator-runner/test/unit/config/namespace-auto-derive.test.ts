import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  deriveNamespaceFromPath,
  buildNamespaceConfig,
} from '../../../src/config/namespace';

describe('Namespace Auto-Derivation (Same Folder = Same Queue)', () => {
  describe('deriveNamespaceFromPath', () => {
    it('should derive namespace from simple project path', () => {
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/my-project');
      // Format: {folder_name}-{4_char_hash}
      assert.ok(namespace.startsWith('my-project-'), 'Expected to start with "my-project-", got: ' + namespace);
      assert.equal(namespace.length, 'my-project-'.length + 4, 'Expected length ' + ('my-project-'.length + 4) + ', got: ' + namespace.length);
    });

    it('should return consistent namespace for same path', () => {
      const ns1 = deriveNamespaceFromPath('/Users/masa/dev/my-project');
      const ns2 = deriveNamespaceFromPath('/Users/masa/dev/my-project');
      assert.equal(ns1, ns2, 'Same path should produce same namespace');
    });

    it('should return different namespace for different paths', () => {
      const ns1 = deriveNamespaceFromPath('/Users/masa/dev/project-a');
      const ns2 = deriveNamespaceFromPath('/Users/masa/dev/project-b');
      assert.notEqual(ns1, ns2, 'Different paths should produce different namespaces');
    });

    it('should return different namespace for same folder name in different locations', () => {
      const ns1 = deriveNamespaceFromPath('/Users/masa/dev/project');
      const ns2 = deriveNamespaceFromPath('/Users/john/dev/project');
      // Same folder name but different full paths should have same prefix but different hash
      assert.ok(ns1.startsWith('project-'), 'ns1 should start with "project-", got: ' + ns1);
      assert.ok(ns2.startsWith('project-'), 'ns2 should start with "project-", got: ' + ns2);
      assert.notEqual(ns1, ns2, 'Same folder name in different locations should produce different namespaces');
    });

    it('should handle folder names with hyphens', () => {
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/my-cool-project');
      assert.ok(namespace.startsWith('my-cool-project-'), 'Expected to start with "my-cool-project-", got: ' + namespace);
    });

    it('should handle folder names with numbers', () => {
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/project123');
      assert.ok(namespace.startsWith('project123-'), 'Expected to start with "project123-", got: ' + namespace);
    });

    it('should handle Windows-style paths', () => {
      const namespace = deriveNamespaceFromPath('C:\\Users\\masa\\dev\\my-project');
      // Should extract folder name properly regardless of path separator
      assert.ok(namespace.includes('my-project'), 'Expected to include "my-project", got: ' + namespace);
    });

    it('should handle trailing slash', () => {
      const ns1 = deriveNamespaceFromPath('/Users/masa/dev/my-project');
      const ns2 = deriveNamespaceFromPath('/Users/masa/dev/my-project/');
      assert.equal(ns1, ns2, 'Trailing slash should not affect namespace');
    });

    it('should produce valid namespace format', () => {
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/my-project');
      // Check that it matches the valid namespace pattern
      const validPattern = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/i;
      assert.ok(validPattern.test(namespace), 'Namespace "' + namespace + '" should match valid pattern');
    });

    it('should handle folder names with uppercase (normalize to lowercase)', () => {
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/MyProject');
      assert.ok(namespace.startsWith('myproject-'), 'Expected to start with "myproject-" (lowercase), got: ' + namespace);
    });

    it('should handle folder names with underscores (convert to hyphens)', () => {
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/my_project');
      // Underscores should be converted to hyphens for valid namespace
      assert.ok(!namespace.includes('_'), 'Namespace should not contain underscores, got: ' + namespace);
    });

    it('should handle special characters in folder name (remove or convert)', () => {
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/my.project@v2');
      // Special characters should be removed or converted
      assert.ok(!namespace.includes('.'), 'Namespace should not contain dots, got: ' + namespace);
      assert.ok(!namespace.includes('@'), 'Namespace should not contain @, got: ' + namespace);
    });

    it('should truncate long folder names to fit max namespace length', () => {
      const longFolderName = 'this-is-a-very-long-project-name-that-exceeds-limits';
      const namespace = deriveNamespaceFromPath('/Users/masa/dev/' + longFolderName);
      // Max namespace length is 32, minus 5 for "-" and hash
      assert.ok(namespace.length <= 32, 'Namespace length ' + namespace.length + ' should be <= 32');
    });
  });

  describe('buildNamespaceConfig with auto-derivation', () => {
    it('should auto-derive namespace when not explicitly provided and no env var', () => {
      const originalEnv = process.env.PM_RUNNER_NAMESPACE;
      try {
        delete process.env.PM_RUNNER_NAMESPACE;
        
        const config = buildNamespaceConfig({
          projectRoot: '/Users/masa/dev/my-project',
          autoDerive: true,
        });

        // Should derive from path, not use 'default'
        assert.ok(config.namespace.startsWith('my-project-'), 
          'Expected namespace to start with "my-project-", got: ' + config.namespace);
        assert.notEqual(config.namespace, 'default', 'Should not be default when auto-derive is enabled');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.PM_RUNNER_NAMESPACE;
        } else {
          process.env.PM_RUNNER_NAMESPACE = originalEnv;
        }
      }
    });

    it('should prefer explicit namespace over auto-derived', () => {
      const config = buildNamespaceConfig({
        namespace: 'explicit-ns',
        projectRoot: '/Users/masa/dev/my-project',
        autoDerive: true,
      });

      assert.equal(config.namespace, 'explicit-ns', 'Explicit namespace should take priority');
    });

    it('should prefer env var over auto-derived', () => {
      const originalEnv = process.env.PM_RUNNER_NAMESPACE;
      try {
        process.env.PM_RUNNER_NAMESPACE = 'from-env';
        
        const config = buildNamespaceConfig({
          projectRoot: '/Users/masa/dev/my-project',
          autoDerive: true,
        });

        assert.equal(config.namespace, 'from-env', 'Env var should take priority over auto-derive');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.PM_RUNNER_NAMESPACE;
        } else {
          process.env.PM_RUNNER_NAMESPACE = originalEnv;
        }
      }
    });

    it('should use default namespace when autoDerive is false/undefined', () => {
      const originalEnv = process.env.PM_RUNNER_NAMESPACE;
      try {
        delete process.env.PM_RUNNER_NAMESPACE;
        
        const config = buildNamespaceConfig({
          projectRoot: '/Users/masa/dev/my-project',
          // autoDerive not set, defaults to false
        });

        assert.equal(config.namespace, 'default', 'Should use default when autoDerive is not enabled');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.PM_RUNNER_NAMESPACE;
        } else {
          process.env.PM_RUNNER_NAMESPACE = originalEnv;
        }
      }
    });

    it('should produce consistent config for same project path', () => {
      const originalEnv = process.env.PM_RUNNER_NAMESPACE;
      try {
        delete process.env.PM_RUNNER_NAMESPACE;
        
        const config1 = buildNamespaceConfig({
          projectRoot: '/Users/masa/dev/my-project',
          autoDerive: true,
        });
        
        const config2 = buildNamespaceConfig({
          projectRoot: '/Users/masa/dev/my-project',
          autoDerive: true,
        });

        assert.equal(config1.namespace, config2.namespace, 'Same path should produce same namespace');
        assert.equal(config1.tableName, config2.tableName, 'Same path should produce same table name');
        assert.equal(config1.stateDir, config2.stateDir, 'Same path should produce same state dir');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.PM_RUNNER_NAMESPACE;
        } else {
          process.env.PM_RUNNER_NAMESPACE = originalEnv;
        }
      }
    });
  });
});
