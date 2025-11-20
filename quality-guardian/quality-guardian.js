#!/usr/bin/env node

/**
 * Quality Guardian - 統合品質管理システム
 * AIによるコード変更の品質を多角的に検証
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class QualityGuardian {
  constructor(config = {}) {
    this.projectRoot = config.projectRoot || process.cwd();
    this.configFile = path.join(this.projectRoot, '.quality-guardian.json');
    this.baselineFile = path.join(this.projectRoot, '.quality-baseline.json');

    // モジュールを動的にロード
    this.modules = {
      baseline: require('./modules/baseline-monitor'),
      context: require('./modules/context-analyzer'),
      invariant: require('./modules/invariant-checker'),
      deepQuality: require('./modules/deep-quality-analyzer'),
      prReview: require('./modules/pr-reviewer')
    };

    this.loadConfig();
  }

  /**
   * 設定ロード
   */
  loadConfig() {
    if (fs.existsSync(this.configFile)) {
      this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    } else {
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * デフォルト設定
   */
  getDefaultConfig() {
    return {
      version: '1.3.71',
      enabled: true,
      modules: {
        baseline: { enabled: true, threshold: 0.95 },
        context: { enabled: true, strictMode: false },
        invariant: { enabled: true, rules: [] },
        deepQuality: { enabled: true, minScore: 60 },
        prReview: { enabled: true, autoBlock: true }
      },
      rules: {
        migration: {
          allowDeletion: false,
          allowModification: false,
          severity: 'blocker'
        },
        testing: {
          minCoverage: 70,
          maxMockRatio: 0.4,
          requireAssertions: true
        },
        typescript: {
          allowAny: false,
          allowTsIgnore: false,
          strictNullChecks: true
        }
      },
      hooks: {
        preCommit: true,
        prCheck: true,
        ciIntegration: true
      }
    };
  }

  /**
   * メインコマンド: 初期化
   */
  async init() {
    console.log('🚀 Quality Guardian 初期化\n');

    // 設定ファイル作成
    if (!fs.existsSync(this.configFile)) {
      fs.writeFileSync(this.configFile, JSON.stringify(this.getDefaultConfig(), null, 2));
      console.log('✅ 設定ファイル作成: .quality-guardian.json');
    }

    // Git hooks設定
    await this.setupGitHooks();

    // GitHub Actions設定
    await this.setupGitHubActions();

    // package.jsonにスクリプト追加
    await this.updatePackageJson();

    console.log('\n✨ Quality Guardian の初期化が完了しました！');
    console.log('\n使用方法:');
    console.log('  npx quality-guardian baseline  # ベースライン記録');
    console.log('  npx quality-guardian check     # 品質チェック実行');
    console.log('  npx quality-guardian pr        # PR分析');
  }

  /**
   * メインコマンド: ベースライン記録
   */
  async baseline() {
    console.log('📊 ベースライン記録開始...\n');

    const baseline = {
      timestamp: new Date().toISOString(),
      commit: this.getCurrentCommit(),
      metrics: {}
    };

    // 各モジュールでベースライン記録
    if (this.config.modules.baseline.enabled) {
      baseline.metrics.quality = await this.modules.baseline.capture(this.projectRoot);
    }

    if (this.config.modules.invariant.enabled) {
      baseline.metrics.invariants = await this.modules.invariant.capture(this.projectRoot);
    }

    // ベースライン保存
    fs.writeFileSync(this.baselineFile, JSON.stringify(baseline, null, 2));

    console.log('✅ ベースライン記録完了');
    this.outputBaselineSummary(baseline);
  }

  /**
   * メインコマンド: 品質チェック
   */
  async check(options = {}) {
    console.log('🔍 品質チェック開始...\n');

    const results = {
      timestamp: new Date().toISOString(),
      commit: this.getCurrentCommit(),
      checks: {},
      verdict: null
    };

    // 1. ベースライン比較
    if (this.config.modules.baseline.enabled && fs.existsSync(this.baselineFile)) {
      console.log('📈 ベースライン比較...');
      results.checks.baseline = await this.modules.baseline.compare(
        this.projectRoot,
        this.baselineFile
      );
    }

    // 2. 文脈分析
    if (this.config.modules.context.enabled) {
      console.log('🧠 文脈分析...');
      results.checks.context = await this.modules.context.analyze(
        this.projectRoot,
        options.targetBranch || 'main'
      );
    }

    // 3. 不変式チェック
    if (this.config.modules.invariant.enabled) {
      console.log('🔐 不変式チェック...');
      results.checks.invariant = await this.modules.invariant.verify(
        this.projectRoot,
        this.config.rules
      );
    }

    // 4. 深層品質分析
    if (this.config.modules.deepQuality.enabled) {
      console.log('🔬 深層品質分析...');
      results.checks.deepQuality = await this.modules.deepQuality.analyze(
        this.projectRoot
      );
    }

    // 最終判定
    results.verdict = this.judge(results.checks);

    // 結果出力
    this.outputResults(results);

    // CI/CD用の終了コード
    if (results.verdict.status === 'BLOCK') {
      process.exit(1);
    }

    return results;
  }

  /**
   * メインコマンド: PR分析
   */
  async pr(targetBranch = 'main') {
    console.log(`🔍 PR分析 (ベース: ${targetBranch})\n`);

    const analysis = await this.modules.prReview.analyze(
      this.projectRoot,
      targetBranch,
      this.config.rules
    );

    this.outputPRAnalysis(analysis);

    if (analysis.verdict === 'BLOCK' && this.config.modules.prReview.autoBlock) {
      process.exit(1);
    }

    return analysis;
  }

  /**
   * メインコマンド: 修復
   */
  async fix() {
    console.log('🔧 自動修復開始...\n');

    const fixes = [];

    // 型安全性の修復
    if (this.config.rules.typescript.allowAny === false) {
      console.log('📝 any型を unknown に置換...');
      fixes.push(await this.fixAnyTypes());
    }

    // Lintエラーの修復
    console.log('✨ Lintエラー修正...');
    fixes.push(await this.fixLintErrors());

    // テストの改善
    if (this.config.rules.testing.requireAssertions) {
      console.log('🧪 空のテストにアサーション追加...');
      fixes.push(await this.improveTests());
    }

    console.log(`\n✅ ${fixes.filter(f => f.success).length} 個の修正を適用しました`);
  }

  /**
   * Git hooks設定
   */
  async setupGitHooks() {
    const hookPath = path.join(this.projectRoot, '.git/hooks/pre-commit');
    const hookContent = `#!/bin/sh
# Quality Guardian Pre-commit Hook
npx quality-guardian check --quick
`;

    if (!fs.existsSync(hookPath)) {
      fs.writeFileSync(hookPath, hookContent);
      fs.chmodSync(hookPath, '755');
      console.log('✅ Git pre-commit hook 設定完了');
    }
  }

  /**
   * GitHub Actions設定
   */
  async setupGitHubActions() {
    const workflowDir = path.join(this.projectRoot, '.github/workflows');
    const workflowFile = path.join(workflowDir, 'quality-guardian.yml');

    if (!fs.existsSync(workflowFile)) {
      if (!fs.existsSync(workflowDir)) {
        fs.mkdirSync(workflowDir, { recursive: true });
      }

      const workflow = `name: Quality Guardian

on:
  pull_request:
    types: [opened, synchronize]
  push:
    branches: [main, develop]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Quality Guardian
        run: npm install -g quality-guardian

      - name: Run Quality Check
        run: quality-guardian check

      - name: PR Analysis
        if: github.event_name == 'pull_request'
        run: quality-guardian pr \${{ github.base_ref }}
`;

      fs.writeFileSync(workflowFile, workflow);
      console.log('✅ GitHub Actions workflow 設定完了');
    }
  }

  /**
   * package.json更新
   */
  async updatePackageJson() {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      // Quality Guardianスクリプト追加
      const scripts = {
        'quality:baseline': 'quality-guardian baseline',
        'quality:check': 'quality-guardian check',
        'quality:pr': 'quality-guardian pr',
        'quality:fix': 'quality-guardian fix'
      };

      let updated = false;
      for (const [key, value] of Object.entries(scripts)) {
        if (!packageJson.scripts[key]) {
          packageJson.scripts[key] = value;
          updated = true;
        }
      }

      if (updated) {
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log('✅ package.json スクリプト追加完了');
      }
    }
  }

  /**
   * 総合判定
   */
  judge(checks) {
    const verdict = {
      status: 'PASS',
      score: 100,
      issues: [],
      blockers: []
    };

    // 各チェック結果を統合
    for (const [module, result] of Object.entries(checks)) {
      if (result.blockers && result.blockers.length > 0) {
        verdict.blockers.push(...result.blockers);
        verdict.status = 'BLOCK';
      }

      if (result.issues && result.issues.length > 0) {
        verdict.issues.push(...result.issues);
      }

      if (result.score !== undefined) {
        verdict.score = Math.min(verdict.score, result.score);
      }
    }

    // スコアベースの判定
    if (verdict.status !== 'BLOCK') {
      if (verdict.score < 30) {
        verdict.status = 'FAIL';
      } else if (verdict.score < 60) {
        verdict.status = 'WARNING';
      }
    }

    return verdict;
  }

  /**
   * 結果出力
   */
  outputResults(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 品質チェック結果');
    console.log('='.repeat(60));

    const statusEmoji = {
      'PASS': '✅',
      'WARNING': '⚠️',
      'FAIL': '❌',
      'BLOCK': '🚫'
    };

    console.log(`\n判定: ${statusEmoji[results.verdict.status]} ${results.verdict.status}`);
    console.log(`スコア: ${results.verdict.score}/100`);

    if (results.verdict.blockers.length > 0) {
      console.log('\n🚫 ブロッカー:');
      results.verdict.blockers.forEach(b => {
        console.log(`  • ${b.type}: ${b.message}`);
      });
    }

    if (results.verdict.issues.length > 0) {
      console.log('\n⚠️ 問題:');
      results.verdict.issues.slice(0, 10).forEach(i => {
        console.log(`  • ${i.type}: ${i.message}`);
      });
    }

    // 詳細レポート
    if (results.checks.baseline) {
      console.log('\n📈 品質変化:');
      const changes = results.checks.baseline.changes || [];
      changes.forEach(c => {
        const emoji = c.improved ? '📈' : '📉';
        console.log(`  ${emoji} ${c.metric}: ${c.before} → ${c.after}`);
      });
    }

    console.log('='.repeat(60));
  }

  /**
   * PR分析結果出力
   */
  outputPRAnalysis(analysis) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 PR分析結果');
    console.log('='.repeat(60));

    console.log(`\n判定: ${analysis.verdict}`);
    console.log(`信頼度: ${analysis.confidence}%`);

    if (analysis.contradictions && analysis.contradictions.length > 0) {
      console.log('\n❗ 検出された矛盾:');
      analysis.contradictions.forEach(c => {
        console.log(`  • ${c.type}: ${c.explanation}`);
      });
    }

    if (analysis.recommendations && analysis.recommendations.length > 0) {
      console.log('\n💡 推奨事項:');
      analysis.recommendations.forEach(r => {
        console.log(`  • ${r}`);
      });
    }

    console.log('='.repeat(60));
  }

  /**
   * ベースラインサマリー出力
   */
  outputBaselineSummary(baseline) {
    console.log('\n📊 ベースラインサマリー:');

    if (baseline.metrics.quality) {
      const q = baseline.metrics.quality;
      console.log(`  テスト: ${q.totalTests}個 (カバレッジ: ${q.coverage}%)`);
      console.log(`  コード品質: スコア ${q.qualityScore}/100`);
    }

    if (baseline.metrics.invariants) {
      console.log(`  不変式: ${baseline.metrics.invariants.length}個を監視`);
    }
  }

  // ユーティリティメソッド

  getCurrentCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  async fixAnyTypes() {
    try {
      const files = this.findTypeScriptFiles();
      let fixed = 0;

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const newContent = content.replace(/: any/g, ': unknown');

        if (content !== newContent) {
          fs.writeFileSync(file, newContent);
          fixed++;
        }
      }

      return { success: true, count: fixed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async fixLintErrors() {
    try {
      execSync('npm run lint:fix', { cwd: this.projectRoot });
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async improveTests() {
    // テスト改善ロジック（簡略版）
    return { success: true, count: 0 };
  }

  findTypeScriptFiles() {
    const glob = require('glob');
    return glob.sync('**/*.{ts,tsx}', {
      cwd: this.projectRoot,
      ignore: ['node_modules/**', 'dist/**']
    });
  }
}

// CLI実行
if (require.main === module) {
  const guardian = new QualityGuardian();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  const commands = {
    init: () => guardian.init(),
    baseline: () => guardian.baseline(),
    check: () => guardian.check(),
    pr: () => guardian.pr(args[0]),
    fix: () => guardian.fix(),
    help: () => {
      console.log(`
Quality Guardian - AI品質管理システム

使用方法:
  quality-guardian init      # プロジェクト初期化
  quality-guardian baseline  # ベースライン記録
  quality-guardian check     # 品質チェック
  quality-guardian pr [base] # PR分析
  quality-guardian fix       # 自動修復

詳細: https://github.com/quality-guardian/docs
      `);
    }
  };

  const cmd = commands[command] || commands.help;
  cmd().catch(console.error);
}

module.exports = QualityGuardian;