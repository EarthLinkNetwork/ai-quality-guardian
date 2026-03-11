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

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
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
      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
      expect(res.body.eventCount).toBe(0);
      expect(res.body.settingsExists).toBe(false);
      expect(res.body.knownEvents).toContain('UserPromptSubmit');
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
      expect(createRes.status).toBe(200);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.commandCount).toBe(1);

      // List
      const listRes = await request(app).get('/api/claude-hooks/project');
      expect(listRes.status).toBe(200);
      expect(listRes.body.eventCount).toBe(1);
      expect(listRes.body.events[0].event).toBe('UserPromptSubmit');
      expect(listRes.body.events[0].commandCount).toBe(1);

      // Read
      const readRes = await request(app).get('/api/claude-hooks/project/UserPromptSubmit');
      expect(readRes.status).toBe(200);
      expect(readRes.body.exists).toBe(true);
      expect(readRes.body.commands.length).toBe(1);
      expect(readRes.body.commands[0].command).toBe('echo "hello"');
      expect(readRes.body.commands[0].timeout).toBe(5000);

      // Update with more commands
      const updateRes = await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({
          commands: [
            { type: 'command', command: 'echo "hello"', timeout: 5000 },
            { type: 'command', command: 'echo "world"' },
          ],
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.commandCount).toBe(2);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-hooks/project/UserPromptSubmit');
      expect(readRes2.body.commands.length).toBe(2);

      // Delete
      const delRes = await request(app).delete('/api/claude-hooks/project/UserPromptSubmit');
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-hooks/project');
      expect(listRes2.body.eventCount).toBe(0);
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
      expect(settings.permissions.allow).toEqual(['Read', 'Write']);
      expect(settings.customKey).toBe('preserve-me');
      expect(settings.hooks.PreToolUse.length).toBe(1);
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
      expect(projRes.body.eventCount).toBe(1);
      expect(projRes.body.events[0].event).toBe('UserPromptSubmit');

      // Global should only have Stop
      const globalRes = await request(app).get('/api/claude-hooks/global');
      expect(globalRes.body.eventCount).toBe(1);
      expect(globalRes.body.events[0].event).toBe('Stop');
    });

    it('should reject invalid scope', async () => {
      const res = await request(app).get('/api/claude-hooks/invalid');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_SCOPE');
    });

    it('should reject invalid event name', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/invalid-event')
        .send({ commands: [{ type: 'command', command: 'echo' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_EVENT');
    });

    it('should reject non-array commands', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({ commands: 'not-an-array' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_COMMANDS');
    });

    it('should reject command without command field', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({ commands: [{ type: 'command' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_COMMAND');
    });

    it('should return 404 when deleting non-existent event', async () => {
      const res = await request(app).delete('/api/claude-hooks/project/UserPromptSubmit');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('should read non-existent event as empty', async () => {
      const res = await request(app).get('/api/claude-hooks/project/UserPromptSubmit');
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
      expect(res.body.commands).toEqual([]);
    });
  });

  // =====================
  // Scripts CRUD
  // =====================
  describe('Scripts CRUD', () => {
    it('should list empty scripts when hooks dir does not exist', async () => {
      const res = await request(app).get('/api/claude-hooks/project/scripts');
      expect(res.status).toBe(200);
      expect(res.body.scripts).toEqual([]);
      expect(res.body.scriptCount).toBe(0);
    });

    it('should create a script, list it, read it, delete it', async () => {
      // Create
      const createRes = await request(app)
        .put('/api/claude-hooks/project/scripts/my-hook.sh')
        .send({ content: '#!/bin/bash\necho "Hello from hook"' });
      expect(createRes.status).toBe(200);
      expect(createRes.body.success).toBe(true);

      // List
      const listRes = await request(app).get('/api/claude-hooks/project/scripts');
      expect(listRes.status).toBe(200);
      expect(listRes.body.scriptCount).toBe(1);
      expect(listRes.body.scripts[0].name).toBe('my-hook.sh');
      expect(listRes.body.scripts[0].executable).toBe(true);

      // Read
      const readRes = await request(app).get('/api/claude-hooks/project/scripts/my-hook.sh');
      expect(readRes.status).toBe(200);
      expect(readRes.body.content).toContain('echo "Hello from hook"');
      expect(readRes.body.executable).toBe(true);

      // Update
      const updateRes = await request(app)
        .put('/api/claude-hooks/project/scripts/my-hook.sh')
        .send({ content: '#!/bin/bash\necho "Updated hook"' });
      expect(updateRes.status).toBe(200);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-hooks/project/scripts/my-hook.sh');
      expect(readRes2.body.content).toContain('Updated hook');

      // Delete
      const delRes = await request(app).delete('/api/claude-hooks/project/scripts/my-hook.sh');
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-hooks/project/scripts');
      expect(listRes2.body.scriptCount).toBe(0);
    });

    it('should reject invalid script filename', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/scripts/bad-name.txt')
        .send({ content: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_FILENAME');
    });

    it('should reject missing content', async () => {
      const res = await request(app)
        .put('/api/claude-hooks/project/scripts/test.sh')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_CONTENT');
    });

    it('should return 404 for non-existent script read', async () => {
      const res = await request(app).get('/api/claude-hooks/project/scripts/nonexistent.sh');
      expect(res.status).toBe(404);
    });

    it('should return 404 when deleting non-existent script', async () => {
      const res = await request(app).delete('/api/claude-hooks/project/scripts/nonexistent.sh');
      expect(res.status).toBe(404);
    });

    it('should scope switch: project and global scripts are independent', async () => {
      await request(app)
        .put('/api/claude-hooks/project/scripts/proj-hook.sh')
        .send({ content: '#!/bin/bash\necho project' });

      await request(app)
        .put('/api/claude-hooks/global/scripts/global-hook.sh')
        .send({ content: '#!/bin/bash\necho global' });

      const projRes = await request(app).get('/api/claude-hooks/project/scripts');
      expect(projRes.body.scriptCount).toBe(1);
      expect(projRes.body.scripts[0].name).toBe('proj-hook.sh');

      const globalRes = await request(app).get('/api/claude-hooks/global/scripts');
      expect(globalRes.body.scriptCount).toBe(1);
      expect(globalRes.body.scripts[0].name).toBe('global-hook.sh');
    });
  });

  // =====================
  // Inconsistency Detection
  // =====================
  describe('Inconsistency Detection', () => {
    it('should return no issues when no hooks or scripts exist', async () => {
      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      expect(res.status).toBe(200);
      expect(res.body.issueCount).toBe(0);
      expect(res.body.hasErrors).toBe(false);
      expect(res.body.hasWarnings).toBe(false);
    });

    it('should detect missing script referenced by hook', async () => {
      // Create a hook that references a script
      await request(app)
        .put('/api/claude-hooks/project/UserPromptSubmit')
        .send({
          commands: [{ type: 'command', command: '.claude/hooks/missing-script.sh' }],
        });

      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      expect(res.status).toBe(200);
      expect(res.body.issueCount).toBeGreaterThanOrEqual(1);
      expect(res.body.hasErrors).toBe(true);
      const missingIssue = res.body.issues.find((i: any) => i.type === 'missing_script');
      expect(missingIssue).toBeDefined();
      expect(missingIssue.script).toBe('missing-script.sh');
    });

    it('should detect orphan scripts not referenced by any hook', async () => {
      // Create a script without any hook reference
      await request(app)
        .put('/api/claude-hooks/project/scripts/orphan.sh')
        .send({ content: '#!/bin/bash\necho orphan' });

      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      expect(res.status).toBe(200);
      const orphanIssue = res.body.issues.find((i: any) => i.type === 'orphan_script');
      expect(orphanIssue).toBeDefined();
      expect(orphanIssue.script).toBe('orphan.sh');
    });

    it('should detect non-executable scripts', async () => {
      // Create a script without executable flag
      await request(app)
        .put('/api/claude-hooks/project/scripts/noexec.sh')
        .send({ content: '#!/bin/bash\necho noexec', executable: false });

      const res = await request(app).get('/api/claude-hooks/project/inconsistencies');
      expect(res.status).toBe(200);
      const noexecIssue = res.body.issues.find((i: any) => i.type === 'not_executable');
      expect(noexecIssue).toBeDefined();
      expect(noexecIssue.script).toBe('noexec.sh');
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
      expect(res.status).toBe(200);
      expect(res.body.hasErrors).toBe(false);
      // May still have no warnings since script is executable
    });
  });
});
