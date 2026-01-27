/**
 * GenericPicker
 *
 * Reusable FZF-style selection UI for the REPL.
 * Not tied to any specific command - used by /inspect, /logs, /tasks, etc.
 *
 * Responsibilities:
 * - Format items for display (numbered list)
 * - Parse user selection (number or 'q')
 * - Return selected item or cancellation
 */
/**
 * Item that can be displayed in the picker.
 */
export interface PickerItem<T = unknown> {
    /** Unique identifier */
    id: string;
    /** Display label (shown in list) */
    label: string;
    /** Optional description (shown below label) */
    description?: string;
    /** Optional category/icon prefix */
    prefix?: string;
    /** Payload data associated with this item */
    data: T;
}
/**
 * Result of a picker selection.
 */
export type PickerSelection<T = unknown> = {
    type: 'selected';
    item: PickerItem<T>;
} | {
    type: 'cancelled';
} | {
    type: 'invalid';
    input: string;
};
/**
 * Options for the picker display.
 */
export interface PickerOptions {
    /** Title shown at top */
    title?: string;
    /** Whether to show item descriptions */
    showDescriptions?: boolean;
    /** Maximum items to show (default: 50) */
    maxItems?: number;
    /** Empty state message */
    emptyMessage?: string;
}
/**
 * GenericPicker - reusable FZF-style selection UI.
 */
export declare class GenericPicker<T = unknown> {
    private items;
    private options;
    constructor(options?: PickerOptions);
    /**
     * Set the items to display.
     */
    setItems(items: PickerItem<T>[]): void;
    /**
     * Format items for display.
     * Returns lines to be printed.
     */
    formatForDisplay(): string[];
    /**
     * Process user input and return selection result.
     */
    processInput(input: string): PickerSelection<T>;
    /**
     * Get the current items.
     */
    getItems(): PickerItem<T>[];
    /**
     * Get item count.
     */
    getCount(): number;
}
//# sourceMappingURL=picker.d.ts.map