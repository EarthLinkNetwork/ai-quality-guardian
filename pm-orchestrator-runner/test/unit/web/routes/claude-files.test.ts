/**
 * Claude Files Routes Integration Tests
 *
 * Tests for /api/claude-files/* endpoints:
 * - Commands CRUD (list, read, write, delete)
 * - Agents/Skills CRUD (list, read, write, delete)
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
import { createClaudeFilesRoutes } from '../../../../src/web/routes/claude-files';

describe('Claude Files Routes', () => {
  let app: express.Express;
  let tmpDir: string;
  let globalTmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-files-test-'));
    globalTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-files-global-'));

    app = express();
    app.use(express.json());
    app.use('/api/claude-files', createClaudeFilesRoutes({
      projectRoot: tmpDir,
      globalClaudeDir: globalTmpDir,
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(globalTmpDir, { recursive: true, force: true });
  });

  // =====================
  // Commands CRUD
  // =====================
  describe('Commands', () => {
    it('should list empty commands when directory does not exist', async () => {
      const res = await request(app).get('/api/claude-files/commands/project');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.files, []);
    });

    it('should create a command, list it, read it, then delete it', async () => {
      // Create
      const createRes = await request(app)
        .put('/api/claude-files/commands/project/my-command')
        .send({ content: '# My Command\n\nDo something.\n\n$ARGUMENTS' });
      assert.equal(createRes.status, 200);
      assert.equal(createRes.body.success, true);

      // List
      const listRes = await request(app).get('/api/claude-files/commands/project');
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.files.length, 1);
      assert.equal(listRes.body.files[0].name, 'my-command');

      // Read
      const readRes = await request(app).get('/api/claude-files/commands/project/my-command');
      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.exists, true);
      assert.ok(readRes.body.content.includes('# My Command'));

      // Update
      const updateRes = await request(app)
        .put('/api/claude-files/commands/project/my-command')
        .send({ content: '# Updated Command\n\nNew content.' });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.success, true);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-files/commands/project/my-command');
      assert.ok(readRes2.body.content.includes('# Updated Command'));

      // Delete
      const delRes = await request(app).delete('/api/claude-files/commands/project/my-command');
      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.success, true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-files/commands/project');
      assert.equal(listRes2.body.files.length, 0);
    });

    it('should scope switch: project and global are independent', async () => {
      // Create in project scope
      await request(app)
        .put('/api/claude-files/commands/project/proj-cmd')
        .send({ content: 'project command' });

      // Create in global scope
      await request(app)
        .put('/api/claude-files/commands/global/global-cmd')
        .send({ content: 'global command' });

      // Project list should only have proj-cmd
      const projList = await request(app).get('/api/claude-files/commands/project');
      assert.equal(projList.body.files.length, 1);
      assert.equal(projList.body.files[0].name, 'proj-cmd');

      // Global list should only have global-cmd
      const globalList = await request(app).get('/api/claude-files/commands/global');
      assert.equal(globalList.body.files.length, 1);
      assert.equal(globalList.body.files[0].name, 'global-cmd');
    });

    it('should reject invalid scope', async () => {
      const res = await request(app).get('/api/claude-files/commands/invalid');
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_SCOPE');
    });

    it('should reject invalid filename', async () => {
      const res = await request(app)
        .put('/api/claude-files/commands/project/.hidden')
        .send({ content: 'bad' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_NAME');
    });

    it('should return 404 when deleting non-existent command', async () => {
      const res = await request(app).delete('/api/claude-files/commands/project/nonexistent');
      assert.equal(res.status, 404);
    });
  });

  // =====================
  // Agents/Skills CRUD
  // =====================
  describe('Agents and Skills', () => {
    it('should list empty agents when directories do not exist', async () => {
      const res = await request(app).get('/api/claude-files/agents/project');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.files, []);
    });

    it('should create an agent, list it, read it, update it, delete it', async () => {
      const content = '---\nskill: test-agent\ntools:\n  - Read\n  - Grep\n---\n\n# Test Agent';

      // Create agent
      const createRes = await request(app)
        .put('/api/claude-files/agents/project/agent/test-agent')
        .send({ content });
      assert.equal(createRes.status, 200);
      assert.equal(createRes.body.success, true);

      // List
      const listRes = await request(app).get('/api/claude-files/agents/project');
      assert.equal(listRes.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agents = listRes.body.files.filter((f: any) => f.type === 'agent');
      assert.equal(agents.length, 1);
      assert.equal(agents[0].name, 'test-agent');

      // Read
      const readRes = await request(app).get('/api/claude-files/agents/project/agent/test-agent');
      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.exists, true);
      assert.ok(readRes.body.content.includes('# Test Agent'));

      // Update
      const updateRes = await request(app)
        .put('/api/claude-files/agents/project/agent/test-agent')
        .send({ content: '# Updated Agent\n\nNew content.' });
      assert.equal(updateRes.status, 200);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-files/agents/project/agent/test-agent');
      assert.ok(readRes2.body.content.includes('# Updated Agent'));

      // Delete
      const delRes = await request(app).delete('/api/claude-files/agents/project/agent/test-agent');
      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.success, true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-files/agents/project');
      assert.equal(listRes2.body.files.length, 0);
    });

    it('should create a skill and list it separately from agents', async () => {
      // Create agent
      await request(app)
        .put('/api/claude-files/agents/project/agent/my-agent')
        .send({ content: '# My Agent' });

      // Create skill
      await request(app)
        .put('/api/claude-files/agents/project/skill/my-skill')
        .send({ content: '# My Skill' });

      // List should show both
      const listRes = await request(app).get('/api/claude-files/agents/project');
      assert.equal(listRes.body.files.length, 2);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentsList = listRes.body.files.filter((f: any) => f.type === 'agent');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const skills = listRes.body.files.filter((f: any) => f.type === 'skill');
      assert.equal(agentsList.length, 1);
      assert.equal(agentsList[0].name, 'my-agent');
      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, 'my-skill');
    });

    it('should scope switch: project and global are independent', async () => {
      await request(app)
        .put('/api/claude-files/agents/project/agent/proj-agent')
        .send({ content: 'project agent' });

      await request(app)
        .put('/api/claude-files/agents/global/agent/global-agent')
        .send({ content: 'global agent' });

      const projList = await request(app).get('/api/claude-files/agents/project');
      assert.equal(projList.body.files.length, 1);
      assert.equal(projList.body.files[0].name, 'proj-agent');

      const globalList = await request(app).get('/api/claude-files/agents/global');
      assert.equal(globalList.body.files.length, 1);
      assert.equal(globalList.body.files[0].name, 'global-agent');
    });

    it('should reject invalid type', async () => {
      const res = await request(app)
        .put('/api/claude-files/agents/project/invalid/test')
        .send({ content: 'bad' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_TYPE');
    });

    it('Local scope should be disabled (invalid)', async () => {
      const res = await request(app).get('/api/claude-files/agents/local');
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'INVALID_SCOPE');
    });
  });
});
