/**
 * E2E Tests: Chat MVP Feature
 *
 * Verifies the Chat UI MVP acceptance criteria:
 * 1. Chat UI with conversation history
 * 2. Send message -> Plan -> Dispatch flow
 * 3. AWAITING_RESPONSE detection and response mode
 * 4. bootstrapPrompt injection
 * 5. Project type (runner-dev) support
 * 6. State persistence across restarts
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { initNoDynamo, getNoDynamo, resetNoDynamo, initNoDynamoExtended, getNoDynamoExtended, resetNoDynamoExtended } from '../../src/web/dal/no-dynamo';

describe('E2E: Chat MVP Feature', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  const testSessionId = 'chat-e2e-test-session';
  const testNamespace = 'chat-e2e-test';

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

  before(() => {
    // Create temporary state directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-chat-e2e-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    // Initialize NoDynamo DAL
    initNoDynamo(stateDir);
  });

  after(() => {
    // Cleanup
    resetNoDynamo();
    resetNoDynamoExtended();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Create fresh app for each test
    app = createApp({
      queueStore: mockQueueStore as any,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('Chat API Tests', () => {
    let projectId: string;

    beforeEach(async () => {
      // Create a test project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/chat-project-' + Date.now(),
          alias: 'Chat Test Project',
          tags: ['e2e', 'chat'],
        })
        .expect(201);

      projectId = projectRes.body.projectId;
    });

    it('should send a chat message and create run', async () => {
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Hello, please help me with a task' })
        .expect(201);

      assert.ok(chatRes.body.userMessage, 'Should have user message');
      assert.ok(chatRes.body.assistantMessage, 'Should have assistant message');
      assert.ok(chatRes.body.runId, 'Should have runId');
      assert.equal(chatRes.body.userMessage.role, 'user');
      assert.equal(chatRes.body.assistantMessage.role, 'assistant');
    });

    it('should get conversation history', async () => {
      // Send a message first
      await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Test message 1' })
        .expect(201);

      // Get conversation
      const conversationRes = await request(app)
        .get('/api/projects/' + projectId + '/conversation')
        .expect(200);

      assert.ok(Array.isArray(conversationRes.body.messages), 'Should have messages array');
      assert.ok(conversationRes.body.messages.length >= 2, 'Should have at least 2 messages (user + assistant)');
    });

    it('should detect AWAITING_RESPONSE status', async () => {
      // Send a message
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Test message' })
        .expect(201);

      // Set message to awaiting_response
      await request(app)
        .patch('/api/projects/' + projectId + '/conversation/' + chatRes.body.assistantMessage.messageId)
        .send({ 
          status: 'awaiting_response',
          metadata: { clarificationQuestion: 'What color do you prefer?' }
        })
        .expect(200);

      // Check conversation status
      const statusRes = await request(app)
        .get('/api/projects/' + projectId + '/conversation/status')
        .expect(200);

      assert.equal(statusRes.body.awaitingResponse, true, 'Should detect awaiting response');
      assert.ok(statusRes.body.awaitingMessage, 'Should have awaiting message');
    });

    it('should respond to AWAITING_RESPONSE message', async () => {
      // Send initial message
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Test message' })
        .expect(201);

      // Set message to awaiting_response
      await request(app)
        .patch('/api/projects/' + projectId + '/conversation/' + chatRes.body.assistantMessage.messageId)
        .send({ 
          status: 'awaiting_response',
          metadata: { clarificationQuestion: 'What color?' }
        })
        .expect(200);

      // Send response
      const respondRes = await request(app)
        .post('/api/projects/' + projectId + '/respond')
        .send({ content: 'Blue' })
        .expect(201);

      assert.ok(respondRes.body.responseMessage, 'Should have response message');
      assert.equal(respondRes.body.responseMessage.content, 'Blue');
    });
  });

  describe('bootstrapPrompt Tests', () => {
    let projectId: string;

    beforeEach(async () => {
      // Create project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/bootstrap-project-' + Date.now(),
          alias: 'Bootstrap Test Project',
        })
        .expect(201);

      projectId = projectRes.body.projectId;
    });

    it('should save and retrieve bootstrapPrompt', async () => {
      const bootstrapPrompt = 'You are a helpful assistant. Always be concise.';

      // Update project with bootstrapPrompt
      await request(app)
        .patch('/api/projects/' + projectId)
        .send({ bootstrapPrompt })
        .expect(200);

      // Get project
      const projectRes = await request(app)
        .get('/api/projects/' + projectId)
        .expect(200);

      assert.equal(projectRes.body.project.bootstrapPrompt, bootstrapPrompt);
    });

    it('should inject bootstrapPrompt in chat messages', async () => {
      const bootstrapPrompt = 'Always respond in JSON format.';

      // Set bootstrapPrompt
      await request(app)
        .patch('/api/projects/' + projectId)
        .send({ bootstrapPrompt })
        .expect(200);

      // Send chat message
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Hello' })
        .expect(201);

      // bootstrapInjected flag should be true
      assert.equal(chatRes.body.bootstrapInjected, true, 'Should indicate bootstrap was injected');
    });
  });

  describe('Project Type Tests', () => {
    let projectId: string;

    beforeEach(async () => {
      // Create project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/type-project-' + Date.now(),
          alias: 'Type Test Project',
        })
        .expect(201);

      projectId = projectRes.body.projectId;
    });

    it('should default to normal project type', async () => {
      const projectRes = await request(app)
        .get('/api/projects/' + projectId)
        .expect(200);

      // projectType should be undefined or 'normal'
      const projectType = projectRes.body.project.projectType;
      assert.ok(!projectType || projectType === 'normal', 'Default should be normal');
    });

    it('should update project type to runner-dev', async () => {
      await request(app)
        .patch('/api/projects/' + projectId)
        .send({ projectType: 'runner-dev' })
        .expect(200);

      const projectRes = await request(app)
        .get('/api/projects/' + projectId)
        .expect(200);

      assert.equal(projectRes.body.project.projectType, 'runner-dev');
    });
  });

  describe('State Persistence Tests', () => {
    it('should persist conversation across simulated restart', async function() {
      this.timeout(10000);

      // Create project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/persist-project-' + Date.now(),
          alias: 'Persistence Test',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      // Send chat message
      await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Remember this message' })
        .expect(201);

      // Get conversation count
      const conv1 = await request(app)
        .get('/api/projects/' + projectId + '/conversation')
        .expect(200);

      const messageCount = conv1.body.messages.length;
      assert.ok(messageCount >= 2, 'Should have messages');

      // Simulate restart by creating new app instance
      // (State is file-based, so it persists)
      const app2 = createApp({
        queueStore: mockQueueStore as any,
        sessionId: testSessionId + '-2',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
      });

      // Get conversation from "new" server
      const conv2 = await request(app2)
        .get('/api/projects/' + projectId + '/conversation')
        .expect(200);

      assert.equal(conv2.body.messages.length, messageCount, 'Messages should persist after restart');
      
      // Find the original message
      const foundMessage = conv2.body.messages.find((m: any) => m.content === 'Remember this message');
      assert.ok(foundMessage, 'Original message should be found after restart');
    });

    it('should persist AWAITING_RESPONSE state across restart', async function() {
      this.timeout(10000);

      // Create project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/awaiting-persist-' + Date.now(),
          alias: 'Awaiting Persistence Test',
        })
        .expect(201);

      const projectId = projectRes.body.projectId;

      // Send chat and set to awaiting
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Test' })
        .expect(201);

      await request(app)
        .patch('/api/projects/' + projectId + '/conversation/' + chatRes.body.assistantMessage.messageId)
        .send({ 
          status: 'awaiting_response',
          metadata: { clarificationQuestion: 'Persisted question?' }
        })
        .expect(200);

      // Simulate restart
      const app2 = createApp({
        queueStore: mockQueueStore as any,
        sessionId: testSessionId + '-3',
        namespace: testNamespace,
        projectRoot: tempDir,
        stateDir: stateDir,
      });

      // Check awaiting status persists
      const statusRes = await request(app2)
        .get('/api/projects/' + projectId + '/conversation/status')
        .expect(200);

      assert.equal(statusRes.body.awaitingResponse, true, 'Awaiting response should persist');
      assert.equal(
        statusRes.body.awaitingMessage.metadata.clarificationQuestion, 
        'Persisted question?',
        'Question should persist'
      );
    });
  });

  describe('Activity and TaskGroup Integration (Regression)', () => {
    /**
     * These tests verify the fix for:
     * "Web Chat submission does NOT create any Task Groups or Activity records"
     *
     * The fix ensures:
     * 1. Activity is always recorded when chat is received
     * 2. TaskGroup is created via queueStore when available
     * 3. Errors are recorded as Activity
     */

    let projectId: string;

    beforeEach(async () => {
      // Create a test project
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/activity-regression-' + Date.now(),
          alias: 'Activity Regression Test',
          tags: ['e2e', 'regression'],
        })
        .expect(201);

      projectId = projectRes.body.projectId;
    });

    it('should return activityId in chat response', async () => {
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Test message for activity tracking' })
        .expect(201);

      // Verify activityId is returned
      assert.ok(chatRes.body.activityId, 'Should have activityId in response');
      assert.ok(chatRes.body.activityId.startsWith('act_'), 'activityId should start with act_');
    });

    it('should return taskGroupId in chat response when queueStore available', async () => {
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Test message for TaskGroup creation' })
        .expect(201);

      // Verify taskGroupId is returned (only when queueStore is provided)
      // The mock queueStore always returns successfully
      assert.ok(chatRes.body.taskGroupId, 'Should have taskGroupId in response');
      assert.ok(chatRes.body.taskGroupId.startsWith('tg_chat_'), 'taskGroupId should start with tg_chat_');
    });

    it('should create activity event visible in /api/activity', async () => {
      // Send a chat message
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Activity visibility test' })
        .expect(201);

      // Get activity events
      const activityRes = await request(app)
        .get('/api/activity')
        .expect(200);

      // Verify activity exists
      assert.ok(Array.isArray(activityRes.body.events), 'Should have events array');

      // Find the chat_received activity
      const chatActivity = activityRes.body.events.find(
        (e: any) => e.type === 'chat_received' && e.projectId === projectId
      );

      assert.ok(chatActivity, 'Should find chat_received activity for this project');
      assert.ok(chatActivity.summary.includes('Chat message received'), 'Summary should describe chat receipt');
    });

    it('should include runId and taskGroupId for execution pipeline tracing', async () => {
      const chatRes = await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: 'Pipeline tracing test' })
        .expect(201);

      // All pipeline identifiers should be present
      assert.ok(chatRes.body.runId, 'Should have runId for execution tracking');
      assert.ok(chatRes.body.runId.startsWith('run_'), 'runId format check');
      assert.ok(chatRes.body.activityId, 'Should have activityId for audit tracking');
      assert.ok(chatRes.body.taskGroupId, 'Should have taskGroupId for queue tracking');

      // Verify the user and assistant messages have the runId
      assert.ok(chatRes.body.userMessage, 'Should have userMessage');
      assert.ok(chatRes.body.assistantMessage, 'Should have assistantMessage');
      assert.ok(chatRes.body.assistantMessage.runId, 'assistantMessage should have runId');
    });

    it('should record error as activity when chat fails validation', async () => {
      // Send empty content (should fail validation)
      await request(app)
        .post('/api/projects/' + projectId + '/chat')
        .send({ content: '' })
        .expect(400);

      // Get activity events
      const activityRes = await request(app)
        .get('/api/activity')
        .expect(200);

      // Find the chat_error activity
      const errorActivity = activityRes.body.events.find(
        (e: any) => e.type === 'chat_error' && e.projectId === projectId
      );

      assert.ok(errorActivity, 'Should find chat_error activity for validation failure');
      assert.ok(errorActivity.summary.includes('validation failed'), 'Summary should describe validation failure');
    });

    it('should record error as activity when project not found', async () => {
      // Send to non-existent project
      await request(app)
        .post('/api/projects/non-existent-project-id/chat')
        .send({ content: 'Test' })
        .expect(404);

      // Get activity events
      const activityRes = await request(app)
        .get('/api/activity')
        .expect(200);

      // Find the chat_error activity for not found
      const errorActivity = activityRes.body.events.find(
        (e: any) => e.type === 'chat_error' && e.details?.error === 'NOT_FOUND'
      );

      assert.ok(errorActivity, 'Should find chat_error activity for project not found');
    });
  });

  describe('Multiple Projects Scenario', () => {
    it('should handle 2 projects with different settings', async function() {
      this.timeout(15000);

      // Create Project 1 - Normal
      const project1Res = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/multi-project-1',
          alias: 'Project One',
        })
        .expect(201);

      // Create Project 2 - Runner Dev with bootstrap
      const project2Res = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/multi-project-2',
          alias: 'Project Two',
        })
        .expect(201);

      // Configure Project 2
      await request(app)
        .patch('/api/projects/' + project2Res.body.projectId)
        .send({ 
          projectType: 'runner-dev',
          bootstrapPrompt: 'Project 2 bootstrap'
        })
        .expect(200);

      // Send chat to both
      const chat1Res = await request(app)
        .post('/api/projects/' + project1Res.body.projectId + '/chat')
        .send({ content: 'Message to project 1' })
        .expect(201);

      const chat2Res = await request(app)
        .post('/api/projects/' + project2Res.body.projectId + '/chat')
        .send({ content: 'Message to project 2' })
        .expect(201);

      // Verify isolation
      assert.notEqual(chat1Res.body.runId, chat2Res.body.runId, 'Runs should be different');

      // Verify bootstrap injection only for project 2
      assert.equal(chat1Res.body.bootstrapInjected, false, 'Project 1 should not have bootstrap');
      assert.equal(chat2Res.body.bootstrapInjected, true, 'Project 2 should have bootstrap');

      // Verify project types
      const p1 = await request(app).get('/api/projects/' + project1Res.body.projectId).expect(200);
      const p2 = await request(app).get('/api/projects/' + project2Res.body.projectId).expect(200);

      assert.ok(!p1.body.project.projectType || p1.body.project.projectType === 'normal');
      assert.equal(p2.body.project.projectType, 'runner-dev');
    });
  });
});
