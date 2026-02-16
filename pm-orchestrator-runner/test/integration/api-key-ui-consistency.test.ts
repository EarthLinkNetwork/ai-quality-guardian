/**
 * API Key UI Consistency Test
 *
 * Purpose: Identify mismatch between API response and UI display
 * for API key configured status.
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import assert from 'node:assert/strict';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');
const LOG_FILE = path.join(TMP_DIR, 'api-key-ui-consistency.log');

// Ensure .tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function clearLog() {
  fs.writeFileSync(LOG_FILE, '');
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

describe('API Key UI Consistency Tests', function () {
  this.timeout(60000);

  let serverProcess: ChildProcess;
  const PORT = 5688;

  before(async function () {
    clearLog();
    log('=== API Key UI Consistency Test ===');

    // Kill any existing server
    try {
      execSync('pkill -f "node dist/cli/index.js web"', { stdio: 'ignore' });
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      // Ignore
    }

    // Build first
    log('Building project...');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });

    // Start server
    log(`Starting server on port ${PORT} with PM_WEB_NO_DYNAMODB=1...`);
    serverProcess = spawn('node', ['dist/cli/index.js', 'web', '--port', String(PORT)], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PM_WEB_NO_DYNAMODB: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (data) => {
      log(`[SERVER] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data) => {
      log(`[SERVER ERR] ${data.toString().trim()}`);
    });

    // Wait for server
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('Server started');
  });

  after(async function () {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    log('=== Test Complete ===');
  });

  it('should compare API response with HTML rendering for API key status', async function () {
    log('');
    log('=== STEP 1: GET /api/settings/api-key/status ===');

    const apiKeyStatus = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
    log(`[API] Response: ${JSON.stringify(apiKeyStatus)}`);

    log('');
    log('=== STEP 2: GET /settings HTML page ===');

    const settingsHtml = await fetchHtml(`http://localhost:${PORT}/settings`);
    log(`[HTML] Page length: ${settingsHtml.length} bytes`);

    // Extract API key related sections from HTML
    const apiKeyPatterns = [
      /configured/gi,
      /not configured/gi,
      /api[_-]?key/gi,
      /anthropic/gi,
      /openai/gi,
      /sk-[a-zA-Z*-]+/gi,
    ];

    log('');
    log('[HTML] Searching for API key related patterns in HTML:');

    // Look for JavaScript that handles API key display
    const scriptMatch = settingsHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatch) {
      scriptMatch.forEach((script, i) => {
        if (script.includes('api-key') || script.includes('apiKey') || script.includes('configured')) {
          // Extract relevant lines
          const lines = script.split('\n').filter(line =>
            line.includes('configured') ||
            line.includes('api-key') ||
            line.includes('apiKey') ||
            line.includes('Anthropic') ||
            line.includes('OpenAI')
          );
          if (lines.length > 0) {
            log(`[HTML] Script block ${i} relevant lines:`);
            lines.slice(0, 20).forEach(line => log(`  ${line.trim()}`));
          }
        }
      });
    }

    // Look for the API key status rendering function
    const renderApiKeyMatch = settingsHtml.match(/function\s+\w*[aA]pi[kK]ey\w*\s*\([^)]*\)\s*\{[\s\S]*?\}/g);
    if (renderApiKeyMatch) {
      log('');
      log('[HTML] Found API key rendering functions:');
      renderApiKeyMatch.forEach((fn, i) => {
        log(`  Function ${i}: ${fn.substring(0, 200)}...`);
      });
    }

    // Look for loadApiKeyStatus or similar
    const loadFnMatch = settingsHtml.match(/async\s+function\s+load\w*[aA]pi[kK]ey\w*[\s\S]*?\}/g);
    if (loadFnMatch) {
      log('');
      log('[HTML] Found loadApiKey functions:');
      loadFnMatch.forEach((fn, i) => {
        log(`  Function ${i}: ${fn.substring(0, 500)}...`);
      });
    }

    // Check for initial state or data attributes
    const dataAttrMatch = settingsHtml.match(/data-[a-z-]*configured[^"]*"[^"]*"/gi);
    if (dataAttrMatch) {
      log('');
      log('[HTML] Data attributes related to configured:');
      dataAttrMatch.forEach(attr => log(`  ${attr}`));
    }

    log('');
    log('=== STEP 3: Check /api/settings endpoint ===');

    const settingsApi = await fetchJson(`http://localhost:${PORT}/api/settings`);
    log(`[API] /api/settings Response: ${JSON.stringify(settingsApi)}`);

    log('');
    log('=== STEP 4: Curl verification ===');

    try {
      const curlResult = execSync(`curl -s http://localhost:${PORT}/api/settings/api-key/status`).toString();
      log(`[CURL] /api/settings/api-key/status: ${curlResult}`);
    } catch (e) {
      log(`[CURL] Error: ${e}`);
    }

    log('');
    log('=== STEP 5: Check state directory for api-keys.json ===');

    const stateDir = path.join(PROJECT_ROOT, '.claude', 'state');
    if (fs.existsSync(stateDir)) {
      const stateDirs = fs.readdirSync(stateDir);
      log(`[STATE] State directories: ${stateDirs.join(', ')}`);

      for (const dir of stateDirs) {
        const apiKeysFile = path.join(stateDir, dir, 'api-keys.json');
        if (fs.existsSync(apiKeysFile)) {
          const content = fs.readFileSync(apiKeysFile, 'utf-8');
          log(`[STATE] ${apiKeysFile}:`);
          log(`  ${content}`);
        }
      }
    }

    log('');
    log('=== STEP 6: Check for renderApiKeyStatus function ===');

    const renderMatch = settingsHtml.match(/function\s+renderApiKeyStatus[\s\S]*?(?=function\s+\w+|<\/script>)/);
    if (renderMatch) {
      log('[HTML] renderApiKeyStatus function:');
      log(renderMatch[0].substring(0, 1000));
    }

    // Look for where configured/not configured is set in UI
    const configuredDisplayMatch = settingsHtml.match(/['"](Not )?Configured['"]/gi);
    if (configuredDisplayMatch) {
      log('');
      log('[HTML] String literals containing "Configured":');
      configuredDisplayMatch.forEach(m => log(`  ${m}`));
    }

    log('');
    log('=== ANALYSIS ===');
    log(`API says anthropic.configured: ${apiKeyStatus.anthropic?.configured}`);
    log(`API says openai.configured: ${apiKeyStatus.openai?.configured}`);
    log(`Settings API api_key_configured: ${settingsApi.settings?.api_key_configured}`);

    // Assertions to identify the issue
    assert.ok('anthropic' in apiKeyStatus);
    assert.ok('openai' in apiKeyStatus);
  });

  it('should test after reload to check for race conditions', async function () {
    log('');
    log('=== RELOAD TEST ===');

    // First call
    log('[CALL 1] GET /api/settings/api-key/status');
    const status1 = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
    log(`  Response: ${JSON.stringify(status1)}`);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Second call
    log('[CALL 2] GET /api/settings/api-key/status');
    const status2 = await fetchJson(`http://localhost:${PORT}/api/settings/api-key/status`);
    log(`  Response: ${JSON.stringify(status2)}`);

    // Compare
    log('');
    log('[COMPARISON]');
    log(`  Call 1 anthropic.configured: ${status1.anthropic?.configured}`);
    log(`  Call 2 anthropic.configured: ${status2.anthropic?.configured}`);
    log(`  Match: ${status1.anthropic?.configured === status2.anthropic?.configured}`);

    assert.equal(status1.anthropic?.configured, status2.anthropic?.configured);
  });
});
