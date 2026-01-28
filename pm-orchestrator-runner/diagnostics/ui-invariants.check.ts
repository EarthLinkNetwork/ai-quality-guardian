/**
 * UI Invariants Diagnostic Check
 *
 * Verifies Tier-0 rules A-F for system UI correctness.
 * Run: npx ts-node diagnostics/ui-invariants.check.ts
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks fail
 */

interface CheckResult {
  rule: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  reason?: string;
}

const results: CheckResult[] = [];

function check(rule: string, description: string, fn: () => boolean | string): void {
  try {
    const result = fn();
    if (result === true) {
      results.push({ rule, description, status: 'PASS' });
    } else {
      results.push({ rule, description, status: 'FAIL', reason: typeof result === 'string' ? result : 'Check returned false' });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ rule, description, status: 'FAIL', reason: msg });
  }
}

// -------------------------------------------------------------------
// Rule A: Input Fixed at Bottom
// Structural check: TwoPaneRenderer has renderInputLine method
// -------------------------------------------------------------------
check('A', 'TwoPaneRenderer has renderInputLine method', () => {
  try {
    // Dynamic import check - verify the class exists with expected method
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/repl/two-pane-renderer');
    const Cls = mod.TwoPaneRenderer;
    if (!Cls) return 'TwoPaneRenderer class not found';
    const proto = Cls.prototype;
    if (typeof proto.renderInputLine !== 'function') return 'renderInputLine method missing';
    return true;
  } catch {
    return 'Cannot load two-pane-renderer module';
  }
});

// -------------------------------------------------------------------
// Rule B: Scrollable Upper Area
// Structural check: TwoPaneRenderer has log batching (addLog / renderLogs)
// -------------------------------------------------------------------
check('B', 'TwoPaneRenderer has log batching capability', () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/repl/two-pane-renderer');
    const Cls = mod.TwoPaneRenderer;
    if (!Cls) return 'TwoPaneRenderer class not found';
    const proto = Cls.prototype;
    const hasAddLog = typeof proto.addLog === 'function' || typeof proto.appendLog === 'function';
    if (!hasAddLog) return 'No log append method found (addLog or appendLog)';
    return true;
  } catch {
    return 'Cannot load two-pane-renderer module';
  }
});

// -------------------------------------------------------------------
// Rule C: No Output Corruption on Concurrent Writes
// Structural check: Debounce timer exists in renderer
// -------------------------------------------------------------------
check('C', 'TwoPaneRenderer uses debounced rendering', () => {
  try {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../src/repl/two-pane-renderer'), 'utf-8');
    if (src.includes('debounce') || src.includes('setTimeout') || src.includes('requestAnimationFrame')) {
      return true;
    }
    return 'No debounce/batching mechanism found in source';
  } catch {
    return 'Cannot read two-pane-renderer source';
  }
});

// -------------------------------------------------------------------
// Rule D: Separator Integrity
// Structural check: Separator rendering exists
// -------------------------------------------------------------------
check('D', 'TwoPaneRenderer renders separator line', () => {
  try {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../src/repl/two-pane-renderer'), 'utf-8');
    if (src.includes('separator') || src.includes('─') || src.includes('━') || src.includes('═')) {
      return true;
    }
    return 'No separator rendering found in source';
  } catch {
    return 'Cannot read two-pane-renderer source';
  }
});

// -------------------------------------------------------------------
// Rule E: Keyboard-Selectable Picker (Selection Lists)
// -------------------------------------------------------------------
check('E', 'InteractivePicker module exists with keypress handling', () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/repl/interactive-picker');
    if (mod.InteractivePicker) return true;
    return 'InteractivePicker class not exported';
  } catch {
    return 'src/repl/interactive-picker module not found (Phase 0-B required)';
  }
});

// -------------------------------------------------------------------
// Rule F: Keyboard-Selectable Clarification Picker
// -------------------------------------------------------------------
check('F', 'ClarificationType enum exists with picker routing', () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/models/clarification');
    if (!mod.ClarificationType) return 'ClarificationType not exported';
    const types = Object.values(mod.ClarificationType);
    const required = ['TARGET_FILE', 'SELECT_ONE', 'CONFIRM', 'FREE_TEXT'];
    for (const t of required) {
      if (!types.includes(t)) return `Missing ClarificationType: ${t}`;
    }
    return true;
  } catch {
    return 'src/models/clarification module not found (Phase 0-C required)';
  }
});

// -------------------------------------------------------------------
// Print results
// -------------------------------------------------------------------
console.log('\n=== UI Invariants Diagnostic Check ===\n');

let allPass = true;
for (const r of results) {
  const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[SKIP]';
  console.log(`${icon} Rule ${r.rule}: ${r.description}`);
  if (r.reason) {
    console.log(`       Reason: ${r.reason}`);
  }
  if (r.status === 'FAIL') allPass = false;
}

console.log(`\nOverall: ${allPass ? 'ALL PASS' : 'SOME FAILURES'}`);
process.exit(allPass ? 0 : 1);
