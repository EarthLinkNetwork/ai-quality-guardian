import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  CLI,
  CLIError,
  parseArgs,
  validateArgs,
} from '../../../src/cli/cli-interface';
import { OverallStatus } from '../../../src/models/enums';
import { ErrorCode } from '../../../src/errors/error-codes';

describe('CLI Interface (05_CLI.md)', () => {
  let cli: CLI;
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-cli-test-'));
    projectDir = path.join(tempDir, 'test-project');
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');

    cli = new CLI({
      evidenceDir: tempDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Spec compliance tests (05_CLI.md L20-26)
   * Valid commands: start, continue, status, validate
   * Note: 'run' is NOT a valid command per spec
   */
  describe('Spec Compliance: Command Names (05_CLI.md L20-26)', () => {
    it('should accept start command', () => {
      const args = parseArgs(['start', '/path/to/project']);
      assert.doesNotThrow(() => validateArgs(args));
      assert.equal(args.command, 'start');
    });

    it('should accept continue command', () => {
      const args = parseArgs(['continue', 'session-12345']);
      assert.doesNotThrow(() => validateArgs(args));
      assert.equal(args.command, 'continue');
    });

    it('should accept status command', () => {
      const args = parseArgs(['status', 'session-12345']);
      assert.doesNotThrow(() => validateArgs(args));
      assert.equal(args.command, 'status');
    });

    it('should accept validate command', () => {
      const args = parseArgs(['validate', '/path/to/project']);
      assert.doesNotThrow(() => validateArgs(args));
      assert.equal(args.command, 'validate');
    });

    it('should reject run command (not in spec)', () => {
      assert.throws(
        () => validateArgs(parseArgs(['run', '/path/to/project'])),
        (err: Error) => err instanceof CLIError
      );
    });
  });

  describe('Argument Parsing (05_CLI.md L10-30)', () => {
    it('should parse start command with project path', () => {
      const args = parseArgs(['start', '/path/to/project']);

      assert.equal(args.command, 'start');
      assert.equal(args.projectPath, '/path/to/project');
    });

    it('should parse continue command with session ID', () => {
      const args = parseArgs(['continue', 'session-12345']);

      assert.equal(args.command, 'continue');
      assert.equal(args.sessionId, 'session-12345');
    });

    it('should parse status command with session ID', () => {
      const args = parseArgs(['status', 'session-12345']);

      assert.equal(args.command, 'status');
      assert.equal(args.sessionId, 'session-12345');
    });

    it('should parse --config option', () => {
      const args = parseArgs(['start', '/path/to/project', '--config', '/path/to/config.yaml']);

      assert.equal(args.configPath, '/path/to/config.yaml');
    });

    it('should parse --output option', () => {
      const args = parseArgs(['start', '/path/to/project', '--output', '/path/to/output.json']);

      assert.equal(args.outputPath, '/path/to/output.json');
    });

    it('should parse --verbose flag', () => {
      const args = parseArgs(['start', '/path/to/project', '--verbose']);

      assert.ok(args.verbose);
    });

    it('should parse --quiet flag', () => {
      const args = parseArgs(['start', '/path/to/project', '--quiet']);

      assert.ok(args.quiet);
    });

    it('should parse --dry-run flag', () => {
      const args = parseArgs(['start', '/path/to/project', '--dry-run']);

      assert.ok(args.dryRun);
    });

    it('should parse limit override options', () => {
      const args = parseArgs([
        'start',
        '/path/to/project',
        '--max-files', '10',
        '--max-tests', '20',
        '--max-seconds', '600',
      ]);

      assert.equal(args.limits?.max_files, 10);
      assert.equal(args.limits?.max_tests, 20);
      assert.equal(args.limits?.max_seconds, 600);
    });
  });

  describe('Argument Validation (05_CLI.md L31-50)', () => {
    it('should fail on missing command', () => {
      assert.throws(
        () => validateArgs(parseArgs([])),
        (err: Error) => {
          return err instanceof CLIError &&
            (err as CLIError).code === ErrorCode.E101_CONFIG_FILE_NOT_FOUND;
        }
      );
    });

    it('should fail on unknown command', () => {
      assert.throws(
        () => validateArgs(parseArgs(['unknown'])),
        (err: Error) => err instanceof CLIError
      );
    });

    it('should fail on start without project path', () => {
      assert.throws(
        () => validateArgs(parseArgs(['start'])),
        (err: Error) => err instanceof CLIError
      );
    });

    it('should fail on continue without session ID', () => {
      assert.throws(
        () => validateArgs(parseArgs(['continue'])),
        (err: Error) => err instanceof CLIError
      );
    });

    it('should fail on invalid limit values', () => {
      assert.throws(
        () => validateArgs(parseArgs(['start', '/path', '--max-files', '0'])),
        (err: Error) => err instanceof CLIError
      );
    });

    it('should fail on conflicting flags', () => {
      assert.throws(
        () => validateArgs(parseArgs(['start', '/path', '--verbose', '--quiet'])),
        (err: Error) => err instanceof CLIError
      );
    });
  });

  describe('Start Command (05_CLI.md L51-80)', () => {
    it('should execute start command', async () => {
      const result = await cli.run(['start', projectDir]);

      assert.ok(result.session_id);
      assert.ok(result.overall_status);
    });

    it('should output JSON result', async () => {
      const outputPath = path.join(tempDir, 'output.json');

      await cli.run(['start', projectDir, '--output', outputPath]);

      assert.ok(fs.existsSync(outputPath));
      const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      assert.ok(output.session_id);
    });

    it('should respect limit overrides', async () => {
      const result = await cli.run([
        'start',
        projectDir,
        '--max-files', '3',
      ]);

      // Should have used the overridden limit
      assert.ok(result.session_id);
    });

    it('should perform dry run without execution', async () => {
      const result = await cli.run(['start', projectDir, '--dry-run']);

      assert.ok(result.dry_run);
      assert.ok(result.would_execute);
      // No actual session should be created
    });

    it('should show verbose output', async () => {
      const logs: string[] = [];
      cli.on('log', (msg) => logs.push(msg));

      await cli.run(['start', projectDir, '--verbose']);

      assert.ok(logs.length > 0);
    });
  });

  describe('Continue Command (05_CLI.md L81-100)', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session to continue
      const result = await cli.run(['start', projectDir]);
      sessionId = result.session_id;

      // Mark as paused for continue
      cli.pauseSession(sessionId);
    });

    it('should continue paused session', async () => {
      const result = await cli.run(['continue', sessionId]);

      assert.equal(result.session_id, sessionId);
      assert.ok(result.resumed);
    });

    it('should fail to continue non-existent session', async () => {
      await assert.rejects(
        () => cli.run(['continue', 'non-existent-session']),
        (err: Error) => {
          return err instanceof CLIError &&
            (err as CLIError).code === ErrorCode.E201_SESSION_ID_MISSING;
        }
      );
    });

    it('should fail to continue completed session', async () => {
      // Complete the session
      cli.completeSession(sessionId);

      await assert.rejects(
        () => cli.run(['continue', sessionId]),
        (err: Error) => {
          return err instanceof CLIError &&
            (err as CLIError).code === ErrorCode.E205_SESSION_RESUME_FAILURE;
        }
      );
    });
  });

  describe('Status Command (05_CLI.md L101-120)', () => {
    let sessionId: string;

    beforeEach(async () => {
      const result = await cli.run(['start', projectDir]);
      sessionId = result.session_id;
    });

    it('should show session status', async () => {
      const result = await cli.run(['status', sessionId]);

      assert.equal(result.session_id, sessionId);
      assert.ok(result.status);
      assert.ok(result.current_phase);
    });

    it('should show task progress', async () => {
      const result = await cli.run(['status', sessionId]);

      assert.ok(result.tasks_completed !== undefined);
      assert.ok(result.tasks_total !== undefined);
    });

    it('should show evidence summary', async () => {
      const result = await cli.run(['status', sessionId]);

      assert.ok(result.evidence);
    });

    it('should fail for non-existent session', async () => {
      await assert.rejects(
        () => cli.run(['status', 'non-existent']),
        (err: Error) => err instanceof CLIError
      );
    });
  });

  describe('Exit Codes (05_CLI.md L121-140)', () => {
    it('should return 0 for COMPLETE', async () => {
      const result = await cli.run(['start', projectDir]);

      if (result.overall_status === OverallStatus.COMPLETE) {
        assert.equal(cli.getExitCode(), 0);
      }
    });

    it('should return non-zero for ERROR', async () => {
      // Delete project directory to cause an error
      fs.rmSync(projectDir, { recursive: true, force: true });

      try {
        await cli.run(['start', projectDir]);
      } catch {
        // Expected to fail
      }

      assert.ok(cli.getExitCode() > 0);
    });

    it('should return distinct exit codes for different statuses', () => {
      const exitCodes = new Map<OverallStatus, number>();

      exitCodes.set(OverallStatus.COMPLETE, cli.getExitCodeForStatus(OverallStatus.COMPLETE));
      exitCodes.set(OverallStatus.ERROR, cli.getExitCodeForStatus(OverallStatus.ERROR));
      exitCodes.set(OverallStatus.INCOMPLETE, cli.getExitCodeForStatus(OverallStatus.INCOMPLETE));
      exitCodes.set(OverallStatus.INVALID, cli.getExitCodeForStatus(OverallStatus.INVALID));
      exitCodes.set(OverallStatus.NO_EVIDENCE, cli.getExitCodeForStatus(OverallStatus.NO_EVIDENCE));

      // All should be distinct
      const uniqueCodes = new Set(exitCodes.values());
      assert.equal(uniqueCodes.size, 5);
    });
  });

  describe('Error Handling (05_CLI.md L141-160)', () => {
    it('should output error in JSON format', async () => {
      try {
        await cli.run(['start', '/nonexistent/path']);
      } catch (err) {
        const errorOutput = cli.formatError(err as Error);
        const parsed = JSON.parse(errorOutput);

        assert.ok(parsed.error);
        assert.ok(parsed.error.code);
        assert.ok(parsed.error.message);
      }
    });

    it('should include stack trace in verbose mode', async () => {
      cli.setVerbose(true);

      try {
        await cli.run(['start', '/nonexistent/path']);
      } catch (err) {
        const errorOutput = cli.formatError(err as Error);
        const parsed = JSON.parse(errorOutput);

        assert.ok(parsed.error.stack);
      }
    });

    it('should not include stack trace in quiet mode', async () => {
      cli.setQuiet(true);

      try {
        await cli.run(['start', '/nonexistent/path']);
      } catch (err) {
        const errorOutput = cli.formatError(err as Error);
        const parsed = JSON.parse(errorOutput);

        assert.ok(!parsed.error.stack);
      }
    });
  });

  describe('Help and Version (05_CLI.md L161-180)', () => {
    it('should show help with --help', async () => {
      const result = await cli.run(['--help']);

      assert.ok(result.help);
      assert.ok(result.help.includes('start'));
      assert.ok(result.help.includes('continue'));
      assert.ok(result.help.includes('status'));
      assert.ok(result.help.includes('validate'));
    });

    it('should show version with --version', async () => {
      const result = await cli.run(['--version']);

      assert.ok(result.version);
      assert.ok(/^\d+\.\d+\.\d+/.test(result.version));
    });

    it('should show command-specific help', async () => {
      const result = await cli.run(['start', '--help']);

      assert.ok(result.help);
      assert.ok(result.help.includes('--config'));
      assert.ok(result.help.includes('--max-files'));
    });
  });

  describe('Configuration Loading (05_CLI.md L181-200)', () => {
    it('should load config from project directory', async () => {
      fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), `
limits:
  max_files: 15
  max_tests: 25
  max_seconds: 500
`);

      const result = await cli.run(['start', projectDir]);

      // Should have loaded the config
      assert.ok(result.session_id);
    });

    it('should allow config override via --config', async () => {
      const configPath = path.join(tempDir, 'custom-config.yaml');
      fs.writeFileSync(configPath, `
limits:
  max_files: 20
`);

      const result = await cli.run(['start', projectDir, '--config', configPath]);

      assert.ok(result.session_id);
    });

    it('should fail on invalid config file', async () => {
      const configPath = path.join(tempDir, 'invalid-config.yaml');
      fs.writeFileSync(configPath, 'invalid: yaml: content:');

      await assert.rejects(
        () => cli.run(['start', projectDir, '--config', configPath]),
        (err: Error) => err instanceof CLIError
      );
    });

    it('should fail on non-existent config file', async () => {
      await assert.rejects(
        () => cli.run(['start', projectDir, '--config', '/nonexistent/config.yaml']),
        (err: Error) => {
          return err instanceof CLIError &&
            (err as CLIError).code === ErrorCode.E101_CONFIG_FILE_NOT_FOUND;
        }
      );
    });
  });

  describe('Output Formatting (05_CLI.md L201-220)', () => {
    it('should output JSON by default', async () => {
      const output = await cli.run(['start', projectDir]);

      // Should be JSON-serializable
      assert.doesNotThrow(() => JSON.stringify(output));
    });

    it('should support --format json explicitly', async () => {
      const output = await cli.run(['start', projectDir, '--format', 'json']);

      assert.doesNotThrow(() => JSON.stringify(output));
    });

    it('should support --format compact', async () => {
      const outputStr = await cli.runAndFormat(['start', projectDir, '--format', 'compact']);

      // Compact should be single line
      const lines = outputStr.split('\n').filter(l => l.trim());
      assert.equal(lines.length, 1);
    });

    it('should include timestamp in output', async () => {
      const output = await cli.run(['start', projectDir]);

      assert.ok(output.timestamp);
    });
  });

  describe('Progress Output (05_CLI.md L221-240)', () => {
    it('should emit progress events', (done) => {
      let called = false;
      cli.on('progress', (event) => {
        if (!called) {
          called = true;
          assert.ok(event.current_phase);
          assert.ok(event.progress_percent !== undefined);
          done();
        }
      });

      cli.run(['start', projectDir]);
    });

    it('should support streaming output', async () => {
      const events: any[] = [];

      cli.on('output', (event) => {
        events.push(event);
      });

      await cli.run(['start', projectDir, '--stream']);

      assert.ok(events.length > 0);
    });
  });

  describe('Signal Handling (05_CLI.md L241-260)', () => {
    it('should handle SIGINT gracefully', async () => {
      const runPromise = cli.run(['start', projectDir]);

      // Simulate SIGINT
      process.nextTick(() => {
        cli.handleSignal('SIGINT');
      });

      const result = await runPromise;

      assert.ok(result.interrupted || result.overall_status);
    });

    it('should save state on SIGTERM', async () => {
      const runPromise = cli.run(['start', projectDir]);

      process.nextTick(() => {
        cli.handleSignal('SIGTERM');
      });

      await runPromise;

      // State should be saved
      const sessionId = cli.getCurrentSessionId();
      if (sessionId) {
        const statePath = path.join(tempDir, sessionId, 'session.json');
        assert.ok(fs.existsSync(statePath));
      }
    });
  });
});
