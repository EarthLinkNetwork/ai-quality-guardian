/**
 * Relay Two-Web Live E2E Integration Test
 *
 * PURPOSE:
 * Verify that two independent Web UI instances can run tasks through
 * the full Relay -> LLM -> Claude Code pipeline without interference.
 *
 * REQUIREMENTS:
 * - Uses REAL LLM API (no stubs/mocks) - this is NOT optional
 * - Requires LLM_LIVE_E2E=1 AND valid API key to run
 * - SKIP (not pass) if conditions not met
 *
 * ACCEPTANCE CRITERIA:
 * - AC-1: Two servers on different ports/stateDir/projectRoot
 * - AC-2: Tasks reach COMPLETE/COMPLETED status automatically
 * - AC-3: No ERROR events in traces
 * - AC-4: LLM_RESPONSE >= 2 per task ("offer相当" proof)
 * - AC-5: Files stay in respective projectRoots
 * - AC-6: No namespace cross-contamination
 *
 * See: docs/specs/relay-live-e2e-two-web.md
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import assert from 'node:assert/strict';
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp/relay-live-e2e-two-web');
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 300000; // 5 minutes per task

interface ExecutionGateResult {
  canExecute: boolean;
  skipReason?: string;
  provider?: string;
  envVar?: string;
}

interface ServerConfig {
  name: string;
  port: number;
  namespace: string;
  stateDir: string;
  projectRoot: string;
}

interface TaskInfo {
  task_id: string;
  task_group_id: string;
  server: ServerConfig;
}

interface TraceEntry {
  timestamp: string;
  event: string;
  session_id: string;
  task_id: string;
  iteration_index?: number;
  data: Record<string, unknown>;
}

interface TraceResponse {
  task_id: string;
  trace_file: string;
  entries: TraceEntry[];
  summary: {
    total_iterations: number;
    judgments: Array<{ iteration: number; passed: boolean; reason: string }>;
    final_status?: string;
  };
}

interface TaskResponse {
  task_id: string;
  task_group_id: string;
  prompt: string;
  status: string;
  created_at: string;
  completed_at?: string;
  output?: string;
  error?: string;
}

/**
 * Check execution gate - BOTH conditions must be met:
 * 1. LLM_LIVE_E2E=1
 * 2. Valid API key present
 */
function checkExecutionGate(): ExecutionGateResult {
  if (process.env.LLM_LIVE_E2E !== '1') {
    return {
      canExecute: false,
      skipReason: 'LLM_LIVE_E2E is not set to 1. Set LLM_LIVE_E2E=1 to run live E2E tests with real LLM.',
    };
  }

  const provider = process.env.LLM_PROVIDER || 'anthropic';
  const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';

  if (!process.env[envVar]) {
    return {
      canExecute: false,
      skipReason: `LLM_LIVE_E2E=1 but ${envVar} is not set. Live E2E tests require a valid API key.`,
      provider,
      envVar,
    };
  }

  return {
    canExecute: true,
    provider,
    envVar,
  };
}

const EXECUTION_GATE = checkExecutionGate();

// Log execution gate status
console.log('\n' + '='.repeat(70));
console.log('[Relay Two-Web Live E2E] Execution Gate Check');
console.log('='.repeat(70));
if (EXECUTION_GATE.canExecute) {
  console.log('[Relay Two-Web Live E2E] GATE: OPEN - Real LLM API calls WILL be made');
  console.log(`[Relay Two-Web Live E2E] Provider: ${EXECUTION_GATE.provider}`);
  console.log(`[Relay Two-Web Live E2E] API Key Env: ${EXECUTION_GATE.envVar} (present)`);
} else {
  console.log('[Relay Two-Web Live E2E] GATE: CLOSED - Tests will be SKIPPED');
  console.log(`[Relay Two-Web Live E2E] Reason: ${EXECUTION_GATE.skipReason}`);
}
console.log('='.repeat(70) + '\n');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  // Ensure directory exists before logging to file
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  fs.appendFileSync(path.join(TMP_DIR, 'test.log'), line + '\n');
  console.log(message);
}

function setupTestEnvironment(): { serverA: ServerConfig; serverB: ServerConfig } {
  // Clean and create temp directory
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true });
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const timestamp = Date.now();

  const serverA: ServerConfig = {
    name: 'Server-A',
    port: 5700,
    namespace: `e2e-a-${timestamp}`,
    stateDir: path.join(TMP_DIR, 'server-a/state'),
    projectRoot: path.join(TMP_DIR, 'server-a/project'),
  };

  const serverB: ServerConfig = {
    name: 'Server-B',
    port: 5701,
    namespace: `e2e-b-${timestamp}`,
    stateDir: path.join(TMP_DIR, 'server-b/state'),
    projectRoot: path.join(TMP_DIR, 'server-b/project'),
  };

  // Create directories
  fs.mkdirSync(serverA.stateDir, { recursive: true });
  fs.mkdirSync(serverA.projectRoot, { recursive: true });
  fs.mkdirSync(serverB.stateDir, { recursive: true });
  fs.mkdirSync(serverB.projectRoot, { recursive: true });

  // Create minimal .claude directories for each server
  fs.mkdirSync(path.join(serverA.projectRoot, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(serverB.projectRoot, '.claude'), { recursive: true });

  log(`Test environment created at ${TMP_DIR}`);
  log(`Server A: port=${serverA.port}, namespace=${serverA.namespace}`);
  log(`Server B: port=${serverB.port}, namespace=${serverB.namespace}`);

  return { serverA, serverB };
}

async function startServer(config: ServerConfig): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    log(`Starting ${config.name} on port ${config.port}...`);

    // Use STATE_DIR env var to override stateDir
    // PROJECT_ROOT_DIR env var tells the server where to create files
    const env = {
      ...process.env,
      STATE_DIR: config.stateDir,
      PROJECT_ROOT_DIR: config.projectRoot,
    };

    // Use absolute path to CLI since we run from temp directory
    const cliPath = path.join(PROJECT_ROOT, 'dist/cli/index.js');

    const server = spawn(
      'node',
      [
        cliPath,
        'web',
        '--port', String(config.port),
        '--namespace', config.namespace,
      ],
      {
        cwd: config.projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      }
    );

    let started = false;
    const serverLog: string[] = [];

    const timeout = setTimeout(() => {
      if (!started) {
        server.kill();
        log(`${config.name} startup timeout. Logs:\n${serverLog.join('\n')}`);
        reject(new Error(`${config.name} start timeout after 30 seconds`));
      }
    }, 30000);

    server.stdout?.on('data', (data) => {
      const str = data.toString();
      serverLog.push(`[${config.name}-STDOUT] ${str.trim()}`);

      if (
        str.includes('Queue poller started') ||
        str.includes('Web server') ||
        str.includes(`localhost:${config.port}`)
      ) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          log(`${config.name} started successfully`);
          setTimeout(() => resolve(server), 1000);
        }
      }
    });

    server.stderr?.on('data', (data) => {
      const str = data.toString().trim();
      serverLog.push(`[${config.name}-STDERR] ${str}`);
      // Don't fail on warnings
      if (!str.includes('Warning') && !str.includes('MODULE_TYPELESS_PACKAGE_JSON')) {
        log(`[${config.name}-STDERR] ${str}`);
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    server.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        log(`${config.name} exited before starting. Logs:\n${serverLog.join('\n')}`);
        reject(new Error(`${config.name} exited with code ${code} before starting`));
      }
    });
  });
}

async function healthCheck(config: ServerConfig): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${config.port}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function submitTask(config: ServerConfig, prompt: string): Promise<TaskInfo> {
  const taskGroupId = `tg-${config.namespace}-${Date.now()}`;

  log(`Submitting task to ${config.name}: "${prompt.substring(0, 50)}..."`);

  const response = await fetch(`http://localhost:${config.port}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_group_id: taskGroupId,
      prompt,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to submit task to ${config.name}: ${response.status} ${text}`);
  }

  const data = await response.json() as { task_id: string };
  log(`Task submitted to ${config.name}: task_id=${data.task_id}`);

  return {
    task_id: data.task_id,
    task_group_id: taskGroupId,
    server: config,
  };
}

async function getTaskStatus(config: ServerConfig, taskId: string): Promise<TaskResponse | null> {
  try {
    const response = await fetch(`http://localhost:${config.port}/api/tasks/${taskId}`);
    if (!response.ok) {
      return null;
    }
    return await response.json() as TaskResponse;
  } catch {
    return null;
  }
}

async function getTaskTrace(config: ServerConfig, taskId: string): Promise<TraceResponse | null> {
  try {
    const response = await fetch(
      `http://localhost:${config.port}/api/tasks/${taskId}/trace?raw=true`
    );
    if (!response.ok) {
      return null;
    }
    return await response.json() as TraceResponse;
  } catch {
    return null;
  }
}

async function waitForTaskCompletion(task: TaskInfo): Promise<TaskResponse> {
  const startTime = Date.now();
  const config = task.server;

  log(`Waiting for ${config.name} task ${task.task_id} to complete...`);

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const status = await getTaskStatus(config, task.task_id);

    if (status) {
      log(`${config.name} task status: ${status.status}`);

      if (status.status === 'COMPLETE' || status.status === 'COMPLETED') {
        log(`${config.name} task completed successfully`);
        return status;
      }

      if (status.status === 'ERROR' || status.status === 'FAILED') {
        throw new Error(`${config.name} task failed: ${status.error || 'Unknown error'}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`${config.name} task ${task.task_id} did not complete within ${MAX_WAIT_MS}ms`);
}

function verifyFileIsolation(
  serverA: ServerConfig,
  serverB: ServerConfig,
  fileA: string,
  fileB: string
): { passed: boolean; details: string } {
  const fileAPathInA = path.join(serverA.projectRoot, fileA);
  const fileAPathInB = path.join(serverB.projectRoot, fileA);
  const fileBPathInA = path.join(serverA.projectRoot, fileB);
  const fileBPathInB = path.join(serverB.projectRoot, fileB);

  const results: string[] = [];

  // Check file A exists in A's projectRoot
  const aInA = fs.existsSync(fileAPathInA);
  results.push(`File A in A's projectRoot: ${aInA}`);

  // Check file A does NOT exist in B's projectRoot
  const aInB = fs.existsSync(fileAPathInB);
  results.push(`File A in B's projectRoot (should be false): ${aInB}`);

  // Check file B exists in B's projectRoot
  const bInB = fs.existsSync(fileBPathInB);
  results.push(`File B in B's projectRoot: ${bInB}`);

  // Check file B does NOT exist in A's projectRoot
  const bInA = fs.existsSync(fileBPathInA);
  results.push(`File B in A's projectRoot (should be false): ${bInA}`);

  const passed = aInA && !aInB && bInB && !bInA;

  return {
    passed,
    details: results.join('\n'),
  };
}

function countLLMResponses(trace: TraceResponse | null): number {
  if (!trace || !trace.entries) {
    return 0;
  }
  return trace.entries.filter((e) => e.event === 'LLM_RESPONSE').length;
}

function hasErrorEvents(trace: TraceResponse | null): boolean {
  if (!trace || !trace.entries) {
    return false;
  }
  // Check for ERROR events or error in data
  return trace.entries.some(
    (e) =>
      e.event.includes('ERROR') ||
      (e.data && (e.data.error !== undefined || e.data.status === 'ERROR'))
  );
}

describe('Relay Two-Web Live E2E Tests', function () {
  this.timeout(600000); // 10 minutes total

  let serverA: ServerConfig;
  let serverB: ServerConfig;
  let serverAProcess: ChildProcess | null = null;
  let serverBProcess: ChildProcess | null = null;

  before(async function () {
    if (!EXECUTION_GATE.canExecute) {
      log(`Skipping tests: ${EXECUTION_GATE.skipReason}`);
      this.skip();
      return;
    }

    // Build project
    log('Building project...');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });

    // Setup test environment
    const env = setupTestEnvironment();
    serverA = env.serverA;
    serverB = env.serverB;

    // Start both servers
    try {
      serverAProcess = await startServer(serverA);
      serverBProcess = await startServer(serverB);
    } catch (error) {
      log(`Failed to start servers: ${error}`);
      throw error;
    }

    // Verify health checks (AC-1)
    const healthA = await healthCheck(serverA);
    const healthB = await healthCheck(serverB);

    if (!healthA || !healthB) {
      throw new Error(`Health check failed: A=${healthA}, B=${healthB}`);
    }

    log('Both servers healthy and ready');
  });

  after(async function () {
    log('Cleaning up servers...');

    if (serverAProcess) {
      serverAProcess.kill();
      log('Server A stopped');
    }

    if (serverBProcess) {
      serverBProcess.kill();
      log('Server B stopped');
    }

    // Save evidence
    if (fs.existsSync(TMP_DIR)) {
      const evidencePath = path.join(TMP_DIR, 'evidence.json');
      fs.writeFileSync(
        evidencePath,
        JSON.stringify(
          {
            testRun: new Date().toISOString(),
            serverA: serverA,
            serverB: serverB,
            executionGate: EXECUTION_GATE,
          },
          null,
          2
        )
      );
      log(`Evidence saved to ${evidencePath}`);
    }
  });

  describe('AC-1: Dual Server Startup', function () {
    it('should have both servers responding to health check', async function () {
      const healthA = await healthCheck(serverA);
      const healthB = await healthCheck(serverB);

      assert.equal(healthA, true);
      assert.equal(healthB, true);

      log('[AC-1] PASS: Both servers healthy');
    });

    it('should have different namespaces', function () {
      assert.notEqual(serverA.namespace, serverB.namespace);
      log(`[AC-1] PASS: Different namespaces: ${serverA.namespace} vs ${serverB.namespace}`);
    });
  });

  describe('AC-2 to AC-6: Task Execution and Verification', function () {
    let taskA: TaskInfo;
    let taskB: TaskInfo;
    let taskAResult: TaskResponse;
    let taskBResult: TaskResponse;
    let traceA: TraceResponse | null;
    let traceB: TraceResponse | null;

    const PROMPT_A = `Create a file named "hello-from-a.txt" in the current directory containing the text "Hello from Server A - ${Date.now()}". Then read the file and confirm its contents.`;
    const PROMPT_B = `Create a file named "hello-from-b.txt" in the current directory containing the text "Hello from Server B - ${Date.now()}". Then read the file and confirm its contents.`;

    it('AC-2: should submit tasks to both servers', async function () {
      taskA = await submitTask(serverA, PROMPT_A);
      taskB = await submitTask(serverB, PROMPT_B);

      assert.equal(typeof taskA.task_id, 'string');
      assert.equal(typeof taskB.task_id, 'string');
      assert.notEqual(taskA.task_id, taskB.task_id);

      log('[AC-2] PASS: Tasks submitted with unique IDs');
    });

    it('AC-2: should complete both tasks automatically (no user intervention)', async function () {
      this.timeout(MAX_WAIT_MS * 2);

      // Wait for both tasks in parallel
      const [resultA, resultB] = await Promise.all([
        waitForTaskCompletion(taskA),
        waitForTaskCompletion(taskB),
      ]);

      taskAResult = resultA;
      taskBResult = resultB;

      assert.match(taskAResult.status, /^COMPLETE(D)?$/);
      assert.match(taskBResult.status, /^COMPLETE(D)?$/);

      log('[AC-2] PASS: Both tasks completed automatically');
    });

    it('AC-3: should have no ERROR events in traces', async function () {
      traceA = await getTaskTrace(serverA, taskA.task_id);
      traceB = await getTaskTrace(serverB, taskB.task_id);

      const hasErrorA = hasErrorEvents(traceA);
      const hasErrorB = hasErrorEvents(traceB);

      if (hasErrorA) {
        log(`[AC-3] ERROR events found in Server A trace`);
      }
      if (hasErrorB) {
        log(`[AC-3] ERROR events found in Server B trace`);
      }

      assert.equal(hasErrorA, false);
      assert.equal(hasErrorB, false);

      log('[AC-3] PASS: No ERROR events in traces');
    });

    it('AC-4: should have >= 2 LLM_RESPONSE events per task ("offer相当")', async function () {
      const llmResponsesA = countLLMResponses(traceA);
      const llmResponsesB = countLLMResponses(traceB);

      log(`Server A LLM_RESPONSE count: ${llmResponsesA}`);
      log(`Server B LLM_RESPONSE count: ${llmResponsesB}`);

      assert.ok(llmResponsesA >= 2);
      assert.ok(llmResponsesB >= 2);

      log(`[AC-4] PASS: LLM_RESPONSE counts: A=${llmResponsesA}, B=${llmResponsesB}`);
    });

    it('AC-5: should have files isolated in respective projectRoots', function () {
      const result = verifyFileIsolation(
        serverA,
        serverB,
        'hello-from-a.txt',
        'hello-from-b.txt'
      );

      log(`File isolation details:\n${result.details}`);

      assert.equal(result.passed, true);

      log('[AC-5] PASS: Files isolated correctly');
    });

    it('AC-6: should have no namespace cross-contamination', function () {
      // Check that Server A's namespace is not referenced in Server B's stateDir
      const stateDirBContents = fs.existsSync(serverB.stateDir)
        ? fs.readdirSync(serverB.stateDir, { recursive: true })
        : [];
      const stateDirAContents = fs.existsSync(serverA.stateDir)
        ? fs.readdirSync(serverA.stateDir, { recursive: true })
        : [];

      const aNamespaceInB = stateDirBContents.some((f) =>
        String(f).includes(serverA.namespace)
      );
      const bNamespaceInA = stateDirAContents.some((f) =>
        String(f).includes(serverB.namespace)
      );

      log(`Server A namespace in B's stateDir: ${aNamespaceInB}`);
      log(`Server B namespace in A's stateDir: ${bNamespaceInA}`);

      assert.equal(aNamespaceInB, false);
      assert.equal(bNamespaceInA, false);

      log('[AC-6] PASS: No namespace cross-contamination');
    });
  });
});
