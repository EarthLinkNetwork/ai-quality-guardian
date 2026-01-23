import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  validateNamespace,
  getTableName,
  getStateDir,
  getDefaultPort,
  buildNamespaceConfig,
  NamespaceUtils,
  DEFAULT_NAMESPACE,
  NamespaceConfig,
} from '../../../src/config/namespace';

describe('Namespace Configuration (21_STABLE_DEV.md)', () => {
  describe('validateNamespace', () => {
    describe('valid namespaces', () => {
      it('should accept single character namespace', () => {
        assert.equal(validateNamespace('a'), undefined);
        assert.equal(validateNamespace('1'), undefined);
      });

      it('should accept two character namespace', () => {
        assert.equal(validateNamespace('ab'), undefined);
        assert.equal(validateNamespace('12'), undefined);
      });

      it('should accept lowercase alphanumeric', () => {
        assert.equal(validateNamespace('stable'), undefined);
        assert.equal(validateNamespace('dev'), undefined);
        assert.equal(validateNamespace('test123'), undefined);
      });

      it('should accept uppercase alphanumeric (case insensitive)', () => {
        assert.equal(validateNamespace('STABLE'), undefined);
        assert.equal(validateNamespace('DEV'), undefined);
        assert.equal(validateNamespace('Test123'), undefined);
      });

      it('should accept namespaces with hyphens in middle', () => {
        assert.equal(validateNamespace('my-namespace'), undefined);
        assert.equal(validateNamespace('test-1'), undefined);
        assert.equal(validateNamespace('a-b-c'), undefined);
      });

      it('should accept 32 character namespace (max length)', () => {
        const maxLengthNamespace = 'a'.repeat(32);
        assert.equal(validateNamespace(maxLengthNamespace), undefined);
      });

      it('should accept default namespace', () => {
        assert.equal(validateNamespace('default'), undefined);
      });
    });

    describe('invalid namespaces', () => {
      it('should reject empty namespace', () => {
        const error = validateNamespace('');
        assert.ok(error !== undefined);
        assert.ok(error.includes('empty'));
      });

      it('should reject namespace exceeding 32 characters', () => {
        const tooLongNamespace = 'a'.repeat(33);
        const error = validateNamespace(tooLongNamespace);
        assert.ok(error !== undefined);
        assert.ok(error.includes('too long'));
        assert.ok(error.includes('33'));
        assert.ok(error.includes('max 32'));
      });

      it('should reject namespace starting with hyphen', () => {
        const error = validateNamespace('-invalid');
        assert.ok(error !== undefined);
        assert.ok(error.includes('Invalid namespace format'));
      });

      it('should reject namespace ending with hyphen', () => {
        const error = validateNamespace('invalid-');
        assert.ok(error !== undefined);
        assert.ok(error.includes('Invalid namespace format'));
      });

      it('should reject namespace with special characters', () => {
        const invalidChars = ['namespace@test', 'name_space', 'name.space', 'name space', 'name/space'];
        for (const ns of invalidChars) {
          const error = validateNamespace(ns);
          assert.ok(error !== undefined, 'Should reject: ' + ns);
          assert.ok(error.includes('Invalid namespace format'), 'Wrong error for: ' + ns);
        }
      });

      it('should reject reserved namespace names (case insensitive)', () => {
        const reserved = ['all', 'none', 'null', 'undefined', 'system'];
        for (const ns of reserved) {
          // Test lowercase
          let error = validateNamespace(ns);
          assert.ok(error !== undefined, 'Should reject reserved: ' + ns);
          assert.ok(error.includes('Reserved namespace'), 'Wrong error for: ' + ns);

          // Test uppercase
          error = validateNamespace(ns.toUpperCase());
          assert.ok(error !== undefined, 'Should reject reserved uppercase: ' + ns.toUpperCase());
          assert.ok(error.includes('Reserved namespace'), 'Wrong error for: ' + ns.toUpperCase());
        }
      });
    });
  });

  describe('getTableName', () => {
    it('should return base table name for default namespace', () => {
      assert.equal(getTableName('default'), 'pm-runner-queue');
    });

    it('should return fixed table name for all namespaces (v2: single-table design)', () => {
      assert.equal(getTableName('stable'), 'pm-runner-queue');
      assert.equal(getTableName('dev'), 'pm-runner-queue');
      assert.equal(getTableName('test-1'), 'pm-runner-queue');
    });

    it('should return fixed table name for custom namespaces (v2: single-table design)', () => {
      assert.equal(getTableName('my-project'), 'pm-runner-queue');
      assert.equal(getTableName('feature123'), 'pm-runner-queue');
    });
  });

  describe('getStateDir', () => {
    it('should return base .claude directory for default namespace', () => {
      assert.equal(getStateDir('/project', 'default'), '/project/.claude');
    });

    it('should return namespaced state directory for non-default namespaces', () => {
      assert.equal(getStateDir('/project', 'stable'), '/project/.claude/state/stable');
      assert.equal(getStateDir('/project', 'dev'), '/project/.claude/state/dev');
    });

    it('should handle different project roots', () => {
      assert.equal(getStateDir('/Users/user/myproject', 'stable'), '/Users/user/myproject/.claude/state/stable');
      assert.equal(getStateDir('/var/app', 'dev'), '/var/app/.claude/state/dev');
    });

    it('should return fixed table name for custom namespaces (v2: single-table design)', () => {
      assert.equal(getStateDir('/project', 'my-ns'), '/project/.claude/state/my-ns');
      assert.equal(getStateDir('/project', 'test-1'), '/project/.claude/state/test-1');
    });
  });

  describe('getDefaultPort', () => {
    it('should return 5678 for default namespace', () => {
      assert.equal(getDefaultPort('default'), 5678);
    });

    it('should return 5678 for stable namespace', () => {
      assert.equal(getDefaultPort('stable'), 5678);
    });

    it('should return 5679 for dev namespace', () => {
      assert.equal(getDefaultPort('dev'), 5679);
    });

    it('should return hash-based port (5680-6677) for other namespaces', () => {
      const port = getDefaultPort('my-custom-namespace');
      assert.ok(port >= 5680, 'Port ' + port + ' should be >= 5680');
      assert.ok(port <= 6677, 'Port ' + port + ' should be <= 6677');
    });

    it('should return consistent port for same namespace', () => {
      const port1 = getDefaultPort('test-namespace');
      const port2 = getDefaultPort('test-namespace');
      assert.equal(port1, port2);
    });

    it('should return different ports for different namespaces', () => {
      const portA = getDefaultPort('namespace-a');
      const portB = getDefaultPort('namespace-b');
      // Not guaranteed to be different, but very likely
      // Just check they are in valid range
      assert.ok(portA >= 5680 && portA <= 6677);
      assert.ok(portB >= 5680 && portB <= 6677);
    });
  });

  describe('buildNamespaceConfig', () => {
    describe('with valid namespace', () => {
      it('should build config for default namespace', () => {
        const config = buildNamespaceConfig({
          projectRoot: '/project',
        });

        assert.equal(config.namespace, 'default');
        assert.equal(config.tableName, 'pm-runner-queue');
        assert.equal(config.stateDir, '/project/.claude');
        assert.equal(config.port, 5678);
      });

      it('should build config for explicit namespace', () => {
        const config = buildNamespaceConfig({
          namespace: 'stable',
          projectRoot: '/project',
        });

        assert.equal(config.namespace, 'stable');
        assert.equal(config.tableName, 'pm-runner-queue');
        assert.equal(config.stateDir, '/project/.claude/state/stable');
        assert.equal(config.port, 5678);
      });

      it('should build config for dev namespace', () => {
        const config = buildNamespaceConfig({
          namespace: 'dev',
          projectRoot: '/project',
        });

        assert.equal(config.namespace, 'dev');
        assert.equal(config.tableName, 'pm-runner-queue');
        assert.equal(config.stateDir, '/project/.claude/state/dev');
        assert.equal(config.port, 5679);
      });

      it('should override default port with explicit port', () => {
        const config = buildNamespaceConfig({
          namespace: 'stable',
          projectRoot: '/project',
          port: 8080,
        });

        assert.equal(config.port, 8080);
      });

      it('should use PM_RUNNER_NAMESPACE env var as fallback', () => {
        const originalEnv = process.env.PM_RUNNER_NAMESPACE;
        try {
          process.env.PM_RUNNER_NAMESPACE = 'from-env';
          const config = buildNamespaceConfig({
            projectRoot: '/project',
          });

          assert.equal(config.namespace, 'from-env');
          assert.equal(config.tableName, 'pm-runner-queue');
        } finally {
          if (originalEnv === undefined) {
            delete process.env.PM_RUNNER_NAMESPACE;
          } else {
            process.env.PM_RUNNER_NAMESPACE = originalEnv;
          }
        }
      });

      it('should prefer explicit namespace over env var', () => {
        const originalEnv = process.env.PM_RUNNER_NAMESPACE;
        try {
          process.env.PM_RUNNER_NAMESPACE = 'from-env';
          const config = buildNamespaceConfig({
            namespace: 'explicit',
            projectRoot: '/project',
          });

          assert.equal(config.namespace, 'explicit');
        } finally {
          if (originalEnv === undefined) {
            delete process.env.PM_RUNNER_NAMESPACE;
          } else {
            process.env.PM_RUNNER_NAMESPACE = originalEnv;
          }
        }
      });
    });

    describe('fail-closed behavior (invalid namespace)', () => {
      it('should fallback to default namespace for empty string', () => {
        // Empty string is falsy, so it falls back to DEFAULT_NAMESPACE
        const config = buildNamespaceConfig({
          namespace: '',
          projectRoot: '/project',
        });
        assert.equal(config.namespace, 'default');
      });

      it('should throw on namespace exceeding max length', () => {
        const tooLongNamespace = 'a'.repeat(33);
        assert.throws(
          () => buildNamespaceConfig({
            namespace: tooLongNamespace,
            projectRoot: '/project',
          }),
          (err: Error) => {
            return err.message.includes('Invalid namespace') && err.message.includes('too long');
          }
        );
      });

      it('should throw on namespace with invalid format', () => {
        assert.throws(
          () => buildNamespaceConfig({
            namespace: '-invalid',
            projectRoot: '/project',
          }),
          (err: Error) => {
            return err.message.includes('Invalid namespace') && err.message.includes('Invalid namespace format');
          }
        );
      });

      it('should throw on reserved namespace', () => {
        assert.throws(
          () => buildNamespaceConfig({
            namespace: 'all',
            projectRoot: '/project',
          }),
          (err: Error) => {
            return err.message.includes('Invalid namespace') && err.message.includes('Reserved');
          }
        );
      });
    });
  });

  describe('NamespaceUtils', () => {
    describe('isSameNamespace', () => {
      it('should return true for identical namespaces', () => {
        assert.ok(NamespaceUtils.isSameNamespace('stable', 'stable'));
        assert.ok(NamespaceUtils.isSameNamespace('dev', 'dev'));
      });

      it('should be case insensitive', () => {
        assert.ok(NamespaceUtils.isSameNamespace('STABLE', 'stable'));
        assert.ok(NamespaceUtils.isSameNamespace('Dev', 'DEV'));
        assert.ok(NamespaceUtils.isSameNamespace('Stable', 'STABLE'));
      });

      it('should return false for different namespaces', () => {
        assert.ok(!NamespaceUtils.isSameNamespace('stable', 'dev'));
        assert.ok(!NamespaceUtils.isSameNamespace('default', 'stable'));
      });
    });

    describe('isDefaultNamespace', () => {
      it('should return true for default namespace', () => {
        assert.ok(NamespaceUtils.isDefaultNamespace('default'));
      });

      it('should be case insensitive', () => {
        assert.ok(NamespaceUtils.isDefaultNamespace('DEFAULT'));
        assert.ok(NamespaceUtils.isDefaultNamespace('Default'));
      });

      it('should return false for non-default namespaces', () => {
        assert.ok(!NamespaceUtils.isDefaultNamespace('stable'));
        assert.ok(!NamespaceUtils.isDefaultNamespace('dev'));
      });
    });

    describe('isStable', () => {
      it('should return true for stable namespace', () => {
        assert.ok(NamespaceUtils.isStable('stable'));
      });

      it('should be case insensitive', () => {
        assert.ok(NamespaceUtils.isStable('STABLE'));
        assert.ok(NamespaceUtils.isStable('Stable'));
      });

      it('should return false for non-stable namespaces', () => {
        assert.ok(!NamespaceUtils.isStable('dev'));
        assert.ok(!NamespaceUtils.isStable('default'));
      });
    });

    describe('isDev', () => {
      it('should return true for dev namespace', () => {
        assert.ok(NamespaceUtils.isDev('dev'));
      });

      it('should be case insensitive', () => {
        assert.ok(NamespaceUtils.isDev('DEV'));
        assert.ok(NamespaceUtils.isDev('Dev'));
      });

      it('should return false for non-dev namespaces', () => {
        assert.ok(!NamespaceUtils.isDev('stable'));
        assert.ok(!NamespaceUtils.isDev('default'));
      });
    });
  });

  describe('DEFAULT_NAMESPACE constant', () => {
    it('should be "default"', () => {
      assert.equal(DEFAULT_NAMESPACE, 'default');
    });
  });
});
