/**
 * Claude Settings Routes Unit Tests
 *
 * Tests for /api/claude-settings/* endpoints:
 * - GET/PUT /project (project settings.json)
 * - GET/PUT /global (global settings.json)
 * - GET/PUT /claude-md/project (project CLAUDE.md)
 * - GET/PUT /claude-md/global (global CLAUDE.md)
 *
 * Uses temp directories for both project and global to avoid writing to real ~/.claude.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createClaudeSettingsRoutes } from '../../../../src/web/routes/claude-settings';

describe('Claude Settings Routes', () => {
  let app: express.Express;
  let tmpDir: string;
  let globalTmpDir: string;

  beforeEach(() => {
    // Create separate temp dirs for project and global
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-settings-test-'));
    globalTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-global-test-'));

    app = express();
    app.use(express.json());
    app.use('/api/claude-settings', createClaudeSettingsRoutes({
      projectRoot: tmpDir,
      globalClaudeDir: globalTmpDir,
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(globalTmpDir, { recursive: true, force: true });
  });

  // ==============================
  // Project settings.json
  // ==============================

  describe('GET /api/claude-settings/project', () => {
    it('returns exists=false when settings.json does not exist', async () => {
      const res = await request(app).get('/api/claude-settings/project');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, false);
      assert.deepEqual(res.body.settings, {});
    });

    it('returns the settings when settings.json exists', async () => {
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const settingsData = { hooks: { UserPromptSubmit: [] }, custom: 'value' };
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settingsData));

      const res = await request(app).get('/api/claude-settings/project');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, true);
      assert.deepEqual(res.body.settings, settingsData);
    });

    it('returns the file path in response', async () => {
      const res = await request(app).get('/api/claude-settings/project');
      assert.ok(res.body.path);
      assert.ok(res.body.path.includes('.claude'));
      assert.ok(res.body.path.endsWith('settings.json'));
    });
  });

  describe('PUT /api/claude-settings/project', () => {
    it('writes settings.json and creates directory if needed', async () => {
      const settings = { hooks: {}, myKey: 'myValue' };
      const res = await request(app)
        .put('/api/claude-settings/project')
        .send({ settings });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify file was written
      const filePath = path.join(tmpDir, '.claude', 'settings.json');
      const written = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.deepEqual(written, settings);
    });

    it('returns 400 when settings is missing', async () => {
      const res = await request(app)
        .put('/api/claude-settings/project')
        .send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'MISSING_SETTINGS');
    });

    it('round-trip: PUT then GET returns same data', async () => {
      const settings = {
        hooks: { UserPromptSubmit: [{ command: 'echo test' }] },
        permissions: { allow: ['Read', 'Write'] },
        nested: { deep: { value: 42 } },
      };

      // Write
      const putRes = await request(app)
        .put('/api/claude-settings/project')
        .send({ settings });
      assert.equal(putRes.status, 200);
      assert.equal(putRes.body.success, true);

      // Read back
      const getRes = await request(app).get('/api/claude-settings/project');
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.exists, true);
      assert.deepEqual(getRes.body.settings, settings);
    });

    it('overwrites existing settings completely', async () => {
      // Write initial
      await request(app)
        .put('/api/claude-settings/project')
        .send({ settings: { a: 1, b: 2 } });

      // Overwrite with different data
      await request(app)
        .put('/api/claude-settings/project')
        .send({ settings: { c: 3 } });

      // Verify old keys are gone
      const getRes = await request(app).get('/api/claude-settings/project');
      assert.deepEqual(getRes.body.settings, { c: 3 });
      assert.equal(getRes.body.settings.a, undefined);
    });
  });

  // ==============================
  // Global settings.json
  // ==============================

  describe('GET /api/claude-settings/global', () => {
    it('returns exists=false when global settings.json does not exist', async () => {
      const res = await request(app).get('/api/claude-settings/global');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, false);
      assert.deepEqual(res.body.settings, {});
    });

    it('returns settings when global settings.json exists', async () => {
      const globalSettings = { globalKey: 'globalValue', features: ['a', 'b'] };
      fs.writeFileSync(
        path.join(globalTmpDir, 'settings.json'),
        JSON.stringify(globalSettings),
      );

      const res = await request(app).get('/api/claude-settings/global');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, true);
      assert.deepEqual(res.body.settings, globalSettings);
    });
  });

  describe('PUT /api/claude-settings/global', () => {
    it('returns 400 when settings is missing', async () => {
      const res = await request(app)
        .put('/api/claude-settings/global')
        .send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'MISSING_SETTINGS');
    });

    it('writes global settings.json to the global dir', async () => {
      const settings = { globalHook: true, version: 2 };
      const res = await request(app)
        .put('/api/claude-settings/global')
        .send({ settings });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify written to globalTmpDir
      const filePath = path.join(globalTmpDir, 'settings.json');
      const written = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.deepEqual(written, settings);
    });

    it('round-trip: PUT then GET returns same data for global', async () => {
      const settings = { mcpServers: { notion: { url: 'https://example.com' } } };

      await request(app)
        .put('/api/claude-settings/global')
        .send({ settings });

      const getRes = await request(app).get('/api/claude-settings/global');
      assert.equal(getRes.body.exists, true);
      assert.deepEqual(getRes.body.settings, settings);
    });
  });

  // ==============================
  // Project CLAUDE.md
  // ==============================

  describe('GET /api/claude-settings/claude-md/project', () => {
    it('returns exists=false when CLAUDE.md does not exist', async () => {
      const res = await request(app).get('/api/claude-settings/claude-md/project');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, false);
      assert.equal(res.body.content, '');
    });

    it('returns content when CLAUDE.md exists', async () => {
      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const mdContent = '# Project Rules\n\nFollow these guidelines.';
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), mdContent);

      const res = await request(app).get('/api/claude-settings/claude-md/project');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, true);
      assert.equal(res.body.content, mdContent);
    });
  });

  describe('PUT /api/claude-settings/claude-md/project', () => {
    it('writes CLAUDE.md and creates directory if needed', async () => {
      const content = '# Updated Rules\n\nNew content here.';
      const res = await request(app)
        .put('/api/claude-settings/claude-md/project')
        .send({ content });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify file was written
      const filePath = path.join(tmpDir, '.claude', 'CLAUDE.md');
      const written = fs.readFileSync(filePath, 'utf-8');
      assert.equal(written, content);
    });

    it('returns 400 when content is missing', async () => {
      const res = await request(app)
        .put('/api/claude-settings/claude-md/project')
        .send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'MISSING_CONTENT');
    });

    it('round-trip: PUT then GET returns same markdown', async () => {
      const content = '# My Project\n\n## Rules\n\n- Rule 1\n- Rule 2\n\n```json\n{"key": "value"}\n```';

      await request(app)
        .put('/api/claude-settings/claude-md/project')
        .send({ content });

      const getRes = await request(app).get('/api/claude-settings/claude-md/project');
      assert.equal(getRes.body.exists, true);
      assert.equal(getRes.body.content, content);
    });
  });

  // ==============================
  // Global CLAUDE.md
  // ==============================

  describe('GET /api/claude-settings/claude-md/global', () => {
    it('returns exists=false when global CLAUDE.md does not exist', async () => {
      const res = await request(app).get('/api/claude-settings/claude-md/global');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, false);
      assert.equal(res.body.content, '');
    });

    it('returns content when global CLAUDE.md exists', async () => {
      const mdContent = '# Global Instructions\n\nApply everywhere.';
      fs.writeFileSync(path.join(globalTmpDir, 'CLAUDE.md'), mdContent);

      const res = await request(app).get('/api/claude-settings/claude-md/global');
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, true);
      assert.equal(res.body.content, mdContent);
    });
  });

  describe('PUT /api/claude-settings/claude-md/global', () => {
    it('returns 400 when content is missing', async () => {
      const res = await request(app)
        .put('/api/claude-settings/claude-md/global')
        .send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'MISSING_CONTENT');
    });

    it('writes global CLAUDE.md to the global dir', async () => {
      const content = '# Global Rules\n\nAlways follow these.';
      const res = await request(app)
        .put('/api/claude-settings/claude-md/global')
        .send({ content });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const filePath = path.join(globalTmpDir, 'CLAUDE.md');
      const written = fs.readFileSync(filePath, 'utf-8');
      assert.equal(written, content);
    });

    it('round-trip: PUT then GET returns same global markdown', async () => {
      const content = '# Global\n\n## Section\n\nContent with special chars: <>&"\'';

      await request(app)
        .put('/api/claude-settings/claude-md/global')
        .send({ content });

      const getRes = await request(app).get('/api/claude-settings/claude-md/global');
      assert.equal(getRes.body.exists, true);
      assert.equal(getRes.body.content, content);
    });
  });

  // ==============================
  // Edge cases
  // ==============================

  describe('Edge cases', () => {
    it('handles empty object for settings.json', async () => {
      await request(app)
        .put('/api/claude-settings/project')
        .send({ settings: {} });

      const getRes = await request(app).get('/api/claude-settings/project');
      assert.equal(getRes.body.exists, true);
      assert.deepEqual(getRes.body.settings, {});
    });

    it('handles empty string for CLAUDE.md', async () => {
      await request(app)
        .put('/api/claude-settings/claude-md/project')
        .send({ content: '' });

      const getRes = await request(app).get('/api/claude-settings/claude-md/project');
      assert.equal(getRes.body.exists, true);
      assert.equal(getRes.body.content, '');
    });

    it('project and global settings are independent', async () => {
      const projectSettings = { scope: 'project', val: 1 };
      const globalSettings = { scope: 'global', val: 2 };

      await request(app)
        .put('/api/claude-settings/project')
        .send({ settings: projectSettings });
      await request(app)
        .put('/api/claude-settings/global')
        .send({ settings: globalSettings });

      const projRes = await request(app).get('/api/claude-settings/project');
      const globalRes = await request(app).get('/api/claude-settings/global');

      assert.deepEqual(projRes.body.settings, projectSettings);
      assert.deepEqual(globalRes.body.settings, globalSettings);
    });
  });
});
