/**
 * Unit Tests: Chat Input Enhancements
 *
 * Tests:
 * 1. Textarea sends with multi-line content
 * 2. Image attachments are accepted in chat API
 * 3. Image attachments are stored in message metadata
 * 4. Invalid images are filtered out
 * 5. Chat without images still works (backward compat)
 * 6. Large body (base64 images) accepted by JSON parser
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

describe('Chat Input Enhancements', () => {
  let app: Express;
  let tempDir: string;
  let stateDir: string;
  const testSessionId = 'chat-enhance-test-session';
  const testNamespace = 'chat-enhance-test';

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

  // Tiny 1x1 PNG as base64 data URL
  const TINY_PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-chat-enhance-'));
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = createApp({
      queueStore: mockQueueStore as any,
      sessionId: testSessionId,
      namespace: testNamespace,
      projectRoot: tempDir,
      stateDir: stateDir,
    });
  });

  /**
   * Helper: create a test project
   */
  async function createTestProject(): Promise<string> {
    const projectRes = await request(app)
      .post('/api/projects')
      .send({
        projectPath: '/test/chat-enhance-' + Date.now(),
        alias: 'Chat Enhance Test',
        tags: ['test'],
      })
      .expect(201);
    return projectRes.body.projectId;
  }

  describe('Multi-line content support', () => {
    it('should accept multi-line content in chat message', async () => {
      const projectId = await createTestProject();
      const multiLineContent = 'Line 1\nLine 2\nLine 3\n\nParagraph 2';

      const chatRes = await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: multiLineContent })
        .expect(201);

      assert.ok(chatRes.body.userMessage, 'userMessage should be present');
      assert.equal(chatRes.body.userMessage.content, multiLineContent);
    });

    it('should preserve newlines in stored message', async () => {
      const projectId = await createTestProject();
      const content = 'First line\nSecond line\n\nThird paragraph';

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content })
        .expect(201);

      // Retrieve conversation and verify content is preserved
      const convRes = await request(app)
        .get(`/api/projects/${projectId}/conversation`)
        .expect(200);

      const userMsg = convRes.body.messages.find((m: any) => m.role === 'user');
      assert.ok(userMsg, 'user message should exist');
      assert.equal(userMsg.content, content);
    });
  });

  describe('Image attachment support', () => {
    it('should accept chat message with images', async () => {
      const projectId = await createTestProject();

      const chatRes = await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({
          content: 'Please review this screenshot',
          images: [
            {
              name: 'screenshot.png',
              type: 'image/png',
              data: TINY_PNG_DATA,
            },
          ],
        })
        .expect(201);

      assert.ok(chatRes.body.userMessage, 'userMessage should be present');
      assert.equal(chatRes.body.userMessage.content, 'Please review this screenshot');
    });

    it('should store images in message metadata', async () => {
      const projectId = await createTestProject();

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({
          content: 'Check this image',
          images: [
            {
              name: 'test.png',
              type: 'image/png',
              data: TINY_PNG_DATA,
            },
          ],
        })
        .expect(201);

      // Retrieve conversation and check metadata
      const convRes = await request(app)
        .get(`/api/projects/${projectId}/conversation`)
        .expect(200);

      const userMsg = convRes.body.messages.find((m: any) => m.role === 'user');
      assert.ok(userMsg, 'user message should exist');
      assert.ok(userMsg.metadata, 'metadata should exist');
      assert.ok(userMsg.metadata.images, 'images should exist in metadata');
      assert.equal(userMsg.metadata.images.length, 1);
      assert.equal(userMsg.metadata.images[0].name, 'test.png');
      assert.equal(userMsg.metadata.images[0].type, 'image/png');
      assert.equal(userMsg.metadata.images[0].data, TINY_PNG_DATA);
    });

    it('should accept multiple image attachments', async () => {
      const projectId = await createTestProject();

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({
          content: 'Multiple images',
          images: [
            { name: 'img1.png', type: 'image/png', data: TINY_PNG_DATA },
            { name: 'img2.png', type: 'image/png', data: TINY_PNG_DATA },
            { name: 'img3.png', type: 'image/png', data: TINY_PNG_DATA },
          ],
        })
        .expect(201);

      const convRes = await request(app)
        .get(`/api/projects/${projectId}/conversation`)
        .expect(200);

      const userMsg = convRes.body.messages.find((m: any) => m.role === 'user');
      assert.ok(userMsg.metadata.images, 'images should exist');
      assert.equal(userMsg.metadata.images.length, 3);
    });

    it('should filter out invalid image entries', async () => {
      const projectId = await createTestProject();

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({
          content: 'With invalid images',
          images: [
            { name: 'valid.png', type: 'image/png', data: TINY_PNG_DATA },
            { name: 'no-data.png', type: 'image/png' }, // missing data
            { data: TINY_PNG_DATA }, // missing type
            null, // null entry
            'not-an-object', // string entry
          ],
        })
        .expect(201);

      const convRes = await request(app)
        .get(`/api/projects/${projectId}/conversation`)
        .expect(200);

      const userMsg = convRes.body.messages.find((m: any) => m.role === 'user');
      assert.ok(userMsg.metadata.images, 'images should exist');
      // Only the valid one should remain
      assert.equal(userMsg.metadata.images.length, 1);
      assert.equal(userMsg.metadata.images[0].name, 'valid.png');
    });

    it('should not include metadata.images when no images are sent', async () => {
      const projectId = await createTestProject();

      await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'No images here' })
        .expect(201);

      const convRes = await request(app)
        .get(`/api/projects/${projectId}/conversation`)
        .expect(200);

      const userMsg = convRes.body.messages.find((m: any) => m.role === 'user');
      // metadata may be null/undefined or not have images
      if (userMsg.metadata) {
        assert.ok(!userMsg.metadata.images, 'images should not be in metadata when none sent');
      }
    });

    it('should handle empty images array gracefully', async () => {
      const projectId = await createTestProject();

      const chatRes = await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Empty images array', images: [] })
        .expect(201);

      assert.ok(chatRes.body.userMessage, 'should succeed');

      const convRes = await request(app)
        .get(`/api/projects/${projectId}/conversation`)
        .expect(200);

      const userMsg = convRes.body.messages.find((m: any) => m.role === 'user');
      if (userMsg.metadata) {
        assert.ok(!userMsg.metadata.images, 'images should not be stored for empty array');
      }
    });
  });

  describe('Backward compatibility', () => {
    it('should accept plain text chat without images field', async () => {
      const projectId = await createTestProject();

      const chatRes = await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({ content: 'Simple message' })
        .expect(201);

      assert.ok(chatRes.body.userMessage);
      assert.equal(chatRes.body.userMessage.content, 'Simple message');
    });
  });

  describe('Large payload support', () => {
    it('should accept large base64 image payload', async () => {
      const projectId = await createTestProject();

      // Generate a ~100KB base64 string to simulate a real image
      const largeData = 'data:image/png;base64,' + 'A'.repeat(100000);

      const chatRes = await request(app)
        .post(`/api/projects/${projectId}/chat`)
        .send({
          content: 'Large image test',
          images: [
            { name: 'large.png', type: 'image/png', data: largeData },
          ],
        })
        .expect(201);

      assert.ok(chatRes.body.userMessage, 'should handle large payload');
    });
  });
});
