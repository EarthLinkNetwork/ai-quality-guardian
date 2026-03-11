/**
 * Auto-Updater for Daemon Mode
 *
 * Checks for git updates periodically and performs:
 * git fetch → HEAD compare → git pull → npm run build → process.exit(0)
 *
 * When running under launchd with KeepAlive=true, exiting causes automatic restart
 * with the newly built code.
 */

import { execSync } from 'child_process';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentSha: string;
  remoteSha: string;
  branch: string;
}

export interface UpdateResult {
  success: boolean;
  oldSha: string;
  newSha: string;
  error?: string;
}

/**
 * Check if there are updates available on the remote
 */
export function checkForUpdates(projectPath: string): UpdateCheckResult {
  try {
    // Fetch latest from origin
    execSync('git fetch origin', { cwd: projectPath, stdio: 'pipe', timeout: 30000 });

    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    // Get current HEAD
    const currentSha = execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    // Get remote HEAD
    const remoteSha = execSync(`git rev-parse origin/${branch}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    return {
      hasUpdate: currentSha !== remoteSha,
      currentSha,
      remoteSha,
      branch,
    };
  } catch (error) {
    console.warn('[AutoUpdate] Failed to check for updates:', error instanceof Error ? error.message : String(error));
    return {
      hasUpdate: false,
      currentSha: 'unknown',
      remoteSha: 'unknown',
      branch: 'unknown',
    };
  }
}

/**
 * Perform the update: git pull → npm run build
 * Returns the result. Caller is responsible for restarting (process.exit).
 */
export function performUpdate(projectPath: string): UpdateResult {
  const oldSha = execSync('git rev-parse HEAD', {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();

  try {
    // Pull latest changes
    execSync('git pull --ff-only', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 60000,
    });

    // Install dependencies (in case package.json changed)
    execSync('npm install --production=false', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120000,
    });

    // Build
    execSync('npm run build', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120000,
    });

    const newSha = execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    return { success: true, oldSha, newSha };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AutoUpdate] Update failed:', errorMessage);

    // Attempt to recover: reset to previous state
    try {
      execSync(`git reset --hard ${oldSha}`, { cwd: projectPath, stdio: 'pipe' });
      execSync('npm run build', { cwd: projectPath, stdio: 'pipe', timeout: 120000 });
      console.log('[AutoUpdate] Rolled back to previous state');
    } catch (rollbackErr) {
      console.error('[AutoUpdate] Rollback also failed:', rollbackErr);
    }

    return { success: false, oldSha, newSha: oldSha, error: errorMessage };
  }
}

/**
 * Start auto-update loop
 * Checks every `intervalMs` and performs update + exit if available.
 *
 * @param projectPath - Project directory
 * @param intervalMs - Check interval (default: 5 minutes)
 * @returns cleanup function to stop the loop
 */
export function startAutoUpdateLoop(
  projectPath: string,
  intervalMs: number = 5 * 60 * 1000
): () => void {
  console.log(`[AutoUpdate] Started (check interval: ${intervalMs / 1000}s)`);

  const timer = setInterval(() => {
    console.log('[AutoUpdate] Checking for updates...');
    const check = checkForUpdates(projectPath);

    if (check.hasUpdate) {
      console.log(`[AutoUpdate] Update available: ${check.currentSha.substring(0, 7)} → ${check.remoteSha.substring(0, 7)} (${check.branch})`);
      const result = performUpdate(projectPath);

      if (result.success) {
        console.log(`[AutoUpdate] Updated: ${result.oldSha.substring(0, 7)} → ${result.newSha.substring(0, 7)}`);
        console.log('[AutoUpdate] Exiting for restart (launchd KeepAlive will restart)...');
        process.exit(0);
      } else {
        console.error(`[AutoUpdate] Update failed: ${result.error}`);
      }
    } else {
      console.log('[AutoUpdate] No updates available');
    }
  }, intervalMs);

  return () => {
    clearInterval(timer);
    console.log('[AutoUpdate] Stopped');
  };
}
