/**
 * Task Checkpoint - Rollback mechanism for failed tasks
 *
 * Uses git stash (no commits) when git is available,
 * falls back to file snapshot for non-git projects.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Checkpoint {
  type: 'git-stash' | 'file-snapshot' | 'none';
  taskId: string;
  projectPath: string;
  snapshotDir?: string;
  stashRef?: string;
  createdAt: string;
  /** Files that existed in the snapshot (for file-snapshot type) */
  files?: string[];
}

export interface CheckpointResult {
  success: boolean;
  checkpoint?: Checkpoint;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  filesRestored?: number;
  error?: string;
}

/**
 * Check if a directory is a git repository
 */
export function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if git working tree has changes to stash
 */
function hasGitChanges(dir: string): boolean {
  try {
    const status = execSync('git status --porcelain', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 5000,
    }).toString().trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a checkpoint before task execution.
 * - Git repo: uses git stash (no commit created)
 * - Non-git: copies src files to temp directory
 * - Empty/no changes: returns type 'none'
 */
export async function createCheckpoint(projectPath: string, taskId: string): Promise<CheckpointResult> {
  try {
    if (isGitRepo(projectPath)) {
      return createGitStashCheckpoint(projectPath, taskId);
    } else {
      return createFileSnapshotCheckpoint(projectPath, taskId);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Checkpoint] Failed to create checkpoint: ${msg}`);
    return { success: true, checkpoint: { type: 'none', taskId, projectPath, createdAt: new Date().toISOString() } };
  }
}

function createGitStashCheckpoint(projectPath: string, taskId: string): CheckpointResult {
  const stashMsg = `pm-runner-checkpoint-${taskId}`;

  if (!hasGitChanges(projectPath)) {
    // No changes to stash - still create a checkpoint marker
    return {
      success: true,
      checkpoint: {
        type: 'git-stash',
        taskId,
        projectPath,
        stashRef: 'HEAD', // No stash created, but we can reset to HEAD
        createdAt: new Date().toISOString(),
      },
    };
  }

  try {
    // Stash including untracked files
    execSync(`git stash push -u -m "${stashMsg}"`, {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 30000,
    });

    // Get the stash ref
    const stashList = execSync('git stash list --oneline', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 5000,
    }).toString().trim();

    const stashRef = stashList.split('\n')[0]?.split(':')[0] || 'stash@{0}';

    return {
      success: true,
      checkpoint: {
        type: 'git-stash',
        taskId,
        projectPath,
        stashRef,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Git stash failed: ${msg}` };
  }
}

function createFileSnapshotCheckpoint(projectPath: string, taskId: string): CheckpointResult {
  const snapshotDir = path.join(os.tmpdir(), `pm-snapshot-${taskId}-${Date.now()}`);

  try {
    fs.mkdirSync(snapshotDir, { recursive: true });

    const files = collectFiles(projectPath, [
      'node_modules', 'dist', '.git', '.next', '__pycache__',
      'venv', '.venv', 'target', 'build',
    ]);

    // Only snapshot if reasonable size (< 1000 files)
    if (files.length > 1000) {
      console.warn(`[Checkpoint] Too many files (${files.length}), skipping snapshot`);
      return {
        success: true,
        checkpoint: { type: 'none', taskId, projectPath, createdAt: new Date().toISOString() },
      };
    }

    for (const file of files) {
      const rel = path.relative(projectPath, file);
      const dest = path.join(snapshotDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
    }

    return {
      success: true,
      checkpoint: {
        type: 'file-snapshot',
        taskId,
        projectPath,
        snapshotDir,
        files: files.map(f => path.relative(projectPath, f)),
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Clean up on failure
    try { fs.rmSync(snapshotDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return { success: false, error: `File snapshot failed: ${msg}` };
  }
}

/**
 * Collect all files in a directory, excluding specified directories
 */
function collectFiles(dir: string, exclude: string[]): string[] {
  const files: string[] = [];

  function walk(d: string): void {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (exclude.includes(entry.name)) continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          files.push(full);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(dir);
  return files;
}

/**
 * Rollback to a checkpoint after task failure.
 */
export async function rollback(checkpoint: Checkpoint): Promise<RollbackResult> {
  if (checkpoint.type === 'none') {
    return { success: true, filesRestored: 0 };
  }

  try {
    if (checkpoint.type === 'git-stash') {
      return rollbackGitStash(checkpoint);
    } else {
      return rollbackFileSnapshot(checkpoint);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Rollback failed: ${msg}` };
  }
}

function rollbackGitStash(checkpoint: Checkpoint): RollbackResult {
  const { projectPath, stashRef } = checkpoint;

  // Discard all changes made by Claude Code
  execSync('git checkout -- .', { cwd: projectPath, stdio: 'pipe', timeout: 10000 });
  // Remove any new untracked files
  execSync('git clean -fd', { cwd: projectPath, stdio: 'pipe', timeout: 10000 });

  // Restore stashed changes (if stash was created)
  if (stashRef && stashRef !== 'HEAD') {
    try {
      execSync('git stash pop', { cwd: projectPath, stdio: 'pipe', timeout: 10000 });
    } catch {
      // Pop might fail if there are conflicts, try apply instead
      try {
        execSync('git stash apply', { cwd: projectPath, stdio: 'pipe', timeout: 10000 });
      } catch { /* ignore - stash might be empty */ }
    }
  }

  return { success: true };
}

function rollbackFileSnapshot(checkpoint: Checkpoint): RollbackResult {
  const { projectPath, snapshotDir, files } = checkpoint;
  if (!snapshotDir || !files) {
    return { success: false, error: 'No snapshot data' };
  }

  let restored = 0;
  for (const rel of files) {
    const src = path.join(snapshotDir, rel);
    const dest = path.join(projectPath, rel);
    try {
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        restored++;
      }
    } catch { /* skip individual file errors */ }
  }

  // Clean up snapshot
  try { fs.rmSync(snapshotDir, { recursive: true, force: true }); } catch { /* ignore */ }

  return { success: true, filesRestored: restored };
}

/**
 * Clean up a checkpoint after successful task completion.
 */
export async function cleanupCheckpoint(checkpoint: Checkpoint): Promise<void> {
  if (checkpoint.type === 'git-stash' && checkpoint.stashRef && checkpoint.stashRef !== 'HEAD') {
    try {
      // On success, Claude's changes are kept. Drop the pre-task stash.
      execSync('git stash drop', { cwd: checkpoint.projectPath, stdio: 'pipe', timeout: 5000 });
    } catch { /* ignore if already dropped */ }
  } else if (checkpoint.type === 'file-snapshot' && checkpoint.snapshotDir) {
    try {
      fs.rmSync(checkpoint.snapshotDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}
