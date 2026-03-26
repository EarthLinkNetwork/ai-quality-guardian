/**
 * Claude Settings Custom Commands API Tests
 *
 * Tests for GET /api/claude-settings/custom-commands endpoint:
 * - Returns global and project custom commands from settings.json
 * - Handles missing settings.json files gracefully
 * - Returns empty arrays when no customCommands defined
 * - Properly separates global vs project commands
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createClaudeSettingsRoutes } from '../../../../src/web/routes/claude-settings';

describe('Claude Settings Custom Commands API', () => {
  let app: express.Express;
  let tmpDir: string;
  let globalTmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-settings-cmd-test-'));
    globalTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-settings-cmd-global-'));

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

  it('should return empty arrays when no settings.json exist', async () => {
    const res = await request(app)
      .get('/api/claude-settings/custom-commands')
      .expect(200);

    assert.deepEqual(res.body.global, []);
    assert.deepEqual(res.body.project, []);
    assert.ok(res.body.paths.global);
    assert.ok(res.body.paths.project);
  });

  it('should return global commands from global settings.json', async () => {
    // Write global settings with customCommands
    const globalSettings = {
      customCommands: [
        { name: 'deploy', description: 'Deploy to production', prompt: 'Deploy the application' },
        { name: 'lint-all', description: 'Lint everything', prompt: 'Run linting on all files' },
      ],
    };
    fs.writeFileSync(
      path.join(globalTmpDir, 'settings.json'),
      JSON.stringify(globalSettings),
    );

    const res = await request(app)
      .get('/api/claude-settings/custom-commands')
      .expect(200);

    assert.equal(res.body.global.length, 2);
    assert.equal(res.body.global[0].name, 'deploy');
    assert.equal(res.body.global[0].description, 'Deploy to production');
    assert.equal(res.body.global[0].prompt, 'Deploy the application');
    assert.equal(res.body.global[1].name, 'lint-all');
    assert.deepEqual(res.body.project, []);
  });

  it('should return project commands from project settings.json', async () => {
    // Write project settings with customCommands
    const projectClaudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(projectClaudeDir, { recursive: true });
    const projectSettings = {
      customCommands: [
        { name: 'build', description: 'Build project', prompt: 'Run the build command' },
      ],
    };
    fs.writeFileSync(
      path.join(projectClaudeDir, 'settings.json'),
      JSON.stringify(projectSettings),
    );

    const res = await request(app)
      .get('/api/claude-settings/custom-commands')
      .expect(200);

    assert.deepEqual(res.body.global, []);
    assert.equal(res.body.project.length, 1);
    assert.equal(res.body.project[0].name, 'build');
    assert.equal(res.body.project[0].prompt, 'Run the build command');
  });

  it('should return both global and project commands', async () => {
    // Write global settings
    const globalSettings = {
      customCommands: [
        { name: 'global-cmd', description: 'Global', prompt: 'global' },
      ],
    };
    fs.writeFileSync(
      path.join(globalTmpDir, 'settings.json'),
      JSON.stringify(globalSettings),
    );

    // Write project settings
    const projectClaudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(projectClaudeDir, { recursive: true });
    const projectSettings = {
      customCommands: [
        { name: 'project-cmd', description: 'Project', prompt: 'project' },
      ],
    };
    fs.writeFileSync(
      path.join(projectClaudeDir, 'settings.json'),
      JSON.stringify(projectSettings),
    );

    const res = await request(app)
      .get('/api/claude-settings/custom-commands')
      .expect(200);

    assert.equal(res.body.global.length, 1);
    assert.equal(res.body.project.length, 1);
    assert.equal(res.body.global[0].name, 'global-cmd');
    assert.equal(res.body.project[0].name, 'project-cmd');
  });

  it('should handle settings.json without customCommands', async () => {
    // Write global settings without customCommands
    fs.writeFileSync(
      path.join(globalTmpDir, 'settings.json'),
      JSON.stringify({ project: { name: 'test' } }),
    );

    const res = await request(app)
      .get('/api/claude-settings/custom-commands')
      .expect(200);

    assert.deepEqual(res.body.global, []);
    assert.deepEqual(res.body.project, []);
  });

  it('should skip invalid command entries', async () => {
    const globalSettings = {
      customCommands: [
        { name: 'valid', prompt: 'valid prompt' },
        { name: '', prompt: 'empty name' },         // invalid: empty name
        { name: 'no-prompt' },                       // invalid: no prompt
        null,                                        // invalid: null
        42,                                          // invalid: number
      ],
    };
    fs.writeFileSync(
      path.join(globalTmpDir, 'settings.json'),
      JSON.stringify(globalSettings),
    );

    const res = await request(app)
      .get('/api/claude-settings/custom-commands')
      .expect(200);

    assert.equal(res.body.global.length, 1);
    assert.equal(res.body.global[0].name, 'valid');
  });

  it('should support projectPath query parameter override', async () => {
    // Create an alternate project directory with settings
    const altProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-settings-alt-'));
    const altClaudeDir = path.join(altProjectDir, '.claude');
    fs.mkdirSync(altClaudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(altClaudeDir, 'settings.json'),
      JSON.stringify({
        customCommands: [
          { name: 'alt-cmd', description: 'Alt project', prompt: 'alt prompt' },
        ],
      }),
    );

    try {
      const res = await request(app)
        .get('/api/claude-settings/custom-commands')
        .query({ projectPath: altProjectDir })
        .expect(200);

      assert.equal(res.body.project.length, 1);
      assert.equal(res.body.project[0].name, 'alt-cmd');
    } finally {
      fs.rmSync(altProjectDir, { recursive: true, force: true });
    }
  });
});
