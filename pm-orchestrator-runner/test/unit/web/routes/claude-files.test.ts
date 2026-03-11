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

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
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
      expect(res.status).toBe(200);
      expect(res.body.files).toEqual([]);
    });

    it('should create a command, list it, read it, then delete it', async () => {
      // Create
      const createRes = await request(app)
        .put('/api/claude-files/commands/project/my-command')
        .send({ content: '# My Command\n\nDo something.\n\n$ARGUMENTS' });
      expect(createRes.status).toBe(200);
      expect(createRes.body.success).toBe(true);

      // List
      const listRes = await request(app).get('/api/claude-files/commands/project');
      expect(listRes.status).toBe(200);
      expect(listRes.body.files.length).toBe(1);
      expect(listRes.body.files[0].name).toBe('my-command');

      // Read
      const readRes = await request(app).get('/api/claude-files/commands/project/my-command');
      expect(readRes.status).toBe(200);
      expect(readRes.body.exists).toBe(true);
      expect(readRes.body.content).toContain('# My Command');

      // Update
      const updateRes = await request(app)
        .put('/api/claude-files/commands/project/my-command')
        .send({ content: '# Updated Command\n\nNew content.' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-files/commands/project/my-command');
      expect(readRes2.body.content).toContain('# Updated Command');

      // Delete
      const delRes = await request(app).delete('/api/claude-files/commands/project/my-command');
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-files/commands/project');
      expect(listRes2.body.files.length).toBe(0);
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
      expect(projList.body.files.length).toBe(1);
      expect(projList.body.files[0].name).toBe('proj-cmd');

      // Global list should only have global-cmd
      const globalList = await request(app).get('/api/claude-files/commands/global');
      expect(globalList.body.files.length).toBe(1);
      expect(globalList.body.files[0].name).toBe('global-cmd');
    });

    it('should reject invalid scope', async () => {
      const res = await request(app).get('/api/claude-files/commands/invalid');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_SCOPE');
    });

    it('should reject invalid filename', async () => {
      const res = await request(app)
        .put('/api/claude-files/commands/project/.hidden')
        .send({ content: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_NAME');
    });

    it('should return 404 when deleting non-existent command', async () => {
      const res = await request(app).delete('/api/claude-files/commands/project/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // =====================
  // Agents/Skills CRUD
  // =====================
  describe('Agents and Skills', () => {
    it('should list empty agents when directories do not exist', async () => {
      const res = await request(app).get('/api/claude-files/agents/project');
      expect(res.status).toBe(200);
      expect(res.body.files).toEqual([]);
    });

    it('should create an agent, list it, read it, update it, delete it', async () => {
      const content = '---\nskill: test-agent\ntools:\n  - Read\n  - Grep\n---\n\n# Test Agent';

      // Create agent
      const createRes = await request(app)
        .put('/api/claude-files/agents/project/agent/test-agent')
        .send({ content });
      expect(createRes.status).toBe(200);
      expect(createRes.body.success).toBe(true);

      // List
      const listRes = await request(app).get('/api/claude-files/agents/project');
      expect(listRes.status).toBe(200);
      const agents = listRes.body.files.filter((f: any) => f.type === 'agent');
      expect(agents.length).toBe(1);
      expect(agents[0].name).toBe('test-agent');

      // Read
      const readRes = await request(app).get('/api/claude-files/agents/project/agent/test-agent');
      expect(readRes.status).toBe(200);
      expect(readRes.body.exists).toBe(true);
      expect(readRes.body.content).toContain('# Test Agent');

      // Update
      const updateRes = await request(app)
        .put('/api/claude-files/agents/project/agent/test-agent')
        .send({ content: '# Updated Agent\n\nNew content.' });
      expect(updateRes.status).toBe(200);

      // Verify update
      const readRes2 = await request(app).get('/api/claude-files/agents/project/agent/test-agent');
      expect(readRes2.body.content).toContain('# Updated Agent');

      // Delete
      const delRes = await request(app).delete('/api/claude-files/agents/project/agent/test-agent');
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify deleted
      const listRes2 = await request(app).get('/api/claude-files/agents/project');
      expect(listRes2.body.files.length).toBe(0);
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
      expect(listRes.body.files.length).toBe(2);

      const agents = listRes.body.files.filter((f: any) => f.type === 'agent');
      const skills = listRes.body.files.filter((f: any) => f.type === 'skill');
      expect(agents.length).toBe(1);
      expect(agents[0].name).toBe('my-agent');
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('my-skill');
    });

    it('should scope switch: project and global are independent', async () => {
      await request(app)
        .put('/api/claude-files/agents/project/agent/proj-agent')
        .send({ content: 'project agent' });

      await request(app)
        .put('/api/claude-files/agents/global/agent/global-agent')
        .send({ content: 'global agent' });

      const projList = await request(app).get('/api/claude-files/agents/project');
      expect(projList.body.files.length).toBe(1);
      expect(projList.body.files[0].name).toBe('proj-agent');

      const globalList = await request(app).get('/api/claude-files/agents/global');
      expect(globalList.body.files.length).toBe(1);
      expect(globalList.body.files[0].name).toBe('global-agent');
    });

    it('should reject invalid type', async () => {
      const res = await request(app)
        .put('/api/claude-files/agents/project/invalid/test')
        .send({ content: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_TYPE');
    });

    it('Local scope should be disabled (invalid)', async () => {
      const res = await request(app).get('/api/claude-files/agents/local');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_SCOPE');
    });
  });
});
