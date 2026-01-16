/**
 * Logs Command
 *
 * Per spec 10_REPL_UX.md Section 2.4:
 * - /logs: list task logs for current session
 * - /logs <task-id>: show task details (summary view)
 * - /logs <task-id> --full: show task details (full view with executor logs)
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md:
 * - Two-layer viewing (summary/full)
 * - Logs stored in .claude/logs/
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25:
 * - Log visibility control (summary default, --full for details)
 */
/**
 * Logs command result
 */
export interface LogsResult {
    success: boolean;
    message: string;
    output?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Logs Command class
 */
export declare class LogsCommand {
    private logManager;
    private projectPath;
    /**
     * Initialize log manager with project path
     *
     * @param projectPath - Project path
     */
    private ensureLogManager;
    /**
     * List task logs for a session
     * Per spec 10_REPL_UX.md: /logs shows task list (Layer 1)
     *
     * @param projectPath - Project path
     * @param sessionId - Session ID
     * @returns Logs result
     */
    listLogs(projectPath: string, sessionId: string): Promise<LogsResult>;
    /**
     * Get task detail
     * Per spec 10_REPL_UX.md: /logs <task-id> shows details (Layer 2)
     * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25: --full for executor logs
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param full - Show full details (executor logs)
     * @returns Logs result
     */
    getTaskDetail(projectPath: string, taskId: string, full?: boolean): Promise<LogsResult>;
    /**
     * Create a new task log
     * Called when starting a new task
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param sessionId - Session ID
     * @returns Logs result
     */
    createTaskLog(projectPath: string, taskId: string, sessionId: string): Promise<LogsResult>;
    /**
     * Add event to task log
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param eventType - Event type
     * @param content - Event content
     * @returns Logs result
     */
    addEvent(projectPath: string, taskId: string, eventType: string, content: Record<string, unknown>): Promise<LogsResult>;
    /**
     * Complete a task log
     *
     * @param projectPath - Project path
     * @param taskId - Task ID
     * @param status - Completion status
     * @param filesModified - List of modified files
     * @returns Logs result
     */
    completeTask(projectPath: string, taskId: string, status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR', filesModified?: string[]): Promise<LogsResult>;
}
//# sourceMappingURL=logs.d.ts.map