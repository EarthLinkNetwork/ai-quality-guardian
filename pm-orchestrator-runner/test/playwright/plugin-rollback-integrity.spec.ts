/**
 * Plugin Rollback Integrity Test
 *
 * Verifies that plugin install → uninstall results in
 * zero filesystem diff (snapshot comparison) for both
 * global and project scopes.
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

const TEST_PORT = 3595;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;
let tempStateDir: string;
let tempProjectDir: string;
let tempGlobalDir: string;

// === Snapshot utilities ===

interface FileSnapshot {
  /** Relative path from base directory */
  relativePath: string;
  /** SHA-256 hash of file content */
  hash: string;
}

interface DirectorySnapshot {
  files: FileSnapshot[];
}

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function takeSnapshot(baseDir: string): DirectorySnapshot {
  const files: FileSnapshot[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push({
          relativePath: path.relative(baseDir, fullPath),
          hash: hashFile(fullPath),
        });
      }
    }
  }

  walk(baseDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { files };
}

function snapshotsMatch(a: DirectorySnapshot, b: DirectorySnapshot): {
  match: boolean;
  added: string[];
  removed: string[];
  changed: string[];
} {
  const aMap = new Map(a.files.map(f => [f.relativePath, f.hash]));
  const bMap = new Map(b.files.map(f => [f.relativePath, f.hash]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [rp, hash] of bMap) {
    if (!aMap.has(rp)) {
      added.push(rp);
    } else if (aMap.get(rp) !== hash) {
      changed.push(rp);
    }
  }

  for (const [rp] of aMap) {
    if (!bMap.has(rp)) {
      removed.push(rp);
    }
  }

  return {
    match: added.length === 0 && removed.length === 0 && changed.length === 0,
    added,
    removed,
    changed,
  };
}

// === Server lifecycle ===

async function startServer(): Promise<void> {
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-rollback-state-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-rollback-project-'));
  tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-rollback-global-'));

  // Pre-create .claude dirs so snapshot has a baseline
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempProjectDir, '.claude', 'hooks'), { recursive: true });

  fs.mkdirSync(path.join(tempGlobalDir, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(tempGlobalDir, 'hooks'), { recursive: true });

  return new Promise((resolve, reject) => {
    const script = `
      const { createApp } = require('./src/web/server');
      const { InMemoryQueueStore } = require('./src/queue/in-memory-queue-store');

      const queueStore = new InMemoryQueueStore({ namespace: 'pw-rollback' });
      const app = createApp({
        queueStore,
        sessionId: 'pw-rollback-session',
        namespace: 'pw-rollback',
        projectRoot: '${tempProjectDir.replace(/'/g, "\\'")}',
        stateDir: '${tempStateDir.replace(/'/g, "\\'")}',
        globalClaudeDir: '${tempGlobalDir.replace(/'/g, "\\'")}',
      });

      const server = app.listen(${TEST_PORT}, () => {
        console.log('PLAYWRIGHT_SERVER_READY');
      });

      process.on('SIGTERM', () => { server.close(); process.exit(0); });
    `;

    serverProcess = spawn('npx', ['ts-node', '-e', script], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Server start timeout. Output: ' + output));
    }, 30000);

    serverProcess.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes('PLAYWRIGHT_SERVER_READY')) {
        clearTimeout(timeout);
        setTimeout(resolve, 500);
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      serverProcess?.on('exit', () => resolve());
      setTimeout(resolve, 3000);
    });
    serverProcess = null;
  }
  for (const dir of [tempStateDir, tempProjectDir, tempGlobalDir]) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

// === Helper: create plugin via API ===

async function createPlugin(page: import('@playwright/test').Page, scope: 'project' | 'global', suffix: string) {
  const resp = await page.request.post(`${BASE_URL}/api/assistant/plugins`, {
    data: {
      name: `Rollback Test ${suffix}`,
      description: `Rollback integrity test (${scope})`,
      choice: {
        choiceId: `rb-choice-${suffix}`,
        title: `Rollback Test ${suffix}`,
        summary: `Creates test artifacts for ${scope} scope`,
        scope,
        artifacts: [
          {
            kind: 'command',
            name: `rb-cmd-${suffix}`,
            targetPathHint: `.claude/commands/rb-cmd-${suffix}.md`,
            content: `# Rollback Test Command ${suffix}\n\nScope: ${scope}`,
          },
          {
            kind: 'agent',
            name: `rb-agent-${suffix}`,
            targetPathHint: `.claude/agents/rb-agent-${suffix}.md`,
            content: `# Rollback Test Agent ${suffix}\n\nScope: ${scope}`,
          },
          {
            kind: 'skill',
            name: `rb-skill-${suffix}`,
            targetPathHint: `.claude/skills/rb-skill-${suffix}.md`,
            content: `# Rollback Test Skill ${suffix}\n\nScope: ${scope}`,
          },
          {
            kind: 'script',
            name: `rb-hook-${suffix}`,
            targetPathHint: `.claude/hooks/rb-hook-${suffix}.sh`,
            content: `#!/bin/bash\n# Rollback Test Hook ${suffix}\necho "scope: ${scope}"`,
          },
        ],
        applySteps: ['Create command', 'Create agent', 'Create skill', 'Create hook script'],
        rollbackSteps: ['Delete command', 'Delete agent', 'Delete skill', 'Delete hook script'],
        riskNotes: [],
        questions: [],
      },
    },
  });
  expect(resp.ok()).toBeTruthy();
  return await resp.json();
}

// === Tests ===

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
});

test('Rollback integrity: project scope - install then uninstall yields diff=0', async ({ page }) => {
  const projectClaudeDir = path.join(tempProjectDir, '.claude');

  // 1. Snapshot BEFORE install
  const snapshotBefore = takeSnapshot(projectClaudeDir);

  // 2. Create plugin (project scope)
  const plugin = await createPlugin(page, 'project', 'proj');
  const pluginId = plugin.pluginId;

  // 3. Install
  const installResp = await page.request.post(`${BASE_URL}/api/assistant/plugins/${pluginId}/install`);
  expect(installResp.ok()).toBeTruthy();
  const installResult = await installResp.json();
  expect(installResult.success).toBe(true);
  expect(installResult.created.length).toBeGreaterThan(0);

  // 4. Snapshot AFTER install - must differ from before
  const snapshotAfterInstall = takeSnapshot(projectClaudeDir);
  const installDiff = snapshotsMatch(snapshotBefore, snapshotAfterInstall);
  expect(installDiff.match).toBe(false);
  expect(installDiff.added.length).toBeGreaterThan(0);

  // 5. Uninstall
  const uninstallResp = await page.request.post(`${BASE_URL}/api/assistant/plugins/${pluginId}/uninstall`);
  expect(uninstallResp.ok()).toBeTruthy();
  const uninstallResult = await uninstallResp.json();
  expect(uninstallResult.success).toBe(true);
  expect(uninstallResult.deleted.length).toBeGreaterThan(0);

  // 6. Snapshot AFTER uninstall - must match BEFORE
  const snapshotAfterUninstall = takeSnapshot(projectClaudeDir);
  const rollbackDiff = snapshotsMatch(snapshotBefore, snapshotAfterUninstall);

  // Report for evidence
  console.log('=== Project Scope Rollback Integrity ===');
  console.log(`Before: ${snapshotBefore.files.length} files`);
  console.log(`After install: ${snapshotAfterInstall.files.length} files (added: ${installDiff.added.length})`);
  console.log(`After uninstall: ${snapshotAfterUninstall.files.length} files`);
  console.log(`Diff zero: ${rollbackDiff.match}`);
  if (!rollbackDiff.match) {
    console.log(`  Added: ${rollbackDiff.added.join(', ')}`);
    console.log(`  Removed: ${rollbackDiff.removed.join(', ')}`);
    console.log(`  Changed: ${rollbackDiff.changed.join(', ')}`);
  }

  expect(rollbackDiff.match, 'Project scope: diff must be zero after uninstall').toBe(true);
});

test('Rollback integrity: global scope - install then uninstall yields diff=0', async ({ page }) => {
  // 1. Snapshot BEFORE install
  const snapshotBefore = takeSnapshot(tempGlobalDir);

  // 2. Create plugin (global scope)
  const plugin = await createPlugin(page, 'global', 'glob');
  const pluginId = plugin.pluginId;

  // 3. Install
  const installResp = await page.request.post(`${BASE_URL}/api/assistant/plugins/${pluginId}/install`);
  expect(installResp.ok()).toBeTruthy();
  const installResult = await installResp.json();
  expect(installResult.success).toBe(true);
  expect(installResult.created.length).toBeGreaterThan(0);

  // 4. Snapshot AFTER install - must differ from before
  const snapshotAfterInstall = takeSnapshot(tempGlobalDir);
  const installDiff = snapshotsMatch(snapshotBefore, snapshotAfterInstall);
  expect(installDiff.match).toBe(false);
  expect(installDiff.added.length).toBeGreaterThan(0);

  // 5. Uninstall
  const uninstallResp = await page.request.post(`${BASE_URL}/api/assistant/plugins/${pluginId}/uninstall`);
  expect(uninstallResp.ok()).toBeTruthy();
  const uninstallResult = await uninstallResp.json();
  expect(uninstallResult.success).toBe(true);
  expect(uninstallResult.deleted.length).toBeGreaterThan(0);

  // 6. Snapshot AFTER uninstall - must match BEFORE
  const snapshotAfterUninstall = takeSnapshot(tempGlobalDir);
  const rollbackDiff = snapshotsMatch(snapshotBefore, snapshotAfterUninstall);

  // Report for evidence
  console.log('=== Global Scope Rollback Integrity ===');
  console.log(`Before: ${snapshotBefore.files.length} files`);
  console.log(`After install: ${snapshotAfterInstall.files.length} files (added: ${installDiff.added.length})`);
  console.log(`After uninstall: ${snapshotAfterUninstall.files.length} files`);
  console.log(`Diff zero: ${rollbackDiff.match}`);
  if (!rollbackDiff.match) {
    console.log(`  Added: ${rollbackDiff.added.join(', ')}`);
    console.log(`  Removed: ${rollbackDiff.removed.join(', ')}`);
    console.log(`  Changed: ${rollbackDiff.changed.join(', ')}`);
  }

  expect(rollbackDiff.match, 'Global scope: diff must be zero after uninstall').toBe(true);
});
