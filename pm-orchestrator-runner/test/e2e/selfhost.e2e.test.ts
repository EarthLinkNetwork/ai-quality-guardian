/**
 * E2E Tests: Self-Hosting Apply Protocol
 *
 * Verifies the Self-Hosting / Apply feature:
 * 1. Status API returns correct checks for runner-dev projects
 * 2. Status API returns minimal response for non-runner-dev projects
 * 3. Apply API validates preconditions
 * 4. Apply API creates artifacts when conditions are met
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { initNoDynamo, resetNoDynamo, resetNoDynamoExtended } from '../../src/web/dal/no-dynamo';

describe('E2E: Self-Hosting Apply Protocol', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  let devDir: string;
  const testSessionId = 'selfhost-e2e-test-session';
  const testNamespace = 'selfhost-e2e-test';

  // Mock QueueStore for tests
  const mockQueueStore = {
    enqueue: async () => ({ task_id: 'mock-task', task_group_id: 'mock-group', namespace: testNamespace, status: 'QUEUED' as const, created_at: new Date().toISOString() }),
    getItem: async () => null,
    claim: async () => ({ success: false }),
    updateStatus: async () => {},
    getBySession: async () => [],
    getByStatus: async () => [],
    getByTaskGroup: async () => [],
    getAllTaskGroups: async () => [],
    deleteItem: async () => {},
    recoverStaleTasks: async () => 0,
    getTableName: () => 'pm-runner-queue',
    destroy: () => {},
    ensureTable: async () => {},
    getAllNamespaces: async () => [],
    getRunnersWithStatus: async () => [],
    updateStatusWithValidation: async () => ({ success: false, error: 'Not implemented' }),
  };

  before(() => {
    // Create temporary directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-selfhost-e2e-'));
    stateDir = path.join(tempDir, 'state');
    devDir = path.join(tempDir, 'dev');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(devDir, { recursive: true });

    // Initialize NoDynamo DAL
    initNoDynamo(stateDir);

    // Set environment variables for testing
    process.env.PM_RUNNER_DEV_DIR = devDir;
    process.env.PM_RUNNER_PROD_DIR = tempDir;
  });

  after(() => {
    // Cleanup environment variables
    delete process.env.PM_RUNNER_DEV_DIR;
    delete process.env.PM_RUNNER_PROD_DIR;

    // Cleanup DAL
    resetNoDynamo();
    resetNoDynamoExtended();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Create fresh app for each test
    app = createApp({
      queueStore: mockQueueStore as any,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('SELFHOST-1: Status API for runner-dev projects', () => {
    let projectId: string;

    beforeEach(async () => {
      // Create a runner-dev project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/runner-dev-project-' + Date.now(),
          alias: 'Runner Dev Project',
          tags: ['e2e', 'selfhost'],
          projectType: 'runner-dev',
        })
        .expect(201);

      projectId = projectRes.body.projectId;
    });

    it('should return selfhost status for runner-dev project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/selfhost/status`)
        .expect(200);

      assert.strictEqual(res.body.isRunnerDev, true);
      assert.ok(res.body.prodDir);
      assert.ok(res.body.devDir);
      assert.ok(res.body.checks);
      assert.strictEqual(typeof res.body.checks.devDirExists, 'boolean');
      assert.strictEqual(typeof res.body.checks.gateAllPass, 'boolean');
      assert.strictEqual(typeof res.body.checks.evidencePresent, 'boolean');
      assert.ok(Array.isArray(res.body.applyPlan));
      assert.strictEqual(typeof res.body.canApply, 'boolean');
    });

    it('should detect dev directory exists when PM_RUNNER_DEV_DIR is set', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/selfhost/status`)
        .expect(200);

      assert.strictEqual(res.body.checks.devDirExists, true);
    });

    it('should report blockReason when gate:all not passed', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/selfhost/status`)
        .expect(200);

      // gate:all hasn't passed in test environment
      assert.strictEqual(res.body.checks.gateAllPass, false);
      assert.strictEqual(res.body.canApply, false);
      assert.ok(res.body.blockReason);
      // blockReason should mention gate:all
      assert.ok(res.body.blockReason.toLowerCase().includes('gate'), `Expected blockReason to include 'gate', got: ${res.body.blockReason}`);
    });
  });

  describe('SELFHOST-2: Status API for normal projects', () => {
    let normalProjectId: string;

    beforeEach(async () => {
      // Create a normal (non-runner-dev) project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/normal-project-' + Date.now(),
          alias: 'Normal Project',
          tags: ['e2e', 'selfhost'],
          projectType: 'normal',
        })
        .expect(201);

      normalProjectId = projectRes.body.projectId;
    });

    it('should return minimal status for non-runner-dev project', async () => {
      const res = await request(app)
        .get(`/api/projects/${normalProjectId}/selfhost/status`)
        .expect(200);

      assert.strictEqual(res.body.isRunnerDev, false);
      assert.strictEqual(res.body.canApply, false);
      assert.strictEqual(res.body.blockReason, 'Project is not marked as runner-dev');
      assert.deepStrictEqual(res.body.applyPlan, []);
    });
  });

  describe('SELFHOST-3: Apply API precondition validation', () => {
    let runnerDevProjectId: string;

    beforeEach(async () => {
      // Create a runner-dev project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/runner-dev-apply-' + Date.now(),
          alias: 'Runner Dev Apply Test',
          tags: ['e2e', 'selfhost'],
          projectType: 'runner-dev',
        })
        .expect(201);

      runnerDevProjectId = projectRes.body.projectId;
    });

    it('should return 409 when gate:all has not passed', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/selfhost/apply`)
        .expect(409);

      assert.strictEqual(res.body.error, 'GATE_NOT_PASSED');
      assert.ok(res.body.checks);
      assert.strictEqual(res.body.checks.devDirExists, true);
      assert.strictEqual(res.body.checks.gateAllPass, false);
    });

    it('should return 409 for non-runner-dev project', async () => {
      // Create a normal project
      const normalRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/normal-apply-' + Date.now(),
          alias: 'Normal Apply Test',
          projectType: 'normal',
        })
        .expect(201);

      const res = await request(app)
        .post(`/api/projects/${normalRes.body.projectId}/selfhost/apply`)
        .expect(409);

      assert.strictEqual(res.body.error, 'NOT_RUNNER_DEV');
    });
  });

  describe('SELFHOST-4: Apply API with all preconditions met', () => {
    let runnerDevProjectId: string;

    beforeEach(async () => {
      // Create a runner-dev project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/runner-dev-full-' + Date.now(),
          alias: 'Runner Dev Full Test',
          tags: ['e2e', 'selfhost'],
          projectType: 'runner-dev',
        })
        .expect(201);

      runnerDevProjectId = projectRes.body.projectId;

      // Setup devDir to pass all preconditions
      // 1. Create gate log with ALL PASS
      const tmpDir = path.join(devDir, '.tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'gate-all.log'), 'Overall: ALL PASS\n[PASS] lint\n[PASS] test\n[PASS] build');

      // 2. Create EVIDENCE.md with content (must be > 100 bytes)
      const docsDir = path.join(devDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      const evidenceContent = `# Evidence

## Test Evidence File

This is the evidence file with more than 100 bytes of content for testing purposes.
It contains multiple lines and sections to ensure proper detection by the selfhost status API.

## Verification
- Item 1: Verified
- Item 2: Verified
- Item 3: Verified
`;
      fs.writeFileSync(path.join(docsDir, 'EVIDENCE.md'), evidenceContent);

      // 3. Initialize git repo for git rev-parse to work
      try {
        const { execSync } = require('child_process');
        execSync('git init', { cwd: devDir, stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: devDir, stdio: 'pipe' });
        execSync('git config user.name "Test"', { cwd: devDir, stdio: 'pipe' });
        fs.writeFileSync(path.join(devDir, 'README.md'), '# Test');
        execSync('git add .', { cwd: devDir, stdio: 'pipe' });
        execSync('git commit -m "init"', { cwd: devDir, stdio: 'pipe' });
      } catch {
        // Git setup may fail in some environments, that's okay
      }
    });

    afterEach(() => {
      // Cleanup devDir content
      try {
        fs.rmSync(path.join(devDir, '.tmp'), { recursive: true, force: true });
        fs.rmSync(path.join(devDir, 'docs'), { recursive: true, force: true });
        fs.rmSync(path.join(devDir, '.git'), { recursive: true, force: true });
        fs.rmSync(path.join(devDir, 'README.md'), { force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create apply artifacts when all preconditions are met', async () => {
      // First verify status shows canApply: true
      const statusRes = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/selfhost/status`)
        .expect(200);

      assert.strictEqual(statusRes.body.checks.devDirExists, true);
      assert.strictEqual(statusRes.body.checks.gateAllPass, true);
      assert.strictEqual(statusRes.body.checks.evidencePresent, true);
      assert.strictEqual(statusRes.body.canApply, true);

      // Now apply
      const applyRes = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/selfhost/apply`)
        .expect(200);

      assert.strictEqual(applyRes.body.success, true);
      assert.ok(applyRes.body.timestamp);
      assert.ok(applyRes.body.artifactDir);
      assert.ok(applyRes.body.applyPlanPath);
      assert.ok(applyRes.body.statusPath);
      assert.ok(Array.isArray(applyRes.body.applyPlan));

      // Verify artifact files were created
      assert.ok(fs.existsSync(applyRes.body.applyPlanPath));
      assert.ok(fs.existsSync(applyRes.body.statusPath));

      // Verify apply-plan.json content
      const applyPlanContent = JSON.parse(fs.readFileSync(applyRes.body.applyPlanPath, 'utf-8'));
      assert.ok(applyPlanContent.timestamp);
      assert.strictEqual(applyPlanContent.projectId, runnerDevProjectId);
      assert.ok(Array.isArray(applyPlanContent.applyPlan));

      // Verify status.json content
      const statusContent = JSON.parse(fs.readFileSync(applyRes.body.statusPath, 'utf-8'));
      assert.strictEqual(statusContent.checks.devDirExists, true);
      assert.strictEqual(statusContent.checks.gateAllPass, true);
      assert.strictEqual(statusContent.checks.evidencePresent, true);
      assert.strictEqual(statusContent.applyReady, true);
    });
  });

  describe('SELFHOST-5: 404 for non-existent project', () => {
    it('should return 404 for status of non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/non-existent-project-id/selfhost/status')
        .expect(404);

      assert.strictEqual(res.body.error, 'NOT_FOUND');
    });

    it('should return 404 for apply of non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/non-existent-project-id/selfhost/apply')
        .expect(404);

      assert.strictEqual(res.body.error, 'NOT_FOUND');
    });
  });
});
