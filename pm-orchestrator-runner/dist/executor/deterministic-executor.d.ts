/**
 * Deterministic Executor for CLI_TEST_MODE
 *
 * Per spec 10_REPL_UX.md Section 11 and spec 06_CORRECTNESS_PROPERTIES.md Property 37:
 * When CLI_TEST_MODE=1, use deterministic stub instead of Claude Code CLI.
 *
 * This executor:
 * - Parses natural language prompts for file creation patterns
 * - Creates actual files on disk (verified_files exists=true)
 * - Performs filesBefore/filesAfter 2-scan (Property 31)
 * - Returns immediately without spawning subprocess
 */
import type { IExecutor, ExecutorTask, ExecutorResult } from './claude-code-executor';
/**
 * DeterministicExecutor - For CLI_TEST_MODE=1
 *
 * Creates actual files on disk without spawning Claude Code CLI.
 * Performs proper filesBefore/filesAfter 2-scan per Property 31.
 */
export declare class DeterministicExecutor implements IExecutor {
    isClaudeCodeAvailable(): Promise<boolean>;
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    /**
     * List all files in a directory (recursively)
     */
    private listFiles;
    /**
     * Detect files that were modified or created
     */
    private detectModifiedFiles;
}
/**
 * Check if deterministic mode is enabled
 */
export declare function isDeterministicMode(): boolean;
/**
 * Create appropriate executor based on environment
 */
export declare function createExecutorForEnvironment(): IExecutor | null;
//# sourceMappingURL=deterministic-executor.d.ts.map