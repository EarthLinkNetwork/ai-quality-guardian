/**
 * Unit Tests: Chat Input Draft Preservation
 *
 * Tests that chat input text is preserved across re-renders (navigation, refresh).
 *
 * The fix adds:
 * 1. A global chatInputDrafts map to store input text per project
 * 2. Draft saving at renderChat() start (before DOM replacement)
 * 3. Draft restoration after DOM rebuild
 * 4. An input event listener to continuously save drafts
 * 5. Draft clearing only after successful message send
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createApp } from '../../../src/web/server';
import { initNoDynamo, resetNoDynamo, resetNoDynamoExtended } from '../../../src/web/dal/no-dynamo';
import { resetDAL } from '../../../src/web/dal/dal-factory';

describe('Chat Input Draft Preservation', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  const testSessionId = 'chat-draft-test-session';
  const testNamespace = 'chat-draft-test';

  // Minimal mock QueueStore
  const mockQueueStore = {
    enqueue: async () => ({
      task_id: 'mock-task',
      task_group_id: 'mock-group',
      namespace: testNamespace,
      status: 'QUEUED' as const,
      created_at: new Date().toISOString(),
    }),
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-chat-draft-'));
    stateDir = path.join(tempDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    initNoDynamo(stateDir);
  });

  after(() => {
    resetNoDynamo();
    resetNoDynamoExtended();
    resetDAL();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = createApp({
      queueStore: mockQueueStore as any,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  describe('Frontend code contains draft preservation logic', () => {
    it('should include chatInputDrafts variable declaration in served HTML', async () => {
      const res = await request(app)
        .get('/')
        .expect(200);

      const html = res.text;
      assert.ok(
        html.includes('var chatInputDrafts = {}'),
        'HTML should contain chatInputDrafts map declaration'
      );
    });

    it('should save draft before DOM replacement in renderChat', async () => {
      const res = await request(app)
        .get('/')
        .expect(200);

      const html = res.text;
      // Check that renderChat saves the existing input value before replacing innerHTML
      assert.ok(
        html.includes('chatInputDrafts[currentChatProjectId || projectId] = existingInput.value'),
        'renderChat should save draft before DOM replacement'
      );
    });

    it('should restore draft after re-render', async () => {
      const res = await request(app)
        .get('/')
        .expect(200);

      const html = res.text;
      // Check that draft is restored after DOM rebuild
      assert.ok(
        html.includes('chatInputDrafts[projectId]'),
        'renderChat should restore draft from chatInputDrafts'
      );
      assert.ok(
        html.includes('chatInput.value = draft'),
        'renderChat should set textarea value from saved draft'
      );
    });

    it('should register input event listener for continuous draft saving', async () => {
      const res = await request(app)
        .get('/')
        .expect(200);

      const html = res.text;
      // Check that an input event listener is added to save drafts on typing
      assert.ok(
        html.includes("chatInput.addEventListener('input'"),
        'Should add input event listener for draft saving'
      );
    });

    it('should clear draft after successful message send', async () => {
      const res = await request(app)
        .get('/')
        .expect(200);

      const html = res.text;
      // Check that draft is deleted after successful send
      assert.ok(
        html.includes('delete chatInputDrafts[projectId]'),
        'Should clear draft after successful send'
      );
    });

    it('should explicitly clear input value after successful message send', async () => {
      const res = await request(app)
        .get('/')
        .expect(200);

      const html = res.text;
      // Verify that sendChatMessage clears input.value = '' on success
      // This ensures the text field is emptied even if renderChat doesn't fully re-render
      assert.ok(
        html.includes("input.value = ''"),
        'Should explicitly clear input.value after successful send'
      );
    });
  });

  describe('Chat API still works correctly (no regression)', () => {
    async function createTestProject(): Promise<string> {
      const projectRes = await request(app)
        .post('/api/projects')
        .send({
          projectPath: '/test/chat-draft-' + Date.now(),
          alias: 'Chat Draft Test',
          tags: ['test'],
        })
        .expect(201);
      return projectRes.body.projectId;
    }

    it('should accept chat messages without breaking', async () => {
      const projectId = await createTestProject();

      const chatRes = await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Test message for draft preservation' })
        .expect(201);

      assert.ok(chatRes.body.userMessage, 'userMessage should be present');
      assert.equal(chatRes.body.userMessage.content, 'Test message for draft preservation');
    });

    it('should return conversation with messages after send', async () => {
      const projectId = await createTestProject();

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Hello world' })
        .expect(201);

      const convRes = await request(app)
        .get(`/api/projects/${projectId}/conversation`)
        .expect(200);

      assert.ok(convRes.body.messages, 'messages should be present');
      assert.ok(convRes.body.messages.length > 0, 'should have at least one message');
      assert.equal(convRes.body.messages[0].content, 'Hello world');
    });
  });
});
