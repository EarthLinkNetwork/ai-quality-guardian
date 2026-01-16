/**
 * Unit tests for File Verification in Claude Code Executor
 *
 * TDD: These tests are written FIRST, before implementation fixes.
 *
 * Property 31 (Verified Files Detection) requires:
 * 1. Diff Detection: Compare filesBefore vs filesAfter
 * 2. Disk Verification: fs.existsSync() confirms file exists
 * 3. verified_files must include path, exists, detected_at, detection_method
 *
 * Problem areas tested:
 * - listFiles() hidden file exclusion (should NOT affect project root non-hidden files)
 * - detectModifiedFiles() new file detection
 * - Timing: filesAfter scan must happen AFTER file write completes
 * - Path handling: relative vs absolute path consistency
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Simulated listFiles() function matching ClaudeCodeExecutor logic
 * This allows testing the algorithm in isolation.
 */
function listFilesSimulated(dir: string): Map<string, { mtime: number; size: number }> {
  const files = new Map<string, { mtime: number; size: number }>();

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Current production code filter (line 379-380 in claude-code-executor.ts):
      // if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          files.set(fullPath, {
            mtime: stat.mtimeMs,
            size: stat.size,
          });
        } catch {
          // File may have been deleted during scan
        }
      } else if (entry.isDirectory()) {
        const subFiles = listFilesSimulated(fullPath);
        for (const [key, value] of subFiles) {
          files.set(key, value);
        }
      }
    }
  } catch {
    // Directory may not exist or be inaccessible
  }

  return files;
}

/**
 * Simulated detectModifiedFiles() matching ClaudeCodeExecutor logic
 */
function detectModifiedFilesSimulated(
  before: Map<string, { mtime: number; size: number }>,
  after: Map<string, { mtime: number; size: number }>,
  baseDir: string
): string[] {
  const modified: string[] = [];

  for (const [filePath, afterStat] of after) {
    const beforeStat = before.get(filePath);

    // New file
    if (!beforeStat) {
      modified.push(path.relative(baseDir, filePath));
      continue;
    }

    // Modified file (mtime or size changed)
    if (beforeStat.mtime !== afterStat.mtime || beforeStat.size !== afterStat.size) {
      modified.push(path.relative(baseDir, filePath));
    }
  }

  return modified;
}

describe('File Verification Logic (Property 31 Unit Tests)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-verify-unit-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('listFiles() Filter Behavior', () => {
    /**
     * Property 31 requires that non-hidden files like README.md are detected.
     * The listFiles() filter should NOT exclude them.
     */
    it('should include README.md in project root', () => {
      const readmePath = path.join(tempDir, 'README.md');
      fs.writeFileSync(readmePath, '# Test Project');

      const files = listFilesSimulated(tempDir);

      assert.ok(files.has(readmePath), 'README.md should be in listed files');
    });

    it('should include all non-hidden files in project root', () => {
      // Create various non-hidden files
      fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export {}');
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(tempDir, 'test.txt'), 'test');

      const files = listFilesSimulated(tempDir);
      const relativePaths = Array.from(files.keys()).map(p => path.relative(tempDir, p));

      assert.ok(relativePaths.includes('index.ts'), 'index.ts should be included');
      assert.ok(relativePaths.includes('package.json'), 'package.json should be included');
      assert.ok(relativePaths.includes('test.txt'), 'test.txt should be included');
    });

    it('should exclude hidden files (.gitignore, .env)', () => {
      fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules');
      fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET=123');
      fs.writeFileSync(path.join(tempDir, 'visible.txt'), 'visible');

      const files = listFilesSimulated(tempDir);
      const relativePaths = Array.from(files.keys()).map(p => path.relative(tempDir, p));

      assert.ok(!relativePaths.includes('.gitignore'), '.gitignore should be excluded');
      assert.ok(!relativePaths.includes('.env'), '.env should be excluded');
      assert.ok(relativePaths.includes('visible.txt'), 'visible.txt should be included');
    });

    it('should exclude hidden directories (.claude, .git)', () => {
      // Create hidden directory with file
      fs.mkdirSync(path.join(tempDir, '.claude'));
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');
      fs.mkdirSync(path.join(tempDir, '.git'));
      fs.writeFileSync(path.join(tempDir, '.git', 'config'), '');

      // Create visible directory with file
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export {}');

      const files = listFilesSimulated(tempDir);
      const relativePaths = Array.from(files.keys()).map(p => path.relative(tempDir, p));

      assert.ok(!relativePaths.some(p => p.includes('.claude')), '.claude files should be excluded');
      assert.ok(!relativePaths.some(p => p.includes('.git')), '.git files should be excluded');
      assert.ok(relativePaths.some(p => p.includes('src')), 'src/index.ts should be included');
    });

    it('should exclude node_modules directory', () => {
      fs.mkdirSync(path.join(tempDir, 'node_modules'));
      fs.mkdirSync(path.join(tempDir, 'node_modules', 'lodash'));
      fs.writeFileSync(path.join(tempDir, 'node_modules', 'lodash', 'index.js'), '');

      const files = listFilesSimulated(tempDir);

      assert.ok(!Array.from(files.keys()).some(p => p.includes('node_modules')),
        'node_modules should be excluded');
    });

    it('should recurse into non-hidden subdirectories', () => {
      // Create nested structure
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.mkdirSync(path.join(tempDir, 'src', 'components'));
      fs.writeFileSync(path.join(tempDir, 'src', 'components', 'Button.tsx'), 'export {}');

      const files = listFilesSimulated(tempDir);
      const relativePaths = Array.from(files.keys()).map(p => path.relative(tempDir, p));

      assert.ok(relativePaths.includes(path.join('src', 'components', 'Button.tsx')),
        'Nested file should be included');
    });
  });

  describe('detectModifiedFiles() Behavior', () => {
    /**
     * Property 31: New files should appear in files_modified.
     * A file in filesAfter but not in filesBefore is NEW.
     */
    it('should detect new file (in after, not in before)', () => {
      const before = new Map<string, { mtime: number; size: number }>();
      const after = new Map<string, { mtime: number; size: number }>();

      // Simulate new file created
      const newFilePath = path.join(tempDir, 'new-file.txt');
      after.set(newFilePath, { mtime: Date.now(), size: 100 });

      const modified = detectModifiedFilesSimulated(before, after, tempDir);

      assert.deepEqual(modified, ['new-file.txt'], 'New file should be detected');
    });

    it('should detect modified file (mtime changed)', () => {
      const filePath = path.join(tempDir, 'existing.txt');

      const before = new Map<string, { mtime: number; size: number }>();
      before.set(filePath, { mtime: 1000, size: 50 });

      const after = new Map<string, { mtime: number; size: number }>();
      after.set(filePath, { mtime: 2000, size: 50 });  // mtime changed

      const modified = detectModifiedFilesSimulated(before, after, tempDir);

      assert.deepEqual(modified, ['existing.txt'], 'Modified file should be detected');
    });

    it('should detect modified file (size changed)', () => {
      const filePath = path.join(tempDir, 'growing.txt');

      const before = new Map<string, { mtime: number; size: number }>();
      before.set(filePath, { mtime: 1000, size: 50 });

      const after = new Map<string, { mtime: number; size: number }>();
      after.set(filePath, { mtime: 1000, size: 100 });  // size changed

      const modified = detectModifiedFilesSimulated(before, after, tempDir);

      assert.deepEqual(modified, ['growing.txt'], 'File with size change should be detected');
    });

    it('should NOT detect unchanged file', () => {
      const filePath = path.join(tempDir, 'unchanged.txt');

      const before = new Map<string, { mtime: number; size: number }>();
      before.set(filePath, { mtime: 1000, size: 50 });

      const after = new Map<string, { mtime: number; size: number }>();
      after.set(filePath, { mtime: 1000, size: 50 });  // Same mtime and size

      const modified = detectModifiedFilesSimulated(before, after, tempDir);

      assert.deepEqual(modified, [], 'Unchanged file should NOT be in modified list');
    });

    it('should detect multiple new files', () => {
      const before = new Map<string, { mtime: number; size: number }>();
      const after = new Map<string, { mtime: number; size: number }>();

      // Multiple new files
      after.set(path.join(tempDir, 'file1.txt'), { mtime: Date.now(), size: 10 });
      after.set(path.join(tempDir, 'file2.txt'), { mtime: Date.now(), size: 20 });
      after.set(path.join(tempDir, 'file3.txt'), { mtime: Date.now(), size: 30 });

      const modified = detectModifiedFilesSimulated(before, after, tempDir);

      assert.equal(modified.length, 3, 'All 3 new files should be detected');
      assert.ok(modified.includes('file1.txt'));
      assert.ok(modified.includes('file2.txt'));
      assert.ok(modified.includes('file3.txt'));
    });
  });

  describe('fs.existsSync() Verification', () => {
    /**
     * Property 31: verified_files.exists must be TRUE for files that exist.
     * This is the final authority check.
     */
    it('should return true for existing file', () => {
      const filePath = path.join(tempDir, 'exists.txt');
      fs.writeFileSync(filePath, 'content');

      assert.ok(fs.existsSync(filePath), 'existsSync should return true for existing file');
    });

    it('should return false for non-existing file', () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      assert.ok(!fs.existsSync(filePath), 'existsSync should return false for non-existing file');
    });

    it('should return true for file in subdirectory', () => {
      fs.mkdirSync(path.join(tempDir, 'subdir'));
      const filePath = path.join(tempDir, 'subdir', 'nested.txt');
      fs.writeFileSync(filePath, 'nested content');

      assert.ok(fs.existsSync(filePath), 'existsSync should find file in subdirectory');
    });
  });

  describe('End-to-End File Detection Simulation', () => {
    /**
     * Simulates the full flow: filesBefore -> create file -> filesAfter -> detect
     */
    it('should detect README.md created between scans', () => {
      // 1. Scan before
      const filesBefore = listFilesSimulated(tempDir);

      // 2. Create file
      const readmePath = path.join(tempDir, 'README.md');
      fs.writeFileSync(readmePath, '# Created after scan');

      // 3. Scan after
      const filesAfter = listFilesSimulated(tempDir);

      // 4. Detect modified
      const modified = detectModifiedFilesSimulated(filesBefore, filesAfter, tempDir);

      // 5. Verify
      assert.deepEqual(modified, ['README.md'], 'README.md should be detected as new');

      // 6. Disk verification (Property 8: Runner's fs.existsSync is authoritative)
      assert.ok(fs.existsSync(readmePath), 'README.md should exist on disk');
    });

    it('should handle file creation in subdirectory', () => {
      // 1. Create subdirectory
      fs.mkdirSync(path.join(tempDir, 'docs'));

      // 2. Scan before
      const filesBefore = listFilesSimulated(tempDir);

      // 3. Create file in subdirectory
      const docPath = path.join(tempDir, 'docs', 'guide.md');
      fs.writeFileSync(docPath, '# User Guide');

      // 4. Scan after
      const filesAfter = listFilesSimulated(tempDir);

      // 5. Detect
      const modified = detectModifiedFilesSimulated(filesBefore, filesAfter, tempDir);

      // 6. Verify
      assert.deepEqual(modified, [path.join('docs', 'guide.md')], 'docs/guide.md should be detected');
      assert.ok(fs.existsSync(docPath), 'File should exist on disk');
    });

    it('should NOT falsely detect files in .claude directory', () => {
      // 1. Create .claude directory structure
      fs.mkdirSync(path.join(tempDir, '.claude'));
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}');

      // 2. Scan before
      const filesBefore = listFilesSimulated(tempDir);

      // 3. Modify file in .claude (this should NOT be detected)
      fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{"updated": true}');

      // 4. Scan after
      const filesAfter = listFilesSimulated(tempDir);

      // 5. Detect
      const modified = detectModifiedFilesSimulated(filesBefore, filesAfter, tempDir);

      // 6. Verify .claude files are excluded
      assert.deepEqual(modified, [], 'Changes in .claude should NOT be detected');
    });

    it('should correctly detect project root files while ignoring hidden dirs', () => {
      // Setup: Create both hidden and visible directories
      fs.mkdirSync(path.join(tempDir, '.claude'));
      fs.mkdirSync(path.join(tempDir, 'src'));

      // 1. Scan before
      const filesBefore = listFilesSimulated(tempDir);

      // 2. Create files in both locations
      fs.writeFileSync(path.join(tempDir, '.claude', 'new-config.json'), '{}');  // Should be ignored
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export {}');  // Should be detected
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Project');  // Should be detected

      // 3. Scan after
      const filesAfter = listFilesSimulated(tempDir);

      // 4. Detect
      const modified = detectModifiedFilesSimulated(filesBefore, filesAfter, tempDir);

      // 5. Verify
      assert.ok(modified.includes(path.join('src', 'index.ts')), 'src/index.ts should be detected');
      assert.ok(modified.includes('README.md'), 'README.md should be detected');
      assert.ok(!modified.some(p => p.includes('.claude')), '.claude files should NOT be detected');
    });
  });

  describe('Path Handling', () => {
    /**
     * Property 31: Paths in verified_files should be relative to project directory.
     */
    it('should return relative paths from detectModifiedFiles', () => {
      const before = new Map<string, { mtime: number; size: number }>();
      const after = new Map<string, { mtime: number; size: number }>();

      const fullPath = path.join(tempDir, 'nested', 'deep', 'file.txt');
      after.set(fullPath, { mtime: Date.now(), size: 10 });

      const modified = detectModifiedFilesSimulated(before, after, tempDir);

      // Path should be relative to baseDir (tempDir)
      assert.equal(modified[0], path.join('nested', 'deep', 'file.txt'),
        'Path should be relative to project directory');
    });

    it('should handle absolute paths in verification', () => {
      // Create file
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'content');

      // Both absolute and relative should work with existsSync
      assert.ok(fs.existsSync(filePath), 'Absolute path should work');

      // Relative from tempDir would require process.cwd() to be tempDir
      // This is NOT recommended - always use absolute paths for verification
    });
  });

  describe('Timing Considerations', () => {
    /**
     * Property 31: filesAfter scan must happen AFTER file write completes.
     * This tests synchronous file operations which Node.js handles correctly.
     */
    it('should see file immediately after sync write', () => {
      const filePath = path.join(tempDir, 'sync-write.txt');

      // Write synchronously
      fs.writeFileSync(filePath, 'sync content');

      // Should be visible immediately
      assert.ok(fs.existsSync(filePath), 'File should exist immediately after sync write');

      // And readable
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.equal(content, 'sync content', 'Content should be correct');
    });

    it('should detect file created by external process (simulated)', async () => {
      // 1. Scan before
      const filesBefore = listFilesSimulated(tempDir);

      // 2. Simulate delay (external process creating file)
      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. Create file
      const filePath = path.join(tempDir, 'delayed.txt');
      fs.writeFileSync(filePath, 'created after delay');

      // 4. Small delay to ensure fs sync
      await new Promise(resolve => setTimeout(resolve, 50));

      // 5. Scan after
      const filesAfter = listFilesSimulated(tempDir);

      // 6. Detect
      const modified = detectModifiedFilesSimulated(filesBefore, filesAfter, tempDir);

      // 7. Verify
      assert.ok(modified.includes('delayed.txt'), 'Delayed file should be detected');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty directory', () => {
      const files = listFilesSimulated(tempDir);
      assert.equal(files.size, 0, 'Empty directory should have no files');
    });

    it('should handle directory with only hidden files', () => {
      fs.writeFileSync(path.join(tempDir, '.hidden1'), 'hidden');
      fs.writeFileSync(path.join(tempDir, '.hidden2'), 'hidden');

      const files = listFilesSimulated(tempDir);
      assert.equal(files.size, 0, 'Directory with only hidden files should report 0 visible files');
    });

    it('should handle special characters in filename', () => {
      const specialPath = path.join(tempDir, 'file with spaces.txt');
      fs.writeFileSync(specialPath, 'content');

      const files = listFilesSimulated(tempDir);
      assert.ok(files.has(specialPath), 'File with spaces should be included');
    });

    it('should handle deeply nested directories', () => {
      // Create deep nesting
      const deepPath = path.join(tempDir, 'a', 'b', 'c', 'd', 'e');
      fs.mkdirSync(deepPath, { recursive: true });
      fs.writeFileSync(path.join(deepPath, 'deep.txt'), 'deep content');

      const files = listFilesSimulated(tempDir);
      const relativePaths = Array.from(files.keys()).map(p => path.relative(tempDir, p));

      assert.ok(
        relativePaths.includes(path.join('a', 'b', 'c', 'd', 'e', 'deep.txt')),
        'Deeply nested file should be found'
      );
    });
  });
});
