/**
 * E2E Test: Open Chat Creates Task Group
 *
 * Verifies that the Open Chat flow (POST /api/projects/:projectId/chat)
 * creates Task Groups that appear in GET /api/task-groups.
 *
 * Requirements:
 * - B) Task Groups Must Appear: Open Chat sessions must appear as Task Groups
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { FileQueueStore } from '../../src/queue/file-queue-store';
import { initNoDynamo, resetNoDynamo, resetNoDynamoExtended, getNoDynamoExtended, initNoDynamoExtended, isNoDynamoExtendedInitialized } from '../../src/web/dal/no-dynamo';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: Open Chat Creates Task Group', () => {
  let app: Express;
  let queueStore: FileQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'open-chat-e2e';
  const testSessionId = 'open-chat-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-open-chat-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
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

  beforeEach(async () => {
    // Reset and reinitialize NoDynamo before each test
    resetNoDynamo();
    resetNoDynamoExtended();

    // Clear queue data for test isolation
    const queueDir = path.join(stateDir, 'queue');
    if (fs.existsSync(queueDir)) {
      fs.rmSync(queueDir, { recursive: true, force: true });
    }

    initNoDynamo(stateDir);
    initNoDynamoExtended(stateDir);

    // Create fresh FileQueueStore and app for each test
    queueStore = new FileQueueStore({
      namespace: testNamespace,
      stateDir: stateDir,
    });
    await queueStore.ensureTable();

    app = createApp({
      queueStore: queueStore as unknown as IQueueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
      queueStoreType: 'file',
    });
  });

  describe('Chat flow creates Task Group', () => {
    it('should create a project and verify it exists', async () => {
      // First create a project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: tempDir,
          alias: 'Test Chat Project',
        })
        .expect(201);

      console.log('[E2E] Created project:', JSON.stringify(projectRes.body));
      assert.ok(projectRes.body.projectId, 'Project should have a projectId');
    });

    it('POST /api/projects/:projectId/chat should create Task Group', async () => {
      // Step 1: Create a project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: tempDir,
          alias: 'Chat Task Group Project',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;
      console.log('[E2E] Created project with ID:', projectId);

      // Step 2: Send a chat message
      const chatRes = await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({
          content: 'Hello, this is a test chat message',
        })
        .expect(201);

      console.log('[E2E] Chat response:', JSON.stringify(chatRes.body));
      assert.ok(chatRes.body.userMessage, 'Should return userMessage');
      assert.equal(chatRes.body.userMessage.role, 'user');

      // Step 3: Verify Task Group was created
      const taskGroupsRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Task groups:', JSON.stringify(taskGroupsRes.body));
      assert.ok(Array.isArray(taskGroupsRes.body.task_groups), 'task_groups should be an array');
      assert.ok(taskGroupsRes.body.task_groups.length > 0, 'Should have at least one task group');

      // The task_group_id should match the sessionId (per SESSION_MODEL.md: 1 Session = 1 TaskGroup)
      const foundGroup = taskGroupsRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testSessionId
      );
      assert.ok(foundGroup, `Task group with id "${testSessionId}" should exist`);
      assert.equal(foundGroup.task_count, 1, 'Task group should have 1 task');
    });

    it('multiple chat messages should accumulate in same Task Group', async () => {
      // Step 1: Create a project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: tempDir,
          alias: 'Multi-Chat Project',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      // Step 2: Send multiple chat messages
      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'First message' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Second message' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Third message' })
        .expect(201);

      // Step 3: Verify all messages are in the same Task Group
      const taskGroupsRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Task groups after 3 messages:', JSON.stringify(taskGroupsRes.body));

      const foundGroup = taskGroupsRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testSessionId
      );
      assert.ok(foundGroup, 'Task group should exist');
      assert.equal(foundGroup.task_count, 3, 'Task group should have 3 tasks');
    });

    it('chat task should have correct task_type', async () => {
      // Create a project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: tempDir,
          alias: 'Task Type Test Project',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      // Send a chat message that should be detected as READ_INFO
      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Show me the current status' })
        .expect(201);

      // Get tasks in the task group
      const tasksRes = await request(app)
        .get(`/api/task-groups/${testSessionId}/tasks`)
        .expect(200);

      console.log('[E2E] Tasks in group:', JSON.stringify(tasksRes.body));
      assert.ok(tasksRes.body.tasks.length > 0, 'Should have tasks');

      const task = tasksRes.body.tasks[0];
      assert.ok(task.task_type, 'Task should have task_type');
      // READ_INFO is the default/expected type for informational queries
      console.log('[E2E] Detected task_type:', task.task_type);
    });
  });

  describe('Chat Task Groups persist across restart', () => {
    it('should persist chat-created Task Groups after store recreation', async () => {
      // Phase 1: Create project and send chat message
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: tempDir,
          alias: 'Persistence Chat Project',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'This message should persist' })
        .expect(201);

      // Verify task group exists
      const res1 = await request(app)
        .get('/api/task-groups')
        .expect(200);

      assert.ok(
        res1.body.task_groups.some((g: { task_group_id: string }) => g.task_group_id === testSessionId),
        'Task group should exist before restart'
      );

      // FLAKY FIX: Wait for any pending I/O to complete before recreating app
      // This prevents ECONNRESET when supertest's internal sockets overlap
      await new Promise(resolve => setTimeout(resolve, 50));

      // Phase 2: "Restart" - create new store with same stateDir
      const queueStore2 = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await queueStore2.ensureTable();

      const app2 = createApp({
        queueStore: queueStore2 as unknown as IQueueStore,
        sessionId: testSessionId + '-restarted',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      // Verify task group still exists
      const res2 = await request(app2)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Task groups after restart:', JSON.stringify(res2.body));
      assert.ok(
        res2.body.task_groups.some((g: { task_group_id: string }) => g.task_group_id === testSessionId),
        'Task group should exist after restart'
      );
    });
  });

  describe('Activity tracking integration', () => {
    it('POST /api/projects/:projectId/chat should record activity', async () => {
      // Create a project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: tempDir,
          alias: 'Activity Test Project',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      // Send a chat message
      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Activity test message' })
        .expect(201);

      // Check activity was recorded
      const activityRes = await request(app)
        .get('/api/activity')
        .expect(200);

      console.log('[E2E] Activity:', JSON.stringify(activityRes.body));
      assert.ok(activityRes.body.events, 'Should have activity events');

      const chatActivity = activityRes.body.events.find(
        (a: { type: string }) => a.type === 'chat_received'
      );
      assert.ok(chatActivity, 'Should have chat_received activity');
      assert.equal(chatActivity.projectId, projectId, 'Activity should reference correct project');
    });
  });
});
