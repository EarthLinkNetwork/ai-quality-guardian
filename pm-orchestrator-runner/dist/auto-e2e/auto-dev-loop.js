"use strict";
/**
 * Auto-Dev Loop Controller
 *
 * Manages the automatic implement -> test -> fix -> re-test cycle.
 * Ensures no human intervention is required.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPatch = applyPatch;
exports.revertPatch = revertPatch;
exports.runAutoDevLoop = runAutoDevLoop;
exports.needsAutoE2E = needsAutoE2E;
exports.createAutoDevSummary = createAutoDevSummary;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const runner_1 = require("./runner");
const global_config_1 = require("../config/global-config");
/**
 * Generate fix prompt based on failed tests
 * Requests unified diff patch format for direct application
 */
function createFixPrompt(request, projectPath) {
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
function extractPatch(response) {
    // Look for ```patch or ```diff code blocks
    const patchMatch = response.match(/```(?:patch|diff)\n([\s\S]*?)```/);
    if (patchMatch) {
        return patchMatch[1].trim();
    }
    // Fallback: look for unified diff markers
    const diffLines = [];
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
async function applyPatch(patch, projectPath, dryRun = false) {
    const patchFile = path.join(projectPath, '.autodev-fix.patch');
    try {
        // Write patch to temp file
        fs.writeFileSync(patchFile, patch, 'utf-8');
        console.log(`[autodev] Patch written to ${patchFile}`);
        const execOptions = {
            cwd: projectPath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        };
        // Check if patch can be applied (dry run first)
        try {
            (0, child_process_1.execSync)(`git apply --check "${patchFile}"`, execOptions);
            console.log('[autodev] Patch check passed');
        }
        catch (checkError) {
            const errorOutput = checkError.stderr || String(checkError);
            console.error('[autodev] Patch check failed:', errorOutput);
            // Try with --3way for better conflict handling
            try {
                (0, child_process_1.execSync)(`git apply --check --3way "${patchFile}"`, execOptions);
                console.log('[autodev] Patch check passed with --3way');
            }
            catch {
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
            (0, child_process_1.execSync)(`git apply "${patchFile}"`, execOptions);
            console.log('[autodev] Patch applied successfully');
        }
        catch {
            // Try with --3way
            (0, child_process_1.execSync)(`git apply --3way "${patchFile}"`, execOptions);
            console.log('[autodev] Patch applied with --3way');
        }
        const appliedFiles = extractAffectedFiles(patch);
        console.log(`[autodev] Modified files: ${appliedFiles.join(', ')}`);
        return {
            success: true,
            appliedFiles,
            patch,
        };
    }
    catch (error) {
        const errorMessage = error.message || String(error);
        console.error('[autodev] Failed to apply patch:', errorMessage);
        return {
            success: false,
            appliedFiles: [],
            patch,
            error: errorMessage,
        };
    }
    finally {
        // Cleanup temp patch file
        try {
            if (fs.existsSync(patchFile)) {
                fs.unlinkSync(patchFile);
            }
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
/**
 * Extract list of affected files from a unified diff patch
 */
function extractAffectedFiles(patch) {
    const files = new Set();
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
async function revertPatch(appliedFiles, projectPath) {
    try {
        const execOptions = {
            cwd: projectPath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        };
        // Checkout the files to revert changes
        for (const file of appliedFiles) {
            try {
                (0, child_process_1.execSync)(`git checkout -- "${file}"`, execOptions);
                console.log(`[autodev] Reverted: ${file}`);
            }
            catch {
                console.warn(`[autodev] Could not revert: ${file}`);
            }
        }
        return true;
    }
    catch (error) {
        console.error('[autodev] Revert failed:', error.message);
        return false;
    }
}
/**
 * Call AI to generate fix with patch format
 */
async function generateFix(request, projectPath) {
    const apiKey = (0, global_config_1.getApiKey)('openai');
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
        const data = await response.json();
        const fixDescription = data.choices[0]?.message?.content || 'No fix generated';
        // Extract patch from AI response
        const patch = extractPatch(fixDescription);
        return {
            success: true,
            fixDescription,
            patch: patch || undefined,
        };
    }
    catch (error) {
        return {
            success: false,
            fixDescription: '',
            error: error.message,
        };
    }
}
/**
 * Auto-Dev Loop - Main entry point
 *
 * Runs the automatic implement -> test -> fix -> re-test cycle.
 * Applies fixes as git patches and re-tests until success or max iterations.
 */
async function runAutoDevLoop(baseUrl, taskDescription, testCases, projectPath, onIteration) {
    const config = (0, runner_1.loadAITestConfig)();
    const state = {
        taskId: `autodev-${Date.now()}`,
        iteration: 0,
        status: 'implementing',
        fixHistory: [],
    };
    // Track applied patches for potential revert
    let lastAppliedFiles = [];
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
        const testReport = await (0, runner_1.runAutoE2E)(baseUrl, testCases, config);
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
        const fixRequest = {
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
            }
            else {
                console.error(`[autodev] Failed to apply patch: ${applyResult.error}`);
                // Continue to next iteration with a different fix attempt
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
        }
        else {
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
function needsAutoE2E(taskType) {
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
function createAutoDevSummary(state) {
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
//# sourceMappingURL=auto-dev-loop.js.map