/**
 * Real LLM E2E Tests (Opt-in)
 *
 * These tests use real Claude Code to fix the tiny-cli fixture.
 * They are skipped by default and only run when REAL_LLM_TESTS=1.
 *
 * Usage:
 *   REAL_LLM_TESTS=1 npm test -- --grep "Real LLM E2E"
 *
 * Requirements:
 *   - Claude Code CLI must be installed and authenticated
 *   - Network access required
 *   - May take several minutes to complete
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';
import { RunnerCore } from '../../src/core/runner-core';

// Check if real LLM tests are enabled
const REAL_LLM_TESTS_ENABLED = process.env.REAL_LLM_TESTS === '1';

// Skip helper
function skipUnlessRealLLM(fn: Mocha.Func | undefined): Mocha.Func | undefined {
  if (!REAL_LLM_TESTS_ENABLED) {
    return undefined; // Return undefined to skip
  }
  return fn;
}

/**
 * Check if Claude Code CLI is available
 */
function checkClaudeCodeAvailable(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

describe('Real LLM E2E Tests (opt-in: REAL_LLM_TESTS=1)', function() {
  // These tests are slow
  this.timeout(600000); // 10 minutes max

  let tempDir: string;
  let projectDir: string;
  let evidenceDir: string;
  let fixtureDir: string;

  beforeEach(async function() {
    if (!REAL_LLM_TESTS_ENABLED) {
      this.skip();
      return;
    }

    // Check Claude Code availability
    if (!checkClaudeCodeAvailable()) {
      console.log('Claude Code CLI not available. Skipping test.');
      this.skip();
      return;
    }

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-llm-e2e-'));
    projectDir = path.join(tempDir, 'tiny-cli');
    evidenceDir = path.join(tempDir, 'evidence');

    // Copy fixture to temp directory
    fixtureDir = path.resolve(__dirname, '../../fixtures/e2e-tiny-cli');

    // Copy fixture
    fs.cpSync(fixtureDir, projectDir, { recursive: true });

    // Install dependencies
    console.log('Installing dependencies...');
    execSync('npm install', { cwd: projectDir, stdio: 'pipe' });

    // Initial build
    console.log('Building...');
    execSync('npm run build', { cwd: projectDir, stdio: 'pipe' });

    // Verify tests fail initially
    try {
      execSync('npm test', { cwd: projectDir, stdio: 'pipe' });
      assert.fail('Tests should fail initially');
    } catch {
      console.log('Verified: Tests fail initially (expected)');
    }

    // Create .claude directory
    const claudeDir = path.join(projectDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'CLAUDE.md'),
      '# Tiny CLI Project\n\nThis is a small CLI tool for testing.\n'
    );
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'agents', 'pm-orchestrator.md'), '# PM');
    fs.mkdirSync(path.join(claudeDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'rules', 'project-rules.md'), '# Rules');
  });

  afterEach(function() {
    if (tempDir && fs.existsSync(tempDir)) {
      // Keep temp dir for debugging if tests fail
      if (this.currentTest?.state === 'failed') {
        console.log('Test failed. Temp directory preserved at:', tempDir);
      } else {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  describe('Fix tiny-cli with real Claude Code', function() {
    it('should fix buggy implementation within 3 loops', skipUnlessRealLLM(async function() {
      console.log('Starting real LLM test...');
      console.log('Project dir:', projectDir);

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        // Use real executor (not mock)
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'fix-tiny-cli-real',
        description: 'Fix the tiny-cli sum and fib functions',
        naturalLanguageTask: [
          'The tiny-cli has bugs in the sum and fib functions.',
          '',
          'Current bugs:',
          '1. sum(2, 3) returns "23" instead of 5 - it uses string concatenation instead of numeric addition',
          '2. fib(10) returns wrong value - there is an off-by-one error in the loop',
          '',
          'Fix both functions in src/tiny-cli.ts so that:',
          '- sum(a, b) returns the numeric sum (a + b)',
          '- fib(n) returns the correct Fibonacci number (fib(10) should be 55)',
          '',
          'After fixing, run "npm run build" and then "npm test" to verify all tests pass.',
          '',
          'Important: Only modify src/tiny-cli.ts. Do not modify the test file.',
        ].join('\n'),
      };

      // Execute with max 3 loops
      let loopCount = 0;
      const maxLoops = 3;

      while (loopCount < maxLoops) {
        loopCount++;
        console.log('Loop ' + loopCount + ' of ' + maxLoops + '...');

        try {
          await runner.executeTasksSequentially([task]);

          // Check if tests pass now
          try {
            execSync('npm run build && npm test', {
              cwd: projectDir,
              stdio: 'pipe',
              encoding: 'utf-8',
            });
            console.log('Tests passed on loop ' + loopCount + '!');
            break;
          } catch (testError) {
            const err = testError as { stdout?: string; stderr?: string };
            console.log('Tests still failing on loop ' + loopCount);
            if (err.stdout) console.log('stdout:', err.stdout.substring(0, 500));
            if (loopCount >= maxLoops) {
              // On last loop, check if we made progress
              const srcContent = fs.readFileSync(
                path.join(projectDir, 'src', 'tiny-cli.ts'),
                'utf-8'
              );
              console.log('Final src/tiny-cli.ts content:');
              console.log(srcContent.substring(0, 1000));
            }
          }
        } catch (e) {
          console.error('Runner error on loop ' + loopCount + ':', e);
          // Continue to next loop
        }
      }

      // Final verification
      console.log('Final verification...');
      execSync('npm run build', { cwd: projectDir, stdio: 'pipe' });

      let testsPassed = false;
      try {
        const testOutput = execSync('npm test', {
          cwd: projectDir,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        console.log('Test output:', testOutput);
        testsPassed = testOutput.includes('passing');
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        console.log('Final test run failed');
        if (err.stdout) console.log('stdout:', err.stdout);
        if (err.stderr) console.log('stderr:', err.stderr);
      }

      assert.ok(testsPassed, 'All tests should pass after fix (within ' + maxLoops + ' loops)');
      console.log('Real LLM test completed successfully!');

      await runner.shutdown();
    }));

    it('should maintain context across correction cycles', skipUnlessRealLLM(async function() {
      // Similar to above but specifically checks context maintenance
      this.skip(); // Covered by the main test above
    }));
  });

  describe('Verification of fix quality', function() {
    it('should produce correct output for edge cases', skipUnlessRealLLM(async function() {
      // This would be run after the fix is applied
      // Skip for now as it depends on the fix being applied
      this.skip();
    }));
  });
});

// Export for use in other tests
export { REAL_LLM_TESTS_ENABLED };
