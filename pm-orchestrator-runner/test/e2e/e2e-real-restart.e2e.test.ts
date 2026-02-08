/**
 * E2E Test: Real Restart Verification
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md
 *
 * Tests:
 * - AC-SUP-1: Supervisor manages Web as child process
 * - AC-SUP-2: Safety mechanisms (build fail → no restart)
 * - AC-OPS-2: Restart(REAL) = PID must change
 * - AC-OPS-3: build_sha tracked and updated after restart
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  ProcessSupervisor,
  createProcessSupervisor,
  BuildMeta,
  WebProcessState,
} from '../../src/supervisor/index';

describe('E2E: Real Restart Verification (WEB_COMPLETE_OPERATION)', function () {
  // Increase timeout for process operations
  this.timeout(30000);

  let testProjectDir: string;
  let supervisor: ProcessSupervisor;
  let serverScriptPath: string;

  before(() => {
    // Create a mock project directory for testing
    testProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-restart-test-'));

    // Create a simple server script that keeps running
    serverScriptPath = path.join(testProjectDir, 'server.js');
    fs.writeFileSync(serverScriptPath, `
      const http = require('http');
      const port = process.env.PM_WEB_PORT || 15000;
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', pid: process.pid }));
      });
      server.listen(port, () => {
        console.log(\`Server running on port \${port}\`);
      });
    `);

    // Create package.json for the mock project
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      scripts: {
        build: 'echo "Build complete" && mkdir -p dist',
      },
    };
    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create dist directory
    fs.mkdirSync(path.join(testProjectDir, 'dist'), { recursive: true });
  });

  after(async () => {
    if (supervisor) {
      await supervisor.shutdown().catch(() => {});
    }
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true });
    }
  });

  beforeEach(async function () {
    this.timeout(10000);
    if (supervisor) {
      await supervisor.shutdown();
    }
    supervisor = createProcessSupervisor({
      projectRoot: testProjectDir,
      webPort: 15000 + Math.floor(Math.random() * 1000),
      buildScript: 'build',
      startCommand: ['node', serverScriptPath],
      startupWaitMs: 1000,
    });
  });

  describe('AC-OPS-3: Build SHA Reflection', () => {
    it('should generate build_sha after build', async () => {
      const result = await supervisor.build();

      assert.strictEqual(result.success, true, 'Build should succeed');
      assert.ok(result.buildMeta, 'Build should generate buildMeta');
      assert.ok(result.buildMeta?.build_sha, 'BuildMeta should have build_sha');
      assert.ok(result.buildMeta?.build_timestamp, 'BuildMeta should have build_timestamp');
    });

    it('should save build-meta.json to dist directory', async () => {
      await supervisor.build();

      const buildMetaPath = path.join(testProjectDir, 'dist', 'build-meta.json');
      assert.ok(fs.existsSync(buildMetaPath), 'build-meta.json should exist');

      const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
      assert.ok(buildMeta.build_sha, 'build-meta.json should have build_sha');
      assert.ok(buildMeta.build_timestamp, 'build-meta.json should have build_timestamp');
    });

    it('should load build metadata on start', async () => {
      // First, build to generate build-meta.json
      await supervisor.build();

      // Start the server
      const startResult = await supervisor.start();
      assert.strictEqual(startResult.success, true, 'Start should succeed');

      // Check that build metadata was loaded
      const buildMeta = supervisor.getBuildMeta();
      assert.ok(buildMeta, 'BuildMeta should be loaded');
      assert.ok(buildMeta?.build_sha, 'BuildMeta should have build_sha');
    });
  });

  describe('AC-OPS-2: Restart(REAL) - PID Change', function () {
    this.timeout(30000);

    it('should have different PID after restart', async function () {
      this.timeout(15000);
      // Start initial process
      const startResult = await supervisor.start();
      assert.strictEqual(startResult.success, true, 'Initial start should succeed');
      const oldPid = supervisor.getWebPid();
      assert.ok(oldPid, 'Initial PID should exist');

      // Restart (with build=false for faster testing)
      const restartResult = await supervisor.restart({ build: false });
      assert.strictEqual(restartResult.success, true, 'Restart should succeed');

      const newPid = supervisor.getWebPid();
      assert.ok(newPid, 'New PID should exist');
      assert.notStrictEqual(oldPid, newPid, 'PID must change after restart (AC-OPS-2)');
    });

    it('should track old and new PID in restart result', async function () {
      this.timeout(15000);
      // Start initial process
      await supervisor.start();
      const oldPid = supervisor.getWebPid();

      // Restart
      const restartResult = await supervisor.restart({ build: false });

      assert.strictEqual(restartResult.success, true);
      assert.strictEqual(restartResult.oldPid, oldPid, 'Old PID should match');
      assert.ok(restartResult.newPid, 'New PID should be returned');
      assert.notStrictEqual(restartResult.oldPid, restartResult.newPid, 'PIDs must differ');
    });

    it('should update build_sha after restart with build', async function () {
      this.timeout(20000);
      // Start initial process
      await supervisor.start();

      // Get initial build_sha (may be undefined)
      const initialBuildMeta = supervisor.getBuildMeta();

      // Restart with build
      const restartResult = await supervisor.restart({ build: true });
      assert.strictEqual(restartResult.success, true);

      // Get new build_sha
      const newBuildMeta = supervisor.getBuildMeta();
      assert.ok(newBuildMeta, 'Build metadata should exist after restart');
      assert.ok(newBuildMeta?.build_sha, 'build_sha should exist after restart');

      // If initial build metadata existed, verify it changed
      if (initialBuildMeta?.build_timestamp) {
        assert.notStrictEqual(
          initialBuildMeta.build_timestamp,
          newBuildMeta?.build_timestamp,
          'Build timestamp should change'
        );
      }
    });
  });

  describe('AC-SUP-1: Supervisor Manages Web as Child', () => {
    it('should start Web as child process', async () => {
      const startResult = await supervisor.start();

      assert.strictEqual(startResult.success, true, 'Start should succeed');
      assert.ok(startResult.pid, 'PID should be returned');

      const state = supervisor.getState();
      assert.strictEqual(state.status, 'running', 'Status should be running');
      assert.ok(state.pid, 'State should have PID');
    });

    it('should stop Web process gracefully', async () => {
      await supervisor.start();
      const pid = supervisor.getWebPid();
      assert.ok(pid, 'Process should be running');

      const stopResult = await supervisor.stop();
      assert.strictEqual(stopResult.success, true, 'Stop should succeed');

      const state = supervisor.getState();
      assert.strictEqual(state.status, 'stopped', 'Status should be stopped');
      assert.strictEqual(state.pid, null, 'PID should be null');
    });

    it('should track process state', async () => {
      // Initial state
      let state = supervisor.getState();
      assert.strictEqual(state.status, 'stopped');

      // After start
      await supervisor.start();
      state = supervisor.getState();
      assert.strictEqual(state.status, 'running');
      assert.ok(state.startTime);

      // After stop
      await supervisor.stop();
      state = supervisor.getState();
      assert.strictEqual(state.status, 'stopped');
    });
  });

  describe('AC-SUP-2: Safety Mechanisms', function () {
    this.timeout(30000);

    it('should preserve old process if build fails', async function () {
      this.timeout(20000);
      // Start initial process
      await supervisor.start();
      const oldPid = supervisor.getWebPid();
      assert.ok(oldPid, 'Initial process should be running');

      // Create a failing build script
      const packageJsonPath = path.join(testProjectDir, 'package.json');
      const originalPkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const failingPkg = {
        ...originalPkg,
        scripts: {
          ...originalPkg.scripts,
          build: 'exit 1', // Failing build
        },
      };
      fs.writeFileSync(packageJsonPath, JSON.stringify(failingPkg, null, 2));

      try {
        // Attempt restart with build (should fail)
        const restartResult = await supervisor.restart({ build: true });

        assert.strictEqual(restartResult.success, false, 'Restart should fail');
        assert.ok(restartResult.error?.includes('Build failed'), 'Error should mention build failure');

        // Old process should still be running
        // (In this test, since build fails, stop is not called)
        assert.strictEqual(restartResult.oldPid, oldPid, 'Old PID should be preserved');
      } finally {
        // Restore original package.json
        fs.writeFileSync(packageJsonPath, JSON.stringify(originalPkg, null, 2));
      }
    });

    it('should not restart without successful build when build=true', async function () {
      this.timeout(20000);
      // Start initial process
      await supervisor.start();

      // Create a failing build script
      const packageJsonPath = path.join(testProjectDir, 'package.json');
      const originalPkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const failingPkg = {
        ...originalPkg,
        scripts: {
          ...originalPkg.scripts,
          build: 'exit 1',
        },
      };
      fs.writeFileSync(packageJsonPath, JSON.stringify(failingPkg, null, 2));

      try {
        const restartResult = await supervisor.restart({ build: true });

        assert.strictEqual(restartResult.success, false);
        // Error message should indicate build failed and old process preserved
        assert.ok(restartResult.error?.includes('preserved'));
      } finally {
        fs.writeFileSync(packageJsonPath, JSON.stringify(originalPkg, null, 2));
      }
    });
  });

  describe('Health Check', function () {
    this.timeout(10000);

    it('should report healthy when running', async function () {
      await supervisor.start();

      const health = await supervisor.healthCheck();

      // The mock server responds to health check, so it should be healthy
      assert.strictEqual(health.healthy, true, 'Health check should succeed with mock server');
      assert.ok(health.pid, 'PID should be in health response');
      assert.ok(health.uptime_ms !== undefined, 'Uptime should be in health response');
    });

    it('should report unhealthy when stopped', async () => {
      const health = await supervisor.healthCheck();

      assert.strictEqual(health.healthy, false);
      assert.ok(health.error?.includes('not running'));
    });
  });

  describe('Edge Cases', function () {
    this.timeout(30000);

    it('should handle start when already running', async function () {
      this.timeout(10000);
      await supervisor.start();
      const pid1 = supervisor.getWebPid();

      // Start again (should return existing process)
      const result = await supervisor.start();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.pid, pid1, 'Should return same PID');
    });

    it('should handle stop when not running', async () => {
      const result = await supervisor.stop();
      assert.strictEqual(result.success, true);
    });

    it('should handle multiple restarts', async function () {
      this.timeout(30000);
      await supervisor.start();
      const pid1 = supervisor.getWebPid();

      // First restart
      await supervisor.restart({ build: false });
      const pid2 = supervisor.getWebPid();
      assert.notStrictEqual(pid1, pid2);

      // Second restart
      await supervisor.restart({ build: false });
      const pid3 = supervisor.getWebPid();
      assert.notStrictEqual(pid2, pid3);
      assert.notStrictEqual(pid1, pid3);
    });
  });
});
