import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ConfigurationManager,
  Configuration,
  ConfigurationError,
} from '../../../src/config/configuration-manager';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('Configuration Manager (04_COMPONENTS.md L52-82)', () => {
  let tempDir: string;
  let configManager: ConfigurationManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-test-'));
    configManager = new ConfigurationManager();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Required Project Structure (04_COMPONENTS.md L64-66)', () => {
    it('should require .claude directory', () => {
      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E101_MISSING_CLAUDE_DIRECTORY;
        }
      );
    });

    it('should require CLAUDE.md', () => {
      fs.mkdirSync(path.join(tempDir, '.claude'));
      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E103_CONFIGURATION_FILE_MISSING;
        }
      );
    });

    it('should require settings.json', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.mkdirSync(path.join(claudeDir, 'agents'));
      fs.mkdirSync(path.join(claudeDir, 'rules'));

      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E103_CONFIGURATION_FILE_MISSING;
        }
      );
    });

    it('should require agents directory', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
      fs.mkdirSync(path.join(claudeDir, 'rules'));

      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E103_CONFIGURATION_FILE_MISSING;
        }
      );
    });

    it('should require rules directory', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
      fs.mkdirSync(path.join(claudeDir, 'agents'));

      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E103_CONFIGURATION_FILE_MISSING;
        }
      );
    });

    it('should accept complete project structure', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
      fs.mkdirSync(path.join(claudeDir, 'agents'));
      fs.mkdirSync(path.join(claudeDir, 'rules'));

      const config = configManager.loadConfiguration(tempDir);
      assert.ok(config);
    });
  });

  describe('Configuration Schema (04_COMPONENTS.md L69-82)', () => {
    function createValidProjectStructure(): void {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.mkdirSync(path.join(claudeDir, 'agents'));
      fs.mkdirSync(path.join(claudeDir, 'rules'));
    }

    it('should apply default task_limits.files (5)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.task_limits.files, 5);
    });

    it('should apply default task_limits.tests (10)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.task_limits.tests, 10);
    });

    it('should apply default task_limits.seconds (300)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.task_limits.seconds, 300);
    });

    it('should validate task_limits.files range (1-20)', () => {
      createValidProjectStructure();
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'settings.json'),
        JSON.stringify({ task_limits: { files: 25 } })
      );
      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE;
        }
      );
    });

    it('should validate task_limits.tests range (1-50)', () => {
      createValidProjectStructure();
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'settings.json'),
        JSON.stringify({ task_limits: { tests: 60 } })
      );
      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE;
        }
      );
    });

    it('should validate task_limits.seconds range (30-900)', () => {
      createValidProjectStructure();
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'settings.json'),
        JSON.stringify({ task_limits: { seconds: 1000 } })
      );
      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE;
        }
      );
    });

    it('should apply default parallel_limits.subagents (9)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.parallel_limits.subagents, 9);
    });

    it('should apply default parallel_limits.executors (4)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.parallel_limits.executors, 4);
    });

    it('should validate parallel_limits.subagents max (9)', () => {
      createValidProjectStructure();
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'settings.json'),
        JSON.stringify({ parallel_limits: { subagents: 10 } })
      );
      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE;
        }
      );
    });

    it('should validate parallel_limits.executors max (4)', () => {
      createValidProjectStructure();
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'settings.json'),
        JSON.stringify({ parallel_limits: { executors: 5 } })
      );
      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE;
        }
      );
    });

    it('should apply default timeouts.deadlock_timeout_seconds (60)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.timeouts.deadlock_timeout_seconds, 60);
    });

    it('should apply default timeouts.operation_timeout_seconds (120)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.timeouts.operation_timeout_seconds, 120);
    });

    it('should apply default evidence_settings.retention_days (30)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.evidence_settings.retention_days, 30);
    });

    it('should apply default evidence_settings.compression_enabled (true)', () => {
      createValidProjectStructure();
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      const config = configManager.loadConfiguration(tempDir);
      assert.equal(config.evidence_settings.compression_enabled, true);
    });
  });

  describe('Configuration Error Handling (Property 3)', () => {
    it('should fail on malformed JSON', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), 'invalid json');
      fs.mkdirSync(path.join(claudeDir, 'agents'));
      fs.mkdirSync(path.join(claudeDir, 'rules'));

      assert.throws(
        () => configManager.loadConfiguration(tempDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E105_CRITICAL_CONFIGURATION_CORRUPTION;
        }
      );
    });

    it('should not infer or guess missing configuration', () => {
      // This test ensures no inference or defaults for malformed config
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{ invalid }');
      fs.mkdirSync(path.join(claudeDir, 'agents'));
      fs.mkdirSync(path.join(claudeDir, 'rules'));

      assert.throws(() => configManager.loadConfiguration(tempDir));
    });
  });

  describe('Project Resolution Rules (04_COMPONENTS.md L21-29)', () => {
    it('should not traverse parent directories', () => {
      // Create valid project in parent
      const parentDir = tempDir;
      const claudeDir = path.join(parentDir, '.claude');
      fs.mkdirSync(claudeDir);
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
      fs.mkdirSync(path.join(claudeDir, 'agents'));
      fs.mkdirSync(path.join(claudeDir, 'rules'));

      // Create child directory without .claude
      const childDir = path.join(parentDir, 'child');
      fs.mkdirSync(childDir);

      // Should fail for child, not use parent's .claude
      assert.throws(
        () => configManager.loadConfiguration(childDir),
        (err: Error) => {
          return err instanceof ConfigurationError &&
            (err as ConfigurationError).code === ErrorCode.E101_MISSING_CLAUDE_DIRECTORY;
        }
      );
    });

    it('should show clear error message with missing path', () => {
      try {
        configManager.loadConfiguration(tempDir);
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof ConfigurationError);
        assert.ok((err as ConfigurationError).message.includes('.claude'));
      }
    });
  });
});
