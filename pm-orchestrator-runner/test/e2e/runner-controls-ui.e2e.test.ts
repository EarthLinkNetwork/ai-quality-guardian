/**
 * E2E Test: Runner Controls UI Visibility
 *
 * Per docs/spec/RUNNER_CONTROLS_SELF_UPDATE.md AC-RC-UI-1:
 * - Runner Controls section visible in Settings page
 * - Buttons: Build, Restart, Stop
 * - Status display: Running status, PID, Build SHA, Timestamp
 * - Operation result: Success/Failure display
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';

describe('E2E: Runner Controls UI (AC-RC-UI-1)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  let tempStateDir: string;
  const namespace = 'runner-controls-ui-test';
  const sessionId = 'session-rc-ui-001';

  before(async () => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-controls-ui-test-'));
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
      projectRoot: process.cwd(),
      stateDir: tempStateDir,
    });
  });

  after(() => {
    if (tempStateDir && fs.existsSync(tempStateDir)) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    }
  });

  describe('Static HTML Structure', () => {
    it('should serve index.html with Runner Controls section', async () => {
      const res = await request(app)
        .get('/')
        .expect(200)
        .expect('Content-Type', /html/);

      const html = res.text;

      // Verify Runner Controls section exists in Settings
      assert.ok(
        html.includes('data-testid="settings-runner-controls"'),
        'Settings page should have Runner Controls section with test ID'
      );

      assert.ok(
        html.includes('Runner Controls'),
        'Settings page should have "Runner Controls" heading'
      );
    });

    it('should have Build button in Runner Controls', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('id="btn-runner-build"'),
        'Should have Build button with correct ID'
      );
      assert.ok(
        html.includes('runnerBuild()'),
        'Build button should call runnerBuild function'
      );
    });

    it('should have Restart button in Runner Controls', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('id="btn-runner-restart"'),
        'Should have Restart button with correct ID'
      );
      assert.ok(
        html.includes('runnerRestart()'),
        'Restart button should call runnerRestart function'
      );
    });

    it('should have Stop button in Runner Controls', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('id="btn-runner-stop"'),
        'Should have Stop button with correct ID'
      );
      assert.ok(
        html.includes('runnerStop()'),
        'Stop button should call runnerStop function'
      );
    });

    it('should have status display elements', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('id="runner-status-dot"'),
        'Should have status indicator dot'
      );
      assert.ok(
        html.includes('id="runner-status-label"'),
        'Should have status label'
      );
      assert.ok(
        html.includes('id="runner-status-detail"'),
        'Should have status detail (for PID, build_sha, timestamp)'
      );
    });

    it('should have result display area', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('id="runner-controls-result"'),
        'Should have result display area'
      );
    });
  });

  describe('CSS Styles', () => {
    it('should include Runner Controls CSS styles', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('.runner-controls'),
        'Should have .runner-controls CSS class'
      );
      assert.ok(
        html.includes('.runner-controls-status'),
        'Should have .runner-controls-status CSS class'
      );
      assert.ok(
        html.includes('.runner-controls-actions'),
        'Should have .runner-controls-actions CSS class'
      );
      assert.ok(
        html.includes('.runner-controls-result'),
        'Should have .runner-controls-result CSS class'
      );
    });

    it('should have status dot styles for running/stopped/building states', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('.status-dot.running'),
        'Should have .status-dot.running CSS'
      );
      assert.ok(
        html.includes('.status-dot.stopped'),
        'Should have .status-dot.stopped CSS'
      );
      assert.ok(
        html.includes('.status-dot.building'),
        'Should have .status-dot.building CSS'
      );
    });

    it('should have button styles for Build/Restart/Stop', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('.btn-build'),
        'Should have .btn-build CSS'
      );
      assert.ok(
        html.includes('.btn-restart'),
        'Should have .btn-restart CSS'
      );
      assert.ok(
        html.includes('.btn-stop'),
        'Should have .btn-stop CSS'
      );
    });
  });

  describe('JavaScript Functions', () => {
    it('should define loadRunnerControlsStatus function', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('async function loadRunnerControlsStatus()'),
        'Should define loadRunnerControlsStatus function'
      );
    });

    it('should define updateRunnerControlsUI function', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('function updateRunnerControlsUI()'),
        'Should define updateRunnerControlsUI function'
      );
    });

    it('should define runnerBuild function', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('async function runnerBuild()'),
        'Should define runnerBuild function'
      );
    });

    it('should define runnerRestart function', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('async function runnerRestart()'),
        'Should define runnerRestart function'
      );
    });

    it('should define runnerStop function', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      assert.ok(
        html.includes('async function runnerStop()'),
        'Should define runnerStop function'
      );
    });

    it('should call loadRunnerControlsStatus when Settings Global is rendered', async () => {
      const res = await request(app).get('/').expect(200);
      const html = res.text;

      // The renderSettingsGlobal function should call loadRunnerControlsStatus at the end
      assert.ok(
        html.includes('loadRunnerControlsStatus()'),
        'Should call loadRunnerControlsStatus when rendering Settings'
      );
    });
  });

  describe('API Integration', () => {
    it('should have /api/runner/status endpoint', async () => {
      const res = await request(app)
        .get('/api/runner/status')
        .expect(200);

      assert.ok('isRunning' in res.body, 'Status should have isRunning field');
    });

    it('should have /api/runner/build endpoint registered', async () => {
      // Verify endpoint is registered by checking routes list
      // We don't actually call build as it takes too long
      const res = await request(app)
        .get('/api/routes')
        .expect(200);

      const hasBuildRoute = res.body.routes.some((r: string) =>
        r.includes('/api/runner/build') && r.startsWith('POST')
      );

      assert.ok(hasBuildRoute, 'Build endpoint should be registered');
    });

    it('should have /api/runner/stop endpoint', async () => {
      const res = await request(app)
        .post('/api/runner/stop')
        .expect(200);

      assert.ok('success' in res.body, 'Stop endpoint should return success field');
    });

    it('should have /api/runner/restart endpoint registered', async () => {
      // Verify endpoint is registered by checking routes list
      // We don't actually call restart as it takes too long
      const res = await request(app)
        .get('/api/routes')
        .expect(200);

      const hasRestartRoute = res.body.routes.some((r: string) =>
        r.includes('/api/runner/restart') && r.startsWith('POST')
      );

      assert.ok(hasRestartRoute, 'Restart endpoint should be registered');
    });
  });
});
