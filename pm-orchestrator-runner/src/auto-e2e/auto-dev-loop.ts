/**
 * Auto-Dev Loop Controller
 *
 * Manages the automatic implement -> test -> fix -> re-test cycle.
 * Ensures no human intervention is required.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptions } from 'child_process';
import {
  AITestConfig,
  AutoDevLoopState,
  AutoFixRequest,
  AutoFixResult,
  TestCase,
  AutoE2EReport,
  FixApplicationResult,
} from './types';
import { runAutoE2E, loadAITestConfig, saveReport } from './runner';
import { getApiKey } from '../config/global-config';

/**
 * Generate fix prompt based on failed tests
 * Requests unified diff patch format for direct application
 */
function createFixPrompt(request: AutoFixRequest, projectPath: string): string {
  const failedSummary = request.failedTests
    .map(t => `- ${t.testCase.description}: ${t.judgeResult.reason}`)
    .join('\n');

  return `The following tests failed for the implementation task "${request.originalTask}":

${failedSummary}

This is iteration ${request.iteration} of ${request.maxIterations}.
Project path: ${projectPath}

Analyze the failures and provide a fix as a unified diff patch.

CRITICAL: Your response MUST include a patch block in this EXACT format:

\`\`\`patch
--- a/path/to/file.ts
+++ b/path/to/file.ts
@@ -line,count +line,count @@
 context line
-removed line
+added line
 context line
\`\`\`

Rules for the patch:
1. Use relative paths from project root (e.g., src/module/file.ts)
2. Include 3 lines of context before and after changes
3. Multiple files can be included in one patch
4. The patch MUST be valid unified diff format that \`git apply\` can process

After the patch block, provide:
1. Brief explanation of the fix
2. Which test(s) this should fix`;
}

/**
 * Extract unified diff patch from AI response
 */
function extractPatch(response: string): string | null {
  // Look for ```patch or ```diff code blocks
  const patchMatch = response.match(/```(?:patch|diff)\n([\s\S]*?)```/);
  if (patchMatch) {
    return patchMatch[1].trim();
  }

  // Fallback: look for unified diff markers
  const diffLines: string[] = [];
  let inDiff = false;
  const lines = response.split('\n');

  for (const line of lines) {
    if (line.startsWith('--- a/') || line.startsWith('--- ')) {
      inDiff = true;
    }
    if (inDiff) {
      diffLines.push(line);
      // End detection: empty line after diff content or new section
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

/**
 * Apply a unified diff patch to the project
 */
export async function applyPatch(
  patch: string,
  projectPath: string,
  dryRun: boolean = false
): Promise<FixApplicationResult> {
  const patchFile = path.join(projectPath, '.autodev-fix.patch');

  try {
    // Write patch to temp file
    fs.writeFileSync(patchFile, patch, 'utf-8');
    console.log(`[autodev] Patch written to ${patchFile}`);

    const execOptions: ExecSyncOptions = {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    // Check if patch can be applied (dry run first)
    try {
      execSync(`git apply --check "${patchFile}"`, execOptions);
      console.log('[autodev] Patch check passed');
    } catch (checkError) {
      const errorOutput = (checkError as { stderr?: string }).stderr || String(checkError);
      console.error('[autodev] Patch check failed:', errorOutput);

      // Try with --3way for better conflict handling
      try {
        execSync(`git apply --check --3way "${patchFile}"`, execOptions);
        console.log('[autodev] Patch check passed with --3way');
      } catch {
        return {
          success: false,
          appliedFiles: [],
          patch,
          error: `Patch cannot be applied: ${errorOutput}`,
        };
      }
    }

    if (dryRun) {
      return {
        success: true,
        appliedFiles: extractAffectedFiles(patch),
        patch,
      };
    }

    // Apply the patch
    try {
      execSync(`git apply "${patchFile}"`, execOptions);
      console.log('[autodev] Patch applied successfully');
    } catch {
      // Try with --3way
      execSync(`git apply --3way "${patchFile}"`, execOptions);
      console.log('[autodev] Patch applied with --3way');
    }

    const appliedFiles = extractAffectedFiles(patch);
    console.log(`[autodev] Modified files: ${appliedFiles.join(', ')}`);

    return {
      success: true,
      appliedFiles,
      patch,
    };
  } catch (error) {
    const errorMessage = (error as Error).message || String(error);
    console.error('[autodev] Failed to apply patch:', errorMessage);
    return {
      success: false,
      appliedFiles: [],
      patch,
      error: errorMessage,
    };
  } finally {
    // Cleanup temp patch file
    try {
      if (fs.existsSync(patchFile)) {
        fs.unlinkSync(patchFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract list of affected files from a unified diff patch
 */
function extractAffectedFiles(patch: string): string[] {
  const files = new Set<string>();
  const lines = patch.split('\n');

  for (const line of lines) {
    // Match --- a/path or +++ b/path
    const match = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/);
    if (match) {
      const filePath = match[1];
      // Skip /dev/null (new/deleted files marker)
      if (filePath !== '/dev/null' && !filePath.startsWith('/dev/null')) {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}

/**
 * Revert applied changes if tests still fail
 */
export async function revertPatch(
  appliedFiles: string[],
  projectPath: string
): Promise<boolean> {
  try {
    const execOptions: ExecSyncOptions = {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    // Checkout the files to revert changes
    for (const file of appliedFiles) {
      try {
        execSync(`git checkout -- "${file}"`, execOptions);
        console.log(`[autodev] Reverted: ${file}`);
      } catch {
        console.warn(`[autodev] Could not revert: ${file}`);
      }
    }

    return true;
  } catch (error) {
    console.error('[autodev] Revert failed:', (error as Error).message);
    return false;
  }
}

/**
 * Call AI to generate fix with patch format
 */
async function generateFix(request: AutoFixRequest, projectPath: string): Promise<AutoFixResult> {
  const apiKey = getApiKey('openai');
  if (!apiKey) {
    return {
      success: false,
      fixDescription: 'No API key available',
      error: 'OpenAI API key not configured',
    };
  }

  try {
    const prompt = createFixPrompt(request, projectPath);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a software engineer fixing test failures.
Provide fixes as unified diff patches that can be applied with git apply.
ALWAYS include a \`\`\`patch code block with valid unified diff format.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const fixDescription = data.choices[0]?.message?.content || 'No fix generated';

    // Extract patch from AI response
    const patch = extractPatch(fixDescription);

    return {
      success: true,
      fixDescription,
      patch: patch || undefined,
    };
  } catch (error) {
    return {
      success: false,
      fixDescription: '',
      error: (error as Error).message,
    };
  }
}

/**
 * Auto-Dev Loop - Main entry point
 *
 * Runs the automatic implement -> test -> fix -> re-test cycle.
 * Applies fixes as git patches and re-tests until success or max iterations.
 */
export async function runAutoDevLoop(
  baseUrl: string,
  taskDescription: string,
  testCases: TestCase[],
  projectPath: string,
  onIteration?: (state: AutoDevLoopState) => void
): Promise<AutoDevLoopState> {
  const config = loadAITestConfig();
  const state: AutoDevLoopState = {
    taskId: `autodev-${Date.now()}`,
    iteration: 0,
    status: 'implementing',
    fixHistory: [],
  };

  // Track applied patches for potential revert
  let lastAppliedFiles: string[] = [];

  // Initial implementation is assumed to be done by the caller
  // This loop handles test -> fix -> apply -> re-test

  while (state.iteration < config.maxAutoFixIterations) {
    state.iteration++;
    state.status = 'testing';

    if (onIteration) {
      onIteration({ ...state });
    }

    console.log(`[autodev] === Iteration ${state.iteration}/${config.maxAutoFixIterations} ===`);

    // Run tests
    const testReport = await runAutoE2E(baseUrl, testCases, config);
    state.testResults = testReport;

    console.log(`[autodev] Test results: ${testReport.summary.passed}/${testReport.summary.total} passed`);

    // Check if all tests pass
    if (testReport.overallPass) {
      state.status = 'complete';
      console.log('[autodev] All tests passed! Auto-dev loop complete.');
      if (onIteration) {
        onIteration({ ...state });
      }
      return state;
    }

    // Tests failed - attempt fix
    state.status = 'fixing';
    if (onIteration) {
      onIteration({ ...state });
    }

    const failedTests = testReport.results.filter(r => !r.judgeResult.pass);
    console.log(`[autodev] ${failedTests.length} test(s) failed. Generating fix...`);

    const fixRequest: AutoFixRequest = {
      originalTask: taskDescription,
      failedTests,
      iteration: state.iteration,
      maxIterations: config.maxAutoFixIterations,
    };

    // Generate fix with patch format
    const fixResult = await generateFix(fixRequest, projectPath);
    state.fixHistory.push(fixResult);

    if (!fixResult.success) {
      console.error(`[autodev] Fix generation failed: ${fixResult.error}`);
      // Continue to next iteration, maybe with different approach
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    // Extract and apply patch
    if (fixResult.patch) {
      console.log('[autodev] Applying fix patch...');

      // If we have previously applied files, revert them first
      if (lastAppliedFiles.length > 0) {
        console.log('[autodev] Reverting previous patch before applying new one...');
        await revertPatch(lastAppliedFiles, projectPath);
        lastAppliedFiles = [];
      }

      const applyResult = await applyPatch(fixResult.patch, projectPath);

      if (applyResult.success) {
        console.log(`[autodev] Patch applied successfully to: ${applyResult.appliedFiles.join(', ')}`);
        lastAppliedFiles = applyResult.appliedFiles;
        fixResult.appliedFiles = applyResult.appliedFiles;
      } else {
        console.error(`[autodev] Failed to apply patch: ${applyResult.error}`);
        // Continue to next iteration with a different fix attempt
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
    } else {
      console.warn('[autodev] No patch found in fix response. Continuing to next iteration...');
      console.log('[autodev] Fix description:', fixResult.fixDescription.substring(0, 200) + '...');
    }

    // Small delay before next iteration (re-test)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Max iterations reached without success
  state.status = 'failed';
  console.error(`[autodev] Max iterations (${config.maxAutoFixIterations}) reached. Auto-dev loop failed.`);

  // Revert any applied patches on failure
  if (lastAppliedFiles.length > 0) {
    console.log('[autodev] Reverting all applied patches...');
    await revertPatch(lastAppliedFiles, projectPath);
  }

  if (onIteration) {
    onIteration({ ...state });
  }

  return state;
}

/**
 * Quick check if a task needs auto E2E testing
 */
export function needsAutoE2E(taskType: string): boolean {
  const implementationTypes = [
    'IMPLEMENTATION',
    'LIGHT_EDIT',
    'CONFIG_CI_CHANGE',
  ];
  return implementationTypes.includes(taskType);
}

/**
 * Create summary report for auto-dev loop
 */
export function createAutoDevSummary(state: AutoDevLoopState): string {
  const lines = [
    `# Auto-Dev Loop Summary`,
    ``,
    `Task ID: ${state.taskId}`,
    `Status: ${state.status}`,
    `Iterations: ${state.iteration}`,
    ``,
  ];

  if (state.testResults) {
    lines.push(`## Test Results`);
    lines.push(`- Total: ${state.testResults.summary.total}`);
    lines.push(`- Passed: ${state.testResults.summary.passed}`);
    lines.push(`- Failed: ${state.testResults.summary.failed}`);
    lines.push(`- Pass Rate: ${(state.testResults.summary.passRate * 100).toFixed(1)}%`);
    lines.push(``);
  }

  if (state.fixHistory.length > 0) {
    lines.push(`## Fix History`);
    state.fixHistory.forEach((fix, i) => {
      lines.push(`### Iteration ${i + 1}`);
      lines.push(fix.success ? fix.fixDescription : `Failed: ${fix.error}`);
      lines.push(``);
    });
  }

  return lines.join('\n');
}
