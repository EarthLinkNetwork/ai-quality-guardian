/**
 * Claude Hooks Routes Integration Tests
 *
 * Tests for /api/claude-hooks/* endpoints:
 * - Hooks CRUD (list events, read, create/update, delete)
 * - Scripts CRUD (list, read, write, delete)
 * - Inconsistency detection
 * - Scope switching (global vs project)
 *
 * Uses temp directories to avoid writing to real ~/.claude.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createClaudeHooksRoutes } from '../../../../src/web/routes/claude-hooks';

describe('Claude Hooks Routes', () => {
  let app: express.Express;
  let tmpDir: string;
  let globalTmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hooks-test-'));
    globalTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hooks-global-'));

    app = express();
    app.use(express.json());
    app.use('/api/claude-hooks', createClaudeHooksRoutes({
      projectRoot: tmpDir,
      globalClaudeDir: globalTmpDir,
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(globalTmpDir, { recursive: true, force: true });
  });

  // =====================
  // Hooks CRUD
  // =====================
  describe('Hooks CRUD', () => {
    it('should list empty events when settings.json does not exist', async () => {
      const res = await request(app).get('/api/claude-hooks/project');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.events, []);
      assert.equal(res.body.eventCount, 0);
      assert.equal(res.body.settingsExists, false);
      assert.ok(res.body.knownEvents.includes('UserPromptSubmit'));
    });

    it('should create a hook event, list it, read it, then delete it', async () => {
      // Create
      const createRes = await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({
          commands: [
            { type: 'command', command: 'echo "hello"', timeout: 5000 },
          ],
        });
      assert.equal(createRes.status, 200);
      assert.equal(createRes.body.success, true);
      assert.equal(createRes.body.commandCount, 1);

      // List
      const listRes = await request(app).get('/api/claude-hooks/project');
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.eventCount, 1);
      assert.equal(listRes.body.events[0].event, 'UserPromptSubmit');
      assert.equal(listRes.body.events[0].commandCount, 1);

      // Read
      const readRes = await request(app).get('/api/claude-hooks/project/UserPromptSubmit');
      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.exists, true);
      assert.equal(readRes.body.commands.length, 1);
      assert.equal(readRes.body.commands[0].command, 'echo "hello"');
      assert.equal(readRes.body.commands[0].timeout, 5000);

      // Update with more commands
      const updateRes = await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({
          commands: [
            { type: 'command', command: 'echo "hello"', timeout: 5000 },
            { type: 'command', command: 'echo "world"' },
          ],
        });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.commandCount, 2);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-hooks/project/UserPromptSubmit');
      assert.equal(readRes2.body.commands.length, 2);

      // Delete
      const delRes = await request(app).delete('/api/claude-hooks/project/UserPromptSubmit');
      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.success, true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-hooks/project');
      assert.equal(listRes2.body.eventCount, 0);
    });

    it('should preserve other settings when writing hooks', async () => {
      // Write some initial settings
      const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({
        permissions: { allow: ['Read', 'Write'] },
        customKey: 'preserve-me',
      }, null, 2));

      // Create a hook
      await request(app)
        .put('/api/claude-hooks/project/PreToolUse')
        .send({ commands: [{ type: 'command', command: 'echo "check"' }] });

      // Verify other settings preserved
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.deepEqual(settings.permissions.allow, ['Read', 'Write']);
      assert.equal(settings.customKey, 'preserve-me');
      assert.equal(settings.hooks.PreToolUse.length, 1);
    });

    it('should scope switch: project and global are independent', async () => {
      // Create in project
      await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({ commands: [{ type: 'command', command: 'echo "project"' }] });

      // Create in global
      await request(app)
        .put('/api/claude-hooks/global/Stop')
        .send({ commands: [{ type: 'command', command: 'echo "global"' }] });

      // Project should only have UserPromptSubmit
      const projRes = await request(app).get('/api/claude-hooks/project');
      assert.equal(projRes.body.eventCount, 1);
      assert.equal(projRes.body.events[0].event, 'UserPromptSubmit');

      // Global should only have Stop
      const globalRes = await request(app).get('/api/claude-hooks/global');
      assert.equal(globalRes.body.eventCount, 1);
      assert.equal(globalRes.body.events[0].event, 'Stop');
    });

    it('should reject invalid scope', async () => {
      const res = await request(app).get('/api/claude-hooks/invalid');
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_SCOPE');
    });

    it('should reject invalid event name', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/invalid-event')
        .send({ commands: [{ type: 'command', command: 'echo' }] });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_EVENT');
    });

    it('should reject non-array commands', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({ commands: 'not-an-array' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_COMMANDS');
    });

    it('should reject command without command field', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({ commands: [{ type: 'command' }] });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_COMMAND');
    });

    it('should return 404 when deleting non-existent event', async () => {
      const res = await request(app).delete('/api/claude-hooks/project/UserPromptSubmit');
      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'NOT_FOUND');
    });

    it('should read non-existent event as empty', async () => {
      const res = await request(app).get('/api/claude-hooks/project/UserPromptSubmit');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, false);
      assert.deepEqual(res.body.commands, []);
    });
  });

  // =====================
  // Scripts CRUD
  // =====================
  describe('Scripts CRUD', () => {
    it('should list empty scripts when hooks dir does not exist', async () => {
      const res = await request(app).get('/api/claude-hooks/project/scripts');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.scripts, []);
      assert.equal(res.body.scriptCount, 0);
    });

    it('should create a script, list it, read it, delete it', async () => {
      // Create
      const createRes = await request(app)
        .put('/api/claude-hooks/project/scripts/my-hook.sh')
        .send({ content: '#!/bin/bash\necho "Hello from hook"' });
      assert.equal(createRes.status, 200);
      assert.equal(createRes.body.success, true);

      // List
      const listRes = await request(app).get('/api/claude-hooks/project/scripts');
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.scriptCount, 1);
      assert.equal(listRes.body.scripts[0].name, 'my-hook.sh');
      assert.equal(listRes.body.scripts[0].executable, true);

      // Read
      const readRes = await request(app).get('/api/claude-hooks/project/scripts/my-hook.sh');
      assert.equal(readRes.status, 200);
      assert.ok(readRes.body.content.includes('echo "Hello from hook"'));
      assert.equal(readRes.body.executable, true);

      // Update
      const updateRes = await request(app)
        .put('/api/claude-hooks/project/scripts/my-hook.sh')
        .send({ content: '#!/bin/bash\necho "Updated hook"' });
      assert.equal(updateRes.status, 200);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-hooks/project/scripts/my-hook.sh');
      assert.ok(readRes2.body.content.includes('Updated hook'));

      // Delete
      const delRes = await request(app).delete('/api/claude-hooks/project/scripts/my-hook.sh');
      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.success, true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-hooks/project/scripts');
      assert.equal(listRes2.body.scriptCount, 0);
    });

    it('should reject invalid script filename', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/scripts/bad-name.txt')
        .send({ content: 'bad' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_FILENAME');
    });

    it('should reject missing content', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/scripts/test.sh')
        .send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'MISSING_CONTENT');
    });

    it('should return 404 for non-existent script read', async () => {
      const res = await request(app).get('/api/claude-hooks/project/scripts/nonexistent.sh');
      assert.equal(res.status, 404);
    });

    it('should return 404 when deleting non-existent script', async () => {
      const res = await request(app).delete('/api/claude-hooks/project/scripts/nonexistent.sh');
      assert.equal(res.status, 404);
    });

    it('should scope switch: project and global scripts are independent', async () => {
      await request(app)
        .put('/api/claude-hooks/project/scripts/proj-hook.sh')
        .send({ content: '#!/bin/bash\necho project' });

      await request(app)
        .put('/api/claude-hooks/global/scripts/global-hook.sh')
        .send({ content: '#!/bin/bash\necho global' });

      const projRes = await request(app).get('/api/claude-hooks/project/scripts');
      assert.equal(projRes.body.scriptCount, 1);
      assert.equal(projRes.body.scripts[0].name, 'proj-hook.sh');

      const globalRes = await request(app).get('/api/claude-hooks/global/scripts');
      assert.equal(globalRes.body.scriptCount, 1);
      assert.equal(globalRes.body.scripts[0].name, 'global-hook.sh');
    });
  });

  // =====================
  // Inconsistency Detection
  // =====================
  describe('Inconsistency Detection', () => {
    it('should return no issues when no hooks or scripts exist', async () => {
      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      assert.equal(res.status, 200);
      assert.equal(res.body.issueCount, 0);
      assert.equal(res.body.hasErrors, false);
      assert.equal(res.body.hasWarnings, false);
    });

    it('should detect missing script referenced by hook', async () => {
      // Create a hook that references a script
      await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({
          commands: [{ type: 'command', command: '.claude/hooks/missing-script.sh' }],
        });

      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      assert.equal(res.status, 200);
      assert.ok(res.body.issueCount >= 1);
      assert.equal(res.body.hasErrors, true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const missingIssue = res.body.issues.find((i: any) => i.type === 'missing_script');
      assert.ok(missingIssue !== undefined);
      assert.equal(missingIssue.script, 'missing-script.sh');
    });

    it('should detect orphan scripts not referenced by any hook', async () => {
      // Create a script without any hook reference
      await request(app)
        .put('/api/claude-hooks/project/scripts/orphan.sh')
        .send({ content: '#!/bin/bash\necho orphan' });

      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      assert.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orphanIssue = res.body.issues.find((i: any) => i.type === 'orphan_script');
      assert.ok(orphanIssue !== undefined);
      assert.equal(orphanIssue.script, 'orphan.sh');
    });

    it('should detect non-executable scripts', async () => {
      // Create a script without executable flag
      await request(app)
        .put('/api/claude-hooks/project/scripts/noexec.sh')
        .send({ content: '#!/bin/bash\necho noexec', executable: false });

      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      assert.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noexecIssue = res.body.issues.find((i: any) => i.type === 'not_executable');
      assert.ok(noexecIssue !== undefined);
      assert.equal(noexecIssue.script, 'noexec.sh');
    });

    it('should report no issues when hooks and scripts are consistent', async () => {
      // Create a script
      await request(app)
        .put('/api/claude-hooks/project/scripts/valid-hook.sh')
        .send({ content: '#!/bin/bash\necho ok' });

      // Create a hook referencing that script
      await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({
          commands: [{ type: 'command', command: '.claude/hooks/valid-hook.sh' }],
        });

      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      assert.equal(res.status, 200);
      assert.equal(res.body.hasErrors, false);
      // May still have no warnings since script is executable
    });
  });
});
