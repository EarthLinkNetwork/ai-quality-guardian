/**
 * REPL Tab Completion Tests
 *
 * Tests for slash command tab completion in REPL interface.
 * Per spec 10_REPL_UX.md: These commands are allowed:
 *   /help /init /model /start /continue /status /tasks /approve /exit
 *   /provider /models /keys /logs (new in spec update)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { REPLInterface } from '../../../src/repl/repl-interface';

describe('REPL Tab Completion', () => {
  let tempDir: string;
  let repl: REPLInterface;

  // Spec-defined commands (20 total: spec commands + clear/version for typo rescue + template commands)
  const SPEC_COMMANDS = [
    '/help', '/init', '/model', '/start', '/continue',
    '/status', '/tasks', '/approve', '/exit',
    // New commands per spec 10_REPL_UX.md update
    '/provider', '/models', '/keys', '/logs', '/respond',
    // Conversation trace command per spec 28_CONVERSATION_TRACE.md
    '/trace',
    // Additional utility commands (for typo rescue support)
    '/clear', '/version',
    // Template and Config commands per spec 32 and 33
    '/templates', '/template', '/config'
  ];

  beforeEach(() => {
    // Create temp directory with minimal .claude structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-tab-completion-'));
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');

    repl = new REPLInterface({ projectPath: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Access private completer method for testing
   */
  function getCompleter(replInstance: REPLInterface): (line: string) => [string[], string] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (replInstance as any).completer.bind(replInstance);
  }

  describe('Spec compliance', () => {
    it('should return exactly 20 commands for "/" (spec list + clear/version + template commands, no /quit)', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/');

      assert.equal(line, '/');
      assert.equal(completions.length, 20, 'Should return exactly 20 commands');

      // Verify all spec commands are present
      for (const cmd of SPEC_COMMANDS) {
        assert.ok(completions.includes(cmd), 'Should include ' + cmd);
      }

      // Verify /quit is NOT included
      assert.ok(!completions.includes('/quit'), '/quit must NOT be in completions');
    });

    it('should return exactly ["/start", "/status"] for "/st"', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/st');

      assert.equal(line, '/st');
      assert.equal(completions.length, 2, 'Should return exactly 2 commands');
      assert.ok(completions.includes('/start'), 'Should include /start');
      assert.ok(completions.includes('/status'), 'Should include /status');
    });

    it('should return [] for "hello" (non-slash input)', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('hello');

      assert.equal(line, 'hello');
      assert.deepEqual(completions, [], 'Should return empty array');
    });

    it('should return [] for "/unknown" (no match)', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/unknown');

      assert.equal(line, '/unknown');
      assert.deepEqual(completions, [], 'Should return empty array for unknown command');
    });
  });

  describe('Fail-closed: /quit rejection', () => {
    it('should reject /quit as unknown command (ERROR)', async () => {
      const result = await repl.processCommand('/quit');

      assert.equal(result.success, false, '/quit should fail');
      // Unknown command returns error per spec
    });
  });

  describe('New commands tab completion', () => {
    it('should complete /pro to /provider', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/pro');

      assert.equal(line, '/pro');
      assert.deepEqual(completions, ['/provider']);
    });

    it('should complete /mod to /model and /models', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/mod');

      assert.equal(line, '/mod');
      assert.equal(completions.length, 2);
      assert.ok(completions.includes('/model'));
      assert.ok(completions.includes('/models'));
    });

    it('should complete /ke to /keys', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/ke');

      assert.equal(line, '/ke');
      assert.deepEqual(completions, ['/keys']);
    });

    it('should complete /lo to /logs', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/lo');

      assert.equal(line, '/lo');
      assert.deepEqual(completions, ['/logs']);
    });
  });

  describe('Additional edge cases', () => {
    it('should complete /he to /help', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/he');

      assert.equal(line, '/he');
      assert.deepEqual(completions, ['/help']);
    });

    it('should complete /con to /config and /continue', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/con');

      assert.equal(line, '/con');
      // Both /config and /continue match /con
      assert.ok(completions.includes('/continue'), 'should include /continue');
      assert.ok(completions.includes('/config'), 'should include /config');
      assert.equal(completions.length, 2, 'should have exactly 2 matches');
    });

    it('should return [] for empty input', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('');

      assert.equal(line, '');
      assert.deepEqual(completions, []);
    });

    it('should be case-sensitive (no match for /HELP)', () => {
      const completer = getCompleter(repl);
      const [completions, line] = completer('/HELP');

      assert.equal(line, '/HELP');
      assert.deepEqual(completions, [], 'Commands are lowercase');
    });
  });
});
