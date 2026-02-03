/**
 * E2E Tests: Web Dashboard and Inspection Packet
 *
 * Verifies the Web UI MVP acceptance criteria:
 * 1. Dashboard: Multiple project management
 * 2. Sessions/Runs: History tree display with log viewing
 * 3. Inspection Packet: Generation, binding, storage, viewing
 * 4. Activity: Timeline log display
 * 5. Regression Detection: Create 2 projects, archive, inspect, view logs
 *
 * Based on spec/03_DASHBOARD_UI.md and spec/05_INSPECTION_PACKET.md
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { initNoDynamo, getNoDynamo, resetNoDynamo } from '../../src/web/dal/no-dynamo';

describe('E2E: Web Dashboard and Inspection Packet', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  const testSessionId = 'e2e-test-session';
  const testNamespace = 'e2e-test';

  // Mock QueueStore for tests that don't need queue functionality
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
    // Create temporary state directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-web-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    // Initialize NoDynamo DAL
    initNoDynamo(stateDir);
  });

  after(() => {
    // Cleanup
    resetNoDynamo();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Create fresh app for each test - include stateDir to enable dashboard routes
    app = createApp({
      queueStore: mockQueueStore as any,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir, // IMPORTANT: This enables dashboard and inspection routes
    });
  });

  describe('Regression Detection Scenario', () => {
    it('should complete full workflow: create projects, archive, generate inspection packet, view logs', async function() {
      this.timeout(30000);

      // Step 1: Create first project
      const project1Response = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/project-alpha',
          alias: 'Alpha Project',
          tags: ['e2e', 'test'],
        })
        .expect(201);

      assert.ok(project1Response.body.projectId, 'Project 1 should have ID');
      const project1Id = project1Response.body.projectId;

      // Step 2: Create second project
      const project2Response = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/project-beta',
          alias: 'Beta Project',
          tags: ['e2e', 'test'],
        })
        .expect(201);

      assert.ok(project2Response.body.projectId, 'Project 2 should have ID');
      const project2Id = project2Response.body.projectId;

      // Step 3: List projects - should have 2
      const projectsResponse = await request(app)
        .get('/api/projects')
        .expect(200);

      assert.equal(projectsResponse.body.projects.length, 2, 'Should have 2 projects');

      // Step 4: Archive first project
      const archiveResponse = await request(app)
        .post(`/api/projects/${project1Id}/archive`)
        .expect(200);

      assert.equal(archiveResponse.body.archived, true, 'Project should be archived');

      // Step 5: List projects without archived
      const activeProjectsResponse = await request(app)
        .get('/api/projects')
        .expect(200);

      assert.equal(activeProjectsResponse.body.projects.length, 1, 'Should have 1 active project');
      assert.equal(activeProjectsResponse.body.projects[0].projectId, project2Id, 'Active project should be project 2');

      // Step 6: List projects with archived
      const allProjectsResponse = await request(app)
        .get('/api/projects?includeArchived=true')
        .expect(200);

      assert.equal(allProjectsResponse.body.projects.length, 2, 'Should have 2 total projects');

      // Step 7: Create a run for inspection packet test
      const dal = getNoDynamo();
      const session = await dal.createSession({
        orgId: 'default',
        projectPath: '/test/project-beta',
        projectId: project2Id,
      });

      const run = await dal.createRun({
        sessionId: session.sessionId,
        projectId: project2Id,
        taskRunId: 'test-task-run-001',
        prompt: 'E2E test run for inspection packet',
      });

      // Add some events to the run
      await dal.recordEvent({
        runId: run.runId,
        sessionId: session.sessionId,
        projectId: project2Id,
        type: 'PROGRESS',
        message: 'Starting E2E test',
        level: 'info',
      });

      await dal.recordEvent({
        runId: run.runId,
        sessionId: session.sessionId,
        projectId: project2Id,
        type: 'LOG_BATCH',
        message: 'Processing step 1',
        level: 'info',
      });

      await dal.recordEvent({
        runId: run.runId,
        sessionId: session.sessionId,
        projectId: project2Id,
        type: 'COMPLETED',
        message: 'E2E test completed successfully',
        level: 'info',
      });

      // Complete the run
      await dal.updateRun(run.runId, {
        status: 'COMPLETE',
        endedAt: new Date().toISOString(),
      });

      // Step 8: Generate inspection packet
      const inspectionResponse = await request(app)
        .post(`/api/inspection/run/${run.runId}`)
        .send({
          generatedBy: 'e2e-test',
          includeAllLogs: true,
        })
        .expect(201);

      assert.ok(inspectionResponse.body.packetId, 'Inspection packet should have ID');
      const packetId = inspectionResponse.body.packetId;

      // Step 9: Retrieve inspection packet
      const packetResponse = await request(app)
        .get(`/api/inspection/${packetId}`)
        .expect(200);

      assert.equal(packetResponse.body.packetId, packetId);
      assert.equal(packetResponse.body.runId, run.runId);
      assert.ok(packetResponse.body.events, 'Packet should have events');

      // Step 10: Get inspection packet as markdown
      const markdownResponse = await request(app)
        .get(`/api/inspection/${packetId}/markdown`)
        .expect(200);

      // Markdown format: # Task Inspection: ...
      assert.ok(markdownResponse.text.includes('Task Inspection'), 'Markdown should have title');
      assert.ok(markdownResponse.text.includes('Timeline'), 'Markdown should include Timeline section');

      // Step 11: Get inspection packet for clipboard
      const clipboardResponse = await request(app)
        .get(`/api/inspection/${packetId}/clipboard`)
        .expect(200);

      assert.ok(clipboardResponse.text.length > 0, 'Clipboard content should not be empty');

      // Step 12: List inspection packets
      const packetsListResponse = await request(app)
        .get('/api/inspection')
        .expect(200);

      assert.ok(packetsListResponse.body.packets.length >= 1, 'Should have at least 1 packet');

      // Step 13: Get run logs
      const logsResponse = await request(app)
        .get(`/api/runs/${run.runId}/logs`)
        .expect(200);

      assert.ok(logsResponse.body.logs.length >= 2, 'Should have at least 2 log entries');

      // Step 14: Get run details
      const runDetailsResponse = await request(app)
        .get(`/api/runs/${run.runId}`)
        .expect(200);

      assert.equal(runDetailsResponse.body.run.runId, run.runId);
      assert.equal(runDetailsResponse.body.run.status, 'COMPLETE');
      assert.ok(runDetailsResponse.body.events.length >= 3, 'Should have 3 events');

      // Step 15: Unarchive first project
      const unarchiveResponse = await request(app)
        .post(`/api/projects/${project1Id}/unarchive`)
        .expect(200);

      assert.equal(unarchiveResponse.body.archived, false, 'Project should be unarchived');

      // Step 16: Verify both projects are now active
      const finalProjectsResponse = await request(app)
        .get('/api/projects')
        .expect(200);

      assert.equal(finalProjectsResponse.body.projects.length, 2, 'Should have 2 active projects');

      console.log('    [PASS] Full regression detection workflow completed');
    });
  });

  describe('Dashboard API', () => {
    it('should return dashboard summary', async () => {
      const response = await request(app)
        .get('/api/dashboard')
        .expect(200);

      assert.ok(response.body.projects, 'Dashboard should have projects');
      assert.ok(response.body.recentActivity, 'Dashboard should have recent activity');
      assert.ok(response.body.stats, 'Dashboard should have stats');
      assert.ok(response.body.timestamp, 'Dashboard should have timestamp');
    });

    it('should create and retrieve project', async () => {
      const createResponse = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/dashboard-test',
          alias: 'Dashboard Test Project',
        })
        .expect(201);

      const projectId = createResponse.body.projectId;

      const getResponse = await request(app)
        .get(`/api/projects/${projectId}`)
        .expect(200);

      assert.equal(getResponse.body.project.projectId, projectId);
      assert.equal(getResponse.body.project.alias, 'Dashboard Test Project');
    });

    it('should update project properties', async () => {
      const createResponse = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/update-test',
        })
        .expect(201);

      const projectId = createResponse.body.projectId;

      const updateResponse = await request(app)
        .patch(`/api/projects/${projectId}`)
        .send({
          favorite: true,
          alias: 'Updated Alias',
          tags: ['updated', 'test'],
        })
        .expect(200);

      assert.equal(updateResponse.body.favorite, true);
      assert.equal(updateResponse.body.alias, 'Updated Alias');
      assert.deepEqual(updateResponse.body.tags, ['updated', 'test']);
    });

    it('should return 400 for missing projectPath', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({})
        .expect(400);

      assert.equal(response.body.error, 'INVALID_INPUT');
    });
  });

  describe('Activity API', () => {
    it('should list activity events', async () => {
      const response = await request(app)
        .get('/api/activity')
        .expect(200);

      assert.ok(response.body.events, 'Response should have events array');
    });

    it('should filter activity by projectId', async () => {
      // Create a project first
      const projectResponse = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/activity-filter-test',
        })
        .expect(201);

      const projectId = projectResponse.body.projectId;

      const response = await request(app)
        .get(`/api/activity?projectId=${projectId}`)
        .expect(200);

      assert.ok(response.body.events, 'Response should have events array');
    });
  });

  describe('Sessions API', () => {
    it('should list sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);

      assert.ok(response.body.sessions, 'Response should have sessions array');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/sessions/non-existent-session-id')
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
    });
  });

  describe('Runs API', () => {
    it('should list runs', async () => {
      const response = await request(app)
        .get('/api/runs')
        .expect(200);

      assert.ok(response.body.runs, 'Response should have runs array');
    });

    it('should return 404 for non-existent run', async () => {
      const response = await request(app)
        .get('/api/runs/non-existent-run-id')
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
    });

    it('should return empty logs for non-existent run', async () => {
      // Note: The logs endpoint doesn't return 404 for non-existent runs,
      // it returns empty logs array
      const response = await request(app)
        .get('/api/runs/non-existent-run-id/logs')
        .expect(200);

      assert.deepEqual(response.body.logs, []);
    });
  });

  describe('Inspection Packet API', () => {
    it('should return 404 for non-existent packet', async () => {
      const response = await request(app)
        .get('/api/inspection/non-existent-packet-id')
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
    });

    it('should return 404 when generating packet for non-existent run', async () => {
      const response = await request(app)
        .post('/api/inspection/run/non-existent-run-id')
        .send({})
        .expect(404);

      assert.equal(response.body.error, 'NOT_FOUND');
    });

    it('should list inspection packets with filter', async () => {
      const response = await request(app)
        .get('/api/inspection?runId=test-run-id')
        .expect(200);

      assert.ok(response.body.packets, 'Response should have packets array');
    });
  });

  describe('Static Routes', () => {
    it('should serve dashboard page', async () => {
      const response = await request(app)
        .get('/dashboard')
        .expect(200);

      assert.ok(response.text.includes('PM Orchestrator Runner'));
    });

    it('should serve activity page', async () => {
      const response = await request(app)
        .get('/activity')
        .expect(200);

      assert.ok(response.text.includes('PM Orchestrator Runner'));
    });

    it('should serve project detail page', async () => {
      const response = await request(app)
        .get('/projects/test-project-id')
        .expect(200);

      assert.ok(response.text.includes('PM Orchestrator Runner'));
    });

    it('should serve session detail page', async () => {
      const response = await request(app)
        .get('/sessions/test-session-id')
        .expect(200);

      assert.ok(response.text.includes('PM Orchestrator Runner'));
    });

    it('should serve run detail page', async () => {
      const response = await request(app)
        .get('/runs/test-run-id')
        .expect(200);

      assert.ok(response.text.includes('PM Orchestrator Runner'));
    });
  });
});
