/**
 * InteractivePicker
 *
 * Keyboard-navigable selection UI for the REPL.
 * Supports: Arrow Up/Down, j/k, Enter (select), Esc/q (cancel).
 * Also accepts numbered input as fallback.
 *
 * Tier-0 Rules E & F compliance.
 */
import { PickerItem, PickerSelection } from '../diagnostics/picker';
export interface InteractivePickerOptions {
    /** Title shown above the list */
    title?: string;
    /** Maximum items visible at once (scrolls if more) */
    maxVisible?: number;
    /** Whether to show item descriptions */
    showDescriptions?: boolean;
}
/**
 * InteractivePicker - keyboard-navigable selection UI.
 *
 * Usage:
 *   const picker = new InteractivePicker<MyData>(items, options);
 *   const result = await picker.prompt();
 *   // result is PickerSelection<MyData>
 */
export declare class InteractivePicker<T = unknown> {
    private items;
    private options;
    private selectedIndex;
    private scrollOffset;
    constructor(items: PickerItem<T>[], options?: InteractivePickerOptions);
    /**
     * Get the visible window of items for rendering.
     */
    private getVisibleWindow;
    /**
     * Render the picker to stdout.
     * Called on each navigation event.
     */
    private render;
    private lastRenderedLineCount;
    /**
     * Move selection up by one.
     */
    moveUp(): void;
    /**
     * Move selection down by one.
     */
    moveDown(): void;
    /**
     * Get the currently selected item.
     */
    getSelected(): PickerSelection<T>;
    /**
     * Process a number input (fallback mode).
     */
    processNumberInput(input: string): PickerSelection<T>;
    /**
     * Show the interactive picker and wait for user selection.
     * Returns a Promise that resolves to the user's choice.
     *
     * Requires TTY (process.stdin.isTTY). Falls back to numbered
     * input if TTY is not available.
     */
    prompt(): Promise<PickerSelection<T>>;
    /**
     * Non-interactive fallback: print numbered list and read line.
     */
    private promptNonInteractive;
}
//# sourceMappingURL=interactive-picker.d.ts.map