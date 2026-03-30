/**
 * Task Checkpoint Tests
 *
 * Tests for the checkpoint/rollback mechanism used to restore
 * project state when a task fails.
 *
 * Covers:
 * - isGitRepo detection
 * - Git stash-based checkpoint creation and rollback
 * - File snapshot-based checkpoint creation and rollback
 * - Checkpoint cleanup after success
 * - Edge cases (no changes, too many files)
 */

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  isGitRepo,
  createCheckpoint,
  rollback,
  cleanupCheckpoint,
} from '../../../src/checkpoint';

import type {
  Checkpoint,
} from '../../../src/checkpoint';

// Track temp dirs for cleanup
const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `checkpoint-test-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'file.txt'), 'original');
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe' });
}

describe('Task Checkpoint', () => {
  afterEach(() => {
    // Clean up all temp directories
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  describe('isGitRepo', () => {
    it('returns true for a git repository', () => {
      const dir = makeTmpDir('git-repo');
      initGitRepo(dir);
      assert.equal(isGitRepo(dir), true);
    });

    it('returns false for a non-git directory', () => {
      const dir = makeTmpDir('non-git');
      assert.equal(isGitRepo(dir), false);
    });

    it('returns false for a non-existent directory', () => {
      assert.equal(isGitRepo('/tmp/nonexistent-checkpoint-test-dir-12345'), false);
    });
  });

  describe('createCheckpoint - git stash', () => {
    it('creates git stash checkpoint when there are changes', async () => {
      const dir = makeTmpDir('git-stash');
      initGitRepo(dir);

      // Make some uncommitted changes
      fs.writeFileSync(path.join(dir, 'file.txt'), 'modified');

      const result = await createCheckpoint(dir, 'test-task-1');

      assert.equal(result.success, true);
      assert.ok(result.checkpoint);
      assert.equal(result.checkpoint.type, 'git-stash');
      assert.equal(result.checkpoint.taskId, 'test-task-1');
      assert.equal(result.checkpoint.projectPath, dir);
      assert.ok(result.checkpoint.stashRef);
      assert.notEqual(result.checkpoint.stashRef, 'HEAD');
      assert.ok(result.checkpoint.createdAt);

      // Verify stash was created - working tree should be clean
      const status = execSync('git status --porcelain', { cwd: dir, stdio: 'pipe' }).toString().trim();
      assert.equal(status, '', 'Working tree should be clean after stash');
    });

    it('returns git-stash type with HEAD ref when no changes', async () => {
      const dir = makeTmpDir('git-no-changes');
      initGitRepo(dir);

      const result = await createCheckpoint(dir, 'test-task-2');

      assert.equal(result.success, true);
      assert.ok(result.checkpoint);
      assert.equal(result.checkpoint.type, 'git-stash');
      assert.equal(result.checkpoint.stashRef, 'HEAD');
    });

    it('stashes untracked files', async () => {
      const dir = makeTmpDir('git-untracked');
      initGitRepo(dir);

      // Create a new untracked file
      fs.writeFileSync(path.join(dir, 'new-file.txt'), 'new content');

      const result = await createCheckpoint(dir, 'test-task-3');

      assert.equal(result.success, true);
      assert.ok(result.checkpoint);
      assert.equal(result.checkpoint.type, 'git-stash');

      // Verify untracked file was stashed
      assert.equal(fs.existsSync(path.join(dir, 'new-file.txt')), false, 'Untracked file should be stashed');
    });
  });

  describe('createCheckpoint - file snapshot', () => {
    it('creates file snapshot for non-git directories', async () => {
      const dir = makeTmpDir('file-snapshot');
      fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("hello")');
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export default {}');

      const result = await createCheckpoint(dir, 'test-task-4');

      assert.equal(result.success, true);
      assert.ok(result.checkpoint);
      assert.equal(result.checkpoint.type, 'file-snapshot');
      assert.equal(result.checkpoint.taskId, 'test-task-4');
      assert.ok(result.checkpoint.snapshotDir);
      assert.ok(result.checkpoint.files);
      assert.ok(result.checkpoint.files.length >= 2);

      // Verify snapshot files exist
      assert.equal(
        fs.existsSync(path.join(result.checkpoint.snapshotDir!, 'app.js')),
        true,
        'Snapshot should contain app.js'
      );
      assert.equal(
        fs.existsSync(path.join(result.checkpoint.snapshotDir!, 'src', 'index.ts')),
        true,
        'Snapshot should contain src/index.ts'
      );

      // Track snapshot dir for cleanup
      tmpDirs.push(result.checkpoint.snapshotDir!);
    });

    it('excludes node_modules and dist directories', async () => {
      const dir = makeTmpDir('file-exclude');
      fs.writeFileSync(path.join(dir, 'app.js'), 'hello');
      fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'module');
      fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'dist', 'bundle.js'), 'bundle');

      const result = await createCheckpoint(dir, 'test-task-5');

      assert.equal(result.success, true);
      assert.ok(result.checkpoint);
      assert.ok(result.checkpoint.files);

      // Should only have app.js, not node_modules or dist files
      const relFiles = result.checkpoint.files!;
      assert.ok(relFiles.includes('app.js'), 'Should include app.js');
      assert.ok(
        !relFiles.some(f => f.startsWith('node_modules')),
        'Should not include node_modules files'
      );
      assert.ok(
        !relFiles.some(f => f.startsWith('dist')),
        'Should not include dist files'
      );

      // Track snapshot dir for cleanup
      if (result.checkpoint.snapshotDir) {
        tmpDirs.push(result.checkpoint.snapshotDir);
      }
    });
  });

  describe('rollback - git stash', () => {
    it('restores stashed changes after rollback', async () => {
      const dir = makeTmpDir('git-rollback');
      initGitRepo(dir);

      // Make uncommitted changes
      fs.writeFileSync(path.join(dir, 'file.txt'), 'pre-task changes');

      // Create checkpoint (stashes the changes)
      const cpResult = await createCheckpoint(dir, 'test-task-rb-1');
      assert.equal(cpResult.success, true);
      const checkpoint = cpResult.checkpoint!;

      // Simulate Claude Code making some changes
      fs.writeFileSync(path.join(dir, 'file.txt'), 'claude code changes');
      fs.writeFileSync(path.join(dir, 'new-by-claude.txt'), 'created by claude');

      // Rollback
      const rbResult = await rollback(checkpoint);
      assert.equal(rbResult.success, true);

      // Verify: pre-task changes should be restored
      const content = fs.readFileSync(path.join(dir, 'file.txt'), 'utf-8');
      assert.equal(content, 'pre-task changes');

      // Verify: Claude's new file should be removed
      assert.equal(
        fs.existsSync(path.join(dir, 'new-by-claude.txt')),
        false,
        'New files created by Claude should be removed'
      );
    });

    it('handles rollback when no stash was created (HEAD ref)', async () => {
      const dir = makeTmpDir('git-rollback-head');
      initGitRepo(dir);

      // No changes - checkpoint will have HEAD ref
      const cpResult = await createCheckpoint(dir, 'test-task-rb-2');
      const checkpoint = cpResult.checkpoint!;
      assert.equal(checkpoint.stashRef, 'HEAD');

      // Simulate Claude making changes
      fs.writeFileSync(path.join(dir, 'file.txt'), 'claude changes');

      // Rollback
      const rbResult = await rollback(checkpoint);
      assert.equal(rbResult.success, true);

      // Original content should be restored
      const content = fs.readFileSync(path.join(dir, 'file.txt'), 'utf-8');
      assert.equal(content, 'original');
    });
  });

  describe('rollback - file snapshot', () => {
    it('restores files from snapshot', async () => {
      const dir = makeTmpDir('file-rollback');
      fs.writeFileSync(path.join(dir, 'app.js'), 'original code');
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'main.ts'), 'original main');

      // Create checkpoint
      const cpResult = await createCheckpoint(dir, 'test-task-rb-3');
      assert.equal(cpResult.success, true);
      const checkpoint = cpResult.checkpoint!;

      // Simulate modifications
      fs.writeFileSync(path.join(dir, 'app.js'), 'modified code');
      fs.writeFileSync(path.join(dir, 'src', 'main.ts'), 'modified main');

      // Rollback
      const rbResult = await rollback(checkpoint);
      assert.equal(rbResult.success, true);
      assert.ok(rbResult.filesRestored);
      assert.ok(rbResult.filesRestored >= 2);

      // Verify restoration
      assert.equal(fs.readFileSync(path.join(dir, 'app.js'), 'utf-8'), 'original code');
      assert.equal(fs.readFileSync(path.join(dir, 'src', 'main.ts'), 'utf-8'), 'original main');
    });

    it('returns error when snapshot data is missing', async () => {
      const checkpoint: Checkpoint = {
        type: 'file-snapshot',
        taskId: 'test',
        projectPath: '/tmp/nonexistent',
        createdAt: new Date().toISOString(),
        // Missing snapshotDir and files
      };

      const rbResult = await rollback(checkpoint);
      assert.equal(rbResult.success, false);
      assert.ok(rbResult.error);
      assert.ok(rbResult.error.includes('No snapshot data'));
    });
  });

  describe('rollback - none type', () => {
    it('succeeds with 0 files restored for none type', async () => {
      const checkpoint: Checkpoint = {
        type: 'none',
        taskId: 'test',
        projectPath: '/tmp/test',
        createdAt: new Date().toISOString(),
      };

      const rbResult = await rollback(checkpoint);
      assert.equal(rbResult.success, true);
      assert.equal(rbResult.filesRestored, 0);
    });
  });

  describe('cleanupCheckpoint', () => {
    it('removes snapshot directory for file-snapshot type', async () => {
      const dir = makeTmpDir('cleanup');
      fs.writeFileSync(path.join(dir, 'file.txt'), 'content');

      const cpResult = await createCheckpoint(dir, 'test-cleanup-1');
      const checkpoint = cpResult.checkpoint!;

      assert.equal(checkpoint.type, 'file-snapshot');
      assert.ok(checkpoint.snapshotDir);
      assert.equal(fs.existsSync(checkpoint.snapshotDir!), true);

      await cleanupCheckpoint(checkpoint);

      assert.equal(
        fs.existsSync(checkpoint.snapshotDir!),
        false,
        'Snapshot directory should be removed after cleanup'
      );
    });

    it('drops git stash on cleanup', async () => {
      const dir = makeTmpDir('cleanup-git');
      initGitRepo(dir);

      // Make changes to create a real stash
      fs.writeFileSync(path.join(dir, 'file.txt'), 'changes');

      const cpResult = await createCheckpoint(dir, 'test-cleanup-2');
      const checkpoint = cpResult.checkpoint!;

      // Verify stash exists
      const stashBefore = execSync('git stash list', { cwd: dir, stdio: 'pipe' }).toString().trim();
      assert.ok(stashBefore.length > 0, 'Stash should exist before cleanup');

      await cleanupCheckpoint(checkpoint);

      // Verify stash was dropped
      const stashAfter = execSync('git stash list', { cwd: dir, stdio: 'pipe' }).toString().trim();
      assert.equal(stashAfter, '', 'Stash should be dropped after cleanup');
    });

    it('handles cleanup of none type gracefully', async () => {
      const checkpoint: Checkpoint = {
        type: 'none',
        taskId: 'test',
        projectPath: '/tmp/test',
        createdAt: new Date().toISOString(),
      };

      // Should not throw
      await cleanupCheckpoint(checkpoint);
    });
  });
});
