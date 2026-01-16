/**
 * Claude Code CLI Integration Test
 *
 * Tests executor-only mode with:
 * - Evidence saving to .claude/evidence
 * - Session management
 *
 * Based on 04_COMPONENTS.md L85-110 (Executor Interface)
 * and 06_CORRECTNESS_PROPERTIES.md L69-76 (Property 5)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CLI, parseArgs, validateArgs, CLIError } from '../../src/cli/cli-interface';
import { OverallStatus } from '../../src/models/enums';

describe('Claude Code CLI Integration', () => {
  let tempDir: string;
  let projectDir: string;
  let evidenceDir: string;
  let cli: CLI;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cli-test-'));
    projectDir = path.join(tempDir, 'project');
    evidenceDir = path.join(tempDir, '.claude', 'evidence');

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });

    cli = new CLI({
      evidenceDir: evidenceDir,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('parseArgs', () => {
    it('should parse start command with project path', () => {
      const args = parseArgs(['start', '/path/to/project']);
      assert.equal(args.command, 'start');
      assert.equal(args.projectPath, '/path/to/project');
    });

    it('should parse continue command with session id', () => {
      const args = parseArgs(['continue', 'session-123']);
      assert.equal(args.command, 'continue');
      assert.equal(args.sessionId, 'session-123');
    });

    it('should parse status command with session id', () => {
      const args = parseArgs(['status', 'session-456']);
      assert.equal(args.command, 'status');
      assert.equal(args.sessionId, 'session-456');
    });

    it('should parse --help flag', () => {
      const args = parseArgs(['--help']);
      assert.equal(args.help, true);
    });

    it('should parse --version flag', () => {
      const args = parseArgs(['--version']);
      assert.equal(args.version, true);
    });

    it('should parse options', () => {
      const args = parseArgs([
        'start', '/path/to/project',
        '--verbose',
        '--config', '/path/to/config.yaml',
        '--output', '/path/to/output.json',
        '--max-files', '10',
        '--max-tests', '30',
        '--max-seconds', '300'
      ]);

      assert.equal(args.command, 'start');
      assert.equal(args.projectPath, '/path/to/project');
      assert.equal(args.verbose, true);
      assert.equal(args.configPath, '/path/to/config.yaml');
      assert.equal(args.outputPath, '/path/to/output.json');
      assert.equal(args.limits?.max_files, 10);
      assert.equal(args.limits?.max_tests, 30);
      assert.equal(args.limits?.max_seconds, 300);
    });

    it('should parse --dry-run flag', () => {
      const args = parseArgs(['start', '/path', '--dry-run']);
      assert.equal(args.dryRun, true);
    });

    it('should parse --quiet flag', () => {
      const args = parseArgs(['start', '/path', '--quiet']);
      assert.equal(args.quiet, true);
    });

    it('should parse --stream flag', () => {
      const args = parseArgs(['start', '/path', '--stream']);
      assert.equal(args.stream, true);
    });

    it('should parse --format option', () => {
      const args = parseArgs(['start', '/path', '--format', 'compact']);
      assert.equal(args.format, 'compact');
    });
  });

  describe('validateArgs', () => {
    it('should accept valid start command', () => {
      const args = validateArgs({ command: 'start', projectPath: '/path' });
      assert.equal(args.command, 'start');
    });

    it('should accept valid continue command', () => {
      const args = validateArgs({ command: 'continue', sessionId: 'session-123' });
      assert.equal(args.command, 'continue');
    });

    it('should accept valid status command', () => {
      const args = validateArgs({ command: 'status', sessionId: 'session-456' });
      assert.equal(args.command, 'status');
    });

    it('should reject start command without project path', () => {
      assert.throws(() => {
        validateArgs({ command: 'start' });
      }, CLIError);
    });

    it('should reject continue command without session id', () => {
      assert.throws(() => {
        validateArgs({ command: 'continue' });
      }, CLIError);
    });

    it('should reject unknown command', () => {
      assert.throws(() => {
        validateArgs({ command: 'unknown' });
      }, CLIError);
    });

    it('should reject conflicting verbose and quiet flags', () => {
      assert.throws(() => {
        validateArgs({ command: 'start', projectPath: '/path', verbose: true, quiet: true });
      }, CLIError);
    });

    it('should reject invalid limits', () => {
      assert.throws(() => {
        validateArgs({ command: 'start', projectPath: '/path', limits: { max_files: 0 } });
      }, CLIError);

      assert.throws(() => {
        validateArgs({ command: 'start', projectPath: '/path', limits: { max_tests: 0 } });
      }, CLIError);

      assert.throws(() => {
        validateArgs({ command: 'start', projectPath: '/path', limits: { max_seconds: 10 } });
      }, CLIError);
    });

    it('should accept help flag without command', () => {
      const args = validateArgs({ help: true });
      assert.equal(args.help, true);
    });

    it('should accept version flag', () => {
      const args = validateArgs({ version: true });
      assert.equal(args.version, true);
    });
  });

  describe('CLI.run', () => {
    it('should return help text when --help is passed', async () => {
      const result = await cli.run(['--help']);
      assert.ok(result.help);
      assert.ok(result.help.includes('Commands:'));
    });

    it('should return version when --version is passed', async () => {
      const result = await cli.run(['--version']);
      assert.equal(result.version, '0.1.0');
    });

    it('should return command-specific help', async () => {
      const result = await cli.run(['start', '--help']);
      assert.ok(result.help);
      assert.ok(result.help.includes('--max-files'));
    });

    it('should handle dry run', async () => {
      // Create a simple project structure
      fs.writeFileSync(
        path.join(projectDir, 'pm-orchestrator.yaml'),
        'project:\n  name: test-project\n  version: 1.0.0\n'
      );

      const result = await cli.run(['start', projectDir, '--dry-run']);
      assert.equal(result.dry_run, true);
      assert.equal(result.would_execute, true);
    });

    it('should throw error for non-existent project path', async () => {
      try {
        await cli.run(['start', '/nonexistent/path']);
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.ok(err instanceof CLIError);
      }
    });

    it('should throw error for non-existent config file', async () => {
      fs.mkdirSync(projectDir, { recursive: true });

      try {
        await cli.run(['start', projectDir, '--config', '/nonexistent/config.yaml']);
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.ok(err instanceof CLIError);
      }
    });
  });

  describe('CLI exit codes', () => {
    it('should return correct exit codes for each status', () => {
      assert.equal(cli.getExitCodeForStatus(OverallStatus.COMPLETE), 0);
      assert.equal(cli.getExitCodeForStatus(OverallStatus.INCOMPLETE), 1);
      assert.equal(cli.getExitCodeForStatus(OverallStatus.NO_EVIDENCE), 2);
      assert.equal(cli.getExitCodeForStatus(OverallStatus.ERROR), 3);
      assert.equal(cli.getExitCodeForStatus(OverallStatus.INVALID), 4);
    });
  });

  describe('CLI error formatting', () => {
    it('should format CLIError correctly', () => {
      const error = new CLIError('E101_CONFIG_FILE_NOT_FOUND' as any, 'Config not found');
      const formatted = JSON.parse(cli.formatError(error));

      assert.ok(formatted.error);
      assert.equal(formatted.error.message, 'Config not found');
      assert.equal(formatted.error.code, 'E101_CONFIG_FILE_NOT_FOUND');
    });

    it('should format generic Error correctly', () => {
      const error = new Error('Something went wrong');
      const formatted = JSON.parse(cli.formatError(error));

      assert.ok(formatted.error);
      assert.equal(formatted.error.message, 'Something went wrong');
    });

    it('should include stack in verbose mode', () => {
      cli.setVerbose(true);
      const error = new Error('Test error');
      const formatted = JSON.parse(cli.formatError(error));

      assert.ok(formatted.error.stack);
    });
  });

  describe('Session management', () => {
    it('should track current session ID', async () => {
      // Initially null
      assert.equal(cli.getCurrentSessionId(), null);
    });

    it('should handle signals', () => {
      // Should not throw
      cli.handleSignal('SIGINT');
    });
  });

  describe('verbose and quiet modes', () => {
    it('should set verbose mode', () => {
      cli.setVerbose(true);
      // No assertion needed - just verify it doesn't throw
    });

    it('should set quiet mode', () => {
      cli.setQuiet(true);
      // No assertion needed - just verify it doesn't throw
    });
  });
});
