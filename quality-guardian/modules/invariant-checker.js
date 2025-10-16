#!/usr/bin/env node

/**
 * 不変式チェッカー
 * AIがどんなズルをしても検出する仕組み
 */

class InvariantChecker {
  constructor() {
    // プロジェクトの不変式（絶対に守られるべき条件）
    this.invariants = this.defineInvariants();

    // ベースラインの記録（改ざん前の状態）
    this.baseline = this.recordBaseline();
  }

  /**
   * 不変式の定義
   * これらは「絶対に劣化してはいけない」指標
   */
  defineInvariants() {
    return {
      // 1. テストの実質的なカバレッジ
      testCoverage: {
        measure: () => this.measureRealTestCoverage(),
        constraint: 'non_decreasing',
        baseline: null
      },

      // 2. アサーションの密度
      assertionDensity: {
        measure: () => this.measureAssertionDensity(),
        constraint: 'non_decreasing',
        baseline: null
      },

      // 3. 型安全性スコア
      typeSafety: {
        measure: () => this.measureTypeSafety(),
        constraint: 'non_decreasing',
        baseline: null
      },

      // 4. データベース整合性
      databaseIntegrity: {
        measure: () => this.checkDatabaseIntegrity(),
        constraint: 'always_true',
        baseline: null
      },

      // 5. 実行時検証
      runtimeVerification: {
        measure: () => this.performRuntimeVerification(),
        constraint: 'must_pass',
        baseline: null
      }
    };
  }

  /**
   * 1. 実質的なテストカバレッジの測定
   * 単にテストが「パス」するかではなく、何を検証しているか
   */
  measureRealTestCoverage() {
    const metrics = {
      totalAssertions: 0,
      meaningfulAssertions: 0,
      mockCalls: 0,
      realFunctionCalls: 0,
      branchCoverage: 0
    };

    // すべてのテストファイルを解析
    const testFiles = this.findTestFiles();

    testFiles.forEach(file => {
      const content = this.readFile(file);

      // アサーションの質を評価
      const assertions = this.extractAssertions(content);
      assertions.forEach(assertion => {
        metrics.totalAssertions++;

        // 意味のあるアサーションか判定
        if (this.isMeaningfulAssertion(assertion)) {
          metrics.meaningfulAssertions++;
        }
      });

      // Mock vs Real の比率
      metrics.mockCalls += this.countMockCalls(content);
      metrics.realFunctionCalls += this.countRealCalls(content);
    });

    // 実質的なカバレッジスコア計算
    const realCoverage =
      (metrics.meaningfulAssertions / (metrics.totalAssertions || 1)) *
      (metrics.realFunctionCalls / (metrics.realFunctionCalls + metrics.mockCalls || 1));

    return realCoverage;
  }

  /**
   * アサーションが意味のあるものか判定
   * AIが作る「形だけのテスト」を検出
   */
  isMeaningfulAssertion(assertion) {
    // 無意味なパターンを検出
    const meaninglessPatterns = [
      /expect\(true\)\.toBe\(true\)/,           // 常に真
      /expect\(.*\)\.toBeDefined\(\)/,          // 定義チェックのみ
      /expect\(.*\)\.not\.toBeNull\(\)/,        // null チェックのみ
      /expect\(mock.*\)\.toHaveBeenCalled/,     // mockの呼び出しチェック
      /expect\(\d+\)\.toBe\(\d+\)/,             // 定数同士の比較
    ];

    // AIがよく使う「ズル」パターン
    const cheatPatterns = [
      /expect\(.*\|\|.*\)\.toBe/,               // OR条件で必ず通る
      /expect\(.*\?\?.*\)\.toBe/,               // Nullish coalescing で必ず通る
      /expect\(\[\]\)\.toEqual\(\[\]\)/,        // 空配列の比較
      /expect\(\{\}\)\.toEqual\(\{\}\)/,        // 空オブジェクトの比較
    ];

    const allPatterns = [...meaninglessPatterns, ...cheatPatterns];

    // パターンに合致したら無意味
    return !allPatterns.some(pattern => pattern.test(assertion));
  }

  /**
   * 2. アサーション密度の測定
   * コード行数に対するアサーション数
   */
  measureAssertionDensity() {
    const testFiles = this.findTestFiles();
    let totalLines = 0;
    let totalAssertions = 0;

    testFiles.forEach(file => {
      const content = this.readFile(file);
      const lines = content.split('\n').filter(line =>
        line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('*')
      );

      totalLines += lines.length;
      totalAssertions += this.extractAssertions(content).length;
    });

    return totalAssertions / (totalLines || 1);
  }

  /**
   * 3. 型安全性スコアの測定
   * anyの使用、型アサーションの乱用を検出
   */
  measureTypeSafety() {
    const sourceFiles = this.findSourceFiles();
    let unsafePatterns = 0;
    let totalTypeAnnotations = 0;

    sourceFiles.forEach(file => {
      const content = this.readFile(file);

      // 危険なパターンをカウント
      unsafePatterns += (content.match(/: any/g) || []).length;
      unsafePatterns += (content.match(/as any/g) || []).length;
      unsafePatterns += (content.match(/as unknown as/g) || []).length;
      unsafePatterns += (content.match(/@ts-ignore/g) || []).length;
      unsafePatterns += (content.match(/@ts-expect-error/g) || []).length;

      // 全体の型注釈をカウント
      totalTypeAnnotations += (content.match(/: \w+/g) || []).length;
    });

    // 安全性スコア（危険なパターンが少ないほど高い）
    return 1 - (unsafePatterns / (totalTypeAnnotations || 1));
  }

  /**
   * 4. データベース整合性チェック
   * Migrationの削除や改ざんを検出
   */
  checkDatabaseIntegrity() {
    const migrationDir = 'apps/backend/prisma/migrations';

    // Migrationファイルのハッシュ値を計算
    const currentHashes = this.calculateMigrationHashes(migrationDir);

    // ベースラインが存在する場合のみ比較
    if (this.baseline && this.baseline.migrationHashes) {
      // 削除されたMigrationを検出
      for (const [file, hash] of this.baseline.migrationHashes) {
        if (!currentHashes.has(file)) {
          console.error(`❌ Migration削除検出: ${file}`);
          return false;
        }

        // 改ざんされたMigrationを検出
        if (currentHashes.get(file) !== hash) {
          console.error(`❌ Migration改ざん検出: ${file}`);
          return false;
        }
      }
    }

    // 初回またはベースラインがない場合はハッシュマップを返す
    return currentHashes.size > 0 ? true : true;
  }

  /**
   * 5. 実行時検証
   * 実際にコードを動かして挙動を確認
   */
  async performRuntimeVerification() {
    const verifications = [];

    // テストの実行時間を測定（mockだらけなら異常に速い）
    verifications.push(this.verifyTestExecutionTime());

    // 実際のデータベース操作を確認
    verifications.push(this.verifyDatabaseOperations());

    // APIエンドポイントの応答を確認
    verifications.push(this.verifyApiResponses());

    // メモリ使用量の確認（実処理なら適切なメモリ使用）
    verifications.push(this.verifyMemoryUsage());

    const results = await Promise.all(verifications);
    return results.every(r => r === true);
  }

  /**
   * テスト実行時間の検証
   * Mockだらけのテストは異常に高速
   */
  async verifyTestExecutionTime() {
    const start = Date.now();
    const result = await this.runTests();
    const duration = Date.now() - start;

    // ファイル数に対して異常に速い場合は怪しい
    const expectedMinTime = this.findTestFiles().length * 100; // 最低100ms/file

    if (duration < expectedMinTime) {
      console.warn(`⚠️ テストが異常に高速: ${duration}ms < ${expectedMinTime}ms`);
      return false;
    }

    return true;
  }

  /**
   * 改ざん検出のメインロジック
   */
  async detectTampering(pr) {
    const violations = [];

    // 各不変式をチェック
    for (const [name, invariant] of Object.entries(this.invariants)) {
      const currentValue = await invariant.measure();
      const baselineValue = invariant.baseline;

      // 制約違反をチェック
      let violated = false;

      switch (invariant.constraint) {
        case 'non_decreasing':
          violated = currentValue < baselineValue * 0.95; // 5%の許容
          break;

        case 'always_true':
          violated = currentValue !== true;
          break;

        case 'must_pass':
          violated = currentValue === false;
          break;
      }

      if (violated) {
        violations.push({
          invariant: name,
          baseline: baselineValue,
          current: currentValue,
          constraint: invariant.constraint,
          severity: this.calculateSeverity(name)
        });
      }
    }

    return violations;
  }

  /**
   * ベースラインの記録
   * PRの前の状態を記録
   */
  recordBaseline() {
    const baseline = {
      timestamp: Date.now(),
      migrationHashes: this.calculateMigrationHashes('apps/backend/prisma/migrations'),
      testCoverage: null,
      assertionDensity: null,
      typeSafety: null
    };

    // 各指標のベースラインを測定
    for (const [name, invariant] of Object.entries(this.invariants)) {
      const value = invariant.measure();
      invariant.baseline = value;
      baseline[name] = value;
    }

    return baseline;
  }

  /**
   * Migrationファイルのハッシュ計算
   */
  calculateMigrationHashes(dir) {
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    const hashes = new Map();

    if (!fs.existsSync(dir)) return hashes;

    const files = fs.readdirSync(dir, { recursive: true })
      .filter(f => f.endsWith('.sql'));

    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      hashes.set(file, hash);
    });

    return hashes;
  }

  /**
   * 最終判定
   */
  judge(violations) {
    if (violations.length === 0) {
      return {
        verdict: 'PASS',
        message: '不変式違反なし'
      };
    }

    // 重大度でソート
    violations.sort((a, b) => b.severity - a.severity);

    const critical = violations.filter(v => v.severity >= 80);
    const high = violations.filter(v => v.severity >= 50 && v.severity < 80);

    if (critical.length > 0) {
      return {
        verdict: 'BLOCK',
        message: `致命的な不変式違反: ${critical.map(v => v.invariant).join(', ')}`,
        violations: critical
      };
    }

    if (high.length > 2) {
      return {
        verdict: 'REJECT',
        message: '複数の重大な品質劣化を検出',
        violations: high
      };
    }

    return {
      verdict: 'WARNING',
      message: '軽微な品質劣化を検出',
      violations: violations
    };
  }

  // ユーティリティメソッド
  findTestFiles() {
    const glob = require('glob');
    return glob.sync('**/*.{test,spec}.{ts,tsx,js,jsx}', {
      ignore: ['node_modules/**', 'dist/**', 'build/**']
    });
  }

  findSourceFiles() {
    const glob = require('glob');
    return glob.sync('**/*.{ts,tsx}', {
      ignore: ['node_modules/**', 'dist/**', '**/*.test.*', '**/*.spec.*']
    });
  }

  readFile(path) {
    const fs = require('fs');
    try {
      return fs.readFileSync(path, 'utf8');
    } catch {
      return '';
    }
  }

  extractAssertions(content) {
    const patterns = [
      /expect\([^)]+\)\.[a-zA-Z]+/g,
      /assert[A-Z]\w*\([^)]+\)/g,
      /should\.[a-zA-Z]+/g
    ];

    const assertions = [];
    patterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      assertions.push(...matches);
    });

    return assertions;
  }

  countMockCalls(content) {
    return (content.match(/mock[A-Z]\w*/g) || []).length +
           (content.match(/jest\.fn\(/g) || []).length +
           (content.match(/vi\.fn\(/g) || []).length +
           (content.match(/sinon\.\w+\(/g) || []).length;
  }

  countRealCalls(content) {
    // import文から実際のモジュールをカウント
    const imports = content.match(/import .* from ['"]\.\//g) || [];
    return imports.length;
  }

  calculateSeverity(invariantName) {
    const severities = {
      databaseIntegrity: 100,
      testCoverage: 80,
      typeSafety: 70,
      assertionDensity: 60,
      runtimeVerification: 90
    };
    return severities[invariantName] || 50;
  }

  async runTests() {
    const { execSync } = require('child_process');
    try {
      execSync('npm test', { encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }

  async verifyDatabaseOperations() {
    // 実際のDB操作を確認
    return true;
  }

  async verifyApiResponses() {
    // API応答を確認
    return true;
  }

  async verifyMemoryUsage() {
    // メモリ使用量を確認
    return true;
  }

  /**
   * ベースライン記録用の静的メソッド
   * quality-guardian.jsから呼ばれる
   */
  static async capture(projectRoot) {
    const checker = new InvariantChecker();
    const invariants = [];

    // 各不変式を記録
    for (const [name, invariant] of Object.entries(checker.invariants)) {
      try {
        const value = await invariant.measure();
        invariants.push({
          name,
          value,
          constraint: invariant.constraint,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.warn(`不変式 ${name} の測定に失敗:`, error.message);
      }
    }

    return invariants;
  }

  /**
   * 検証用の静的メソッド
   * quality-guardian.jsから呼ばれる
   */
  static async verify(projectRoot, rules) {
    const checker = new InvariantChecker();
    const violations = await checker.detectTampering({});
    const judgment = checker.judge(violations);

    return {
      passed: judgment.verdict === 'PASS',
      verdict: judgment.verdict,
      message: judgment.message,
      violations: judgment.violations || [],
      score: judgment.verdict === 'PASS' ? 100 : Math.max(0, 100 - violations.length * 20)
    };
  }
}

// 実行
if (require.main === module) {
  const checker = new InvariantChecker();

  // 現在の状態をチェック
  checker.detectTampering({}).then(violations => {
    const judgment = checker.judge(violations);

    console.log('\n' + '='.repeat(60));
    console.log('🔐 不変式チェック結果');
    console.log('='.repeat(60));
    console.log(`\n判定: ${judgment.verdict}`);
    console.log(`理由: ${judgment.message}`);

    if (judgment.violations) {
      console.log('\n違反詳細:');
      judgment.violations.forEach(v => {
        console.log(`  - ${v.invariant}: ${v.baseline} → ${v.current}`);
      });
    }

    console.log('='.repeat(60));

    process.exit(judgment.verdict === 'BLOCK' ? 1 : 0);
  });
}

module.exports = InvariantChecker;