/**
 * E2E Tests: Dev Console
 *
 * Verifies the Dev Console feature for selfhost-runner (runner-dev) projects:
 * 1. Dev Console only visible for runner-dev projects
 * 2. Not visible for normal projects
 * 3. FS API: tree, read, search
 * 4. Patch application
 * 5. Command execution with persistent logging
 * 6. Log persistence across page reload
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

describe('E2E: Dev Console', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  let runnerDevProjectId: string;
  let normalProjectId: string;
  const testSessionId = 'devconsole-e2e-test-session';
  const testNamespace = 'devconsole-e2e-test';

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

  before(async () => {
    // Create temporary directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-devconsole-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    // Create test project directory with some files
    const projectDir = path.join(tempDir, 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });

    // Create test files
    fs.writeFileSync(path.join(projectDir, 'README.md'), '# Test Project\n\nThis is a test project.');
    fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), 'console.log("Hello, World!");');
    fs.writeFileSync(path.join(projectDir, 'docs', 'DEVCONSOLE_TEST_TARGET.md'), 'Original content line 1\nOriginal content line 2\n');

    // Initialize NoDynamo DAL
    initNoDynamo(stateDir);

    // Create Express app
    app = createApp({
      queueStore: mockQueueStore as any,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });

    // Create runner-dev project
    const runnerDevRes = await request(app)
      .post('/api/projects')
      .send({
        projectPath: projectDir,
        alias: 'Runner Dev Project',
        tags: ['e2e', 'devconsole'],
        projectType: 'runner-dev',
      })
      .expect(201);
    runnerDevProjectId = runnerDevRes.body.projectId;

    // Create normal project
    const normalRes = await request(app)
      .post('/api/projects')
      .send({
        projectPath: path.join(tempDir, 'normal-project'),
        alias: 'Normal Project',
        tags: ['e2e', 'normal'],
        projectType: 'normal',
      })
      .expect(201);
    normalProjectId = normalRes.body.projectId;
  });

  after(() => {
    // Cleanup DAL
    resetNoDynamo();
    resetNoDynamoExtended();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('DEVCONSOLE-1: Access Control', () => {
    it('should allow Dev Console access for runner-dev projects', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/tree`)
        .expect(200);

      assert.ok(res.body.entries, 'Should return entries array');
      assert.ok(Array.isArray(res.body.entries), 'Entries should be an array');
    });

    it('should deny Dev Console access for normal projects', async () => {
      const res = await request(app)
        .get(`/api/projects/${normalProjectId}/dev/fs/tree`)
        .expect(403);

      assert.strictEqual(res.body.error, 'FORBIDDEN');
      assert.ok(res.body.message.includes('runner-dev'), 'Error should mention runner-dev');
    });

    it('should deny Dev Console access for non-existent projects', async () => {
      await request(app)
        .get('/api/projects/nonexistent-project/dev/fs/tree')
        .expect(404);
    });
  });

  describe('DEVCONSOLE-2: FS Tree API', () => {
    it('should list directory contents', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/tree`)
        .expect(200);

      assert.strictEqual(res.body.root, '.');
      const names = res.body.entries.map((e: any) => e.name);
      assert.ok(names.includes('src'), 'Should include src directory');
      assert.ok(names.includes('docs'), 'Should include docs directory');
      assert.ok(names.includes('README.md'), 'Should include README.md');
    });

    it('should list subdirectory contents', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/tree?root=src`)
        .expect(200);

      assert.strictEqual(res.body.root, 'src');
      const names = res.body.entries.map((e: any) => e.name);
      assert.ok(names.includes('index.ts'), 'Should include index.ts');
    });

    it('should prevent path traversal outside project root', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/tree?root=../..`)
        .expect(400);

      assert.strictEqual(res.body.error, 'INVALID_PATH');
    });
  });

  describe('DEVCONSOLE-3: FS Read API', () => {
    it('should read file contents', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/read?path=README.md`)
        .expect(200);

      assert.strictEqual(res.body.path, 'README.md');
      assert.ok(res.body.content.includes('# Test Project'), 'Should contain file content');
    });

    it('should read file in subdirectory', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/read?path=src/index.ts`)
        .expect(200);

      assert.ok(res.body.content.includes('Hello, World!'), 'Should contain file content');
    });

    it('should prevent reading files outside project root', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/read?path=../../etc/passwd`)
        .expect(400);

      assert.strictEqual(res.body.error, 'INVALID_PATH');
    });

    it('should return 404 for non-existent files', async () => {
      await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/read?path=nonexistent.txt`)
        .expect(404);
    });
  });

  describe('DEVCONSOLE-4: FS Search API', () => {
    it('should search file contents', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/fs/search`)
        .send({ query: 'Hello' })
        .expect(200);

      assert.ok(Array.isArray(res.body), 'Should return array');
      assert.ok(res.body.length > 0, 'Should find matches');
      const match = res.body.find((r: any) => r.relPath.includes('index.ts'));
      assert.ok(match, 'Should find match in index.ts');
    });

    it('should return empty array for no matches', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/fs/search`)
        .send({ query: 'xyznonexistent123' })
        .expect(200);

      assert.ok(Array.isArray(res.body), 'Should return array');
      assert.strictEqual(res.body.length, 0, 'Should be empty');
    });

    it('should require query parameter', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/fs/search`)
        .send({})
        .expect(400);

      assert.strictEqual(res.body.error, 'MISSING_QUERY');
    });
  });

  describe('DEVCONSOLE-5: Patch Application', () => {
    it('should apply valid unified diff patch', async () => {
      // Create a patch that modifies the test target file
      const patch = `--- a/docs/DEVCONSOLE_TEST_TARGET.md
+++ b/docs/DEVCONSOLE_TEST_TARGET.md
@@ -1,2 +1,3 @@
 Original content line 1
 Original content line 2
+Added by patch test
`;

      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/fs/applyPatch`)
        .send({ patch })
        .expect(200);

      assert.strictEqual(res.body.ok, true);
      assert.ok(res.body.changedFiles.includes('docs/DEVCONSOLE_TEST_TARGET.md'), 'Should list changed file');

      // Verify file was changed
      const readRes = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/fs/read?path=docs/DEVCONSOLE_TEST_TARGET.md`)
        .expect(200);

      assert.ok(readRes.body.content.includes('Added by patch test'), 'File should contain patched content');
    });

    it('should reject patch with invalid format', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/fs/applyPatch`)
        .send({ patch: 'not a valid patch' })
        .expect(400);

      assert.strictEqual(res.body.ok, false);
      assert.ok(res.body.error, 'Should have error message');
    });

    it('should require patch parameter', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/fs/applyPatch`)
        .send({})
        .expect(400);

      assert.strictEqual(res.body.error, 'MISSING_PATCH');
    });
  });

  describe('DEVCONSOLE-6: Command Execution', () => {
    it('should execute command and return runId', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/cmd/run`)
        .send({ command: 'echo "test output"' })
        .expect(200);

      assert.ok(res.body.runId, 'Should return runId');
      assert.ok(res.body.runId.startsWith('cmd-'), 'RunId should have cmd- prefix');
    });

    it('should require command parameter', async () => {
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/cmd/run`)
        .send({})
        .expect(400);

      assert.strictEqual(res.body.error, 'MISSING_COMMAND');
    });
  });

  describe('DEVCONSOLE-7: Command Log Retrieval', () => {
    let testRunId: string;

    before(async () => {
      // Run a command first
      const res = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/cmd/run`)
        .send({ command: 'echo "hello log test"' })
        .expect(200);

      testRunId = res.body.runId;

      // Wait for command to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
    });

    it('should retrieve command logs', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/cmd/${testRunId}/log`)
        .expect(200);

      assert.ok(res.body.runId, 'Should have runId');
      assert.ok(res.body.command, 'Should have command');
      assert.ok(Array.isArray(res.body.logs), 'Should have logs array');
      assert.ok(res.body.status === 'completed' || res.body.status === 'running', 'Should have valid status');
    });

    it('should return 404 for non-existent runId', async () => {
      await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/cmd/nonexistent-run/log`)
        .expect(404);
    });
  });

  describe('DEVCONSOLE-8: Command History Persistence', () => {
    let runId1: string;
    let runId2: string;

    before(async () => {
      // Run two commands
      const res1 = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/cmd/run`)
        .send({ command: 'echo "history test 1"' })
        .expect(200);
      runId1 = res1.body.runId;

      const res2 = await request(app)
        .post(`/api/projects/${runnerDevProjectId}/dev/cmd/run`)
        .send({ command: 'echo "history test 2"' })
        .expect(200);
      runId2 = res2.body.runId;

      // Wait for commands to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
    });

    it('should list recent command history', async () => {
      const res = await request(app)
        .get(`/api/projects/${runnerDevProjectId}/dev/cmd/list`)
        .expect(200);

      assert.ok(Array.isArray(res.body.runs), 'Should have runs array');
      assert.ok(res.body.runs.length >= 2, 'Should have at least 2 runs');

      const runIds = res.body.runs.map((r: any) => r.runId);
      assert.ok(runIds.includes(runId1), 'Should include first run');
      assert.ok(runIds.includes(runId2), 'Should include second run');
    });

    it('should persist logs after simulated server restart', async () => {
      // Create a new Express app (simulating restart)
      const newApp = createApp({
        queueStore: mockQueueStore as any,
        sessionId: testSessionId + '-new',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
      });

      // Verify logs are still accessible
      const res = await request(newApp)
        .get(`/api/projects/${runnerDevProjectId}/dev/cmd/${runId1}/log`)
        .expect(200);

      assert.ok(res.body.runId, 'Should have runId after restart');
      assert.ok(res.body.logs.length > 0, 'Should have logs after restart');
    });
  });

  describe('DEVCONSOLE-9: Routes Registration', () => {
    it('should list Dev Console routes in /api/routes', async () => {
      const res = await request(app)
        .get('/api/routes')
        .expect(200);

      const routes = res.body.routes;
      assert.ok(routes.includes('GET /api/projects/:projectId/dev/fs/tree'), 'Should include tree route');
      assert.ok(routes.includes('GET /api/projects/:projectId/dev/fs/read'), 'Should include read route');
      assert.ok(routes.includes('POST /api/projects/:projectId/dev/fs/search'), 'Should include search route');
      assert.ok(routes.includes('POST /api/projects/:projectId/dev/fs/applyPatch'), 'Should include applyPatch route');
      assert.ok(routes.includes('POST /api/projects/:projectId/dev/cmd/run'), 'Should include cmd run route');
      assert.ok(routes.includes('GET /api/projects/:projectId/dev/cmd/:runId/log'), 'Should include cmd log route');
      assert.ok(routes.includes('GET /api/projects/:projectId/dev/cmd/list'), 'Should include cmd list route');
    });
  });
});
