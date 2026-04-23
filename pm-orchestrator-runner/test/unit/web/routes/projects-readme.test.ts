/**
 * Project README Endpoint Unit Tests
 *
 * Covers `GET /api/projects/:projectId/readme` (defined in
 * `src/web/routes/dashboard.ts`):
 *   - 200 + content for an existing README.md
 *   - 404 for a project that has no README
 *   - 404 for an unknown projectId
 *   - Path-traversal / symlink rejection (cannot escape projectPath)
 *
 * Authentication is intentionally NOT exercised here because the
 * dashboard router is mounted without auth middleware in the unit harness;
 * auth coverage lives in the integration suite.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createDashboardRoutes } from '../../../../src/web/routes/dashboard';
import { getDAL, resetDAL } from '../../../../src/web/dal/dal-factory';

describe('Project README Endpoint', () => {
  let app: express.Express;
  let stateDir: string;
  let projectsRoot: string;

  beforeEach(() => {
    // Reset the singleton DAL so each test gets a fresh stateDir.
    resetDAL();
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-readme-state-'));
    projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-readme-projects-'));

    app = express();
    app.use(express.json());
    // createDashboardRoutes calls initDAL({ stateDir }) internally if not
    // already initialized; resetDAL() above ensures it picks up our temp dir.
    app.use('/api', createDashboardRoutes({ stateDir }));
  });

  afterEach(() => {
    resetDAL();
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  });

  async function createProjectWith(opts: { withReadme?: string | null; subdir?: string }): Promise<string> {
    const subdir = opts.subdir ?? `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const projectPath = path.join(projectsRoot, subdir);
    fs.mkdirSync(projectPath, { recursive: true });
    if (typeof opts.withReadme === 'string') {
      fs.writeFileSync(path.join(projectPath, 'README.md'), opts.withReadme);
    }
    const dal = getDAL();
    const project = await dal.createProjectIndex({
      orgId: 'default',
      projectPath,
      alias: 'readme-test',
      projectType: 'normal',
    });
    return project.projectId;
  }

  it('returns 200 + content for an existing README.md', async () => {
    const projectId = await createProjectWith({ withReadme: '# Hello\n\nworld\n' });
    const res = await request(app).get(`/api/projects/${encodeURIComponent(projectId)}/readme`);
    assert.equal(res.status, 200);
    assert.equal(res.body.filename, 'README.md');
    assert.ok(typeof res.body.content === 'string', 'content should be a string');
    assert.ok(res.body.content.includes('# Hello'), `expected content to include '# Hello', got: ${res.body.content}`);
  });

  it('returns 404 NOT_FOUND when project has no README', async () => {
    const projectId = await createProjectWith({ withReadme: null });
    const res = await request(app).get(`/api/projects/${encodeURIComponent(projectId)}/readme`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'NOT_FOUND');
  });

  it('returns 404 NOT_FOUND for an unknown projectId', async () => {
    const res = await request(app).get('/api/projects/does-not-exist/readme');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'NOT_FOUND');
  });

  it('rejects symlinked README.md pointing outside projectPath', async () => {
    // Create a project, then replace its README with a symlink to a file
    // outside the project root. The endpoint must refuse to serve it.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-readme-outside-'));
    try {
      const secretPath = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(secretPath, 'SHOULD-NOT-LEAK');

      const projectId = await createProjectWith({ withReadme: null });
      const dal = getDAL();
      const project = await dal.getProjectIndex(projectId);
      assert.ok(project, 'project should exist');

      const linkPath = path.join(project!.projectPath, 'README.md');
      try {
        fs.symlinkSync(secretPath, linkPath);
      } catch (err) {
        // Some CI filesystems disallow symlinks; skip in that case.
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'EPERM' || e.code === 'EACCES') {
          // eslint-disable-next-line no-console
          console.warn('[skip] symlink not permitted on this filesystem');
          return;
        }
        throw err;
      }

      const res = await request(app).get(`/api/projects/${encodeURIComponent(projectId)}/readme`);
      // Endpoint MUST NOT return 200 with the secret content.
      assert.notEqual(res.status, 200, `expected non-200; got 200 with body=${JSON.stringify(res.body)}`);
      // Most likely 404 (no eligible README candidate) — that is acceptable.
      if (res.body && typeof res.body.content === 'string') {
        assert.ok(!res.body.content.includes('SHOULD-NOT-LEAK'), 'symlink target leaked through endpoint');
      }
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
