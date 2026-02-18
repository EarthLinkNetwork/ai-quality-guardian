/**
 * E2E Tests: Activity Task Events (taskId resolution improvement)
 *
 * Verifies:
 * 1. Chat submission emits task_queued event with full identifier chain
 * 2. Chat submission emits task_started event with full identifier chain
 * 3. Task status transition (COMPLETE/ERROR/AWAITING_RESPONSE) emits task_updated events
 * 4. Reply flow emits task_updated event
 * 5. Activity API returns new events with taskId populated (not N/A)
 * 6. Mixed old/new data: old events still return N/A, new events have real IDs
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

describe('E2E: Activity Task Events (taskId resolution)', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  let queueStore: InMemoryQueueStore;
  const testSessionId = 'act-task-e2e-session';
  const testNamespace = 'act-task-e2e';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-act-task-e2e-'));
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

  describe('Chat emits task_queued event', () => {
    it('should create task_queued event with full identifier chain', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/task-queued-test',
        alias: 'Task Queued Test',
      });

      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Implement the new feature' });

      assert.equal(chatRes.status, 201, 'Chat should succeed');

      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      assert.equal(activityRes.status, 200);

      const taskQueuedEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_queued' && e.projectId === project.projectId
      );
      assert.ok(taskQueuedEvent, 'task_queued event should exist');
      assert.equal(taskQueuedEvent.projectId, project.projectId);
      assert.notEqual(taskQueuedEvent.taskGroupId, 'N/A', 'taskGroupId should not be N/A');
      assert.notEqual(taskQueuedEvent.taskId, 'N/A', 'taskId should not be N/A');
    });
  });

  describe('Chat emits task_started event', () => {
    it('should create task_started event with full identifier chain', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/task-started-test',
        alias: 'Task Started Test',
      });

      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Fix the critical bug' });

      assert.equal(chatRes.status, 201);

      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      const taskStartedEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_started' && e.projectId === project.projectId
      );
      assert.ok(taskStartedEvent, 'task_started event should exist');
      assert.equal(taskStartedEvent.projectId, project.projectId);
      assert.notEqual(taskStartedEvent.taskGroupId, 'N/A', 'taskGroupId should not be N/A');
      assert.notEqual(taskStartedEvent.taskId, 'N/A', 'taskId should not be N/A');
    });
  });

  describe('Status transition emits task_updated events', () => {
    it('should emit task_completed on COMPLETE status', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/task-complete-test',
        alias: 'Complete Test',
      });

      // Chat to create the task
      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Build the module' });

      assert.equal(chatRes.status, 201);

      // Get the task from the queue
      const groups = await queueStore.getAllTaskGroups();
      assert.ok(groups.length >= 1, 'Should have at least one task group');

      const tasks = await queueStore.getByTaskGroup(groups[0].task_group_id);
      assert.ok(tasks.length >= 1, 'Should have at least one task');
      const taskId = tasks[0].task_id;

      // Transition: QUEUED -> RUNNING -> COMPLETE
      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'RUNNING' });

      const completeRes = await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'COMPLETE' });

      assert.equal(completeRes.status, 200);

      // Check activity for task_completed event
      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      const completedEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_completed' && e.taskId === taskId
      );
      assert.ok(completedEvent, 'task_completed event should exist');
      assert.notEqual(completedEvent.taskGroupId, 'N/A', 'taskGroupId should not be N/A');
      assert.notEqual(completedEvent.taskId, 'N/A', 'taskId should not be N/A');
    });

    it('should emit task_failed on ERROR status', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/task-error-test',
        alias: 'Error Test',
      });

      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Deploy the service' });

      assert.equal(chatRes.status, 201);

      const groups = await queueStore.getAllTaskGroups();
      const tasks = await queueStore.getByTaskGroup(groups[0].task_group_id);
      const taskId = tasks[0].task_id;

      // QUEUED -> RUNNING -> ERROR
      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'RUNNING' });

      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'ERROR', error: 'Deployment failed' });

      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      const failedEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_failed' && e.taskId === taskId
      );
      assert.ok(failedEvent, 'task_failed event should exist');
      assert.equal(failedEvent.importance, 'high', 'Error events should be high importance');
    });

    it('should emit task_awaiting on AWAITING_RESPONSE status', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/task-awaiting-test',
        alias: 'Awaiting Test',
      });

      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Review the PR' });

      assert.equal(chatRes.status, 201);

      const groups = await queueStore.getAllTaskGroups();
      const tasks = await queueStore.getByTaskGroup(groups[0].task_group_id);
      const taskId = tasks[0].task_id;

      // QUEUED -> RUNNING -> AWAITING_RESPONSE
      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'RUNNING' });

      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'AWAITING_RESPONSE' });

      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      const awaitingEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_awaiting' && e.taskId === taskId
      );
      assert.ok(awaitingEvent, 'task_awaiting event should exist');
      assert.equal(awaitingEvent.importance, 'high', 'Awaiting events should be high importance');
    });
  });

  describe('Reply flow emits task_updated event', () => {
    it('should emit task_updated when replying to AWAITING_RESPONSE task', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/task-reply-test',
        alias: 'Reply Test',
      });

      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Analyze the codebase' });

      assert.equal(chatRes.status, 201);

      const groups = await queueStore.getAllTaskGroups();
      const tasks = await queueStore.getByTaskGroup(groups[0].task_group_id);
      const taskId = tasks[0].task_id;

      // QUEUED -> RUNNING -> AWAITING_RESPONSE
      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'RUNNING' });

      await queueStore.setAwaitingResponse(taskId, {
        type: 'case_by_case',
        question: 'Which module to focus on?',
      });

      // Reply to the awaiting task
      const replyRes = await request(app)
        .post('/api/tasks/' + taskId + '/reply')
        .send({ reply: 'Focus on the auth module' });

      assert.equal(replyRes.status, 200);

      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      const replyEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_updated' && e.taskId === taskId
          && e.summary?.includes('reply')
      );
      assert.ok(replyEvent, 'task_updated (reply) event should exist');
      assert.notEqual(replyEvent.taskGroupId, 'N/A', 'taskGroupId should not be N/A');
    });
  });

  describe('Mixed old/new data compatibility', () => {
    it('should handle old events (no taskId) alongside new events', async () => {
      const dal = getNoDynamo();

      // Create old-style event (no taskId/taskGroupId)
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'session_started',
        summary: 'Old session without task IDs',
      });

      // Create new-style event (with full identifiers)
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'task_queued',
        projectId: 'proj-new',
        taskGroupId: 'grp-new',
        taskId: 'task-new-123',
        summary: 'New task queued with IDs',
      });

      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      assert.equal(activityRes.status, 200);

      // New event should have real IDs
      const newEvent = activityRes.body.events.find(
        (e: any) => e.type === 'task_queued' && e.taskId === 'task-new-123'
      );
      assert.ok(newEvent, 'New event should exist with taskId');
      assert.equal(newEvent.taskGroupId, 'grp-new');
      assert.equal(newEvent.taskId, 'task-new-123');

      // Old event should have N/A
      const oldEvent = activityRes.body.events.find(
        (e: any) => e.summary === 'Old session without task IDs'
      );
      assert.ok(oldEvent, 'Old event should exist');
      assert.equal(oldEvent.taskGroupId, 'N/A', 'Old event taskGroupId should be N/A');
      assert.equal(oldEvent.taskId, 'N/A', 'Old event taskId should be N/A');
    });

    it('new task events should appear above old events (most recent first)', async () => {
      const activityRes = await request(app)
        .get('/api/activity?limit=50');

      assert.equal(activityRes.status, 200);

      if (activityRes.body.events.length >= 2) {
        // Events should be sorted by timestamp descending (most recent first)
        const timestamps = activityRes.body.events.map(
          (e: any) => new Date(e.timestamp).getTime()
        );
        for (let i = 0; i < timestamps.length - 1; i++) {
          assert.ok(
            timestamps[i] >= timestamps[i + 1],
            'Events should be sorted most recent first'
          );
        }
      }
    });
  });

  describe('Full chat -> task lifecycle -> activity verification', () => {
    it('should produce complete activity trail: chat_received, task_queued, task_started, task_completed', async () => {
      const dal = getNoDynamo();

      const project = await dal.createProjectIndex({
        orgId: 'default',
        projectPath: '/test/full-lifecycle',
        alias: 'Full Lifecycle Test',
      });

      // 1. Chat (creates chat_received + task_queued + task_started)
      const chatRes = await request(app)
        .post('/api/projects/' + project.projectId + '/chat')
        .send({ content: 'Run the full pipeline' });

      assert.equal(chatRes.status, 201);

      // 2. Get task and transition to COMPLETE
      const groups = await queueStore.getAllTaskGroups();
      const tasks = await queueStore.getByTaskGroup(groups[0].task_group_id);
      const taskId = tasks[0].task_id;

      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'RUNNING' });

      await request(app)
        .patch('/api/tasks/' + taskId + '/status')
        .send({ status: 'COMPLETE' });

      // 3. Verify activity trail
      const activityRes = await request(app)
        .get('/api/activity?projectId=' + project.projectId + '&limit=50');

      assert.equal(activityRes.status, 200);
      const events = activityRes.body.events;

      // Should have at least: chat_received, task_queued, task_started, task_completed
      const eventTypes = events.map((e: any) => e.type);

      assert.ok(eventTypes.includes('chat_received'), 'Should have chat_received');
      assert.ok(eventTypes.includes('task_queued'), 'Should have task_queued');
      assert.ok(eventTypes.includes('task_started'), 'Should have task_started');
      assert.ok(eventTypes.includes('task_completed'), 'Should have task_completed');

      // All events for this project should have non-N/A taskId
      for (const evt of events) {
        if (['task_queued', 'task_started', 'task_completed'].includes(evt.type)) {
          assert.notEqual(evt.taskId, 'N/A',
            `${evt.type} event should have real taskId, got N/A`);
          assert.notEqual(evt.taskGroupId, 'N/A',
            `${evt.type} event should have real taskGroupId, got N/A`);
        }
      }
    });
  });
});
