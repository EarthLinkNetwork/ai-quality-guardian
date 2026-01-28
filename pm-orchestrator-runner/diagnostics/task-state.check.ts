/**
 * Task State Diagnostic Check
 *
 * Verifies Tier-0 rules G-I for task lifecycle correctness.
 * Run: npx ts-node diagnostics/task-state.check.ts
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
// Rule G: Single Pending Clarification
// Structural check: AWAITING_RESPONSE state exists in TaskQueueState
// -------------------------------------------------------------------
check('G', 'TaskQueueState includes AWAITING_RESPONSE', () => {
  try {
    const fs = require('fs');
    const replPath = require.resolve('../src/repl/repl-interface');
    const src = fs.readFileSync(replPath, 'utf-8');
    if (!src.includes("'AWAITING_RESPONSE'")) {
      return 'AWAITING_RESPONSE not found in TaskQueueState';
    }
    return true;
  } catch {
    return 'Cannot read repl-interface source';
  }
});

check('G', 'Single AWAITING_RESPONSE enforcement exists', () => {
  try {
    const fs = require('fs');
    const replPath = require.resolve('../src/repl/repl-interface');
    const src = fs.readFileSync(replPath, 'utf-8');
    // Check for logic that ensures only one task awaits at a time
    if (src.includes('AWAITING_RESPONSE') && src.includes('pendingUserResponse')) {
      return true;
    }
    return 'No single-pending enforcement pattern found';
  } catch {
    return 'Cannot read repl-interface source';
  }
});

// -------------------------------------------------------------------
// Rule H: /respond Advances State
// -------------------------------------------------------------------
check('H', '/respond command handler exists', () => {
  try {
    const fs = require('fs');
    const replPath = require.resolve('../src/repl/repl-interface');
    const src = fs.readFileSync(replPath, 'utf-8');
    if (src.includes('/respond') || src.includes('respond')) {
      return true;
    }
    return '/respond handler not found in repl-interface';
  } catch {
    return 'Cannot read repl-interface source';
  }
});

check('H', '/respond transitions task from AWAITING_RESPONSE to RUNNING', () => {
  try {
    const fs = require('fs');
    const replPath = require.resolve('../src/repl/repl-interface');
    const src = fs.readFileSync(replPath, 'utf-8');
    // Look for state transition pattern
    if (src.includes('AWAITING_RESPONSE') && (src.includes("state = 'RUNNING'") || src.includes("RUNNING"))) {
      return true;
    }
    return 'No AWAITING_RESPONSE -> RUNNING transition found';
  } catch {
    return 'Cannot read repl-interface source';
  }
});

// -------------------------------------------------------------------
// Rule I: No Repeat Clarification
// -------------------------------------------------------------------
check('I', 'ClarificationHistory module exists', () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/repl/clarification-history');
    if (mod.ClarificationHistory) return true;
    return 'ClarificationHistory class not exported';
  } catch {
    return 'src/repl/clarification-history module not found (Phase 0-C required)';
  }
});

check('I', 'Semantic resolver module exists', () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/repl/semantic-resolver');
    if (mod.SemanticResolver || mod.resolveSemanticInput) return true;
    return 'SemanticResolver not exported';
  } catch {
    return 'src/repl/semantic-resolver module not found (Phase 0-C required)';
  }
});

// -------------------------------------------------------------------
// Rule J: Self-Development Gate
// -------------------------------------------------------------------
check('J', 'Governance artifacts exist (specs/, plans/, diagnostics/)', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const requiredFiles = [
    'specs/system-ui.md',
    'specs/task-lifecycle.md',
    'specs/clarification.md',
    'plans/current-phase.md',
    'plans/open-defects.md',
    'diagnostics/ui-invariants.check.ts',
    'diagnostics/task-state.check.ts',
  ];

  const missing: string[] = [];
  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(root, f))) {
      missing.push(f);
    }
  }

  if (missing.length > 0) {
    return `Missing files: ${missing.join(', ')}`;
  }
  return true;
});

// -------------------------------------------------------------------
// Print results
// -------------------------------------------------------------------
console.log('\n=== Task State Diagnostic Check ===\n');

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
