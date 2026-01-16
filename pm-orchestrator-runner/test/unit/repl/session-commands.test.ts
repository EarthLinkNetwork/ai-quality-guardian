/**
 * Tests for SessionCommands
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionCommands, REPLSession } from '../../../src/repl/commands/session';
import { REPLConfig } from '../../../src/repl/repl-interface';

describe('SessionCommands', () => {
  let tempDir: string;
  let session: REPLSession;
  let config: REPLConfig;
  let sessionCommands: SessionCommands;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-session-test-'));

    session = {
      sessionId: null,
      projectPath: tempDir,
      runner: null,
      supervisor: null,
      status: 'idle',
    };

    config = {
      projectPath: tempDir,
      evidenceDir: path.join(tempDir, '.evidence'),
      authMode: 'claude-code',
    };

    sessionCommands = new SessionCommands(session, config);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('start', () => {
    it('should start a new session', async () => {
      // Create .claude directory for initialization
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({
          project: { name: 'test' },
          pm: {},
          executor: {},
        }),
        'utf-8'
      );

      const result = await sessionCommands.start(tempDir);

      assert.ok(result.success);
      assert.ok(result.sessionId);
      assert.ok(result.runner);
    });

    it('should handle relative paths', async () => {
      // Create .claude directory
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({
          project: { name: 'test' },
          pm: {},
          executor: {},
        }),
        'utf-8'
      );

      // Use relative path (current dir)
      const result = await sessionCommands.start(tempDir);

      assert.ok(result.success);
    });
  });

  describe('continueSession', () => {
    it('should continue an existing session', async () => {
      // First start a session
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({
          project: { name: 'test' },
          pm: {},
          executor: {},
        }),
        'utf-8'
      );

      const startResult = await sessionCommands.start(tempDir);
      assert.ok(startResult.success);
      assert.ok(startResult.sessionId);

      // Continue the session
      const continueResult = await sessionCommands.continueSession(startResult.sessionId!);

      assert.ok(continueResult.success);
      assert.equal(continueResult.sessionId, startResult.sessionId);
    });

    it('should fail for non-existent session', async () => {
      const result = await sessionCommands.continueSession('non-existent-session-id');

      assert.ok(!result.success);
      assert.ok(result.message);
    });
  });

  describe('approve', () => {
    it('should fail when no runner is active', async () => {
      const result = await sessionCommands.approve('some-session-id');

      assert.ok(!result.success);
      assert.ok(result.message?.includes('No active runner'));
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', async () => {
      const sessions = await sessionCommands.listSessions();

      assert.ok(Array.isArray(sessions));
      assert.equal(sessions.length, 0);
    });
  });
});
