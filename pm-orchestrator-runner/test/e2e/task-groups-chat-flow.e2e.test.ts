/**
 * E2E Test: Task Groups via Chat Flow
 *
 * Verifies that TaskGroups created via POST /api/projects/:id/chat
 * appear in GET /api/task-groups.
 *
 * This test specifically targets the scenario where:
 * - Activity shows chat_received (via NoDynamoExtended)
 * - But Task Groups is empty (queueStore not receiving data)
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
import { initNoDynamo, resetNoDynamo, resetNoDynamoExtended } from '../../src/web/dal/no-dynamo';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: Task Groups via Chat Flow', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'chat-flow-taskgroups-e2e';
  const testSessionId = 'chat-flow-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-chat-tg-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
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
    // Reset and reinitialize NoDynamo before each test to avoid state pollution
    resetNoDynamo();
    resetNoDynamoExtended();
    initNoDynamo(stateDir);

    queueStore = new InMemoryQueueStore({ namespace: testNamespace });
    app = createApp({
      queueStore: queueStore as unknown as IQueueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('Chat-to-TaskGroup flow', () => {
    let projectId: string;

    beforeEach(async () => {
      // Create a test project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/chat-taskgroup-project-' + Date.now(),
          alias: 'Chat TaskGroup Test Project',
          tags: ['e2e', 'chat', 'taskgroups'],
        })
        .expect(201);

      projectId = projectRes.body.projectId;
      console.log('[E2E] Created project:', projectId);
    });

    it('should create TaskGroup when sending chat message', async () => {
      // Step 1: Send chat message
      console.log('[E2E] Step 1: Sending chat message');
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Hello, this is a test message' })
        .expect(201);

      console.log('[E2E] Chat response:', JSON.stringify(chatRes.body));
      assert.ok(chatRes.body.userMessage, 'Should have user message');
      assert.ok(chatRes.body.runId, 'Should have runId');

      // Verify taskGroupId is returned
      console.log('[E2E] taskGroupId from chat:', chatRes.body.taskGroupId);
      assert.ok(chatRes.body.taskGroupId, 'Chat response should include taskGroupId');

      // Step 2: Check /api/task-groups
      console.log('[E2E] Step 2: Getting task-groups');
      const taskGroupsRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Task groups response:', JSON.stringify(taskGroupsRes.body));
      console.log('[E2E] Expected namespace:', testNamespace);
      console.log('[E2E] Returned namespace:', taskGroupsRes.body.namespace);

      // Verify namespace matches
      assert.equal(taskGroupsRes.body.namespace, testNamespace, 'Namespace should match');

      // Verify task_groups array contains the taskGroupId
      const foundGroup = taskGroupsRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === chatRes.body.taskGroupId
      );

      assert.ok(
        foundGroup,
        `TaskGroup "${chatRes.body.taskGroupId}" should appear in /api/task-groups after chat`
      );
    });

    it('should create Activity AND TaskGroup for chat message', async () => {
      // Send chat message
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Activity and TaskGroup test' })
        .expect(201);

      console.log('[E2E] Chat response:', JSON.stringify({
        taskGroupId: chatRes.body.taskGroupId,
        activityId: chatRes.body.activityId,
        runId: chatRes.body.runId,
      }));

      // Check Activity
      const activityRes = await request(app)
        .get('/api/activity')
        .expect(200);

      console.log('[E2E] Activity events count:', activityRes.body.events?.length);

      const chatActivity = activityRes.body.events?.find(
        (e: any) => e.type === 'chat_received' && e.projectId === projectId
      );
      assert.ok(chatActivity, 'Should have chat_received activity');

      // Check Task Groups
      const taskGroupsRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Task groups:', JSON.stringify(taskGroupsRes.body));

      const foundGroup = taskGroupsRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === chatRes.body.taskGroupId
      );

      assert.ok(foundGroup, 'TaskGroup should exist after chat');

      // Both should exist
      console.log('[E2E] VERIFICATION:');
      console.log('[E2E]   Activity: FOUND');
      console.log('[E2E]   TaskGroup:', foundGroup ? 'FOUND' : 'MISSING');
    });

    it('should use sessionId as taskGroupId (1:1 mapping per SESSION_MODEL.md)', async () => {
      // Send chat message
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Session mapping test' })
        .expect(201);

      // taskGroupId should equal sessionId (per SESSION_MODEL.md spec)
      // The server uses testSessionId
      console.log('[E2E] Expected taskGroupId:', testSessionId);
      console.log('[E2E] Actual taskGroupId:', chatRes.body.taskGroupId);

      assert.equal(
        chatRes.body.taskGroupId,
        testSessionId,
        'taskGroupId should equal sessionId (1:1 mapping per SESSION_MODEL.md)'
      );

      // Verify in task-groups list
      const taskGroupsRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      const foundGroup = taskGroupsRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testSessionId
      );

      assert.ok(foundGroup, `TaskGroup with id="${testSessionId}" should exist`);
    });
  });

  describe('Direct queueStore verification', () => {
    it('should verify queueStore receives the enqueue from chat routes', async () => {
      // Create project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/direct-verify-' + Date.now(),
          alias: 'Direct Verify Test',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      // Before chat: queueStore should be empty
      const beforeItems = await queueStore.getAllItems();
      console.log('[E2E] QueueStore items before chat:', beforeItems.length);

      // Send chat
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Direct queueStore verification' })
        .expect(201);

      // After chat: queueStore should have 1 item
      const afterItems = await queueStore.getAllItems();
      console.log('[E2E] QueueStore items after chat:', afterItems.length);
      console.log('[E2E] Items:', JSON.stringify(afterItems));

      // Verify the item exists
      const chatItem = afterItems.find(
        item => item.task_group_id === chatRes.body.taskGroupId
      );

      assert.ok(
        chatItem,
        'Chat should create an item in queueStore with matching task_group_id'
      );

      // Also verify via getAllTaskGroups
      const groups = await queueStore.getAllTaskGroups();
      console.log('[E2E] Direct queueStore.getAllTaskGroups:', JSON.stringify(groups));

      const foundGroup = groups.find(
        g => g.task_group_id === chatRes.body.taskGroupId
      );
      assert.ok(foundGroup, 'TaskGroup should be in direct queueStore.getAllTaskGroups');
    });
  });

  describe('Namespace consistency', () => {
    it('should use consistent namespace across all endpoints', async () => {
      // Create project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/namespace-check-' + Date.now(),
          alias: 'Namespace Check',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      // Get namespace from health endpoint
      const healthRes = await request(app)
        .get('/api/health')
        .expect(200);

      console.log('[E2E] Health namespace:', healthRes.body.namespace);

      // Send chat
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Namespace consistency test' })
        .expect(201);

      // Get task-groups
      const taskGroupsRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Task-groups namespace:', taskGroupsRes.body.namespace);

      // Check namespaces endpoint
      const namespacesRes = await request(app)
        .get('/api/namespaces')
        .expect(200);

      console.log('[E2E] All namespaces:', JSON.stringify(namespacesRes.body));

      // All should match
      assert.equal(healthRes.body.namespace, testNamespace, 'Health namespace should match');
      assert.equal(taskGroupsRes.body.namespace, testNamespace, 'Task-groups namespace should match');
      assert.equal(namespacesRes.body.current_namespace, testNamespace, 'Current namespace should match');

      // Verify the task was created with correct namespace
      const afterItems = await queueStore.getAllItems();
      for (const item of afterItems) {
        assert.equal(item.namespace, testNamespace, `Item namespace should be ${testNamespace}`);
      }
    });
  });
});
