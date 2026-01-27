/**
 * DiagnosticRunner Tests
 *
 * Engine-level tests only. No per-problem test commands.
 * Tests the generic execution engine, not specific diagnostics.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  DiagnosticRunner,
  DiagnosticRegistry,
  DiagnosticDefinition,
  GenericPicker,
  PickerItem,
} from '../../../src/diagnostics';

describe('DiagnosticRunner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-runner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: minimal definition
   */
  function minimalDef(overrides: Partial<DiagnosticDefinition> = {}): DiagnosticDefinition {
    return {
      id: 'test-diag',
      title: 'Test Diagnostic',
      description: 'A test diagnostic',
      preconditions: [],
      steps: [],
      assertions: [],
      artifacts: [],
      ...overrides,
    };
  }

  describe('Preconditions', () => {
    it('should pass when preconditions are met', async () => {
      // Create required file
      fs.writeFileSync(path.join(tempDir, 'required.txt'), 'exists');

      const def = minimalDef({
        preconditions: [
          { type: 'file_exists', target: 'required.txt', description: 'Required file' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.preconditionsMet, true);
      assert.equal(result.preconditionErrors.length, 0);
    });

    it('should fail when file precondition is not met', async () => {
      const def = minimalDef({
        preconditions: [
          { type: 'file_exists', target: 'missing.txt', description: 'Missing file' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.preconditionsMet, false);
      assert.equal(result.preconditionErrors.length, 1);
      assert.ok(result.preconditionErrors[0].includes('missing.txt'));
      assert.equal(result.passed, false);
    });

    it('should fail when dir precondition is not met', async () => {
      const def = minimalDef({
        preconditions: [
          { type: 'dir_exists', target: 'missing-dir', description: 'Missing dir' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.preconditionsMet, false);
      assert.equal(result.preconditionErrors.length, 1);
    });

    it('should skip steps when preconditions fail', async () => {
      const def = minimalDef({
        preconditions: [
          { type: 'file_exists', target: 'missing.txt', description: 'Missing' },
        ],
        steps: [
          { id: 'step1', label: 'Step 1', action: { type: 'read_file', path: 'missing.txt' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.stepResults.length, 0, 'Steps should not execute');
    });
  });

  describe('Steps', () => {
    it('should execute glob step', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.ts'), '');
      fs.writeFileSync(path.join(tempDir, 'b.ts'), '');
      fs.writeFileSync(path.join(tempDir, 'c.js'), '');

      const def = minimalDef({
        steps: [
          { id: 'find-ts', label: 'Find TS files', action: { type: 'glob', pattern: '*.ts' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.stepResults.length, 1);
      assert.equal(result.stepResults[0].success, true);
      const files = result.stepResults[0].output.split('\n');
      assert.equal(files.length, 2, 'Should find 2 TS files');
    });

    it('should execute read_file step', async () => {
      fs.writeFileSync(path.join(tempDir, 'data.txt'), 'hello world');

      const def = minimalDef({
        steps: [
          { id: 'read', label: 'Read data', action: { type: 'read_file', path: 'data.txt' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.stepResults[0].success, true);
      assert.equal(result.stepResults[0].output, 'hello world');
    });

    it('should execute exec step', async () => {
      const def = minimalDef({
        steps: [
          { id: 'echo', label: 'Echo test', action: { type: 'exec', command: 'echo hello' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.stepResults[0].success, true);
      assert.equal(result.stepResults[0].output, 'hello');
      assert.equal(result.stepResults[0].exitCode, 0);
    });

    it('should handle exec failure', async () => {
      const def = minimalDef({
        steps: [
          { id: 'fail', label: 'Fail', action: { type: 'exec', command: 'exit 42' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.stepResults[0].success, false);
    });

    it('should execute compare step (content mode)', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'same');
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'same');

      const def = minimalDef({
        steps: [
          { id: 'cmp', label: 'Compare', action: { type: 'compare', left: 'a.txt', right: 'b.txt', mode: 'content' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.stepResults[0].success, true);
      assert.equal(result.stepResults[0].output, 'identical');
    });

    it('should detect content difference', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'one');
      fs.writeFileSync(path.join(tempDir, 'b.txt'), 'two');

      const def = minimalDef({
        steps: [
          { id: 'cmp', label: 'Compare', action: { type: 'compare', left: 'a.txt', right: 'b.txt', mode: 'content' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.stepResults[0].success, false);
      assert.equal(result.stepResults[0].output, 'different');
    });

    it('should execute custom step handler', async () => {
      const def = minimalDef({
        steps: [
          { id: 'custom', label: 'Custom', action: { type: 'custom', handler: 'my-handler' } },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      runner.registerStepHandler('my-handler', async (_cwd) => ({
        output: 'custom output',
        exitCode: 0,
      }));

      const result = await runner.run(def);

      assert.equal(result.stepResults[0].success, true);
      assert.equal(result.stepResults[0].output, 'custom output');
    });
  });

  describe('Assertions', () => {
    it('should evaluate not_empty assertion (pass)', async () => {
      fs.writeFileSync(path.join(tempDir, 'data.txt'), 'content');

      const def = minimalDef({
        steps: [
          { id: 'read', label: 'Read', action: { type: 'read_file', path: 'data.txt' } },
        ],
        assertions: [
          { stepId: 'read', type: 'not_empty', severity: 'error', message: 'Should have content' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.assertionResults.length, 1);
      assert.equal(result.assertionResults[0].passed, true);
      assert.equal(result.passed, true);
    });

    it('should evaluate contains assertion (fail)', async () => {
      fs.writeFileSync(path.join(tempDir, 'data.txt'), 'no match here');

      const def = minimalDef({
        steps: [
          { id: 'read', label: 'Read', action: { type: 'read_file', path: 'data.txt' } },
        ],
        assertions: [
          { stepId: 'read', type: 'contains', expected: 'needle', severity: 'error', message: 'Should contain needle' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.assertionResults[0].passed, false);
      assert.equal(result.passed, false);
    });

    it('should distinguish error vs warning severity', async () => {
      const def = minimalDef({
        steps: [
          { id: 's1', label: 'S1', action: { type: 'exec', command: 'echo ""' } },
        ],
        assertions: [
          { stepId: 's1', type: 'not_empty', severity: 'warning', message: 'Warn only' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      // Warning severity should not cause overall failure
      assert.equal(result.passed, true, 'Warning should not fail diagnostic');
      assert.equal(result.assertionResults[0].passed, false, 'Assertion itself should fail');
    });

    it('should evaluate count_eq assertion', async () => {
      fs.writeFileSync(path.join(tempDir, 'a.ts'), '');
      fs.writeFileSync(path.join(tempDir, 'b.ts'), '');

      const def = minimalDef({
        steps: [
          { id: 'find', label: 'Find', action: { type: 'glob', pattern: '*.ts' } },
        ],
        assertions: [
          { stepId: 'find', type: 'count_eq', expected: 2, severity: 'error', message: 'Should find exactly 2' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.assertionResults[0].passed, true);
    });

    it('should evaluate exit_code assertion', async () => {
      const def = minimalDef({
        steps: [
          { id: 'ok', label: 'Ok', action: { type: 'exec', command: 'true' } },
        ],
        assertions: [
          { stepId: 'ok', type: 'exit_code', expected: 0, severity: 'error', message: 'Should exit 0' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.assertionResults[0].passed, true);
    });
  });

  describe('Full diagnostic run', () => {
    it('should produce complete result with timing', async () => {
      fs.writeFileSync(path.join(tempDir, 'src.ts'), 'const x = 1;');

      const def = minimalDef({
        id: 'full-test',
        title: 'Full Test',
        preconditions: [
          { type: 'file_exists', target: 'src.ts', description: 'Source exists' },
        ],
        steps: [
          { id: 'read-src', label: 'Read source', action: { type: 'read_file', path: 'src.ts' } },
        ],
        assertions: [
          { stepId: 'read-src', type: 'not_empty', severity: 'error', message: 'Source should have content' },
        ],
      });

      const runner = new DiagnosticRunner(tempDir);
      const result = await runner.run(def);

      assert.equal(result.definitionId, 'full-test');
      assert.equal(result.title, 'Full Test');
      assert.ok(result.startedAt);
      assert.ok(result.completedAt);
      assert.ok(result.durationMs >= 0);
      assert.equal(result.preconditionsMet, true);
      assert.equal(result.passed, true);
      assert.ok(result.summary.includes('1/1'));
    });
  });
});

describe('DiagnosticRegistry', () => {
  it('should register and retrieve definitions', () => {
    const registry = new DiagnosticRegistry();
    const def: DiagnosticDefinition = {
      id: 'test',
      title: 'Test',
      description: 'Test diagnostic',
      preconditions: [],
      steps: [],
      assertions: [],
      artifacts: [],
    };

    registry.register(def);

    assert.equal(registry.has('test'), true);
    assert.equal(registry.has('unknown'), false);
    assert.equal(registry.count(), 1);
    assert.deepEqual(registry.get('test'), def);
    assert.equal(registry.getAll().length, 1);
  });

  it('should filter by category', () => {
    const registry = new DiagnosticRegistry();
    registry.register({
      id: 'a', title: 'A', description: '', category: 'build',
      preconditions: [], steps: [], assertions: [], artifacts: [],
    });
    registry.register({
      id: 'b', title: 'B', description: '', category: 'security',
      preconditions: [], steps: [], assertions: [], artifacts: [],
    });
    registry.register({
      id: 'c', title: 'C', description: '', category: 'build',
      preconditions: [], steps: [], assertions: [], artifacts: [],
    });

    assert.equal(registry.getByCategory('build').length, 2);
    assert.equal(registry.getByCategory('security').length, 1);
    assert.equal(registry.getByCategory('unknown').length, 0);
  });
});

describe('GenericPicker', () => {
  it('should format items for display', () => {
    const picker = new GenericPicker({ title: 'Select item:' });
    picker.setItems([
      { id: '1', label: 'Item A', description: 'Description A', data: null },
      { id: '2', label: 'Item B', prefix: 'X', data: null },
    ]);

    const lines = picker.formatForDisplay();

    assert.ok(lines.some(l => l.includes('Select item:')));
    assert.ok(lines.some(l => l.includes('1. Item A')));
    assert.ok(lines.some(l => l.includes('Description A')));
    assert.ok(lines.some(l => l.includes('[X] Item B')));
  });

  it('should process valid numeric input', () => {
    const picker = new GenericPicker();
    picker.setItems([
      { id: 'a', label: 'A', data: 'data-a' },
      { id: 'b', label: 'B', data: 'data-b' },
    ]);

    const result = picker.processInput('2');
    assert.equal(result.type, 'selected');
    if (result.type === 'selected') {
      assert.equal(result.item.id, 'b');
      assert.equal(result.item.data, 'data-b');
    }
  });

  it('should handle cancel input', () => {
    const picker = new GenericPicker();
    picker.setItems([{ id: 'a', label: 'A', data: null }]);

    assert.equal(picker.processInput('q').type, 'cancelled');
    assert.equal(picker.processInput('quit').type, 'cancelled');
    assert.equal(picker.processInput('cancel').type, 'cancelled');
  });

  it('should handle invalid input', () => {
    const picker = new GenericPicker();
    picker.setItems([{ id: 'a', label: 'A', data: null }]);

    assert.equal(picker.processInput('99').type, 'invalid');
    assert.equal(picker.processInput('abc').type, 'invalid');
    assert.equal(picker.processInput('0').type, 'invalid');
  });

  it('should show empty message when no items', () => {
    const picker = new GenericPicker({ emptyMessage: 'Nothing here' });
    picker.setItems([]);

    const lines = picker.formatForDisplay();
    assert.ok(lines.some(l => l.includes('Nothing here')));
  });

  it('should respect maxItems', () => {
    const picker = new GenericPicker({ maxItems: 2 });
    picker.setItems([
      { id: '1', label: 'A', data: null },
      { id: '2', label: 'B', data: null },
      { id: '3', label: 'C', data: null },
    ]);

    assert.equal(picker.getCount(), 2);
  });
});
