/**
 * InteractivePicker Integration Tests
 *
 * Verifies that InteractivePicker is properly integrated into repl-interface.ts
 * (not just that the module exists).
 *
 * This is the structural test counterpart of diagnostics/ui-invariants.check.ts Rule E.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const REPL_SRC_PATH = path.resolve(__dirname, '../../../src/repl/repl-interface.ts');
const PICKER_SRC_PATH = path.resolve(__dirname, '../../../src/repl/interactive-picker.ts');

describe('InteractivePicker REPL Integration (Tier-0 Rule E)', () => {
  let replSrc: string;

  before(() => {
    replSrc = fs.readFileSync(REPL_SRC_PATH, 'utf-8');
  });

  it('InteractivePicker module must exist', () => {
    assert.ok(fs.existsSync(PICKER_SRC_PATH), 'interactive-picker.ts must exist');
  });

  it('InteractivePicker must be imported in repl-interface.ts', () => {
    assert.ok(
      replSrc.includes('InteractivePicker'),
      'repl-interface.ts must reference InteractivePicker'
    );
    assert.ok(
      replSrc.includes("from './interactive-picker'") || replSrc.includes('from "./interactive-picker"'),
      'repl-interface.ts must import from interactive-picker module'
    );
  });

  it('InteractivePicker must be instantiated in repl-interface.ts', () => {
    assert.ok(
      replSrc.includes('new InteractivePicker'),
      'repl-interface.ts must instantiate InteractivePicker (not just import)'
    );
  });

  it('All 4 interactive handlers must use InteractivePicker', () => {
    // Count occurrences of `new InteractivePicker` — expect at least 4
    // (handleLogsInteractive, handleTasksInteractive, handleInspectInteractive, handleDiagnosticInteractive)
    const matches = replSrc.match(/new InteractivePicker/g);
    assert.ok(matches, 'Should find InteractivePicker instantiations');
    assert.ok(
      matches!.length >= 4,
      `Expected at least 4 InteractivePicker instantiations (one per handler), found ${matches!.length}`
    );
  });

  it('pickerActive flag must exist for stdin coordination', () => {
    assert.ok(
      replSrc.includes('pickerActive'),
      'repl-interface.ts must have pickerActive flag for stdin coordination'
    );
  });

  it('Non-TTY fallback must be preserved (pendingSelectionMode)', () => {
    assert.ok(
      replSrc.includes('pendingSelectionMode'),
      'repl-interface.ts must retain pendingSelectionMode for non-TTY fallback'
    );
  });
});

describe('Diagnostic gate scripts exist', () => {
  it('ui-invariants.check.ts must exist', () => {
    const p = path.resolve(__dirname, '../../../diagnostics/ui-invariants.check.ts');
    assert.ok(fs.existsSync(p), 'diagnostics/ui-invariants.check.ts must exist');
  });

  it('task-state.check.ts must exist', () => {
    const p = path.resolve(__dirname, '../../../diagnostics/task-state.check.ts');
    assert.ok(fs.existsSync(p), 'diagnostics/task-state.check.ts must exist');
  });

  it('package.json must have gate scripts', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf-8')
    );
    assert.ok(pkg.scripts['gate:ui'], 'gate:ui script must exist');
    assert.ok(pkg.scripts['gate:task'], 'gate:task script must exist');
    assert.ok(pkg.scripts['gate:tier0'], 'gate:tier0 script must exist');
    assert.ok(pkg.scripts['gate:all'], 'gate:all script must exist');
  });
});
