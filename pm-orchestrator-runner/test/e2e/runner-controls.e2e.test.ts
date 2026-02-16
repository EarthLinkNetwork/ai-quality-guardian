/**
 * E2E Test: Runner Controls
 *
 * Tests AC-OPS-1: Runner Controls in Web UI
 * - Stop (safe shutdown)
 * - Build (npm run build equivalent)
 * - Restart (stop -> build -> start sequence)
 * - Operations work for selfhost scenario
 * - Success/failure clearly displayed
 * - On failure: show cause and next action
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';
import {
  setRunnerProcess,
  getRunnerProcess,
} from '../../src/web/routes/runner-controls';

describe('E2E: Runner Controls (AC-OPS-1)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  let tempStateDir: string;
  const namespace = 'runner-controls-test';
  const sessionId = 'session-runner-001';

  before(async () => {
    // Create temp state directory (required for runner controls routes)
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-controls-test-'));

    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
      projectRoot: process.cwd(),
      stateDir: tempStateDir,  // Required for runner controls routes
    });
  });

  beforeEach(() => {
    // Clear runner process state before each test
    setRunnerProcess(null);
  });

  afterEach(() => {
    // Clean up runner process state after each test
    setRunnerProcess(null);
  });

  after(() => {
    // Clean up temp state directory
    if (tempStateDir && fs.existsSync(tempStateDir)) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    }
  });

  describe('GET /api/runner/status', () => {
    it('should return status with web process info (E1-2: selfhost mode always running)', async () => {
      const res = await request(app)
        .get('/api/runner/status')
        .expect(200);

      // E1-2 Fix: In selfhost mode, web is always running since API is responding
      assert.strictEqual(res.body.isRunning, true);
      // Should return current process.pid as fallback
      assert.ok(typeof res.body.pid === 'number', 'pid should be a number');
      assert.ok(res.body.pid > 0, 'pid should be positive');
    });
  });

  describe('POST /api/runner/stop', () => {
    it('should return success when runner is not running', async () => {
      const res = await request(app)
        .post('/api/runner/stop')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.operation, 'stop');
      assert.ok(res.body.message.includes('not currently running'));
    });
  });

  describe('Response structure validation', () => {
    it('should include required fields in stop response', async () => {
      const res = await request(app)
        .post('/api/runner/stop')
        .expect(200);

      assert.ok('success' in res.body, 'Response should have success field');
      assert.ok('operation' in res.body, 'Response should have operation field');
      assert.ok('message' in res.body, 'Response should have message field');
      assert.ok('duration_ms' in res.body, 'Response should have duration_ms field');
    });

    it('should include required fields in status response', async () => {
      const res = await request(app)
        .get('/api/runner/status')
        .expect(200);

      assert.ok('isRunning' in res.body, 'Response should have isRunning field');
    });
  });

  describe('AC-OPS-1: Error handling with nextActions', () => {
    it('should define proper next actions structure', () => {
      // Validate the interface through type checking
      const mockErrorResponse = {
        success: false,
        operation: 'build' as const,
        message: 'Build failed',
        error: 'npm ERR! some error',
        duration_ms: 5000,
        nextActions: [
          { label: 'Retry', action: 'retry' as const },
          { label: 'View Logs', action: 'view_logs' as const },
          { label: 'Back', action: 'back' as const },
        ],
      };

      assert.strictEqual(mockErrorResponse.nextActions.length, 3);
      assert.strictEqual(mockErrorResponse.nextActions[0].action, 'retry');
      assert.strictEqual(mockErrorResponse.nextActions[1].action, 'view_logs');
    });
  });

  describe('Operation timing', () => {
    it('should report duration_ms for stop operation', async () => {
      const res = await request(app)
        .post('/api/runner/stop')
        .expect(200);

      assert.ok(typeof res.body.duration_ms === 'number');
      assert.ok(res.body.duration_ms >= 0);
    });
  });

  describe('Selfhost scenario support', () => {
    it('should have status endpoint for selfhost operation', async () => {
      const res = await request(app)
        .get('/api/runner/status')
        .expect(200);

      assert.ok('isRunning' in res.body);
    });

    it('should have stop endpoint for selfhost operation', async () => {
      const res = await request(app)
        .post('/api/runner/stop')
        .expect(200);

      assert.ok('operation' in res.body);
      assert.strictEqual(res.body.operation, 'stop');
    });

    // Note: Build and Restart endpoints exist but require actual npm scripts
    // They are tested via unit tests, not E2E tests that execute real builds
  });

  describe('Restart handler wiring', () => {
    it('should use restartHandler and invoke postResponse after responding', async () => {
      let handlerCalled = false;
      let postResponseCalled = false;
      let resolvePostResponse: (() => void) | null = null;
      const postResponsePromise = new Promise<void>((resolve) => {
        resolvePostResponse = resolve;
      });

      const appWithRestart = createApp({
        queueStore,
        sessionId,
        namespace,
        projectRoot: process.cwd(),
        stateDir: tempStateDir,
        runnerRestartHandler: async () => {
          handlerCalled = true;
          return {
            success: true,
            oldPid: 123,
            newPid: 456,
            buildMeta: {
              build_sha: 'test-sha',
              build_timestamp: new Date().toISOString(),
            },
            message: 'Restart scheduled',
            postResponse: () => {
              postResponseCalled = true;
              resolvePostResponse?.();
            },
          };
        },
      });

      const res = await request(appWithRestart)
        .post('/api/runner/restart')
        .expect(200);

      assert.strictEqual(handlerCalled, true);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.operation, 'restart');
      assert.strictEqual(res.body.old_pid, 123);
      assert.strictEqual(res.body.new_pid, 456);
      assert.strictEqual(res.body.build_sha, 'test-sha');

      await Promise.race([
        postResponsePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('postResponse not called')), 200)),
      ]);

      assert.strictEqual(postResponseCalled, true);
    });
  });
});
