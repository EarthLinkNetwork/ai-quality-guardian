/**
 * E2E Test: Task Groups Listing
 *
 * Verifies that task_group_id specified in POST /api/tasks appears in GET /api/task-groups.
 *
 * Root cause investigation for:
 * "Web UI shows 'No task groups yet' even though Activity shows chat_received"
 *
 * This test exercises the complete flow:
 * 1. POST /api/tasks with task_group_id
 * 2. GET /api/task-groups
 * 3. Verify the task_group_id appears in the list
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

describe('E2E: Task Groups Listing', () => {
  let app: Express;
  let queueStore: InMemoryQueueStore;
  let tempDir: string;
  let stateDir: string;
  const testNamespace = 'task-groups-listing-e2e';
  const testSessionId = 'task-groups-listing-test-session';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-tg-listing-e2e-'));
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

    // Create fresh queueStore and app for each test
    queueStore = new InMemoryQueueStore({ namespace: testNamespace });
    app = createApp({
      queueStore: queueStore as unknown as IQueueStore,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('Health check prerequisites', () => {
    it('GET /api/health should return OK', async () => {
      const res = await request(app)
        .get('/api/health')
        .expect(200);

      console.log('[E2E] /api/health response:', JSON.stringify(res.body));
      assert.equal(res.body.status, 'ok');
    });
  });

  describe('Task Groups after POST /api/tasks', () => {
    it('should return task_group_id in task-groups list after POST /api/tasks', async () => {
      const testTaskGroupId = 'debug-tg-1';
      const testPrompt = 'ping';

      // Step 1: POST /api/tasks
      console.log('[E2E] Step 1: POST /api/tasks with task_group_id=' + testTaskGroupId);
      const postRes = await request(app)
        .post('/api/tasks')
        .send({
          task_group_id: testTaskGroupId,
          prompt: testPrompt,
        })
        .expect(201);

      console.log('[E2E] POST /api/tasks response:', JSON.stringify(postRes.body));
      assert.ok(postRes.body.task_id, 'task_id should be returned');
      assert.equal(postRes.body.task_group_id, testTaskGroupId, 'task_group_id should match');
      assert.equal(postRes.body.namespace, testNamespace, 'namespace should match');

      // Step 2: GET /api/task-groups
      console.log('[E2E] Step 2: GET /api/task-groups');
      const getRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] GET /api/task-groups response:', JSON.stringify(getRes.body));
      assert.equal(getRes.body.namespace, testNamespace, 'namespace should match');
      assert.ok(Array.isArray(getRes.body.task_groups), 'task_groups should be an array');

      // Step 3: Verify task_group_id is in the list
      const foundGroup = getRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testTaskGroupId
      );
      assert.ok(foundGroup, `task_group_id "${testTaskGroupId}" should be in the task-groups list`);
      assert.equal(foundGroup.task_count, 1, 'task_count should be 1');
    });

    it('should accumulate multiple tasks in the same task_group', async () => {
      const testTaskGroupId = 'debug-tg-multi';

      // POST 2 tasks with the same task_group_id
      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: testTaskGroupId, prompt: 'task 1' })
        .expect(201);

      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: testTaskGroupId, prompt: 'task 2' })
        .expect(201);

      // GET /api/task-groups
      const getRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] GET /api/task-groups after 2 tasks:', JSON.stringify(getRes.body));

      const foundGroup = getRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testTaskGroupId
      );
      assert.ok(foundGroup, `task_group_id "${testTaskGroupId}" should be in the list`);
      assert.equal(foundGroup.task_count, 2, 'task_count should be 2');
    });

    it('should handle multiple different task_groups', async () => {
      // POST tasks to different task_groups
      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: 'group-a', prompt: 'task in group a' })
        .expect(201);

      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: 'group-b', prompt: 'task in group b' })
        .expect(201);

      // GET /api/task-groups
      const getRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] GET /api/task-groups with multiple groups:', JSON.stringify(getRes.body));

      assert.equal(getRes.body.task_groups.length, 2, 'should have 2 task groups');

      const groupA = getRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === 'group-a'
      );
      const groupB = getRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === 'group-b'
      );

      assert.ok(groupA, 'group-a should exist');
      assert.ok(groupB, 'group-b should exist');
    });
  });

  describe('Task Groups persistence across refresh', () => {
    it('should return same task-groups on consecutive GET requests', async () => {
      const testTaskGroupId = 'persist-tg-1';

      // POST a task
      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: testTaskGroupId, prompt: 'persistence test' })
        .expect(201);

      // First GET
      const res1 = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] First GET /api/task-groups:', JSON.stringify(res1.body));

      // Second GET (simulating browser refresh)
      const res2 = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] Second GET /api/task-groups:', JSON.stringify(res2.body));

      // Should return same results
      assert.deepEqual(
        res1.body.task_groups.length,
        res2.body.task_groups.length,
        'task_groups count should be consistent'
      );

      const group1 = res1.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testTaskGroupId
      );
      const group2 = res2.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testTaskGroupId
      );

      assert.ok(group1, 'task_group should exist in first request');
      assert.ok(group2, 'task_group should exist in second request');
      assert.equal(group1.task_count, group2.task_count, 'task_count should be consistent');
    });
  });

  describe('Store consistency verification', () => {
    it('enqueue/getAllTaskGroups should use the same store instance', async () => {
      const testTaskGroupId = 'store-consistency-tg';

      // Directly enqueue via queueStore (bypassing API)
      const item = await queueStore.enqueue(
        testSessionId,
        testTaskGroupId,
        'direct enqueue test'
      );
      console.log('[E2E] Direct enqueue result:', JSON.stringify(item));

      // Get via API
      const apiRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      console.log('[E2E] API task-groups:', JSON.stringify(apiRes.body));

      // Verify store consistency
      const foundGroup = apiRes.body.task_groups.find(
        (g: { task_group_id: string }) => g.task_group_id === testTaskGroupId
      );
      assert.ok(
        foundGroup,
        'Task enqueued directly to queueStore should appear in API response'
      );

      // Also verify via direct queueStore call
      const directGroups = await queueStore.getAllTaskGroups();
      console.log('[E2E] Direct queueStore.getAllTaskGroups:', JSON.stringify(directGroups));

      const directFoundGroup = directGroups.find(
        (g) => g.task_group_id === testTaskGroupId
      );
      assert.ok(
        directFoundGroup,
        'Task should be found in direct queueStore.getAllTaskGroups'
      );
    });

    it('API and queueStore should return matching task_groups', async () => {
      // Create some tasks
      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: 'api-tg-1', prompt: 'test 1' })
        .expect(201);

      await request(app)
        .post('/api/tasks')
        .send({ task_group_id: 'api-tg-2', prompt: 'test 2' })
        .expect(201);

      // Get via API
      const apiRes = await request(app)
        .get('/api/task-groups')
        .expect(200);

      // Get via queueStore directly
      const directGroups = await queueStore.getAllTaskGroups();

      console.log('[E2E] API response:', JSON.stringify(apiRes.body.task_groups));
      console.log('[E2E] Direct queueStore:', JSON.stringify(directGroups));

      // Compare
      assert.equal(
        apiRes.body.task_groups.length,
        directGroups.length,
        'API and queueStore should return same number of groups'
      );

      // Verify each group matches
      for (const apiGroup of apiRes.body.task_groups) {
        const directGroup = directGroups.find(
          (g) => g.task_group_id === apiGroup.task_group_id
        );
        assert.ok(
          directGroup,
          `API group ${apiGroup.task_group_id} should exist in direct queueStore result`
        );
        assert.equal(
          apiGroup.task_count,
          directGroup.task_count,
          'task_count should match between API and direct queueStore'
        );
      }
    });
  });
});
