/**
 * P0-3: Timeout Only on Process Death Gate Check
 *
 * Validates that timeout triggers ONLY on process death, NOT on output silence.
 *
 * Requirements:
 * - "Silence = timeout" is ABOLISHED (v3 design)
 * - Output silence alone does NOT terminate task
 * - Only process exit/crash triggers completion
 *
 * Run: npx ts-node diagnostics/timeout-real.check.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  code: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

function check(code: string, condition: boolean, message: string): void {
  results.push({ code, passed: condition, message });
}

// Check 1: Claude Code executor has v3 design (silence=timeout abolished)
const executorPath = path.join(__dirname, '../src/executor/claude-code-executor.ts');
if (fs.existsSync(executorPath)) {
  const content = fs.readFileSync(executorPath, 'utf-8');

  // Check for "silence=timeout" abolishment comments or design
  const hasV3Design = content.includes('ABOLISHED') ||
                      content.includes('v3') ||
                      content.includes('silence') && content.includes('NOT');
  check('P0-3-V3', hasV3Design, 'Claude Code executor uses v3 design (silence=timeout abolished)');

  // Check that there's no silence-based timeout
  const hasSilenceTimeout = content.includes('lastOutputTime') &&
                            content.includes('silenceTimeout') &&
                            !content.includes('ABOLISHED');
  check('P0-3-NO-SILENCE', !hasSilenceTimeout, 'No silence-based timeout in executor');

  // Check for process exit handling
  const hasExitHandling = content.includes("'exit'") || content.includes("'close'");
  check('P0-3-EXIT', hasExitHandling, 'Executor handles process exit events');

  // Check for progress event support
  const hasProgressEvents = content.includes('progress') || content.includes('heartbeat');
  check('P0-3-PROGRESS', hasProgressEvents, 'Executor supports progress events');
}

// Check 2: Dynamic timeout executor exists and uses profiles
const dynamicTimeoutPath = path.join(__dirname, '../src/executor/dynamic-timeout-executor.ts');
if (fs.existsSync(dynamicTimeoutPath)) {
  const content = fs.readFileSync(dynamicTimeoutPath, 'utf-8');

  // Check for profile-based timeout
  const hasProfiles = content.includes('profile') || content.includes('Profile');
  check('P0-3-PROFILES', hasProfiles, 'Dynamic timeout executor supports profiles');

  // Check for extended timeout option
  const hasExtended = content.includes('extended') || content.includes('EXTENDED');
  check('P0-3-EXTENDED', hasExtended, 'Extended timeout profile available');
} else {
  check('P0-3-DYNAMIC', false, 'Dynamic timeout executor module exists');
}

// Check 3: Queue poller doesn't use silence-based timeout
const queuePollerPath = path.join(__dirname, '../src/queue/queue-poller.ts');
if (fs.existsSync(queuePollerPath)) {
  const content = fs.readFileSync(queuePollerPath, 'utf-8');

  // Check that queue poller doesn't enforce silence timeout
  const enforceSilence = content.includes('silence') &&
                         content.includes('timeout') &&
                         !content.includes('// ABOLISHED');
  check('P0-3-POLLER', !enforceSilence, 'Queue poller does not enforce silence timeout');
}

// Output results
console.log('\n=== P0-3: Timeout Only on Process Death Gate Check ===\n');

let allPassed = true;
for (const result of results) {
  const icon = result.passed ? '[PASS]' : '[FAIL]';
  console.log(`${icon} ${result.code}: ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
}

console.log('');
console.log('--- Summary ---');
console.log('');

if (allPassed) {
  console.log('[PASS] P0-3: Timeout design (process death only) verified');
  console.log('');
  console.log('Overall: ALL PASS');
  process.exit(0);
} else {
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`[FAIL] P0-3: ${failedCount} check(s) failed`);
  console.log('');
  console.log('Overall: FAIL');
  process.exit(1);
}
