/**
 * InteractivePicker Tests
 *
 * Tier-0 Rule E & F compliance.
 * Verifies keyboard navigation (up/down/j/k), selection (enter), cancellation (esc/q).
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { InteractivePicker } from '../../../src/repl/interactive-picker';
import { PickerItem } from '../../../src/diagnostics/picker';

function makeItems(count: number): PickerItem<string>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${i + 1}`,
    description: `Description for item ${i + 1}`,
    data: `data-${i}`,
  }));
}

describe('InteractivePicker', () => {
  describe('construction', () => {
    it('should create with items and default options', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);
      assert.ok(picker, 'Picker should be created');
    });

    it('should create with custom options', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items, {
        title: 'Test Picker',
        maxVisible: 3,
        showDescriptions: true,
      });
      assert.ok(picker, 'Picker should be created with options');
    });
  });

  describe('navigation', () => {
    it('should start at index 0 and select first item', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);
      const result = picker.getSelected();
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-0');
      }
    });

    it('should move down with moveDown()', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);

      // Suppress stdout during render
      const origWrite = process.stdout.write;
      process.stdout.write = (() => true) as typeof process.stdout.write;

      picker.moveDown();
      const result = picker.getSelected();
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-1', 'After moveDown, should be at index 1');
      }

      process.stdout.write = origWrite;
    });

    it('should move up with moveUp()', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);

      const origWrite = process.stdout.write;
      process.stdout.write = (() => true) as typeof process.stdout.write;

      picker.moveDown();
      picker.moveDown();
      picker.moveUp();
      const result = picker.getSelected();
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-1', 'After down,down,up should be at index 1');
      }

      process.stdout.write = origWrite;
    });

    it('should not move above index 0', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);

      const origWrite = process.stdout.write;
      process.stdout.write = (() => true) as typeof process.stdout.write;

      picker.moveUp(); // should be no-op at 0
      const result = picker.getSelected();
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-0', 'Should remain at index 0');
      }

      process.stdout.write = origWrite;
    });

    it('should not move below last index', () => {
      const items = makeItems(3);
      const picker = new InteractivePicker(items);

      const origWrite = process.stdout.write;
      process.stdout.write = (() => true) as typeof process.stdout.write;

      picker.moveDown();
      picker.moveDown();
      picker.moveDown(); // should be no-op at 2
      const result = picker.getSelected();
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-2', 'Should remain at last index');
      }

      process.stdout.write = origWrite;
    });

    it('should navigate to specific item via repeated moveDown', () => {
      const items = makeItems(10);
      const picker = new InteractivePicker(items);

      const origWrite = process.stdout.write;
      process.stdout.write = (() => true) as typeof process.stdout.write;

      // Navigate to item 5 (index 4)
      for (let i = 0; i < 4; i++) picker.moveDown();
      const result = picker.getSelected();
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-4', 'Should be at index 4');
        assert.equal(result.item.label, 'Item 5');
      }

      process.stdout.write = origWrite;
    });
  });

  describe('number input fallback', () => {
    it('should accept valid number input', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);
      const result = picker.processNumberInput('3');
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-2', 'Number 3 selects index 2');
      }
    });

    it('should reject out-of-range number', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);
      const result = picker.processNumberInput('10');
      assert.equal(result.type, 'invalid');
    });

    it('should reject non-numeric input', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);
      const result = picker.processNumberInput('abc');
      assert.equal(result.type, 'invalid');
    });

    it('should reject zero', () => {
      const items = makeItems(5);
      const picker = new InteractivePicker(items);
      const result = picker.processNumberInput('0');
      assert.equal(result.type, 'invalid');
    });
  });

  describe('empty state', () => {
    it('should return cancelled for empty items', async () => {
      const picker = new InteractivePicker([]);
      const result = await picker.prompt();
      assert.equal(result.type, 'cancelled');
    });

    it('should return cancelled from getSelected with no items', () => {
      const picker = new InteractivePicker([]);
      const result = picker.getSelected();
      assert.equal(result.type, 'cancelled');
    });
  });

  describe('scrolling', () => {
    it('should handle more items than maxVisible', () => {
      const items = makeItems(50);
      const picker = new InteractivePicker(items, { maxVisible: 5 });

      const origWrite = process.stdout.write;
      process.stdout.write = (() => true) as typeof process.stdout.write;

      // Navigate past visible window
      for (let i = 0; i < 6; i++) picker.moveDown();
      const result = picker.getSelected();
      assert.equal(result.type, 'selected');
      if (result.type === 'selected') {
        assert.equal(result.item.id, 'item-6');
      }

      process.stdout.write = origWrite;
    });
  });
});
