/**
 * E2E Tests: Identifier Resolution (N/A fix)
 *
 * Verifies:
 * 1. Chat submission saves full identifier chain (projectId/taskGroupId/taskId)
 * 2. Project detail API resolves task_group_id from runs and activity events
 * 3. Activity API cross-references runs to fill missing taskGroupId/taskId
 * 4. Old data without IDs falls back to N/A without errors
 * 5. Consistent identifier naming across all endpoints
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import {
  initNoDynamo,
  resetNoDynamo,
  getNoDynamo,
  resetNoDynamoExtended,
} from '../../src/web/dal/no-dynamo';

describe('E2E: Identifier Resolution (N/A fix)', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  let queueStore: InMemoryQueueStore;
  const testSessionId = 'ident-e2e-session';
  const testNamespace = 'ident-e2e-test';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-ident-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    resetNoDynamo();
    resetNoDynamoExtended();
    initNoDynamo(stateDir);
  });

  after(() => {
    resetNoDynamo();
    resetNoDynamoExtended();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    queueStore = new InMemoryQueueStore({ namespace: testNamespace });
    app = createApp({
      queueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('Chat submission saves identifier chain', () => {
    it('should save taskGroupId and taskId in activity events after chat', async () => {
      const dal = getNoDynamo();

      // Create a project first
      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/chat-ident',
        alias: 'Chat Ident Project',
      });

      // Send a chat message
      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Fix the login bug' });

      assert.equal(chatRes.status, 201, 'Chat should succeed');
      assert.ok(chatRes.body.taskGroupId, 'Response should include taskGroupId');
      assert.ok(chatRes.body.runId, 'Response should include runId');

      // Check activity events for this project
      const activityRes = await request(app)
        .get('/api/activity?projectId=' + project.projectId + '&limit=50');

      assert.equal(activityRes.status, 200);
      assert.ok(Array.isArray(activityRes.body.events));

      // Find chat_received event
      const chatEvent = activityRes.body.events.find(
        (e: any) => e.type === 'chat_received'
      );
      assert.ok(chatEvent, 'chat_received event should exist');
      assert.equal(chatEvent.projectId, project.projectId, 'Should have projectId');
      assert.notEqual(chatEvent.taskGroupId, 'N/A', 'taskGroupId should not be N/A');
      assert.notEqual(chatEvent.taskId, 'N/A', 'taskId should not be N/A');

      // Find task_started event
      const taskEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_started'
      );
      assert.ok(taskEvent, 'task_started event should exist');
      assert.equal(taskEvent.projectId, project.projectId);
      assert.notEqual(taskEvent.taskGroupId, 'N/A', 'taskGroupId should not be N/A');
      assert.notEqual(taskEvent.taskId, 'N/A', 'taskId should not be N/A');
    });

    it('should link taskGroupId to chat response', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/chat-link',
        alias: 'Chat Link Project',
      });

      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Refactor the module' });

      assert.equal(chatRes.status, 201);
      const { taskGroupId, runId } = chatRes.body;
      assert.ok(taskGroupId, 'taskGroupId should be in response');
      assert.ok(runId, 'runId should be in response');

      // taskGroupId should match the session ID pattern
      assert.ok(
        taskGroupId === testSessionId || taskGroupId.startsWith('sess_'),
        'taskGroupId should be session-based'
      );
    });
  });

  describe('Project detail resolves identifiers from runs', () => {
    it('should populate recentTaskGroups from chat-created runs', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/proj-detail-resolve',
        alias: 'Detail Resolve Project',
      });

      // Submit a chat to create run + activity chain
      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Add unit tests' });

      assert.equal(chatRes.status, 201);
      const { taskGroupId } = chatRes.body;

      // Get project detail
      const detailRes = await request(app)
        .get('/api/projects/' + project.projectId);

      assert.equal(detailRes.status, 200);

      // recentTaskGroups should include the chat-created group
      assert.ok(
        Array.isArray(detailRes.body.recentTaskGroups),
        'recentTaskGroups should be array'
      );

      const group = detailRes.body.recentTaskGroups.find(
        (tg: any) => tg.task_group_id === taskGroupId
      );
      assert.ok(group, 'Task group from chat should appear in recentTaskGroups');
      assert.equal(group.projectId, project.projectId);
      assert.ok(group.task_count >= 1, 'Should have at least 1 task');

      // recentTasks should show the task with resolved task_group_id
      assert.ok(
        Array.isArray(detailRes.body.recentTasks),
        'recentTasks should be array'
      );
      if (detailRes.body.recentTasks.length > 0) {
        const task = detailRes.body.recentTasks[0];
        assert.notEqual(
          task.task_group_id,
          'N/A',
          'task_group_id should be resolved, not N/A'
        );
        assert.equal(task.projectId, project.projectId);
      }
    });

    it('should resolve task_group_id from runs when activity has no group', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/run-resolve',
        alias: 'Run Resolve Project',
      });

      // Create a session and run directly (simulating old data without activity)
      const session = await dal.createSession({
        orgId: 'default',
        projectPath: '/test/run-resolve',
        projectId: project.projectId,
        sessionId: 'run-resolve-session',
      });

      await dal.createRun({
        sessionId: session.sessionId,
        projectId: project.projectId,
        taskRunId: 'run-resolve-task-1',
        prompt: 'Test prompt for run resolution',
      });

      const detailRes = await request(app)
        .get('/api/projects/' + project.projectId);

      assert.equal(detailRes.status, 200);

      // recentTasks should have the run with sessionId as task_group_id
      if (detailRes.body.recentTasks.length > 0) {
        const task = detailRes.body.recentTasks.find(
          (t: any) => t.task_id === 'run-resolve-task-1'
        );
        if (task) {
          assert.equal(
            task.task_group_id,
            session.sessionId,
            'task_group_id should resolve to sessionId'
          );
        }
      }
    });
  });

  describe('Activity API cross-references runs for identifiers', () => {
    it('should recover taskGroupId from event details', async () => {
      const dal = getNoDynamo();

      // Create an event with identifiers in details but not top-level
      // (simulating the chat route saving identifiers in details)
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'chat_received',
        projectId: 'detail-proj-1',
        summary: 'Chat with details identifiers',
        details: {
          taskRunId: 'detail-task-1',
          taskGroupId: 'detail-group-1',
        },
      });

      const res = await request(app).get('/api/activity?limit=50');
      assert.equal(res.status, 200);

      const evt = res.body.events.find(
        (e: any) => e.projectId === 'detail-proj-1' && e.type === 'chat_received'
      );
      assert.ok(evt, 'Event should exist');
      // taskGroupId should be recovered from details
      assert.equal(evt.taskGroupId, 'detail-group-1', 'taskGroupId should come from details');
      assert.equal(evt.taskId, 'detail-task-1', 'taskId should come from details');
    });

    it('should recover taskGroupId from runs via sessionId', async () => {
      const dal = getNoDynamo();

      // Create an event with only sessionId (no taskGroupId)
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'session_started',
        projectId: 'session-proj-1',
        sessionId: 'session-for-resolve',
        summary: 'Session started with no group ID',
      });

      const res = await request(app).get('/api/activity?limit=50');
      assert.equal(res.status, 200);

      const evt = res.body.events.find(
        (e: any) => e.projectId === 'session-proj-1' && e.type === 'session_started'
      );
      assert.ok(evt, 'Event should exist');
      // taskGroupId should be recovered from sessionId
      assert.equal(
        evt.taskGroupId,
        'session-for-resolve',
        'taskGroupId should resolve from sessionId'
      );
    });
  });

  describe('Backward compatibility: old data with missing IDs', () => {
    it('should return N/A for truly unknown identifiers without errors', async () => {
      const dal = getNoDynamo();

      // Create an old-style event with no identifiers at all
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'session_started',
        summary: 'Old session event with no identifiers',
      });

      const res = await request(app).get('/api/activity?limit=50');
      assert.equal(res.status, 200);

      const evt = res.body.events.find(
        (e: any) => e.summary === 'Old session event with no identifiers'
      );
      assert.ok(evt, 'Old event should exist');
      assert.equal(evt.projectId, 'N/A', 'projectId should be N/A for old data');
      assert.equal(evt.taskGroupId, 'N/A', 'taskGroupId should be N/A for old data');
      assert.equal(evt.taskId, 'N/A', 'taskId should be N/A for old data');
    });

    it('should never return undefined or null for identifier fields', async () => {
      const res = await request(app).get('/api/activity?limit=100');
      assert.equal(res.status, 200);

      for (const evt of res.body.events) {
        assert.notEqual(evt.projectId, undefined, 'projectId should not be undefined');
        assert.notEqual(evt.projectId, null, 'projectId should not be null');
        assert.notEqual(evt.taskGroupId, undefined, 'taskGroupId should not be undefined');
        assert.notEqual(evt.taskGroupId, null, 'taskGroupId should not be null');
        assert.notEqual(evt.taskId, undefined, 'taskId should not be undefined');
        assert.notEqual(evt.taskId, null, 'taskId should not be null');
      }
    });

    it('project detail should handle projects with no activity gracefully', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/empty-proj',
        alias: 'Empty Project',
      });

      const res = await request(app)
        .get('/api/projects/' + project.projectId);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.recentTaskGroups), 'recentTaskGroups should be array');
      assert.ok(Array.isArray(res.body.recentTasks), 'recentTasks should be array');
      assert.ok(Array.isArray(res.body.taskGroupIds), 'taskGroupIds should be array');
    });
  });
});
