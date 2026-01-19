"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoPaneRenderer = void 0;
/**
 * ANSI escape sequences for terminal control
 */
const ANSI = {
    // Cursor control
    SAVE_CURSOR: '\x1b[s',
    RESTORE_CURSOR: '\x1b[u',
    MOVE_TO_COL: (col) => `\x1b[${col}G`,
    MOVE_UP: (n) => `\x1b[${n}A`,
    MOVE_DOWN: (n) => `\x1b[${n}B`,
    MOVE_TO: (row, col) => `\x1b[${row};${col}H`,
    // Line control
    CLEAR_LINE: '\x1b[2K',
    CLEAR_TO_END: '\x1b[K',
    // Screen control
    SCROLL_UP: '\x1b[S',
    // Colors and styles
    RESET: '\x1b[0m',
    DIM: '\x1b[2m',
    BOLD: '\x1b[1m',
    CYAN: '\x1b[36m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
};
/**
 * Visual separator between log pane and input pane
 * Default width: 60 characters
 */
const SEPARATOR_CHAR = '\u2500'; // Box drawing character: ─
const SEPARATOR_WIDTH = 60;
/**
 * Two-Pane Renderer
 *
 * Maintains separation between log output (upper pane) and input (lower pane).
 * Ensures input line is never disrupted by log output.
 */
class TwoPaneRenderer {
    output;
    prompt;
    enabled;
    // Input state (preserved across log writes)
    inputBuffer = '';
    inputCursorPos = 0;
    // Debounce for high-frequency log output
    pendingLogs = [];
    flushTimeout = null;
    FLUSH_DELAY_MS = 16; // ~60fps
    constructor(config = {}) {
        this.output = config.output || process.stdout;
        this.prompt = config.prompt || 'pm> ';
        // Enable 2-pane mode only if TTY
        if (config.enabled !== undefined) {
            this.enabled = config.enabled;
        }
        else {
            this.enabled = this.output.isTTY === true;
        }
    }
    /**
     * Check if 2-pane mode is enabled
     */
    isEnabled() {
        return this.enabled;
    }
    /**
     * Write log message to upper pane
     * Per spec/18: Logs flow in upper pane, never disrupting input line
     *
     * @param message - Log message to write
     */
    writeLog(message) {
        if (!this.enabled) {
            // Fallback: use console.log for non-TTY
            // This maintains compatibility with test mocks that capture console.log
            // eslint-disable-next-line no-console
            console.log(message);
            return;
        }
        // Add to pending logs for batched output
        this.pendingLogs.push(message);
        // Schedule flush
        if (!this.flushTimeout) {
            this.flushTimeout = setTimeout(() => {
                this.flushLogs();
            }, this.FLUSH_DELAY_MS);
        }
    }
    /**
     * Generate visual separator line
     * Per spec: Visual separation between log pane and input pane
     */
    getSeparator() {
        // Use terminal width if available, otherwise default
        const width = this.output.columns || SEPARATOR_WIDTH;
        return ANSI.DIM + SEPARATOR_CHAR.repeat(Math.min(width, 120)) + ANSI.RESET;
    }
    /**
     * Format a log line with visual prefix
     * Adds dim pipe character to distinguish log output from input
     */
    formatLogLine(message) {
        // Add dim gray prefix to log lines for visual distinction
        return `${ANSI.DIM}|${ANSI.RESET} ${message}`;
    }
    /**
     * Flush pending logs to output
     * Preserves input line state
     */
    flushLogs() {
        this.flushTimeout = null;
        if (this.pendingLogs.length === 0) {
            return;
        }
        const logs = this.pendingLogs;
        this.pendingLogs = [];
        // 1. Save cursor position and clear input line
        this.output.write(ANSI.SAVE_CURSOR);
        this.output.write(ANSI.MOVE_TO_COL(1));
        this.output.write(ANSI.CLEAR_LINE);
        // 2. Move cursor up to log area (if input is on screen)
        // We write logs, then move back down and redraw input
        // 3. Output all logs with visual prefix
        for (const log of logs) {
            this.output.write(this.formatLogLine(log) + '\n');
        }
        // 4. Redraw input line at current position (with separator)
        this.renderInputLine();
        // 5. Restore cursor to correct position in input
        this.output.write(ANSI.MOVE_TO_COL(this.prompt.length + this.inputCursorPos + 1));
    }
    /**
     * Render the input line (prompt + buffer)
     * Called after log output to restore input state
     * Includes visual separator for 2-pane distinction
     */
    renderInputLine() {
        // Show separator line above input
        this.output.write(this.getSeparator() + '\n');
        // Colorized prompt for visual distinction
        const coloredPrompt = `${ANSI.BOLD}${ANSI.CYAN}${this.prompt}${ANSI.RESET}`;
        this.output.write(coloredPrompt + this.inputBuffer);
        this.output.write(ANSI.CLEAR_TO_END);
    }
    /**
     * Update input state
     * Called by readline integration to sync input buffer
     *
     * @param buffer - Current input buffer content
     * @param cursorPos - Cursor position within buffer
     */
    updateInput(buffer, cursorPos) {
        this.inputBuffer = buffer;
        this.inputCursorPos = cursorPos;
    }
    /**
     * Clear input state (e.g., after command execution)
     */
    clearInput() {
        this.inputBuffer = '';
        this.inputCursorPos = 0;
    }
    /**
     * Set prompt string
     */
    setPrompt(prompt) {
        this.prompt = prompt;
    }
    /**
     * Get current prompt
     */
    getPrompt() {
        return this.prompt;
    }
    /**
     * Format RUNNING display
     * Per spec/18: RUNNING task-1234 | 12.3s | processing
     * Yellow color for visibility
     *
     * @param info - Running task info
     * @returns Formatted string
     */
    formatRunning(info) {
        const elapsed = (info.elapsedMs / 1000).toFixed(1);
        return `${ANSI.YELLOW}RUNNING${ANSI.RESET} ${info.taskId} | ${elapsed}s | ${info.status}`;
    }
    /**
     * Show RUNNING status
     * Per spec/18: 1 line only display
     *
     * @param info - Running task info
     */
    showRunning(info) {
        this.writeLog(this.formatRunning(info));
    }
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
    formatComplete(info) {
        const elapsed = (info.elapsedMs / 1000).toFixed(1);
        const lines = [];
        lines.push(`${ANSI.GREEN}COMPLETE${ANSI.RESET} ${info.taskId} | ${elapsed}s`);
        lines.push('');
        if (info.filesModified.length > 0) {
            lines.push(`${ANSI.BOLD}Files modified:${ANSI.RESET}`);
            for (const file of info.filesModified) {
                lines.push(`  ${ANSI.DIM}-${ANSI.RESET} ${file}`);
            }
            lines.push('');
        }
        lines.push(`${ANSI.BLUE}Next:${ANSI.RESET} ${info.nextOperations}`);
        return lines;
    }
    /**
     * Show COMPLETE status
     * Per spec/18: Result summary, files modified, next operations
     *
     * @param info - Complete task info
     */
    showComplete(info) {
        const lines = this.formatComplete(info);
        for (const line of lines) {
            this.writeLog(line);
        }
    }
    /**
     * Force flush any pending logs immediately
     * Used before exit or when immediate output is needed
     */
    flush() {
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }
        if (this.pendingLogs.length > 0) {
            this.flushLogs();
        }
    }
    /**
     * Get current input buffer (for testing)
     */
    getInputBuffer() {
        return this.inputBuffer;
    }
    /**
     * Get current cursor position (for testing)
     */
    getInputCursorPos() {
        return this.inputCursorPos;
    }
}
exports.TwoPaneRenderer = TwoPaneRenderer;
//# sourceMappingURL=two-pane-renderer.js.map