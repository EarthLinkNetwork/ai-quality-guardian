/**
 * Two-Pane Renderer for CLI
 * Per spec/18_CLI_TWO_PANE.md
 *
 * Provides 2-pane layout:
 * - Upper pane: Log display (scrollable)
 * - Lower pane: Input line (always 1 line, never interrupted by logs)
 *
 * Critical requirement: Input line must NEVER be disrupted by log output
 * - Cursor position maintained
 * - Input string maintained
 * - Prompt display maintained
 */
/**
 * Running task display info
 * Per spec/18: RUNNING task-1234 | 12.3s | processing
 */
export interface RunningInfo {
    taskId: string;
    elapsedMs: number;
    status: string;
}
/**
 * Complete task display info
 * Per spec/18: Result summary, files modified, next operations
 */
export interface CompleteInfo {
    taskId: string;
    elapsedMs: number;
    filesModified: string[];
    nextOperations: string;
}
/**
 * Two-Pane Renderer Configuration
 */
export interface TwoPaneRendererConfig {
    /** Prompt string (default: 'pm> ') */
    prompt?: string;
    /** Output stream (default: process.stdout) */
    output?: NodeJS.WriteStream;
    /** Enable 2-pane mode (default: true if TTY) */
    enabled?: boolean;
}
/**
 * Two-Pane Renderer
 *
 * Maintains separation between log output (upper pane) and input (lower pane).
 * Ensures input line is never disrupted by log output.
 */
export declare class TwoPaneRenderer {
    private readonly output;
    private prompt;
    private readonly enabled;
    private inputBuffer;
    private inputCursorPos;
    private pendingLogs;
    private flushTimeout;
    private readonly FLUSH_DELAY_MS;
    constructor(config?: TwoPaneRendererConfig);
    /**
     * Check if 2-pane mode is enabled
     */
    isEnabled(): boolean;
    /**
     * Write log message to upper pane
     * Per spec/18: Logs flow in upper pane, never disrupting input line
     *
     * @param message - Log message to write
     */
    writeLog(message: string): void;
    /**
     * Generate visual separator line
     * Per spec: Visual separation between log pane and input pane
     */
    private getSeparator;
    /**
     * Format a log line with visual prefix
     * Adds dim pipe character to distinguish log output from input
     */
    private formatLogLine;
    /**
     * Flush pending logs to output
     * Preserves input line state
     */
    private flushLogs;
    /**
     * Render the input line (prompt + buffer)
     * Called after log output to restore input state
     * Includes visual separator for 2-pane distinction
     */
    private renderInputLine;
    /**
     * Update input state
     * Called by readline integration to sync input buffer
     *
     * @param buffer - Current input buffer content
     * @param cursorPos - Cursor position within buffer
     */
    updateInput(buffer: string, cursorPos: number): void;
    /**
     * Clear input state (e.g., after command execution)
     */
    clearInput(): void;
    /**
     * Set prompt string
     */
    setPrompt(prompt: string): void;
    /**
     * Get current prompt
     */
    getPrompt(): string;
    /**
     * Format RUNNING display
     * Per spec/18: RUNNING task-1234 | 12.3s | processing
     * Yellow color for visibility
     *
     * @param info - Running task info
     * @returns Formatted string
     */
    formatRunning(info: RunningInfo): string;
    /**
     * Show RUNNING status
     * Per spec/18: 1 line only display
     *
     * @param info - Running task info
     */
    showRunning(info: RunningInfo): void;
    /**
     * Format COMPLETE display
     * Per spec/18:
     * - Result summary (green for success)
     * - Files modified list
     * - Next operations
     *
     * @param info - Complete task info
     * @returns Formatted lines
     */
    formatComplete(info: CompleteInfo): string[];
    /**
     * Show COMPLETE status
     * Per spec/18: Result summary, files modified, next operations
     *
     * @param info - Complete task info
     */
    showComplete(info: CompleteInfo): void;
    /**
     * Force flush any pending logs immediately
     * Used before exit or when immediate output is needed
     */
    flush(): void;
    /**
     * Get current input buffer (for testing)
     */
    getInputBuffer(): string;
    /**
     * Get current cursor position (for testing)
     */
    getInputCursorPos(): number;
}
//# sourceMappingURL=two-pane-renderer.d.ts.map