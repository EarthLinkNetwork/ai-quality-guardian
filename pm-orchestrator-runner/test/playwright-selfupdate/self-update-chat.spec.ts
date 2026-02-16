import { test, expect, Page } from '@playwright/test';
import { execSync, spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

const TEST_PORT = 5801;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const NAMESPACE = 'selfupdate-chat-e2e';
const TARGET_FILE = path.join(PROJECT_ROOT, 'src', 'web', 'public', 'index.html');

let originalHtml: string | null = null;

function waitForHealth(maxRetries = 60, delayMs = 2000): Promise<void> {
  return new Promise(async (resolve, reject) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await new Promise<void>((innerResolve, innerReject) => {
          const req = http.get(`${BASE_URL}/api/health`, (res) => {
            if (res.statusCode === 200) {
              innerResolve();
            } else {
              innerReject(new Error(`Unexpected status: ${res.statusCode}`));
            }
          });
          req.on('error', innerReject);
          req.setTimeout(1000, () => {
            req.destroy();
            innerReject(new Error('Timeout'));
          });
        });
        resolve();
        return;
      } catch {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    reject(new Error('Server not reachable after retries'));
  });
}

async function fetchHealth(): Promise<{ web_pid?: number; build_timestamp?: string; build_sha?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}/api/health`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            web_pid: json.web_pid,
            build_timestamp: json.build_timestamp,
            build_sha: json.build_sha,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function createProject(page: Page): Promise<{ projectId: string }> {
  const response = await page.request.post(`${BASE_URL}/api/projects`, {
    data: {
      projectPath: PROJECT_ROOT,
      alias: 'selfupdate-chat-e2e',
      projectType: 'runner-dev',
    },
  });
  if (!response.ok()) {
    throw new Error(`Failed to create project: ${response.status()}`);
  }
  const data = await response.json();
  const projectId = data.projectId || data.project?.projectId;
  if (!projectId) {
    throw new Error('Project ID not returned from /api/projects');
  }
  return { projectId };
}

async function waitForTaskCompletion(taskGroupId: string, projectId: string): Promise<void> {
  const maxAttempts = 180; // ~9 minutes
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${BASE_URL}/api/task-groups/${encodeURIComponent(taskGroupId)}/tasks`);
    if (!res.ok) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    const data = await res.json();
    const tasks = data.tasks || [];
    if (tasks.length === 0) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    const task = tasks[0];
    if (task.status === 'COMPLETE') {
      return;
    }
    if (task.status === 'ERROR') {
      throw new Error(`Task failed: ${task.error_message || 'unknown error'}`);
    }
    if (task.status === 'AWAITING_RESPONSE') {
      // Respond once to unblock
      await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Proceed with the requested change without further questions.' }),
      }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Task did not complete within timeout');
}

test.describe('Self-update via Chat (explicit)', () => {
  test.beforeAll(async () => {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      throw new Error('OPENAI_API_KEY or ANTHROPIC_API_KEY must be set for self-update chat test.');
    }

    originalHtml = fs.readFileSync(TARGET_FILE, 'utf-8');

    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });

    spawn(process.execPath, ['dist/cli/index.js', 'web', '--background', '--port', String(TEST_PORT), '--namespace', NAMESPACE], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
      env: {
        ...process.env,
      },
      detached: true,
    }).unref();

    await waitForHealth();
  });

  test.afterAll(() => {
    try {
      execSync(`node dist/cli/index.js web-stop --namespace ${NAMESPACE}`, { cwd: PROJECT_ROOT, stdio: 'ignore' });
    } catch {
      // Ignore stop errors in teardown
    }

    if (originalHtml !== null) {
      try {
        fs.writeFileSync(TARGET_FILE, originalHtml, 'utf-8');
      } catch {
        // Ignore restore errors
      }
    }
  });

  test('Chat modifies self, then Build & Restart applies change', async ({ page }) => {
    const { projectId } = await createProject(page);
    const marker = `SELFUPDATE_CHAT_MARKER_${Date.now()}`;
    const insertion = `<div data-testid="selfupdate-chat-marker">${marker}</div>`;

    await page.goto(`${BASE_URL}/chat/${encodeURIComponent(projectId)}`);
    await page.waitForLoadState('networkidle');

    const chatInput = page.locator('#chat-input');
    await expect(chatInput).toBeVisible();

    const prompt = [
      'You are editing the pm-orchestrator-runner codebase.',
      `Modify ${TARGET_FILE} by inserting the exact HTML line below inside the "Self-Update (Build & Restart)" section in Settings.`,
      'Do not change any other files.',
      'Do not run build or restart.',
      '',
      insertion,
      '',
      'Reply with: DONE',
    ].join('\n');

    const responsePromise = page.waitForResponse((res) => {
      return res.url().includes(`/api/projects/${projectId}/chat`) && res.request().method() === 'POST';
    });

    await chatInput.fill(prompt);
    await page.locator('#chat-send-btn').click();

    const chatResponse = await responsePromise;
    const chatData = await chatResponse.json();
    const taskGroupId = chatData.taskGroupId;
    if (!taskGroupId) {
      throw new Error('Chat response missing taskGroupId');
    }

    await waitForTaskCompletion(taskGroupId, projectId);

    const updatedHtml = fs.readFileSync(TARGET_FILE, 'utf-8');
    expect(updatedHtml.includes(marker)).toBeTruthy();

    // Trigger Build & Restart from Settings UI
    page.on('dialog', dialog => dialog.accept());
    const before = await fetchHealth();
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');

    const restartBtn = page.locator('#btn-runner-restart');
    await expect(restartBtn).toBeEnabled();
    await restartBtn.click();

    // Wait for restart to complete (PID change)
    const maxAttempts = 90;
    let after = before;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise(r => setTimeout(r, 2000));
        const current = await fetchHealth();
        if (current.web_pid && current.web_pid !== before.web_pid) {
          after = current;
          break;
        }
      } catch {
        // ignore transient errors during restart
      }
    }

    expect(after.web_pid).toBeTruthy();
    expect(after.web_pid).not.toBe(before.web_pid);
    expect(after.build_timestamp).toBeTruthy();
    expect(after.build_timestamp).not.toBe(before.build_timestamp);

    // Verify UI reflects the change after restart
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.locator('[data-testid="selfupdate-chat-marker"]')).toContainText(marker);
  });
});
