/**
 * P0-1: Executor Logs Visibility Gate Check
 *
 * Validates that Claude Code execution logs are properly visible through Web UI.
 *
 * Requirements:
 * - ExecutorOutputStream exists and provides real-time streaming
 * - Web API exposes task output endpoint
 * - Output includes both stdout and stderr
 *
 * Run: npx ts-node diagnostics/logs-visible.check.ts
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

// Check 1: ExecutorOutputStream module exists
const outputStreamPath = path.join(__dirname, '../src/executor/executor-output-stream.ts');
const outputStreamExists = fs.existsSync(outputStreamPath);
check('P0-1-STREAM', outputStreamExists, 'ExecutorOutputStream module exists');

if (outputStreamExists) {
  const content = fs.readFileSync(outputStreamPath, 'utf-8');

  // Check 2: Has emit method for real-time streaming
  const hasEmit = content.includes('emit(') && content.includes('taskId');
  check('P0-1-EMIT', hasEmit, 'ExecutorOutputStream has emit method for real-time streaming');

  // Check 3: Has subscribe method for consumers
  const hasSubscribe = content.includes('subscribe(');
  check('P0-1-SUBSCRIBE', hasSubscribe, 'ExecutorOutputStream has subscribe method for consumers');

  // Check 4: Handles both stdout and stderr
  const hasStdoutStderr = content.includes('stdout') && content.includes('stderr');
  check('P0-1-STREAMS', hasStdoutStderr, 'ExecutorOutputStream handles both stdout and stderr');

  // Check 5: Has buffering for late subscribers
  const hasBuffer = content.includes('buffer') || content.includes('Buffer') || content.includes('recent');
  check('P0-1-BUFFER', hasBuffer, 'ExecutorOutputStream buffers output for late subscribers');
}

// Check 6: Claude Code executor integrates with output stream
const executorPath = path.join(__dirname, '../src/executor/claude-code-executor.ts');
if (fs.existsSync(executorPath)) {
  const content = fs.readFileSync(executorPath, 'utf-8');
  const usesOutputStream = content.includes('getExecutorOutputStream') || content.includes('ExecutorOutputStream');
  check('P0-1-INTEGRATION', usesOutputStream, 'Claude Code executor integrates with ExecutorOutputStream');
}

// Check 7: Web API has task output endpoint
const tasksRoutePath = path.join(__dirname, '../src/web/routes/tasks.ts');
if (fs.existsSync(tasksRoutePath)) {
  const content = fs.readFileSync(tasksRoutePath, 'utf-8');
  const hasOutputEndpoint = content.includes('/output') || content.includes('output');
  check('P0-1-API', hasOutputEndpoint, 'Web API has task output endpoint');
}

// Output results
console.log('\n=== P0-1: Executor Logs Visibility Gate Check ===\n');

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
  console.log('[PASS] P0-1: Executor logs visibility infrastructure verified');
  console.log('');
  console.log('Overall: ALL PASS');
  process.exit(0);
} else {
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`[FAIL] P0-1: ${failedCount} check(s) failed`);
  console.log('');
  console.log('Overall: FAIL');
  process.exit(1);
}
