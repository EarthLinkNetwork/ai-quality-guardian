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
export type PickerSelection<T = unknown> =
  | { type: 'selected'; item: PickerItem<T> }
  | { type: 'cancelled' }
  | { type: 'invalid'; input: string };

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
export class GenericPicker<T = unknown> {
  private items: PickerItem<T>[] = [];
  private options: PickerOptions;

  constructor(options: PickerOptions = {}) {
    this.options = {
      maxItems: 50,
      showDescriptions: true,
      emptyMessage: 'No items available.',
      ...options,
    };
  }

  /**
   * Set the items to display.
   */
  setItems(items: PickerItem<T>[]): void {
    this.items = items.slice(0, this.options.maxItems);
  }

  /**
   * Format items for display.
   * Returns lines to be printed.
   */
  formatForDisplay(): string[] {
    const lines: string[] = [];

    if (this.items.length === 0) {
      lines.push('');
      lines.push(this.options.emptyMessage || 'No items available.');
      lines.push('');
      return lines;
    }

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

    return lines;
  }

  /**
   * Process user input and return selection result.
   */
  processInput(input: string): PickerSelection<T> {
    const trimmed = input.trim().toLowerCase();

    if (trimmed === 'q' || trimmed === 'quit' || trimmed === 'cancel') {
      return { type: 'cancelled' };
    }

    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 1 || num > this.items.length) {
      return { type: 'invalid', input: trimmed };
    }

    return { type: 'selected', item: this.items[num - 1] };
  }

  /**
   * Get the current items.
   */
  getItems(): PickerItem<T>[] {
    return [...this.items];
  }

  /**
   * Get item count.
   */
  getCount(): number {
    return this.items.length;
  }
}
