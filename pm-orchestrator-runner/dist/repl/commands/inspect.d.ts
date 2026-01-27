/**
 * Inspect Command
 *
 * Single unified UI for browsing and inspecting all events.
 * No symptom-specific handling - all events are treated uniformly.
 *
 * Commands:
 * - /inspect ui     - Interactive event browser (fzf-style picker)
 * - /inspect        - Alias for /inspect ui
 * - /inspect <id>   - View specific event details
 *
 * Design principles:
 * - Single UI for all event types
 * - No category branching
 * - Non-destructive (read-only)
 * - Events shown chronologically
 */
/**
 * Inspect command result
 */
export interface InspectCommandResult {
    success: boolean;
    message: string;
    output?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * InspectCommand - unified event browser
 */
export declare class InspectCommand {
    private readonly projectPath;
    private eventStore;
    constructor(projectPath: string);
    /**
     * Initialize event store (lazy)
     */
    private ensureEventStore;
    /**
     * Execute inspect command
     */
    execute(args: string): Promise<InspectCommandResult>;
    /**
     * Show picker UI for event selection
     */
    showPickerUI(): Promise<InspectCommandResult>;
    /**
     * Show details for a specific event
     */
    showEventDetails(eventId: string): Promise<InspectCommandResult>;
    /**
     * Get events for picker (called by REPLInterface for interactive mode)
     */
    getEventsForPicker(): Promise<{
        id: string;
        display: string;
    }[]>;
    /**
     * Process selection from picker UI
     */
    processSelection(selection: string): Promise<InspectCommandResult>;
    /**
     * Record a file change event (helper for integration)
     */
    recordFileChange(filePath: string, status: 'added' | 'modified' | 'deleted' | 'renamed', options?: {
        oldPath?: string;
        diff?: string;
        taskId?: string;
        sessionId?: string;
    }): Promise<void>;
    /**
     * Record an executor event (helper for integration)
     */
    recordExecutorEvent(executorId: string, action: 'start' | 'end' | 'output' | 'error', options?: {
        taskId?: string;
        sessionId?: string;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        command?: string;
        durationMs?: number;
    }): Promise<void>;
    /**
     * Record a task event (helper for integration)
     */
    recordTaskEvent(taskId: string, newStatus: string, options?: {
        previousStatus?: string;
        description?: string;
        sessionId?: string;
        filesModified?: string[];
        error?: {
            code: string;
            message: string;
        };
    }): Promise<void>;
    /**
     * Record a session event (helper for integration)
     */
    recordSessionEvent(sessionId: string, action: 'start' | 'end' | 'pause' | 'resume', options?: {
        projectPath?: string;
        status?: string;
    }): Promise<void>;
    /**
     * Record a command event (helper for integration)
     */
    recordCommandEvent(command: string, success: boolean, options?: {
        args?: string;
        output?: string;
        error?: string;
        taskId?: string;
        sessionId?: string;
    }): Promise<void>;
    /**
     * Get event store stats
     */
    getStats(): Promise<{
        totalEvents: number;
        fileCount: number;
        oldestEvent?: string;
        newestEvent?: string;
        bySource: Record<string, number>;
    }>;
}
//# sourceMappingURL=inspect.d.ts.map