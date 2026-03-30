/**
 * Skills Routes Unit Tests
 *
 * Tests for /api/skills/* endpoints:
 * - POST /api/skills/generate (dry-run and write modes)
 *
 * Uses temp directories to avoid writing to real project.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createSkillsRoutes } from '../../../../src/web/routes/skills';

describe('Skills Routes', () => {
  let app: express.Express;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-route-test-'));

    app = express();
    app.use(express.json());
    app.use('/api/skills', createSkillsRoutes({
      projectRoot: tmpDir,
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('POST /api/skills/generate', () => {
    it('returns scan results and generated skills in dry-run mode', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { react: '^18.0.0' },
          devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
        })
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

      const res = await request(app)
        .post('/api/skills/generate')
        .send({ dryRun: true });

      assert.equal(res.status, 200);
      assert.equal(res.body.dryRun, true);
      assert.equal(res.body.scan.language, 'typescript');
      assert.ok(Array.isArray(res.body.skills));
      assert.ok(res.body.skills.length > 0);

      // Each skill should have content in dry-run mode
      const conventions = res.body.skills.find(
        (s: { name: string }) => s.name === 'project-conventions'
      );
      assert.ok(conventions);
      assert.ok(conventions.content);
      assert.ok(conventions.content.includes('typescript'));
    });

    it('writes skills to disk in non-dry-run mode', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {},
          devDependencies: { jest: '^29.0.0' },
        })
      );

      const res = await request(app)
        .post('/api/skills/generate')
        .send({ dryRun: false });

      assert.equal(res.status, 200);
      assert.ok(res.body.written);
      assert.ok(res.body.written.length > 0);
      assert.ok(res.body.message);

      // Verify files exist on disk
      for (const filePath of res.body.written) {
        assert.ok(fs.existsSync(filePath), `File should exist: ${filePath}`);
      }
    });

    it('defaults to projectRoot when no projectPath provided', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );

      const res = await request(app)
        .post('/api/skills/generate')
        .send({ dryRun: true });

      assert.equal(res.status, 200);
      assert.equal(res.body.scan.packageManager, 'npm');
    });

    it('uses custom projectPath when provided', async () => {
      const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-custom-'));
      try {
        fs.writeFileSync(
          path.join(customDir, 'Cargo.toml'),
          '[package]\nname = "myapp"'
        );

        const res = await request(app)
          .post('/api/skills/generate')
          .send({ projectPath: customDir, dryRun: true });

        assert.equal(res.status, 200);
        assert.equal(res.body.scan.language, 'rust');
      } finally {
        fs.rmSync(customDir, { recursive: true, force: true });
      }
    });

    it('returns 500 when writeSkills fails on invalid path', async () => {
      const res = await request(app)
        .post('/api/skills/generate')
        .send({ projectPath: '/nonexistent/path/that/does/not/exist' });

      // writeSkills fails because it cannot create directories
      assert.equal(res.status, 500);
      assert.equal(res.body.error, 'SKILL_GENERATION_FAILED');
    });

    it('returns scan result for invalid path in dry-run mode', async () => {
      const res = await request(app)
        .post('/api/skills/generate')
        .send({ projectPath: '/nonexistent/path/that/does/not/exist', dryRun: true });

      // In dry-run, scan succeeds (returns defaults) and no write happens
      assert.equal(res.status, 200);
      assert.equal(res.body.scan.language, 'unknown');
      assert.equal(res.body.dryRun, true);
    });
  });
});
