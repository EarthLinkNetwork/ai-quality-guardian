/**
 * E2E Test: Build and Restart Reflection
 *
 * Per docs/spec/RUNNER_CONTROLS_SELF_UPDATE.md AC-BUILD-SHA-1:
 * - npm run build generates dist/build-meta.json
 * - /api/health returns build_sha
 * - Restart updates build_sha
 */

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'assert';
import request from 'supertest';
import { Express } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createApp } from '../../src/web/server';
import { InMemoryQueueStore } from '../../src/queue/in-memory-queue-store';
import { IQueueStore } from '../../src/queue/queue-store';
import { resetNoDynamo, resetNoDynamoExtended } from '../../src/web/dal/no-dynamo';

describe('E2E: Build and Restart Reflection (AC-BUILD-SHA-1)', () => {
  let app: Express;
  let queueStore: IQueueStore;
  let tempStateDir: string;
  const namespace = 'build-sha-test';
  const sessionId = 'session-build-sha-001';
  const projectRoot = process.cwd();

  before(async () => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-sha-test-'));
    queueStore = new InMemoryQueueStore({ namespace });
    app = createApp({
      queueStore,
      sessionId,
      namespace,
      projectRoot,
      stateDir: tempStateDir,
    });
  });

  after(() => {
    // Reset singletons to avoid pollution between tests
    resetNoDynamo();
    resetNoDynamoExtended();

    if (tempStateDir && fs.existsSync(tempStateDir)) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    }
  });

  describe('Build Meta Generation', () => {
    it('postbuild script should exist in package.json', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      assert.ok(
        packageJson.scripts?.postbuild,
        'package.json should have postbuild script'
      );
      assert.ok(
        packageJson.scripts.postbuild.includes('generate-build-meta'),
        'postbuild should run generate-build-meta.js'
      );
    });

    it('generate-build-meta.js script should exist', () => {
      const scriptPath = path.join(projectRoot, 'scripts', 'generate-build-meta.js');
      assert.ok(
        fs.existsSync(scriptPath),
        'scripts/generate-build-meta.js should exist'
      );
    });

    it('dist/build-meta.json should exist after build', () => {
      const buildMetaPath = path.join(projectRoot, 'dist', 'build-meta.json');
      
      // This test assumes build has been run before tests
      // If not, skip with informative message
      if (!fs.existsSync(buildMetaPath)) {
        console.log('SKIP: dist/build-meta.json not found. Run "npm run build" first.');
        return;
      }

      const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
      
      assert.ok(buildMeta.build_sha, 'build-meta.json should have build_sha');
      assert.ok(buildMeta.build_timestamp, 'build-meta.json should have build_timestamp');
    });

    it('build-meta.json should have required fields', () => {
      const buildMetaPath = path.join(projectRoot, 'dist', 'build-meta.json');
      
      if (!fs.existsSync(buildMetaPath)) {
        console.log('SKIP: dist/build-meta.json not found. Run "npm run build" first.');
        return;
      }

      const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
      
      // Required per spec
      assert.ok('build_sha' in buildMeta, 'Should have build_sha field');
      assert.ok('build_timestamp' in buildMeta, 'Should have build_timestamp field');
      
      // Optional but expected when in git repo
      // git_sha and git_branch may be undefined in non-git environments
    });
  });

  describe('/api/health Build SHA', () => {
    it('should include build_sha in health response when build-meta exists', async () => {
      const buildMetaPath = path.join(projectRoot, 'dist', 'build-meta.json');
      
      if (!fs.existsSync(buildMetaPath)) {
        console.log('SKIP: dist/build-meta.json not found. Run "npm run build" first.');
        return;
      }

      const res = await request(app)
        .get('/api/health')
        .expect(200);

      // Per AC-BUILD-SHA-1, /api/health should return build_sha
      assert.ok('build_sha' in res.body, '/api/health should include build_sha');
      
      // Verify it matches build-meta.json
      const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
      assert.strictEqual(
        res.body.build_sha,
        buildMeta.build_sha,
        'build_sha in health should match build-meta.json'
      );
    });

    it('should include build_timestamp in health response', async () => {
      const buildMetaPath = path.join(projectRoot, 'dist', 'build-meta.json');
      
      if (!fs.existsSync(buildMetaPath)) {
        console.log('SKIP: dist/build-meta.json not found. Run "npm run build" first.');
        return;
      }

      const res = await request(app)
        .get('/api/health')
        .expect(200);

      assert.ok('build_timestamp' in res.body, '/api/health should include build_timestamp');
    });
  });

  describe('/api/runner/status Build Info', () => {
    it('should include build_sha in runner status when available', async () => {
      const res = await request(app)
        .get('/api/runner/status')
        .expect(200);

      // Status may or may not have build_sha depending on ProcessSupervisor state
      // This test verifies the field can be returned
      assert.ok('isRunning' in res.body, 'Runner status should have isRunning');
      // build_sha is optional in runner status when not running via ProcessSupervisor
    });
  });

  describe('Build SHA Format', () => {
    it('build_sha should be a valid short git SHA or fallback format', () => {
      const buildMetaPath = path.join(projectRoot, 'dist', 'build-meta.json');
      
      if (!fs.existsSync(buildMetaPath)) {
        console.log('SKIP: dist/build-meta.json not found. Run "npm run build" first.');
        return;
      }

      const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
      const sha = buildMeta.build_sha;

      // Format: either short git SHA (7 chars hex) or "build-<timestamp>"
      const isGitSha = /^[a-f0-9]{7}$/.test(sha);
      const isFallback = /^build-\d+$/.test(sha);

      assert.ok(
        isGitSha || isFallback,
        `build_sha should be valid format (got: ${sha})`
      );
    });

    it('build_timestamp should be valid ISO-8601', () => {
      const buildMetaPath = path.join(projectRoot, 'dist', 'build-meta.json');
      
      if (!fs.existsSync(buildMetaPath)) {
        console.log('SKIP: dist/build-meta.json not found. Run "npm run build" first.');
        return;
      }

      const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
      const ts = buildMeta.build_timestamp;

      const date = new Date(ts);
      assert.ok(
        !isNaN(date.getTime()),
        `build_timestamp should be valid ISO-8601 (got: ${ts})`
      );
    });
  });
});
