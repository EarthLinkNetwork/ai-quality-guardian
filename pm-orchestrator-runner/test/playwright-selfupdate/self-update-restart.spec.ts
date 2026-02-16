import { test, expect } from '@playwright/test';
import { execSync, spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';

const TEST_PORT = 5799;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const NAMESPACE = 'selfupdate-e2e';

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

test.describe('Self-update (explicit)', () => {
  test.beforeAll(async () => {
    // Ensure dist is present (explicit test only)
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });

    // Start in background mode so we can stop cleanly via web-stop
    spawn(process.execPath, ['dist/cli/index.js', 'web', '--background', '--port', String(TEST_PORT), '--namespace', NAMESPACE], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
      env: {
        ...process.env,
        PM_WEB_ALLOW_PREFLIGHT_FAIL: '1',
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
  });

  test('Build & Restart triggers new PID and updated build timestamp', async ({ page }) => {
    const before = await fetchHealth();
    expect(before.web_pid, 'health should expose web_pid').toBeTruthy();
    expect(before.build_timestamp, 'health should expose build_timestamp').toBeTruthy();

    page.on('dialog', dialog => dialog.accept());

    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');

    const restartBtn = page.locator('#btn-runner-restart');
    await expect(restartBtn).toBeEnabled();
    await restartBtn.click();

    // Wait for restart to complete (poll health)
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

    // Optional: ensure settings page is still reachable after restart
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.locator('[data-testid="settings-runner-controls"]')).toBeVisible();
  });
});
