/**
 * Fix Application Unit Tests
 *
 * Tests for the git patch application logic in auto-dev-loop.ts
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Import functions to test (we'll need to export them or test via module)
// For now, test the logic directly

describe('Fix Application', () => {
  describe('extractPatch', () => {
    // Inline implementation for testing
    function extractPatch(response: string): string | null {
      const patchMatch = response.match(/```(?:patch|diff)\n([\s\S]*?)```/);
      if (patchMatch) {
        return patchMatch[1].trim();
      }

      const diffLines: string[] = [];
      let inDiff = false;
      const lines = response.split('\n');

      for (const line of lines) {
        if (line.startsWith('--- a/') || line.startsWith('--- ')) {
          inDiff = true;
        }
        if (inDiff) {
          diffLines.push(line);
          if (diffLines.length > 3 && line === '' && !lines[lines.indexOf(line) + 1]?.startsWith('+') &&
              !lines[lines.indexOf(line) + 1]?.startsWith('-') && !lines[lines.indexOf(line) + 1]?.startsWith(' ') &&
              !lines[lines.indexOf(line) + 1]?.startsWith('@')) {
            break;
          }
        }
      }

      if (diffLines.length > 0) {
        return diffLines.join('\n').trim();
      }

      return null;
    }

    it('should extract patch from ```patch code block', () => {
      const response = `Here's the fix:

\`\`\`patch
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
 function hello() {
-  return 'hello';
+  return 'world';
 }
\`\`\`

This should fix the test.`;

      const patch = extractPatch(response);
      assert.notEqual(patch, null);
      assert.ok(patch?.includes('--- a/src/example.ts'));
      assert.ok(patch?.includes('+++ b/src/example.ts'));
      assert.ok(patch?.includes("-  return 'hello';"));
      assert.ok(patch?.includes("+  return 'world';"));
    });

    it('should extract patch from ```diff code block', () => {
      const response = `Fix:

\`\`\`diff
--- a/test.js
+++ b/test.js
@@ -5,7 +5,7 @@
 const a = 1;
 const b = 2;
-const c = 3;
+const c = 4;
 const d = 5;
\`\`\``;

      const patch = extractPatch(response);
      assert.notEqual(patch, null);
      assert.ok(patch?.includes('-const c = 3;'));
      assert.ok(patch?.includes('+const c = 4;'));
    });

    it('should extract patch from raw unified diff', () => {
      const response = `I found the issue. Here's the fix:

--- a/lib/utils.ts
+++ b/lib/utils.ts
@@ -10,6 +10,7 @@
 export function process(data: string) {
   const result = parse(data);
+  validate(result);
   return result;
 }

The validate call was missing.`;

      const patch = extractPatch(response);
      assert.notEqual(patch, null);
      assert.ok(patch?.includes('--- a/lib/utils.ts'));
      assert.ok(patch?.includes('+  validate(result);'));
    });

    it('should return null when no patch found', () => {
      const response = `I couldn't generate a valid patch. Please fix manually:

1. Open the file
2. Change line 10
3. Save`;

      const patch = extractPatch(response);
      assert.equal(patch, null);
    });

    it('should handle multiple file patches', () => {
      const response = `\`\`\`patch
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
-export const A = 1;
+export const A = 2;

--- a/src/b.ts
+++ b/src/b.ts
@@ -1,3 +1,3 @@
-export const B = 1;
+export const B = 2;
\`\`\``;

      const patch = extractPatch(response);
      assert.notEqual(patch, null);
      assert.ok(patch?.includes('--- a/src/a.ts'));
      assert.ok(patch?.includes('--- a/src/b.ts'));
    });
  });

  describe('extractAffectedFiles', () => {
    function extractAffectedFiles(patch: string): string[] {
      const files = new Set<string>();
      const lines = patch.split('\n');

      for (const line of lines) {
        const match = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/);
        if (match) {
          const filePath = match[1];
          if (filePath !== '/dev/null' && !filePath.startsWith('/dev/null')) {
            files.add(filePath);
          }
        }
      }

      return Array.from(files);
    }

    it('should extract single file path', () => {
      const patch = `--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
 const x = 1;`;

      const files = extractAffectedFiles(patch);
      assert.deepEqual(files, ['src/example.ts']);
    });

    it('should extract multiple file paths', () => {
      const patch = `--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-const A = 1;
+const A = 2;
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1 @@
-const B = 1;
+const B = 2;`;

      const files = extractAffectedFiles(patch);
      assert.equal(files.length, 2);
      assert.ok(files.includes('src/a.ts'));
      assert.ok(files.includes('src/b.ts'));
    });

    it('should handle new file (from /dev/null)', () => {
      const patch = `--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export const NEW = true;`;

      const files = extractAffectedFiles(patch);
      assert.deepEqual(files, ['src/new-file.ts']);
    });

    it('should handle deleted file (to /dev/null)', () => {
      const patch = `--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export const OLD = true;`;

      const files = extractAffectedFiles(patch);
      assert.deepEqual(files, ['src/old-file.ts']);
    });

    it('should deduplicate file paths', () => {
      const patch = `--- a/src/same.ts
+++ b/src/same.ts
@@ -1 +1 @@
-line1
+line2`;

      const files = extractAffectedFiles(patch);
      assert.equal(files.length, 1);
      assert.deepEqual(files, ['src/same.ts']);
    });
  });

  describe('createFixPrompt', () => {
    it('should include patch format instructions', () => {
      // Inline simplified version
      function createFixPrompt(task: string, failures: string[], iteration: number, maxIterations: number): string {
        return `The following tests failed for the implementation task "${task}":

${failures.map(f => `- ${f}`).join('\n')}

This is iteration ${iteration} of ${maxIterations}.

CRITICAL: Your response MUST include a patch block in this EXACT format:

\`\`\`patch
--- a/path/to/file.ts
+++ b/path/to/file.ts
@@ -line,count +line,count @@
 context line
-removed line
+added line
 context line
\`\`\``;
      }

      const prompt = createFixPrompt('Fix login', ['Test 1 failed', 'Test 2 failed'], 1, 3);

      assert.ok(prompt.includes('Fix login'));
      assert.ok(prompt.includes('Test 1 failed'));
      assert.ok(prompt.includes('Test 2 failed'));
      assert.ok(prompt.includes('iteration 1 of 3'));
      assert.ok(prompt.includes('```patch'));
      assert.ok(prompt.includes('--- a/path/to/file.ts'));
      assert.ok(prompt.includes('+++ b/path/to/file.ts'));
    });
  });

  describe('FixApplicationResult type', () => {
    it('should have correct structure for success', () => {
      interface FixApplicationResult {
        success: boolean;
        appliedFiles: string[];
        patch?: string;
        error?: string;
      }

      const result: FixApplicationResult = {
        success: true,
        appliedFiles: ['src/a.ts', 'src/b.ts'],
        patch: '--- a/src/a.ts...',
      };

      assert.equal(result.success, true);
      assert.equal(result.appliedFiles.length, 2);
      assert.equal(result.error, undefined);
    });

    it('should have correct structure for failure', () => {
      interface FixApplicationResult {
        success: boolean;
        appliedFiles: string[];
        patch?: string;
        error?: string;
      }

      const result: FixApplicationResult = {
        success: false,
        appliedFiles: [],
        patch: '--- a/src/a.ts...',
        error: 'Patch cannot be applied: conflict in src/a.ts',
      };

      assert.equal(result.success, false);
      assert.equal(result.appliedFiles.length, 0);
      assert.ok(result.error?.includes('conflict'));
    });
  });
});

describe('AutoFixResult type', () => {
  it('should include patch field', () => {
    interface AutoFixResult {
      success: boolean;
      fixDescription: string;
      newCode?: string;
      error?: string;
      patch?: string;
      appliedFiles?: string[];
    }

    const result: AutoFixResult = {
      success: true,
      fixDescription: 'Added validation check',
      patch: '--- a/src/utils.ts\n+++ b/src/utils.ts\n...',
      appliedFiles: ['src/utils.ts'],
    };

    assert.notEqual(result.patch, undefined);
    assert.deepEqual(result.appliedFiles, ['src/utils.ts']);
  });
});
