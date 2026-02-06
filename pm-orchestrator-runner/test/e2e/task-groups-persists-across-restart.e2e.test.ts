/**
 * E2E Test: Task Groups Persistence Across Restart
 *
 * Verifies that Task Groups persist when using FileQueueStore
 * and survive across server "restarts" (recreating store with same stateDir).
 *
 * Requirements:
 * - C) Persist Across Restart: Same stateDir/namespace should retain Task Groups
 * - A) Persistent Store: Uses file-based store by default
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
import { initNoDynamo, resetNoDynamo, resetNoDynamoExtended } from '../../src/web/dal/no-dynamo';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: Task Groups Persistence Across Restart', () => {
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'persistence-e2e';
  const testSessionId = 'persistence-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-persist-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Reset NoDynamo state before each test
    resetNoDynamo();
    resetNoDynamoExtended();
    initNoDynamo(stateDir);
  });

  describe('FileQueueStore persistence', () => {
    it('should report store type in /api/health', async () => {
      const fileStore = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore.ensureTable();

      const app = createApp({
        queueStore: fileStore as unknown as IQueueStore,
        sessionId: testSessionId,
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      const res = await request(app)
        .get('/api/health')
        .expect(200);

      console.log('[E2E] /api/health response:', JSON.stringify(res.body));
      assert.equal(res.body.status, 'ok');
      assert.ok(res.body.queue_store, 'queue_store should be present');
      assert.equal(res.body.queue_store.type, 'file', 'queue_store.type should be "file"');
      assert.ok(res.body.queue_store.endpoint, 'queue_store.endpoint should be present');
      assert.ok(res.body.queue_store.endpoint.startsWith('file:'), 'endpoint should start with "file:"');
    });

    it('should persist Task Groups across store recreation (simulated restart)', async () => {
      const testTaskGroupId = 'persist-across-restart-tg';

      // Phase 1: Create initial store and add task
      console.log('[E2E] Phase 1: Create store and add task');
      const fileStore1 = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore1.ensureTable();

      const app1 = createApp({
        queueStore: fileStore1 as unknown as IQueueStore,
        sessionId: testSessionId,
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      // POST a task
      const postRes = await request(app1)
        .post('/api/tasks')
        .send({
          task_group_id: testTaskGroupId,
          prompt: 'persistence test task',
        })
        .expect(201);

      console.log('[E2E] POST /api/tasks response:', JSON.stringify(postRes.body));
      assert.ok(postRes.body.task_id, 'task_id should be returned');

      // Verify task is visible via API
      const getRes1 = await request(app1)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Phase 1 - GET /api/task-groups:', JSON.stringify(getRes1.body));
      const foundGroup1 = getRes1.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testTaskGroupId
      );
      assert.ok(foundGroup1, 'Task group should exist after POST');

      // Verify files were written to disk
      const tasksFile = path.join(stateDir, 'queue', 'tasks.json');
      assert.ok(fs.existsSync(tasksFile), 'tasks.json should exist on disk');
      const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      console.log('[E2E] tasks.json content:', JSON.stringify(tasksData, null, 2));

      // Phase 2: "Restart" by creating a new store with same stateDir
      console.log('[E2E] Phase 2: Simulate restart - create new store with same stateDir');
      const fileStore2 = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore2.ensureTable();

      const app2 = createApp({
        queueStore: fileStore2 as unknown as IQueueStore,
        sessionId: testSessionId + '-restarted',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      // Verify task group is still visible after "restart"
      const getRes2 = await request(app2)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Phase 2 - GET /api/task-groups after restart:', JSON.stringify(getRes2.body));
      const foundGroup2 = getRes2.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testTaskGroupId
      );
      assert.ok(foundGroup2, 'Task group should exist after restart');
      assert.equal(foundGroup2.task_count, 1, 'task_count should be preserved');
    });

    it('should persist multiple Task Groups with correct counts', async () => {
      const groupA = 'persist-multi-group-a';
      const groupB = 'persist-multi-group-b';

      // Phase 1: Create store and add tasks to multiple groups
      const fileStore1 = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore1.ensureTable();

      const app1 = createApp({
        queueStore: fileStore1 as unknown as IQueueStore,
        sessionId: testSessionId,
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      // Add 2 tasks to group A
      await request(app1)
        .post('/api/tasks')
        .send({ task_group_id: groupA, prompt: 'group A task 1' })
        .expect(201);
      await request(app1)
        .post('/api/tasks')
        .send({ task_group_id: groupA, prompt: 'group A task 2' })
        .expect(201);

      // Add 3 tasks to group B
      await request(app1)
        .post('/api/tasks')
        .send({ task_group_id: groupB, prompt: 'group B task 1' })
        .expect(201);
      await request(app1)
        .post('/api/tasks')
        .send({ task_group_id: groupB, prompt: 'group B task 2' })
        .expect(201);
      await request(app1)
        .post('/api/tasks')
        .send({ task_group_id: groupB, prompt: 'group B task 3' })
        .expect(201);

      // Phase 2: "Restart" and verify
      const fileStore2 = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore2.ensureTable();

      const app2 = createApp({
        queueStore: fileStore2 as unknown as IQueueStore,
        sessionId: testSessionId + '-restarted',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      const getRes = await request(app2)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Task groups after restart:', JSON.stringify(getRes.body));

      const foundA = getRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === groupA
      );
      const foundB = getRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === groupB
      );

      assert.ok(foundA, 'Group A should exist after restart');
      assert.ok(foundB, 'Group B should exist after restart');
      assert.equal(foundA.task_count, 2, 'Group A should have 2 tasks');
      assert.equal(foundB.task_count, 3, 'Group B should have 3 tasks');
    });

    it('should persist tasks from different sessions', async () => {
      const taskGroupId = 'persist-diff-sessions';

      // Session 1: Add task
      const fileStore1 = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore1.ensureTable();

      const app1 = createApp({
        queueStore: fileStore1 as unknown as IQueueStore,
        sessionId: 'session-1',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      await request(app1)
        .post('/api/tasks')
        .send({ task_group_id: taskGroupId, prompt: 'session 1 task' })
        .expect(201);

      // Session 2: "Restart" and add another task
      const fileStore2 = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore2.ensureTable();

      const app2 = createApp({
        queueStore: fileStore2 as unknown as IQueueStore,
        sessionId: 'session-2',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      await request(app2)
        .post('/api/tasks')
        .send({ task_group_id: taskGroupId, prompt: 'session 2 task' })
        .expect(201);

      // Verify both tasks exist
      const getRes = await request(app2)
        .get('/api/task-groups')
        .expect(200);

      const foundGroup = getRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === taskGroupId
      );

      assert.ok(foundGroup, 'Task group should exist');
      assert.equal(foundGroup.task_count, 2, 'Should have 2 tasks from different sessions');
    });
  });

  describe('Store type visibility', () => {
    it('should show different store types in health check', async () => {
      // Test with file store
      const fileStore = new FileQueueStore({
        namespace: testNamespace,
        stateDir: stateDir,
      });
      await fileStore.ensureTable();

      const fileApp = createApp({
        queueStore: fileStore as unknown as IQueueStore,
        sessionId: testSessionId,
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'file',
      });

      const fileRes = await request(fileApp)
        .get('/api/health')
        .expect(200);

      console.log('[E2E] File store health:', JSON.stringify(fileRes.body));
      assert.equal(fileRes.body.queue_store.type, 'file');

      // Test with memory store (simulated by passing memory type)
      const { InMemoryQueueStore } = await import('../../src/queue/in-memory-queue-store');
      const memoryStore = new InMemoryQueueStore({ namespace: testNamespace });

      const memoryApp = createApp({
        queueStore: memoryStore as unknown as IQueueStore,
        sessionId: testSessionId,
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
        queueStoreType: 'memory',
      });

      const memoryRes = await request(memoryApp)
        .get('/api/health')
        .expect(200);

      console.log('[E2E] Memory store health:', JSON.stringify(memoryRes.body));
      assert.equal(memoryRes.body.queue_store.type, 'memory');
    });
  });
});
