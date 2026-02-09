/**
 * Auto-Dev Loop Controller
 *
 * Manages the automatic implement -> test -> fix -> re-test cycle.
 * Ensures no human intervention is required.
 */
import { AutoDevLoopState, TestCase, FixApplicationResult } from './types';
/**
 * Apply a unified diff patch to the project
 */
export declare function applyPatch(patch: string, projectPath: string, dryRun?: boolean): Promise<FixApplicationResult>;
/**
 * Revert applied changes if tests still fail
 */
export declare function revertPatch(appliedFiles: string[], projectPath: string): Promise<boolean>;
/**
 * Auto-Dev Loop - Main entry point
 *
 * Runs the automatic implement -> test -> fix -> re-test cycle.
 * Applies fixes as git patches and re-tests until success or max iterations.
 */
export declare function runAutoDevLoop(baseUrl: string, taskDescription: string, testCases: TestCase[], projectPath: string, onIteration?: (state: AutoDevLoopState) => void): Promise<AutoDevLoopState>;
/**
 * Quick check if a task needs auto E2E testing
 */
export declare function needsAutoE2E(taskType: string): boolean;
/**
 * Create summary report for auto-dev loop
 */
export declare function createAutoDevSummary(state: AutoDevLoopState): string;
//# sourceMappingURL=auto-dev-loop.d.ts.map