/**
 * API Key Persistence E2E Tests (AC-K1)
 *
 * These tests verify that:
 * - API keys can be saved via PUT /api/settings/api-key
 * - API keys persist across server restart
 * - API key status endpoint returns correct configured state after restart
 *
 * Uses child process with simple server script (no DynamoDB needed).
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');

// Ensure .tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function log(file: string, message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(path.join(TMP_DIR, file), line);
  console.log(message);
}

function clearLog(file: string) {
  const filePath = path.join(TMP_DIR, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Start a simple WebServer using inline Node.js script
 * This avoids the CLI's DynamoDB dependency
 */
async function startServer(port: number, stateDir: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const script = `
const { WebServer } = require('./dist/web/server.js');

async function main() {
  const server = new WebServer({
    port: ${port},
    host: 'localhost',
    stateDir: '${stateDir}',
    // Mock queueStore - only needed for queue endpoints, not settings
    queueStore: null,
    sessionId: 'test-session',
    namespace: 'test'
  });

  await server.start();
  console.log('SERVER_STARTED');

  // Keep running until killed
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Server error:', err);
  process.exit(1);
});
`;

    const proc = spawn('node', ['-e', script], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        proc.kill();
        reject(new Error('Server start timeout after 15 seconds'));
      }
    }, 15000);

    proc.stdout?.on('data', (data) => {
      const str = data.toString();
      console.log('[SERVER]', str.trim());
      if (str.includes('SERVER_STARTED')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          // Give server a moment to fully initialize
          setTimeout(() => resolve(proc), 500);
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      console.log('[SERVER-STDERR]', data.toString().trim());
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code} before starting`));
      }
    });
  });
}

async function stopServer(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || proc.killed) {
      resolve();
      return;
    }
    proc.on('exit', () => {
      resolve();
    });
    proc.kill('SIGTERM');
    // Force kill after 5 seconds if needed
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
      resolve();
    }, 5000);
  });
}

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const response = await fetch(url, options);
  return response.json();
}

describe('API Key Persistence E2E Tests', function() {
  // These tests may take time due to server startup
  this.timeout(60000);

  const PORT = 5690;
  const LOG_FILE = 'api-key-persistence-e2e.log';
  const STATE_DIR = path.join(TMP_DIR, 'api-key-persistence-test');

  before(function() {
    // Clean up state directory
    if (fs.existsSync(STATE_DIR)) {
      fs.rmSync(STATE_DIR, { recursive: true });
    }
    fs.mkdirSync(STATE_DIR, { recursive: true });
  });

  describe('AC-K1: API Key Persistence Across Server Restart', function() {
    let serverProc: ChildProcess | null = null;

    before(function() {
      clearLog(LOG_FILE);
      log(LOG_FILE, '=== AC-K1: API Key Persistence Across Restart Test ===');
    });

    afterEach(async function() {
      if (serverProc) {
        await stopServer(serverProc);
        serverProc = null;
        // Wait a moment for port to be released
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    });

    it('should persist API key across server restart', async function() {
      // Phase 1: Start server and save API key
      log(LOG_FILE, '=== Phase 1: Save API Key ===');
      log(LOG_FILE, `Starting server on port ${PORT} with STATE_DIR=${STATE_DIR}...`);
      serverProc = await startServer(PORT, STATE_DIR);
      log(LOG_FILE, 'Server started successfully');

      // Check initial status - should be not configured
      log(LOG_FILE, 'Step 1: Checking initial API key status...');
      const initialStatus = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      log(LOG_FILE, `Initial status: ${JSON.stringify(initialStatus)}`);
      assert.equal(initialStatus.anthropic.configured, false);
      assert.equal(initialStatus.openai.configured, false);
      log(LOG_FILE, '[PASS] Initial status: both providers not configured');

      // Save an API key
      log(LOG_FILE, 'Step 2: Saving Anthropic API key...');
      const saveResponse = await fetchJson(`http://localhost:${PORT}/api/settings/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'anthropic',
          api_key: 'sk-ant-test-key-12345678901234567890'
        })
      });
      log(LOG_FILE, `Save response: ${JSON.stringify(saveResponse)}`);
      assert.equal(saveResponse.success, true);
      assert.equal(saveResponse.masked, 'sk-a****7890');
      log(LOG_FILE, '[PASS] API key saved successfully');

      // Verify status after save
      log(LOG_FILE, 'Step 3: Verifying API key status after save...');
      const statusAfterSave = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      log(LOG_FILE, `Status after save: ${JSON.stringify(statusAfterSave)}`);
      assert.equal(statusAfterSave.anthropic.configured, true);
      assert.equal(statusAfterSave.anthropic.masked, 'sk-a****7890');
      log(LOG_FILE, '[PASS] API key status shows configured');

      // Verify persistence file exists
      log(LOG_FILE, 'Step 4: Checking persistence file...');
      const persistenceFile = path.join(STATE_DIR, 'api-keys.json');
      assert.equal(fs.existsSync(persistenceFile), true);
      const persistedData = JSON.parse(fs.readFileSync(persistenceFile, 'utf-8'));
      log(LOG_FILE, `Persistence file contents: ${JSON.stringify(persistedData)}`);
      assert.equal(persistedData.anthropic.configured, true);
      log(LOG_FILE, '[PASS] Persistence file contains correct data');

      // Phase 2: Stop server
      log(LOG_FILE, '=== Phase 2: Stop Server ===');
      log(LOG_FILE, 'Stopping server...');
      await stopServer(serverProc);
      serverProc = null;
      log(LOG_FILE, 'Server stopped');

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Phase 3: Restart server and verify persistence
      log(LOG_FILE, '=== Phase 3: Restart Server and Verify Persistence ===');
      log(LOG_FILE, `Restarting server on port ${PORT}...`);
      serverProc = await startServer(PORT, STATE_DIR);
      log(LOG_FILE, 'Server restarted successfully');

      // Check API key status after restart
      log(LOG_FILE, 'Step 5: Checking API key status after restart...');
      const statusAfterRestart = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      log(LOG_FILE, `Status after restart: ${JSON.stringify(statusAfterRestart)}`);

      // Key assertions
      assert.equal(statusAfterRestart.anthropic.configured, true);
      assert.equal(statusAfterRestart.anthropic.masked, 'sk-a****7890');
      log(LOG_FILE, '[PASS] API key persisted across restart');

      // Verify full settings also reflect the key
      log(LOG_FILE, 'Step 6: Verifying full settings endpoint...');
      const fullSettings = await fetchJson(`http://localhost:${PORT}/api/settings`);
      log(LOG_FILE, `Full settings: ${JSON.stringify(fullSettings)}`);
      assert.equal(fullSettings.settings.api_key_configured, true);
      log(LOG_FILE, '[PASS] settings.api_key_configured is true');

      log(LOG_FILE, '=== TEST RESULT: PASS ===');
      log(LOG_FILE, 'AC-K1 SATISFIED: API key persists across server restart');
    });

    it('should persist multiple provider API keys', async function() {
      // Clean state
      if (fs.existsSync(STATE_DIR)) {
        fs.rmSync(STATE_DIR, { recursive: true });
      }
      fs.mkdirSync(STATE_DIR, { recursive: true });

      log(LOG_FILE, '=== Multiple Provider API Keys Test ===');
      log(LOG_FILE, `Starting server on port ${PORT}...`);
      serverProc = await startServer(PORT, STATE_DIR);
      log(LOG_FILE, 'Server started successfully');

      // Save both API keys
      log(LOG_FILE, 'Saving Anthropic API key...');
      await fetchJson(`http://localhost:${PORT}/api/settings/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'anthropic',
          api_key: 'sk-ant-key-anthropic123456789'
        })
      });

      log(LOG_FILE, 'Saving OpenAI API key...');
      await fetchJson(`http://localhost:${PORT}/api/settings/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          api_key: 'sk-openai-key-1234567890abcdef'
        })
      });

      // Verify both are saved
      const statusBeforeRestart = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      log(LOG_FILE, `Status before restart: ${JSON.stringify(statusBeforeRestart)}`);
      assert.equal(statusBeforeRestart.anthropic.configured, true);
      assert.equal(statusBeforeRestart.openai.configured, true);

      // Stop and restart
      log(LOG_FILE, 'Stopping and restarting server...');
      await stopServer(serverProc);
      serverProc = null;
      await new Promise(resolve => setTimeout(resolve, 2000));

      serverProc = await startServer(PORT, STATE_DIR);
      log(LOG_FILE, 'Server restarted');

      // Verify both persist
      const statusAfterRestart = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      log(LOG_FILE, `Status after restart: ${JSON.stringify(statusAfterRestart)}`);
      assert.equal(statusAfterRestart.anthropic.configured, true);
      assert.equal(statusAfterRestart.openai.configured, true);
      log(LOG_FILE, '[PASS] Both API keys persisted across restart');
    });

    it('should handle API key deletion and persist empty state', async function() {
      // Clean state
      if (fs.existsSync(STATE_DIR)) {
        fs.rmSync(STATE_DIR, { recursive: true });
      }
      fs.mkdirSync(STATE_DIR, { recursive: true });

      log(LOG_FILE, '=== API Key Deletion Test ===');
      log(LOG_FILE, `Starting server on port ${PORT}...`);
      serverProc = await startServer(PORT, STATE_DIR);

      // Save and then delete
      await fetchJson(`http://localhost:${PORT}/api/settings/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'anthropic',
          api_key: 'sk-ant-test-to-delete-12345678'
        })
      });

      // Verify saved
      let status = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      assert.equal(status.anthropic.configured, true);

      // Delete
      log(LOG_FILE, 'Deleting API key...');
      await fetchJson(`http://localhost:${PORT}/api/settings/api-key`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic' })
      });

      // Verify deleted
      status = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      log(LOG_FILE, `Status after delete: ${JSON.stringify(status)}`);
      assert.equal(status.anthropic.configured, false);

      // Restart and verify deletion persisted
      log(LOG_FILE, 'Restarting server...');
      await stopServer(serverProc);
      serverProc = null;
      await new Promise(resolve => setTimeout(resolve, 2000));

      serverProc = await startServer(PORT, STATE_DIR);

      status = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
      log(LOG_FILE, `Status after restart: ${JSON.stringify(status)}`);
      assert.equal(status.anthropic.configured, false);
      log(LOG_FILE, '[PASS] API key deletion persisted across restart');
    });
  });
});
