"use strict";
/**
 * InteractivePicker
 *
 * Keyboard-navigable selection UI for the REPL.
 * Supports: Arrow Up/Down, j/k, Enter (select), Esc/q (cancel).
 * Also accepts numbered input as fallback.
 *
 * Tier-0 Rules E & F compliance.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractivePicker = void 0;
/**
 * ANSI escape sequences for picker rendering.
 */
const ANSI = {
    CLEAR_LINE: '\x1b[2K',
    MOVE_UP: (n) => `\x1b[${n}A`,
    MOVE_DOWN: (n) => `\x1b[${n}B`,
    MOVE_TO_COL: (col) => `\x1b[${col}G`,
    HIDE_CURSOR: '\x1b[?25l',
    SHOW_CURSOR: '\x1b[?25h',
    BOLD: '\x1b[1m',
    RESET: '\x1b[0m',
    CYAN: '\x1b[36m',
    DIM: '\x1b[2m',
    INVERSE: '\x1b[7m',
};
/**
 * InteractivePicker - keyboard-navigable selection UI.
 *
 * Usage:
 *   const picker = new InteractivePicker<MyData>(items, options);
 *   const result = await picker.prompt();
 *   // result is PickerSelection<MyData>
 */
class InteractivePicker {
    items;
    options;
    selectedIndex = 0;
    scrollOffset = 0;
    constructor(items, options = {}) {
        this.items = items;
        this.options = {
            maxVisible: 20,
            showDescriptions: false,
            ...options,
        };
    }
    /**
     * Get the visible window of items for rendering.
     */
    getVisibleWindow() {
        const maxVis = this.options.maxVisible ?? 20;
        const total = this.items.length;
        if (total <= maxVis) {
            return { items: this.items, startIndex: 0 };
        }
        // Adjust scroll offset to keep selection visible
        if (this.selectedIndex < this.scrollOffset) {
            this.scrollOffset = this.selectedIndex;
        }
        else if (this.selectedIndex >= this.scrollOffset + maxVis) {
            this.scrollOffset = this.selectedIndex - maxVis + 1;
        }
        return {
            items: this.items.slice(this.scrollOffset, this.scrollOffset + maxVis),
            startIndex: this.scrollOffset,
        };
    }
    /**
     * Render the picker to stdout.
     * Called on each navigation event.
     */
    render(isInitial = false) {
        const { items: visible, startIndex } = this.getVisibleWindow();
        const total = this.items.length;
        const maxVis = this.options.maxVisible ?? 20;
        // Move cursor up to overwrite previous render (unless initial)
        if (!isInitial) {
            const linesToClear = this.lastRenderedLineCount;
            if (linesToClear > 0) {
                process.stdout.write(ANSI.MOVE_UP(linesToClear));
            }
        }
        const lines = [];
        if (this.options.title) {
            lines.push(`${ANSI.BOLD}${this.options.title}${ANSI.RESET}`);
            lines.push('');
        }
        for (let i = 0; i < visible.length; i++) {
            const globalIndex = startIndex + i;
            const item = visible[i];
            const isSelected = globalIndex === this.selectedIndex;
            const prefix = item.prefix ? `[${item.prefix}] ` : '';
            const num = `${globalIndex + 1}.`;
            if (isSelected) {
                lines.push(`${ANSI.INVERSE}${ANSI.CYAN} > ${num} ${prefix}${item.label} ${ANSI.RESET}`);
            }
            else {
                lines.push(`   ${num} ${prefix}${item.label}`);
            }
            if (this.options.showDescriptions && item.description) {
                const desc = isSelected
                    ? `${ANSI.INVERSE}${ANSI.CYAN}      ${item.description}${ANSI.RESET}`
                    : `${ANSI.DIM}      ${item.description}${ANSI.RESET}`;
                lines.push(desc);
            }
        }
        // Scroll indicator
        if (total > maxVis) {
            const pct = Math.round(((this.selectedIndex + 1) / total) * 100);
            lines.push(`${ANSI.DIM}  (${this.selectedIndex + 1}/${total}) ${pct}%${ANSI.RESET}`);
        }
        lines.push('');
        lines.push(`${ANSI.DIM}[Up/Down or j/k] navigate  [Enter] select  [Esc/q] cancel${ANSI.RESET}`);
        // Write all lines, clearing each
        for (const line of lines) {
            process.stdout.write(`${ANSI.CLEAR_LINE}${line}\n`);
        }
        this.lastRenderedLineCount = lines.length;
    }
    lastRenderedLineCount = 0;
    /**
     * Move selection up by one.
     */
    moveUp() {
        if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.render();
        }
    }
    /**
     * Move selection down by one.
     */
    moveDown() {
        if (this.selectedIndex < this.items.length - 1) {
            this.selectedIndex++;
            this.render();
        }
    }
    /**
     * Get the currently selected item.
     */
    getSelected() {
        if (this.items.length === 0) {
            return { type: 'cancelled' };
        }
        return { type: 'selected', item: this.items[this.selectedIndex] };
    }
    /**
     * Process a number input (fallback mode).
     */
    processNumberInput(input) {
        const num = parseInt(input.trim(), 10);
        if (isNaN(num) || num < 1 || num > this.items.length) {
            return { type: 'invalid', input: input.trim() };
        }
        return { type: 'selected', item: this.items[num - 1] };
    }
    /**
     * Show the interactive picker and wait for user selection.
     * Returns a Promise that resolves to the user's choice.
     *
     * Requires TTY (process.stdin.isTTY). Falls back to numbered
     * input if TTY is not available.
     */
    prompt() {
        if (this.items.length === 0) {
            return Promise.resolve({ type: 'cancelled' });
        }
        // Non-TTY fallback: just render numbered list, return immediately for external handling
        if (!process.stdin.isTTY) {
            return this.promptNonInteractive();
        }
        return new Promise((resolve) => {
            const readline = require('readline');
            readline.emitKeypressEvents(process.stdin);
            const wasRaw = process.stdin.isRaw;
            if (process.stdin.setRawMode) {
                process.stdin.setRawMode(true);
            }
            process.stdout.write(ANSI.HIDE_CURSOR);
            this.render(true);
            let numberBuffer = '';
            const onKeypress = (_str, key) => {
                if (!key)
                    return;
                // Ctrl+C - exit
                if (key.ctrl && key.name === 'c') {
                    cleanup();
                    resolve({ type: 'cancelled' });
                    return;
                }
                // Esc or q - cancel
                if (key.name === 'escape' || key.name === 'q') {
                    cleanup();
                    resolve({ type: 'cancelled' });
                    return;
                }
                // Enter - select
                if (key.name === 'return') {
                    // If number buffer has content, try number selection
                    if (numberBuffer.length > 0) {
                        const result = this.processNumberInput(numberBuffer);
                        cleanup();
                        resolve(result);
                        return;
                    }
                    cleanup();
                    resolve(this.getSelected());
                    return;
                }
                // Up arrow or k - move up
                if (key.name === 'up' || key.name === 'k') {
                    numberBuffer = '';
                    this.moveUp();
                    return;
                }
                // Down arrow or j - move down
                if (key.name === 'down' || key.name === 'j') {
                    numberBuffer = '';
                    this.moveDown();
                    return;
                }
                // Number keys (fallback)
                if (key.sequence && /^[0-9]$/.test(key.sequence)) {
                    numberBuffer += key.sequence;
                    return;
                }
            };
            const cleanup = () => {
                process.stdin.removeListener('keypress', onKeypress);
                if (process.stdin.setRawMode) {
                    process.stdin.setRawMode(wasRaw ?? false);
                }
                process.stdout.write(ANSI.SHOW_CURSOR);
            };
            process.stdin.on('keypress', onKeypress);
        });
    }
    /**
     * Non-interactive fallback: print numbered list and read line.
     */
    promptNonInteractive() {
        const lines = [];
        if (this.options.title) {
            lines.push('');
            lines.push(this.options.title);
            lines.push('');
        }
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const prefix = item.prefix ? `[${item.prefix}] ` : '';
            lines.push(`${i + 1}. ${prefix}${item.label}`);
            if (this.options.showDescriptions && item.description) {
                lines.push(`   ${item.description}`);
            }
        }
        lines.push('');
        lines.push(`Enter number (1-${this.items.length}) to select, or q to cancel:`);
        process.stdout.write(lines.join('\n') + '\n');
        return new Promise((resolve) => {
            const rl = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            rl.question('> ', (answer) => {
                rl.close();
                const trimmed = answer.trim().toLowerCase();
                if (trimmed === 'q' || trimmed === 'quit' || trimmed === 'cancel' || trimmed === '') {
                    resolve({ type: 'cancelled' });
                    return;
                }
                resolve(this.processNumberInput(trimmed));
            });
        });
    }
}
exports.InteractivePicker = InteractivePicker;
//# sourceMappingURL=interactive-picker.js.map