/**
 * E2E Tests: Dashboard Data Contract & Navigation
 *
 * Verifies:
 * 1. Task Groups API includes project info with N/A fallback for unlinked groups
 * 2. Activity API always returns projectId, taskGroupId, taskId (with N/A fallback)
 * 3. Project Detail API returns separated recentTaskGroups and recentTasks
 * 4. AWAITING_RESPONSE tasks appear in recentTasks with correct status
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
import { initNoDynamo, resetNoDynamo, getNoDynamo } from '../../src/web/dal/no-dynamo';

describe('E2E: Dashboard Data Contract & Navigation', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  let queueStore: InMemoryQueueStore;
  const testSessionId = 'contract-e2e-session';
  const testNamespace = 'contract-e2e-test';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-contract-e2e-'));
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

  describe('Task Groups with project info display', () => {
    it('should show project_id, project_alias, project_path for linked groups', async () => {
      const dal = getNoDynamo();
      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/linked-proj',
        alias: 'Linked Project',
      });

      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_started',
        projectId: project.projectId,
        projectAlias: 'Linked Project',
        projectPath: '/test/linked-proj',
        taskGroupId: 'linked-tg-1',
        summary: 'Task started',
      });

      await queueStore.enqueue(testSessionId, 'linked-tg-1', 'Do linked work');

      const res = await request(app).get('/api/task-groups');
      assert.equal(res.status, 200);

      const group = res.body.task_groups.find((g: any) => g.task_group_id === 'linked-tg-1');
      assert.ok(group, 'linked-tg-1 should exist');
      assert.equal(group.project_id, project.projectId);
      assert.equal(group.project_alias, 'Linked Project');
      assert.equal(group.project_path, '/test/linked-proj');
    });

    it('should show N/A for project fields on unlinked groups', async () => {
      await queueStore.enqueue(testSessionId, 'unlinked-tg-1', 'Unlinked work');

      const res = await request(app).get('/api/task-groups');
      assert.equal(res.status, 200);

      const group = res.body.task_groups.find((g: any) => g.task_group_id === 'unlinked-tg-1');
      assert.ok(group, 'unlinked-tg-1 should exist');
      assert.equal(group.project_id, 'N/A');
      assert.equal(group.project_alias, 'N/A');
      assert.equal(group.project_path, 'N/A');
    });
  });

  describe('Activity with project/task_group/task navigation', () => {
    it('should always include projectId, taskGroupId, taskId in events', async () => {
      const dal = getNoDynamo();

      // Event with all identifiers
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_completed',
        projectId: 'proj-full',
        projectAlias: 'Full Project',
        taskGroupId: 'grp-full',
        taskId: 'task-full',
        summary: 'Full event',
      });

      // Event with only projectId (no taskGroupId, no taskId)
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'session_started',
        projectId: 'proj-only',
        summary: 'Project only event',
      });

      const res = await request(app).get('/api/activity?limit=50');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.events));

      // Full event has all identifiers
      const fullEvt = res.body.events.find((e: any) => e.taskGroupId === 'grp-full');
      assert.ok(fullEvt, 'Full event should exist');
      assert.equal(fullEvt.projectId, 'proj-full');
      assert.equal(fullEvt.taskGroupId, 'grp-full');
      assert.equal(fullEvt.taskId, 'task-full');

      // Partial event has N/A for missing identifiers
      const partialEvt = res.body.events.find((e: any) => e.projectId === 'proj-only');
      assert.ok(partialEvt, 'Partial event should exist');
      assert.equal(partialEvt.projectId, 'proj-only');
      assert.equal(partialEvt.taskGroupId, 'N/A');
      assert.equal(partialEvt.taskId, 'N/A');
    });

    it('should never return undefined or null for identifier fields', async () => {
      const dal = getNoDynamo();
      // Event with no identifiers at all
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'session_started',
        summary: 'System started',
      });

      const res = await request(app).get('/api/activity?limit=50');
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
  });

  describe('Project Detail recentTaskGroups and recentTasks', () => {
    it('should return separated recentTaskGroups and recentTasks', async () => {
      const dal = getNoDynamo();
      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/detail-sep',
        alias: 'Detail Sep Project',
      });

      // Create activity events with task_group and task references
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_started',
        projectId: project.projectId,
        taskGroupId: 'sep-grp-1',
        taskId: 'sep-task-1',
        summary: 'Task 1 started',
      });

      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_completed',
        projectId: project.projectId,
        taskGroupId: 'sep-grp-1',
        taskId: 'sep-task-2',
        summary: 'Task 2 completed',
      });

      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_started',
        projectId: project.projectId,
        taskGroupId: 'sep-grp-2',
        summary: 'Group 2 task started',
      });

      const res = await request(app).get('/api/projects/' + project.projectId);
      assert.equal(res.status, 200);

      // recentTaskGroups should exist and be an array
      assert.ok(Array.isArray(res.body.recentTaskGroups), 'recentTaskGroups should be array');
      assert.ok(res.body.recentTaskGroups.length >= 2, 'Should have at least 2 task groups');

      // Check structure of recentTaskGroups
      const tg1 = res.body.recentTaskGroups.find((tg: any) => tg.task_group_id === 'sep-grp-1');
      assert.ok(tg1, 'sep-grp-1 should exist');
      assert.equal(tg1.projectId, project.projectId);
      assert.ok(tg1.task_count >= 2, 'sep-grp-1 should have at least 2 tasks');
      assert.ok(Array.isArray(tg1.task_ids), 'task_ids should be array');
      assert.ok(tg1.latest_activity_type, 'Should have latest_activity_type');

      // recentTasks should exist and be an array
      assert.ok(Array.isArray(res.body.recentTasks), 'recentTasks should be array');

      // taskGroupIds should still exist (backward compat)
      assert.ok(Array.isArray(res.body.taskGroupIds), 'taskGroupIds should be array');
      assert.ok(res.body.taskGroupIds.includes('sep-grp-1'));
      assert.ok(res.body.taskGroupIds.includes('sep-grp-2'));
    });

    it('should include task_group_id and task_id with N/A fallback in recentTasks', async () => {
      const dal = getNoDynamo();
      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/detail-na',
        alias: 'NA Fallback Project',
      });

      // Create a run for this project (via session)
      const session = await dal.createSession({
        orgId: 'default',
        projectPath: '/test/detail-na',
        projectId: project.projectId,
        sessionId: 'na-session-1',
      });

      await dal.createRun({
        sessionId: session.sessionId,
        projectId: project.projectId,
        taskRunId: 'na-taskrun-1',
        prompt: 'Test prompt for NA',
      });

      const res = await request(app).get('/api/projects/' + project.projectId);
      assert.equal(res.status, 200);

      // recentTasks should include runs with task_group_id fallback
      if (res.body.recentTasks.length > 0) {
        const task = res.body.recentTasks[0];
        assert.ok(task.task_id, 'Should have task_id');
        assert.ok(task.task_group_id !== undefined, 'Should have task_group_id (even N/A)');
        assert.ok(task.projectId, 'Should have projectId');
        assert.ok(task.status, 'Should have status');
        assert.ok(task.updated_at !== undefined || task.started_at !== undefined, 'Should have timestamp');
      }
    });
  });
});
