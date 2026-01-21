/**
 * Auto-Resolving Executor with Decision Classification
 *
 * Enhanced executor that:
 * 1. Classifies clarification requests (best_practice vs case_by_case)
 * 2. Auto-resolves best practices using established conventions
 * 3. Routes case-by-case decisions to user input
 * 4. Learns from user preferences to reduce future questions
 *
 * Key insight: Not all clarifications are equal.
 * - Best practices (e.g., docs in docs/) can be auto-resolved
 * - Case-by-case (e.g., which feature first) needs user input
 * - User preferences can be learned over time
 */
import { ExecutorConfig, ExecutorTask, ExecutorResult, IExecutor, AuthCheckResult } from './claude-code-executor';
import { BestPracticeRule } from './decision-classifier';
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
    /** How the resolution was made */
    resolutionMethod?: 'best_practice' | 'user_preference' | 'llm_inference' | 'user_input';
}
/**
 * User response handler callback
 */
export type UserResponseHandler = (question: string, options?: string[], context?: string) => Promise<string>;
/**
 * Configuration for auto-resolving executor
 */
export interface AutoResolveConfig extends ExecutorConfig {
    /** Max retry attempts for auto-resolution (default: 2) */
    maxRetries?: number;
    /** LLM provider for auto-resolution (default: openai) */
    llmProvider?: 'openai' | 'anthropic';
    /** Custom best practice rules */
    customRules?: BestPracticeRule[];
    /** User preference store configuration */
    preferenceStoreConfig?: {
        storagePath?: string;
        namespace?: string;
        minAutoApplyConfidence?: number;
    };
    /** Handler for case-by-case questions that need user input */
    userResponseHandler?: UserResponseHandler;
}
/**
 * Auto-Resolving Executor with Decision Classification
 *
 * Enhanced to classify clarifications and learn user preferences
 */
export declare class AutoResolvingExecutor implements IExecutor {
    private readonly innerExecutor;
    private readonly llmClient;
    private readonly maxRetries;
    private readonly projectPath;
    private readonly classifier;
    private readonly preferenceStore;
    private readonly userResponseHandler?;
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
     * Execute task with smart clarification handling
     */
    execute(task: ExecutorTask): Promise<ExecutorResult>;
    /**
     * Smart resolution using classification and preferences
     */
    private smartResolve;
    /**
     * Apply a matched user preference
     */
    private applyPreference;
    /**
     * Resolve using best practice rules
     */
    private resolveBestPractice;
    /**
     * Handle case-by-case decisions that need user input
     */
    private handleCaseByCase;
    /**
     * Build an explicit prompt with the resolved value
     */
    private buildExplicitPrompt;
    /**
     * Map clarification type to preference category
     */
    private mapClarificationTypeToCategory;
    /**
     * Generate a question from clarification type
     */
    private generateQuestionFromType;
    /**
     * Detect clarification request from output
     */
    private detectClarification;
    /**
     * Auto-resolve clarification using LLM (fallback method)
     */
    private autoResolve;
    /**
     * Resolve ambiguous file path using LLM
     */
    private resolveFilePath;
    /**
     * Resolve unclear scope using LLM
     */
    private resolveScope;
    /**
     * Resolve ambiguous action using LLM
     */
    private resolveAction;
    /**
     * Scan project structure for context
     */
    private scanProjectStructure;
    /**
     * Get preference store statistics
     */
    getPreferenceStats(): {
        totalPreferences: number;
        byCategory: Record<string, number>;
        avgConfidence: number;
        highConfidenceCount: number;
    };
    /**
     * Clear all learned preferences
     */
    clearPreferences(): void;
}
//# sourceMappingURL=auto-resolve-executor.d.ts.map