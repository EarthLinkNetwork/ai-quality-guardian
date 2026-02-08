/**
 * Executor Preflight Auth Gate Diagnostic Check
 *
 * Per design spec: "timeoutで誤魔化すな", "silent fail禁止", "ユーザーに推測させるな"
 *
 * Validates executor configuration before any CI/CD or runtime operation.
 * All auth/config issues must be detected immediately with clear messages.
 *
 * Run: npx ts-node diagnostics/auth.check.ts
 *
 * Exit codes:
 *   0 = at least one executor configured and ready
 *   1 = no executor available, provides fix instructions
 */

import * as path from 'path';
import {
  runPreflightChecks,
  formatPreflightReport,
  formatPreflightReportJSON,
  PreflightReport,
  PreflightResult,
  ExecutorType,
} from '../src/diagnostics/executor-preflight';

export interface AuthCheckResult {
  passed: boolean;
  report: PreflightReport;
  summary: string;
  executorsAvailable: string[];
  fixInstructions: string[];
}

/**
 * Check executor configuration
 */
export function checkExecutorAuth(executorType: ExecutorType = 'auto'): AuthCheckResult {
  const report = runPreflightChecks(executorType);

  // Collect available executors
  const executorsAvailable: string[] = [];
  for (const check of report.checks) {
    if (check.ok && check.code === 'OK') {
      if (check.message.includes('Claude')) {
        executorsAvailable.push('claude-code');
      } else if (check.message.includes('OpenAI')) {
        executorsAvailable.push('openai-api');
      } else if (check.message.includes('Anthropic')) {
        executorsAvailable.push('anthropic-api');
      }
    }
  }

  // Collect fix instructions from fatal errors
  const fixInstructions: string[] = [];
  for (const error of report.fatal_errors) {
    if (error.fix_hint) {
      fixInstructions.push(`${error.code}: ${error.fix_hint}`);
    }
  }

  // Build summary
  let summary: string;
  if (report.can_proceed) {
    summary = `Executor ready: ${executorsAvailable.join(', ') || 'auto-detected'}`;
  } else {
    const firstError = report.fatal_errors[0];
    summary = `No executor configured: ${firstError?.message || 'Unknown error'}`;
  }

  return {
    passed: report.can_proceed,
    report,
    summary,
    executorsAvailable,
    fixInstructions,
  };
}

/**
 * Format result as gate-style output
 */
function formatGateOutput(result: AuthCheckResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('  Executor Auth Gate Diagnostic Check');
  lines.push('='.repeat(60));
  lines.push('');

  // Status
  const statusIcon = result.passed ? '[PASS]' : '[FAIL]';
  lines.push(`${statusIcon} AUTH-1: Executor configuration check`);
  lines.push(`       Status: ${result.report.status}`);
  lines.push(`       Executor Mode: ${result.report.executor}`);
  lines.push('');

  // Individual checks
  for (const check of result.report.checks) {
    const icon = check.ok ? '[PASS]' : check.fatal ? '[FATAL]' : '[WARN]';
    lines.push(`${icon} ${check.code}: ${check.message}`);
    if (!check.ok && check.fix_hint) {
      // Format fix hints with proper indentation
      const hintLines = check.fix_hint.split('\n');
      lines.push(`       Fix: ${hintLines[0]}`);
      for (let i = 1; i < hintLines.length; i++) {
        lines.push(`            ${hintLines[i]}`);
      }
    }
  }

  lines.push('');

  // Summary
  if (result.passed) {
    lines.push('[PASS] At least one executor is configured and ready.');
    if (result.executorsAvailable.length > 0) {
      lines.push(`       Available executors: ${result.executorsAvailable.join(', ')}`);
    }
  } else {
    lines.push('[FAIL] No executor configured. Cannot proceed.');
    lines.push('');
    lines.push('Fix Instructions:');
    for (const instruction of result.fixInstructions) {
      lines.push(`  - ${instruction}`);
    }
    lines.push('');
    lines.push('Quickstart (choose one):');
    lines.push('  Option 1: Install and login to Claude Code');
    lines.push('    npm install -g @anthropic-ai/claude-code');
    lines.push('    claude login');
    lines.push('');
    lines.push('  Option 2: Set OpenAI API key');
    lines.push('    export OPENAI_API_KEY=sk-...');
    lines.push('');
    lines.push('  Option 3: Set Anthropic API key');
    lines.push('    export ANTHROPIC_API_KEY=sk-ant-...');
  }

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('');

  return lines.join('\n');
}

// -------------------------------------------------------------------
// Main execution
// -------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const executorType: ExecutorType = (args.find(a => ['claude-code', 'openai-api', 'anthropic-api', 'auto'].includes(a)) || 'auto') as ExecutorType;

  const result = checkExecutorAuth(executorType);

  if (jsonOutput) {
    console.log(formatPreflightReportJSON(result.report));
  } else {
    console.log(formatGateOutput(result));
  }

  if (!result.passed) {
    console.log('[REJECT] Auth gate failed. Configure at least one executor.\n');
    process.exit(1);
  }

  console.log('[ACCEPT] Auth gate passed.\n');
  process.exit(0);
}
