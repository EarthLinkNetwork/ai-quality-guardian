/**
 * E2E Tests: Dashboard Observability Enhancements
 *
 * Verifies:
 * 1. AWAITING_RESPONSE tasks appear in Dashboard Required Actions with project info
 * 2. TaskGroup rows include status_counts, latest_status, and project association
 * 3. Activity events include projectId, taskGroupId, taskId and navigable links
 * 4. Required Actions API returns correct data with project context
 * 5. Project Detail returns task groups, recent tasks, and activity
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
import { initNoDynamo, resetNoDynamo, getNoDynamo } from '../../src/web/dal/no-dynamo';

describe('E2E: Dashboard Observability Enhancements', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  let queueStore: InMemoryQueueStore;
  const testSessionId = 'obs-e2e-test-session';
  const testNamespace = 'obs-e2e-test';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-obs-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    resetNoDynamo();
    initNoDynamo(stateDir);
  });

  after(() => {
    resetNoDynamo();
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

  describe('GET /api/required-actions', () => {
    it('should return empty when no AWAITING_RESPONSE tasks', async () => {
      const res = await request(app).get('/api/required-actions');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.actions, []);
      assert.equal(res.body.count, 0);
    });

    it('should return AWAITING_RESPONSE tasks with context', async () => {
      // Create a task and set it to AWAITING_RESPONSE
      const item = await queueStore.enqueue(testSessionId, 'test-group-1', 'Implement feature X');
      await queueStore.updateStatus(item.task_id, 'RUNNING');
      await queueStore.setAwaitingResponse(item.task_id, {
        type: 'case_by_case',
        question: 'Should I use approach A or B?',
        options: ['A', 'B'],
      });

      const res = await request(app).get('/api/required-actions');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 1);

      const action = res.body.actions[0];
      assert.equal(action.task_id, item.task_id);
      assert.equal(action.task_group_id, 'test-group-1');
      assert.equal(action.status, 'AWAITING_RESPONSE');
      assert.ok(action.clarification_preview.includes('approach A or B'));
      assert.ok(typeof action.waiting_minutes === 'number');
      assert.ok(typeof action.waiting_display === 'string');
    });

    it('should include project info from activity events', async () => {
      // Create a project and activity event linking task_group to project
      const dal = getNoDynamo();
      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/project-a',
        alias: 'Project Alpha',
      });

      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_awaiting',
        projectId: project.projectId,
        projectAlias: 'Project Alpha',
        projectPath: '/test/project-a',
        taskGroupId: 'linked-group',
        summary: 'Task awaiting response',
      });

      // Create an awaiting task in linked-group
      const item = await queueStore.enqueue(testSessionId, 'linked-group', 'Do something');
      await queueStore.updateStatus(item.task_id, 'RUNNING');
      await queueStore.setAwaitingResponse(item.task_id, {
        type: 'case_by_case',
        question: 'Which approach?',
      });

      const res = await request(app).get('/api/required-actions');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 1);

      const action = res.body.actions[0];
      assert.equal(action.project_id, project.projectId);
      assert.equal(action.project_alias, 'Project Alpha');
      assert.equal(action.project_path, '/test/project-a');
    });

    it('should not include non-AWAITING tasks', async () => {
      await queueStore.enqueue(testSessionId, 'grp-a', 'Task 1');
      const item2 = await queueStore.enqueue(testSessionId, 'grp-b', 'Task 2');
      await queueStore.updateStatus(item2.task_id, 'RUNNING');
      await queueStore.setAwaitingResponse(item2.task_id, {
        type: 'best_practice',
        question: 'Confirm deletion?',
      });

      const res = await request(app).get('/api/required-actions');
      assert.equal(res.body.count, 1);
      assert.equal(res.body.actions[0].task_group_id, 'grp-b');
    });
  });

  describe('GET /api/task-groups - enhanced', () => {
    it('should include status_counts and latest_status', async () => {
      // Create tasks in different statuses
      const t1 = await queueStore.enqueue(testSessionId, 'group-x', 'Task A');
      const t2 = await queueStore.enqueue(testSessionId, 'group-x', 'Task B');
      const t3 = await queueStore.enqueue(testSessionId, 'group-x', 'Task C');

      await queueStore.updateStatus(t1.task_id, 'RUNNING');
      await queueStore.updateStatus(t1.task_id, 'COMPLETE');
      await queueStore.updateStatus(t2.task_id, 'RUNNING');
      await queueStore.updateStatus(t2.task_id, 'ERROR', 'Something failed');

      const res = await request(app).get('/api/task-groups');
      assert.equal(res.status, 200);

      const groups = res.body.task_groups;
      assert.ok(groups.length >= 1);

      const groupX = groups.find((g: any) => g.task_group_id === 'group-x');
      assert.ok(groupX, 'group-x should exist');
      assert.equal(groupX.task_count, 3);
      assert.ok(groupX.status_counts);
      assert.equal(groupX.status_counts.COMPLETE, 1);
      assert.equal(groupX.status_counts.ERROR, 1);
      assert.equal(groupX.status_counts.QUEUED, 1);
      assert.ok(groupX.latest_status);
    });

    it('should track AWAITING_RESPONSE in status_counts', async () => {
      const t1 = await queueStore.enqueue(testSessionId, 'group-await', 'Task 1');
      await queueStore.updateStatus(t1.task_id, 'RUNNING');
      await queueStore.setAwaitingResponse(t1.task_id, {
        type: 'case_by_case',
        question: 'Pick option?',
      });

      const res = await request(app).get('/api/task-groups');
      const group = res.body.task_groups.find((g: any) => g.task_group_id === 'group-await');
      assert.ok(group);
      assert.equal(group.status_counts.AWAITING_RESPONSE, 1);
      assert.equal(group.latest_status, 'AWAITING_RESPONSE');
    });

    it('should include project info when activity events link task_group to project', async () => {
      const dal = getNoDynamo();
      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/project-tg',
        alias: 'TG Project',
      });

      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_started',
        projectId: project.projectId,
        projectAlias: 'TG Project',
        projectPath: '/test/project-tg',
        taskGroupId: 'grp-with-proj',
        summary: 'Task started',
      });

      await queueStore.enqueue(testSessionId, 'grp-with-proj', 'Task in project');

      const res = await request(app).get('/api/task-groups');
      const group = res.body.task_groups.find((g: any) => g.task_group_id === 'grp-with-proj');
      assert.ok(group, 'grp-with-proj should exist');
      assert.equal(group.project_id, project.projectId);
      assert.equal(group.project_alias, 'TG Project');
      assert.equal(group.project_path, '/test/project-tg');
    });
  });

  describe('Dashboard data integration', () => {
    it('should serve dashboard endpoint with stats', async () => {
      const res = await request(app).get('/api/dashboard');
      assert.equal(res.status, 200);
      assert.ok(res.body.stats);
      assert.ok(res.body.projects !== undefined);
      assert.ok(res.body.recentActivity !== undefined);
    });
  });

  describe('Activity events with taskGroupId', () => {
    it('should return activity events with navigable fields', async () => {
      const dal = getNoDynamo();
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_completed',
        projectId: 'proj-abc',
        projectAlias: 'Test Proj',
        taskGroupId: 'grp-123',
        taskId: 'task-456',
        summary: 'Task completed successfully',
      });

      const res = await request(app).get('/api/activity?limit=10');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.events));
      assert.ok(res.body.events.length >= 1);

      const evt = res.body.events.find((e: any) => e.taskGroupId === 'grp-123');
      assert.ok(evt, 'Event with taskGroupId should exist');
      assert.equal(evt.projectId, 'proj-abc');
      assert.equal(evt.projectAlias, 'Test Proj');
      assert.equal(evt.taskGroupId, 'grp-123');
      assert.equal(evt.taskId, 'task-456');
    });
  });

  describe('Project Detail with task groups and activity', () => {
    it('should return project with associated task group IDs and activity', async () => {
      const dal = getNoDynamo();
      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/detail-proj',
        alias: 'Detail Project',
      });

      // Create activity events linking task groups to this project
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_started',
        projectId: project.projectId,
        taskGroupId: 'detail-grp-1',
        summary: 'First task started',
      });

      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_completed',
        projectId: project.projectId,
        taskGroupId: 'detail-grp-2',
        summary: 'Second task completed',
      });

      const res = await request(app).get('/api/projects/' + project.projectId);
      assert.equal(res.status, 200);
      assert.ok(res.body.project);
      assert.equal(res.body.project.projectId, project.projectId);

      // Should include taskGroupIds
      assert.ok(Array.isArray(res.body.taskGroupIds));
      assert.ok(res.body.taskGroupIds.includes('detail-grp-1'));
      assert.ok(res.body.taskGroupIds.includes('detail-grp-2'));

      // Should include recent activity
      assert.ok(Array.isArray(res.body.recentActivity));
      assert.ok(res.body.recentActivity.length >= 2);

      // Should include runs array
      assert.ok(Array.isArray(res.body.runs));
    });
  });

  describe('HTML route endpoints serve SPA', () => {
    it('should serve index.html for /dashboard', async () => {
      const res = await request(app).get('/dashboard');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type']?.includes('text/html'));
    });

    it('should serve index.html for /activity', async () => {
      const res = await request(app).get('/activity');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type']?.includes('text/html'));
    });

    it('should serve index.html for /projects/:id', async () => {
      const res = await request(app).get('/projects/test-proj');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type']?.includes('text/html'));
    });
  });

  describe('Route listing', () => {
    it('should include required-actions in route list', async () => {
      const res = await request(app).get('/api/routes');
      assert.equal(res.status, 200);
      assert.ok(res.body.routes.includes('GET /api/required-actions'));
    });
  });
});
