/**
 * Auto-Resolving Executor
 *
 * Wraps ClaudeCodeExecutor and automatically resolves clarification requests
 * using LLM instead of asking the user.
 *
 * When Claude Code needs clarification (e.g., file path), this executor:
 * 1. Analyzes the output to understand what clarification is needed
 * 2. Uses LLM to make a reasonable decision based on project context
 * 3. Re-runs the task with explicit instructions
 *
 * This is per the user's insight: "LLM Layer should answer clarification questions"
 */
import { ExecutorConfig, ExecutorTask, ExecutorResult, IExecutor, AuthCheckResult } from './claude-code-executor';
/**
 * Clarification types detected from Claude Code output
 */
export type ClarificationType = 'target_file_ambiguous' | 'scope_unclear' | 'action_ambiguous' | 'missing_context' | 'unknown';
/**
 * Parsed clarification from output
 */
export interface ParsedClarification {
    type: ClarificationType;
    question?: string;
    context?: string;
}
/**
 * Auto-resolution result
 */
export interface AutoResolution {
    resolved: boolean;
    resolvedValue?: string;
    explicitPrompt?: string;
    reasoning?: string;
}
/**
 * Configuration for auto-resolving executor
 */
export interface AutoResolveConfig extends ExecutorConfig {
    /** Max retry attempts for auto-resolution (default: 2) */
    maxRetries?: number;
    /** LLM provider for auto-resolution (default: openai) */
    llmProvider?: 'openai' | 'anthropic';
}
/**
 * Auto-Resolving Executor
 *
 * Automatically resolves clarification requests using LLM
 */
export declare class AutoResolvingExecutor implements IExecutor {
    private readonly innerExecutor;
    private readonly llmClient;
    private readonly maxRetries;
    private readonly projectPath;
    constructor(config: AutoResolveConfig);
    /**
     * Check if Claude Code CLI is available
     */
    isClaudeCodeAvailable(): Promise<boolean>;
    /**
     * Check Claude Code CLI auth status
     */
    checkAuthStatus(): Promise<AuthCheckResult>;
    /**
     * Execute task with auto-resolution for clarification requests
     */
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    /**
     * Detect clarification request from output
     */
    private detectClarification;
    /**
     * Auto-resolve clarification using LLM and project context
     */
    private autoResolve;
    /**
     * Resolve ambiguous file path
     */
    private resolveFilePath;
    /**
     * Resolve unclear scope
     */
    private resolveScope;
    /**
     * Resolve ambiguous action
     */
    private resolveAction;
    /**
     * Scan project structure for context
     */
    private scanProjectStructure;
}
//# sourceMappingURL=auto-resolve-executor.d.ts.map