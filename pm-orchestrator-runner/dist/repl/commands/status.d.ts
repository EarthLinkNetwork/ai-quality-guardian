/**
 * Status Commands Handler
 * Manages /status and /tasks commands
 *
 * UX Improvements (v2):
 * - Tasks are categorized into Active/Completed/Failed/Pending sections
 * - ERROR tasks no longer shown as "Current Tasks"
 * - Human-readable error messages with guidance
 * - Alert banners for failed tasks
 */
import { RunnerCore } from '../../core/runner-core';
/**
 * Translate technical error messages to human-readable form
 */
export declare function getHumanReadableError(errorMessage: string): string;
/**
 * Get guidance for specific error types
 */
export declare function getErrorGuidance(status: string): string[];
/**
 * REPL session state (shared with repl-interface)
 */
export interface REPLSession {
    sessionId: string | null;
    projectPath: string;
    runner: RunnerCore | null;
    supervisor: any;
    status: 'idle' | 'running' | 'paused';
}
/**
 * Status commands handler
 */
export declare class StatusCommands {
    private session;
    constructor(session: REPLSession);
    /**
     * Get current session status
     */
    getStatus(): Promise<string>;
    /**
     * Get current tasks - with improved categorization
     */
    getTasks(): Promise<string>;
    /**
     * Categorize tasks by status
     */
    private categorizeTasks;
    /**
     * Format no session message
     */
    private formatNoSession;
    /**
     * Format no runner message
     */
    private formatNoRunner;
    /**
     * Format no state message
     */
    private formatNoState;
    /**
     * Format status from state
     */
    private formatStatus;
    /**
     * Format tasks list - IMPROVED with categorization and guidance
     */
    private formatTasksImproved;
    /**
     * Get status icon
     */
    private getStatusIcon;
}
//# sourceMappingURL=status.d.ts.map