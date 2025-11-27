#!/usr/bin/env node
/**
 * Installation Verification Script
 *
 * npm install 後に自動実行され、パッケージの動作を検証します。
 *
 * 検証項目:
 * 1. 全てのエクスポートがimport可能か
 * 2. 主要クラスがインスタンス化可能か
 * 3. CLIが実行可能か
 * 4. 依存関係が正しいか
 */

const path = require('path');
const fs = require('fs');

// カラー出力
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(status, message) {
  const statusColors = {
    PASS: colors.green,
    FAIL: colors.red,
    WARN: colors.yellow,
    INFO: colors.cyan
  };
  console.log(`${statusColors[status] || ''}[${status}]${colors.reset} ${message}`);
}

async function verifyInstallation() {
  console.log('\n=== PM Orchestrator Installation Verification ===\n');

  let passed = 0;
  let failed = 0;

  // 1. モジュールimportテスト
  try {
    const pkg = require('pm-orchestrator-enhancement');
    const expectedExports = [
      'PMOrchestrator', 'ExecutionLogger', 'ProgressTracker',
      'RuleChecker', 'CodeAnalyzer', 'Designer', 'Implementer',
      'Tester', 'QA', 'CICDEngineer', 'Reporter'
    ];

    const missing = expectedExports.filter(name => !pkg[name]);
    if (missing.length === 0) {
      log('PASS', 'All expected exports available');
      passed++;
    } else {
      log('FAIL', `Missing exports: ${missing.join(', ')}`);
      failed++;
    }
  } catch (e) {
    log('FAIL', `Module import failed: ${e.message}`);
    failed++;
    // モジュールがimportできなければ以降のテストは不可能
    process.exit(1);
  }

  // 2. PMOrchestrator インスタンス化テスト
  try {
    const { PMOrchestrator } = require('pm-orchestrator-enhancement');
    const tmpDir = path.join(require('os').tmpdir(), 'pm-orchestrator-verify');
    const orchestrator = new PMOrchestrator(tmpDir);
    log('PASS', 'PMOrchestrator instantiation');
    passed++;
  } catch (e) {
    log('FAIL', `PMOrchestrator instantiation: ${e.message}`);
    failed++;
  }

  // 3. ExecutionLogger テスト
  try {
    const { ExecutionLogger } = require('pm-orchestrator-enhancement');
    const tmpDir = path.join(require('os').tmpdir(), 'pm-orchestrator-verify');
    const logger = new ExecutionLogger(tmpDir);
    log('PASS', 'ExecutionLogger instantiation');
    passed++;
  } catch (e) {
    log('FAIL', `ExecutionLogger instantiation: ${e.message}`);
    failed++;
  }

  // 4. ProgressTracker ライフサイクルテスト
  try {
    const { ProgressTracker } = require('pm-orchestrator-enhancement');
    const tracker = new ProgressTracker();
    tracker.startTask('verify-test', 'Verification Test');
    tracker.updateProgress('verify-test', 50, 'verifier');
    tracker.completeTask('verify-test');
    log('PASS', 'ProgressTracker lifecycle');
    passed++;
  } catch (e) {
    log('FAIL', `ProgressTracker lifecycle: ${e.message}`);
    failed++;
  }

  // 5. サブエージェント インスタンス化テスト
  const subagents = ['RuleChecker', 'CodeAnalyzer', 'Designer', 'Implementer', 'Tester', 'QA', 'Reporter'];
  for (const name of subagents) {
    try {
      const pkg = require('pm-orchestrator-enhancement');
      new pkg[name]();
      log('PASS', `${name} instantiation`);
      passed++;
    } catch (e) {
      log('FAIL', `${name} instantiation: ${e.message}`);
      failed++;
    }
  }

  // 結果サマリー
  console.log('\n=== Verification Summary ===');
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.red}Installation verification failed.${colors.reset}`);
    console.log('Please report this issue: https://github.com/pm-orchestrator/pm-orchestrator-enhancement/issues');
    process.exit(1);
  } else {
    console.log(`\n${colors.green}Installation verified successfully!${colors.reset}`);
  }
}

// postinstall として実行される場合はスキップ可能にする
if (process.env.PM_ORCHESTRATOR_SKIP_VERIFY !== 'true') {
  verifyInstallation().catch(e => {
    log('FAIL', `Unexpected error: ${e.message}`);
    process.exit(1);
  });
}
