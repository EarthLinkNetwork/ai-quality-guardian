/**
 * Conversation Tracer - JSONL logging for LLM round-trips
 *
 * Per spec/28_CONVERSATION_TRACE.md:
 * - Records all LLM round-trips (request → response → judgment → retry)
 * - JSONL format (one JSON object per line)
 * - Separate from TracePack (complementary, not extending)
 */
/**
 * Conversation trace event types
 */
export type ConversationTraceEventType = 'USER_REQUEST' | 'SYSTEM_RULES' | 'CHUNKING_PLAN' | 'LLM_REQUEST' | 'LLM_RESPONSE' | 'QUALITY_JUDGMENT' | 'REJECTION_DETAILS' | 'ITERATION_END' | 'FINAL_SUMMARY';
/**
 * Quality criteria result
 */
export interface CriteriaResult {
    /** Criteria ID (Q1-Q9) */
    id: string;
    /** Criteria name */
    name: string;
    /** PASS/FAIL */
    passed: boolean;
    /** Reason for the result */
    reason?: string;
}
/**
 * Subtask plan for chunking
 */
export interface SubtaskPlan {
    /** Subtask ID */
    id: string;
    /** Subtask description */
    description: string;
    /** Dependencies on other subtasks */
    dependencies?: string[];
}
/**
 * Conversation trace entry (1 line in JSONL)
 */
export interface ConversationTraceEntry {
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Event type */
    event: ConversationTraceEventType;
    /** Session ID */
    session_id: string;
    /** Task ID */
    task_id: string;
    /** Subtask ID (for Task Chunking) */
    subtask_id?: string;
    /** Iteration index (0-based) */
    iteration_index?: number;
    /** Event-specific data */
    data: Record<string, unknown>;
}
/**
 * Configuration for ConversationTracer
 */
export interface ConversationTracerConfig {
    /** State directory for trace files */
    stateDir: string;
    /** Session ID */
    sessionId: string;
    /** Task ID */
    taskId: string;
}
/**
 * Conversation Tracer - JSONL logger for LLM round-trips
 *
 * Records complete conversation history including:
 * - User requests
 * - System rules injection
 * - LLM requests and responses
 * - Quality judgments
 * - Rejection details and modification prompts
 * - Final summaries
 */
export declare class ConversationTracer {
    private config;
    private traceFilePath;
    private buffer;
    constructor(config: ConversationTracerConfig);
    /**
     * Get the trace file path
     */
    getTraceFilePath(): string;
    /**
     * Log a trace entry
     */
    private log;
    /**
     * Write entry to file
     */
    private writeEntry;
    /**
     * Log user request
     */
    logUserRequest(prompt: string): void;
    /**
     * Log system rules injection
     */
    logSystemRules(rules: string): void;
    /**
     * Log chunking plan
     */
    logChunkingPlan(subtasks: SubtaskPlan[]): void;
    /**
     * Log LLM request
     */
    logLLMRequest(prompt: string, iterationIndex: number, subtaskId?: string): void;
    /**
     * Log LLM response
     */
    logLLMResponse(output: string, status: string, filesModified: string[], iterationIndex: number, subtaskId?: string): void;
    /**
     * Log quality judgment
     */
    logQualityJudgment(judgment: 'PASS' | 'REJECT' | 'RETRY', criteriaResults: CriteriaResult[], iterationIndex: number, summary?: string, subtaskId?: string): void;
    /**
     * Log rejection details
     */
    logRejectionDetails(criteriaFailed: string[], modificationPrompt: string, iterationIndex: number, subtaskId?: string): void;
    /**
     * Log iteration end
     */
    logIterationEnd(iterationIndex: number, judgment: string, subtaskId?: string): void;
    /**
     * Log final summary
     */
    logFinalSummary(status: string, totalIterations: number, filesModified: string[]): void;
    /**
     * Get all buffered entries (for testing)
     */
    getEntries(): ConversationTraceEntry[];
    /**
     * Read trace from file
     */
    static readTrace(filePath: string): ConversationTraceEntry[];
    /**
     * Find trace files for a task
     */
    static findTraceFiles(stateDir: string, taskId: string): string[];
    /**
     * Get the latest trace file for a task
     */
    static getLatestTraceFile(stateDir: string, taskId: string): string | null;
    /**
     * Format trace entries for display
     */
    static formatTraceForDisplay(entries: ConversationTraceEntry[], options?: {
        latestOnly?: boolean;
        raw?: boolean;
    }): string;
}
/**
 * Verify conversation trace file format compliance
 */
export interface ConversationTraceVerifyResult {
    valid: boolean;
    entryCount: number;
    errors: Array<{
        line: number;
        error: string;
    }>;
    summary: {
        userRequests: number;
        systemRules: number;
        chunkingPlans: number;
        llmRequests: number;
        llmResponses: number;
        qualityJudgments: number;
        rejectionDetails: number;
        iterationEnds: number;
        finalSummaries: number;
        judgments: string[];
        totalIterations: number;
    };
}
/**
 * Verify a conversation trace file
 */
export declare function verifyConversationTrace(filePath: string): ConversationTraceVerifyResult;
//# sourceMappingURL=conversation-tracer.d.ts.map