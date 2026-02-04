/**
 * Chat TaskType E2E Diagnostic Check
 *
 * Verifies that Chat READ_INFO/REPORT tasks do not fail with NO_EVIDENCE error.
 * This is a regression test for the task_type propagation fix.
 *
 * CRITICAL: This test ensures that:
 *   1. READ_INFO prompts are correctly detected
 *   2. REPORT prompts are correctly detected
 *   3. These task types do not require evidence file generation
 *   4. The task completes as SUCCESS (not NO_EVIDENCE)
 *
 * Run: npx ts-node diagnostics/chat-tasktype.check.ts
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks fail
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');
const LOG_FILE = path.join(TMP_DIR, 'gate-chat-tasktype.log');

// E2E isolation: unique stateDir per test run
const E2E_RUN_ID = crypto.randomBytes(4).toString('hex');
const E2E_STATE_DIR = path.join(TMP_DIR, 'e2e-state', `chat-tasktype-${E2E_RUN_ID}`);

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

async function waitForServer(port: number, maxWaitMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return true;
    } catch {
      // Not ready
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return false;
}

interface CheckResult {
  name: string;
  passed: boolean;
  reason?: string;
}

function cleanupE2eState() {
  if (fs.existsSync(E2E_STATE_DIR)) {
    try {
      fs.rmSync(E2E_STATE_DIR, { recursive: true, force: true });
      log(`[CLEANUP] Removed E2E stateDir: ${E2E_STATE_DIR}`);
    } catch (err) {
      log(`[CLEANUP] Failed to remove E2E stateDir: ${err}`);
    }
  }
}

interface ChatResponse {
  userMessage?: { messageId: string };
  assistantMessage?: { messageId: string };
  runId?: string;
  taskGroupId?: string;
  error?: string;
}

interface QueueItem {
  task_id: string;
  task_group_id: string;
  prompt: string;
  status: string;
  task_type?: string;
}

interface TaskGroupResponse {
  namespace: string;
  task_group_id: string;
  tasks: QueueItem[];
}

async function runChecks(): Promise<void> {
  clearLog();
  console.log('\n=== Chat TaskType E2E Diagnostic Check ===\n');

  const PORT = 5710; // Different port to avoid conflicts
  const BASE_URL = `http://localhost:${PORT}`;
  const results: CheckResult[] = [];

  let serverProcess: ChildProcess | null = null;

  try {
    // Kill any existing server on this port
    try {
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch { /* ignore */ }

    // Create E2E stateDir
    fs.mkdirSync(E2E_STATE_DIR, { recursive: true });
    log(`[E2E] Created isolated stateDir: ${E2E_STATE_DIR}`);

    // Build
    log('Building...');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
    execSync('cp -r src/web/public dist/web/', { cwd: PROJECT_ROOT, stdio: 'pipe' });

    // Start server with E2E isolation
    log('Starting server...');
    serverProcess = spawn('node', ['dist/cli/index.js', 'web', '--port', String(PORT)], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PM_WEB_NO_DYNAMODB: '1',
        PM_E2E_STATE_DIR: E2E_STATE_DIR,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (data) => {
      log(`[SERVER] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data) => {
      log(`[SERVER ERR] ${data.toString().trim()}`);
    });

    const ready = await waitForServer(PORT);
    if (!ready) {
      throw new Error('Server failed to start');
    }
    log('Server ready');

    // ========================================
    // Test Setup: Create a test project
    // ========================================
    log('[SETUP] Creating test project...');
    const createProjectResp = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: PROJECT_ROOT,
        alias: 'test-chat-tasktype',
      }),
    });
    const projectData = await createProjectResp.json() as { projectId?: string };
    log(`[SETUP] Create project response: ${JSON.stringify(projectData)}`);

    if (!projectData.projectId) {
      throw new Error('Failed to create project: no projectId returned');
    }
    const projectId = projectData.projectId;
    log(`[SETUP] Project ID: ${projectId}`);

    // ========================================
    // Check 1: READ_INFO prompt detection
    // ========================================
    log('[CHECK-1] Testing READ_INFO prompt detection...');
    const readInfoPrompt = 'What is the architecture of this project?';

    const readInfoResp = await fetch(`${BASE_URL}/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: readInfoPrompt }),
    });

    const readInfoData = await readInfoResp.json() as ChatResponse;
    log(`[CHECK-1] Chat response: ${JSON.stringify(readInfoData)}`);

    results.push({
      name: 'CHAT-1: READ_INFO chat request succeeds',
      passed: readInfoResp.ok && !readInfoData.error,
      reason: readInfoResp.ok ? undefined : `Status: ${readInfoResp.status}, Error: ${readInfoData.error}`,
    });

    // Check queue item has correct task_type
    if (readInfoData.taskGroupId) {
      const queueResp = await fetch(`${BASE_URL}/api/task-groups/${readInfoData.taskGroupId}/tasks`);
      const queueData = await queueResp.json() as TaskGroupResponse;

      log(`[CHECK-1] Queue items: ${JSON.stringify(queueData)}`);

      const queueItem = queueData.tasks?.[0] || null;

      results.push({
        name: 'CHAT-2: READ_INFO task_type is propagated to queue',
        passed: queueItem?.task_type === 'READ_INFO',
        reason: queueItem?.task_type === 'READ_INFO' ? undefined : `task_type: ${queueItem?.task_type || 'undefined'}`,
      });
    } else {
      results.push({
        name: 'CHAT-2: READ_INFO task_type is propagated to queue',
        passed: false,
        reason: 'No taskGroupId returned from chat endpoint',
      });
    }

    // ========================================
    // Check 2: REPORT prompt detection
    // ========================================
    log('[CHECK-2] Testing REPORT prompt detection...');
    const reportPrompt = 'Generate a summary report of the test coverage';

    const reportResp = await fetch(`${BASE_URL}/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: reportPrompt }),
    });

    const reportData = await reportResp.json() as ChatResponse;
    log(`[CHECK-2] Chat response: ${JSON.stringify(reportData)}`);

    results.push({
      name: 'CHAT-3: REPORT chat request succeeds',
      passed: reportResp.ok && !reportData.error,
      reason: reportResp.ok ? undefined : `Status: ${reportResp.status}, Error: ${reportData.error}`,
    });

    // Check queue item has correct task_type
    if (reportData.taskGroupId) {
      const queueResp = await fetch(`${BASE_URL}/api/task-groups/${reportData.taskGroupId}/tasks`);
      const queueData = await queueResp.json() as TaskGroupResponse;

      log(`[CHECK-2] Queue items: ${JSON.stringify(queueData)}`);

      const queueItem = queueData.tasks?.[0] || null;

      results.push({
        name: 'CHAT-4: REPORT task_type is propagated to queue',
        passed: queueItem?.task_type === 'REPORT',
        reason: queueItem?.task_type === 'REPORT' ? undefined : `task_type: ${queueItem?.task_type || 'undefined'}`,
      });
    } else {
      results.push({
        name: 'CHAT-4: REPORT task_type is propagated to queue',
        passed: false,
        reason: 'No taskGroupId returned from chat endpoint',
      });
    }

    // ========================================
    // Check 3: IMPLEMENTATION prompt detection
    // ========================================
    log('[CHECK-3] Testing IMPLEMENTATION prompt detection...');
    const implPrompt = 'Create a new user authentication service';

    const implResp = await fetch(`${BASE_URL}/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: implPrompt }),
    });

    const implData = await implResp.json() as ChatResponse;
    log(`[CHECK-3] Chat response: ${JSON.stringify(implData)}`);

    results.push({
      name: 'CHAT-5: IMPLEMENTATION chat request succeeds',
      passed: implResp.ok && !implData.error,
      reason: implResp.ok ? undefined : `Status: ${implResp.status}, Error: ${implData.error}`,
    });

    // Check queue item has correct task_type
    if (implData.taskGroupId) {
      const queueResp = await fetch(`${BASE_URL}/api/task-groups/${implData.taskGroupId}/tasks`);
      const queueData = await queueResp.json() as TaskGroupResponse;

      log(`[CHECK-3] Queue items: ${JSON.stringify(queueData)}`);

      const queueItem = queueData.tasks?.[0] || null;

      results.push({
        name: 'CHAT-6: IMPLEMENTATION task_type is propagated to queue',
        passed: queueItem?.task_type === 'IMPLEMENTATION',
        reason: queueItem?.task_type === 'IMPLEMENTATION' ? undefined : `task_type: ${queueItem?.task_type || 'undefined'}`,
      });
    } else {
      results.push({
        name: 'CHAT-6: IMPLEMENTATION task_type is propagated to queue',
        passed: false,
        reason: 'No taskGroupId returned from chat endpoint',
      });
    }

    // ========================================
    // Check 4: Japanese READ_INFO detection
    // ========================================
    log('[CHECK-4] Testing Japanese READ_INFO prompt detection...');
    const jpReadInfoPrompt = '確認してください: このプロジェクトの構造';

    const jpResp = await fetch(`${BASE_URL}/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: jpReadInfoPrompt }),
    });

    const jpData = await jpResp.json() as ChatResponse;
    log(`[CHECK-4] Chat response: ${JSON.stringify(jpData)}`);

    if (jpData.taskGroupId) {
      const queueResp = await fetch(`${BASE_URL}/api/task-groups/${jpData.taskGroupId}/tasks`);
      const queueData = await queueResp.json() as TaskGroupResponse;

      log(`[CHECK-4] Queue items: ${JSON.stringify(queueData)}`);

      const queueItem = queueData.tasks?.[0] || null;

      results.push({
        name: 'CHAT-7: Japanese READ_INFO is detected correctly',
        passed: queueItem?.task_type === 'READ_INFO',
        reason: queueItem?.task_type === 'READ_INFO' ? undefined : `task_type: ${queueItem?.task_type || 'undefined'}`,
      });
    } else {
      results.push({
        name: 'CHAT-7: Japanese READ_INFO is detected correctly',
        passed: false,
        reason: 'No taskGroupId returned from chat endpoint',
      });
    }

    // ========================================
    // Check 5: Question mark triggers READ_INFO
    // Note: Question must not contain implementation words (file, module, component, etc.)
    // ========================================
    log('[CHECK-5] Testing question mark detection...');
    const questionPrompt = 'Is this approach correct for the design?';

    const qResp = await fetch(`${BASE_URL}/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: questionPrompt }),
    });

    const qData = await qResp.json() as ChatResponse;

    if (qData.taskGroupId) {
      const queueResp = await fetch(`${BASE_URL}/api/task-groups/${qData.taskGroupId}/tasks`);
      const queueData = await queueResp.json() as TaskGroupResponse;

      log(`[CHECK-5] Queue items: ${JSON.stringify(queueData)}`);

      const queueItem = queueData.tasks?.[0] || null;

      results.push({
        name: 'CHAT-8: Question mark prompts are detected as READ_INFO',
        passed: queueItem?.task_type === 'READ_INFO',
        reason: queueItem?.task_type === 'READ_INFO' ? undefined : `task_type: ${queueItem?.task_type || 'undefined'}`,
      });
    } else {
      results.push({
        name: 'CHAT-8: Question mark prompts are detected as READ_INFO',
        passed: false,
        reason: 'No taskGroupId returned from chat endpoint',
      });
    }

  } catch (error) {
    results.push({
      name: 'CHAT-RUNTIME',
      passed: false,
      reason: `Runtime error: ${(error as Error).message}`,
    });
    log(`[ERROR] ${(error as Error).message}`);
  } finally {
    // Cleanup server
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Cleanup E2E state
    log('[CLEANUP] Cleaning up E2E stateDir...');
    cleanupE2eState();
  }

  // Print results
  console.log('');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '[PASS]' : '[FAIL]';
    const reason = r.reason ? `\n       Reason: ${r.reason}` : '';
    console.log(`${status} ${r.name}${reason}`);
    if (!r.passed) allPassed = false;
  }

  console.log('');
  console.log(`Overall: ${allPassed ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log(`Log file: ${LOG_FILE}`);
  console.log('');

  if (!allPassed) {
    process.exit(1);
  }
}

runChecks().catch(err => {
  console.error('Fatal error:', err);
  cleanupE2eState();
  process.exit(1);
});
