#!/usr/bin/env node

/**
 * 文脈認識型PRアナライザー
 * 「必要な修正」と「破壊的変更」を区別する
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ContextAwareAnalyzer {
  constructor() {
    this.verdict = {
      necessary: [],      // 必要な修正
      destructive: [],    // 破壊的変更
      suspicious: [],     // 疑わしい変更
      justified: [],      // 正当化された変更
    };
  }

  /**
   * PR #985で実際に起きた問題を検出する
   */
  analyzeForRealIssues(targetBranch = 'develop') {
    console.log('🔍 文脈認識型分析開始...\n');

    // 1. Migrationファイル削除の文脈分析
    this.analyzeMigrationContext(targetBranch);

    // 2. テスト改変の文脈分析
    this.analyzeTestContext(targetBranch);

    // 3. 設定ファイル変更の文脈分析
    this.analyzeConfigContext(targetBranch);

    // 4. 機能追加と既存コード変更の関係性分析
    this.analyzeFeatureImpact(targetBranch);

    // 5. 最終判定
    return this.contextualVerdict();
  }

  /**
   * 1. Migration削除の文脈分析
   * 問題: 「MasterMaker機能追加なのになぜMigration履歴を削除？」
   */
  analyzeMigrationContext(targetBranch) {
    const deletedMigrations = this.getDeletedFiles(targetBranch)
      .filter(f => f.includes('migrations/'));

    const addedFeatures = this.getAddedFiles(targetBranch)
      .filter(f => f.includes('mastermaker'));

    if (deletedMigrations.length > 0 && addedFeatures.length > 0) {
      // 新機能追加で既存Migrationを削除は絶対におかしい
      this.verdict.destructive.push({
        type: 'UNJUSTIFIED_MIGRATION_DELETE',
        reason: '新機能追加でMigration履歴を削除する正当な理由がない',
        severity: 'blocker',
        evidence: {
          deleted: deletedMigrations,
          added: addedFeatures.slice(0, 5),
          contradiction: 'Migration履歴は追加されるべきで、削除されるべきではない'
        }
      });
    }

    // Migrationなしでのスキーマ変更チェック
    const schemaChanged = this.hasSchemaChanges(targetBranch);
    const newMigration = this.getAddedFiles(targetBranch)
      .filter(f => f.includes('migrations/') && f.endsWith('.sql'));

    if (schemaChanged && newMigration.length === 0 && deletedMigrations.length > 0) {
      this.verdict.destructive.push({
        type: 'SCHEMA_CHANGE_WITHOUT_MIGRATION',
        reason: 'スキーマ変更があるのに新しいMigrationがなく、既存のものを削除',
        severity: 'blocker'
      });
    }
  }

  /**
   * 2. テスト改変の文脈分析
   * 問題: 「なぜ既存の正常なテストをmockに置き換える？」
   */
  analyzeTestContext(targetBranch) {
    const testDiff = this.getTestDiffs(targetBranch);

    testDiff.forEach(diff => {
      const analysis = this.analyzeTestChange(diff);

      // 実テストからMockへの置換を検出
      if (analysis.realTestRemoved && analysis.mockAdded) {
        // MasterMaker機能と関係ないファイルでの変更は不正
        if (!diff.file.includes('mastermaker')) {
          this.verdict.destructive.push({
            type: 'UNNECESSARY_TEST_DEGRADATION',
            reason: 'MasterMaker機能と無関係なテストをmock化',
            severity: 'high',
            file: diff.file,
            evidence: {
              removedAssertions: analysis.removedAssertions,
              addedMocks: analysis.addedMocks,
              justification: 'なし'
            }
          });
        }
      }

      // テスト削除の正当性チェック
      if (analysis.testDeleted) {
        const relatedCode = this.findRelatedCode(diff.file);
        const codeDeleted = this.isDeleted(relatedCode, targetBranch);

        if (!codeDeleted) {
          this.verdict.destructive.push({
            type: 'TEST_DELETED_BUT_CODE_EXISTS',
            reason: 'コードは存在するのにテストだけ削除',
            severity: 'high',
            test: diff.file,
            code: relatedCode
          });
        }
      }
    });

    // Mock過剰使用の文脈チェック
    const mockStats = this.getMockStatistics(targetBranch);
    if (mockStats.newMocks > 50 && mockStats.removedRealTests > 10) {
      this.verdict.suspicious.push({
        type: 'SYSTEMATIC_TEST_WEAKENING',
        reason: '組織的なテスト品質低下の兆候',
        stats: mockStats,
        recommendation: '実際の動作を検証するテストを維持すべき'
      });
    }
  }

  /**
   * 3. 設定ファイル変更の文脈分析
   * 問題: 「MasterMaker追加でなぜ全体の設定を変える？」
   */
  analyzeConfigContext(targetBranch) {
    const configChanges = this.getConfigChanges(targetBranch);

    configChanges.forEach(change => {
      // 変更内容と機能追加の関連性を評価
      const relevance = this.assessRelevance(change, 'mastermaker');

      if (relevance < 0.3) {  // 関連性が低い
        // package.jsonのscripts変更
        if (change.file === 'package.json') {
          const diff = this.getFileDiff(targetBranch, change.file);

          // 既存スクリプトの削除・変更
          if (diff.includes('- ') && diff.includes('"scripts"')) {
            this.verdict.destructive.push({
              type: 'UNRELATED_SCRIPT_MODIFICATION',
              reason: 'MasterMaker機能と無関係な既存スクリプトの変更',
              severity: 'medium',
              file: change.file,
              recommendation: '新機能用のスクリプトは追加のみにすべき'
            });
          }
        }

        // Docker設定の重複
        if (change.type === 'added' && change.file === 'docker-compose.yml') {
          if (fs.existsSync('compose.yml')) {
            this.verdict.destructive.push({
              type: 'DOCKER_CONFIG_DUPLICATION',
              reason: '既存のcompose.ymlがあるのにdocker-compose.ymlを追加',
              severity: 'high',
              conflict: '設定の競合と混乱を引き起こす'
            });
          }
        }

        // biome.json等のリンター設定変更
        if (change.file.includes('biome.json') || change.file.includes('eslint')) {
          const diff = this.getFileDiff(targetBranch, change.file);

          // ルールの無効化を検出
          if (diff.includes('"off"') || diff.includes('false') || diff.includes('ignore')) {
            this.verdict.suspicious.push({
              type: 'LINTER_RULES_WEAKENED',
              reason: 'リンタールールの無効化/緩和',
              file: change.file,
              impact: 'コード品質チェックの弱体化'
            });
          }
        }
      }
    });
  }

  /**
   * 4. 機能追加と既存コード変更の関係性分析
   * 核心的な問題: 「新機能追加が既存機能を壊す理由がない」
   */
  analyzeFeatureImpact(targetBranch) {
    // MasterMaker関連ファイル
    const featureFiles = this.getChangedFiles(targetBranch)
      .filter(f => f.includes('mastermaker'));

    // 非MasterMaker関連の変更
    const coreChanges = this.getChangedFiles(targetBranch)
      .filter(f => !f.includes('mastermaker') && !f.includes('test'));

    // 各コア変更の正当性を評価
    coreChanges.forEach(file => {
      const justification = this.findJustification(file, featureFiles);

      if (!justification) {
        // 型定義ファイルの変更
        if (file.includes('.d.ts') || file.includes('types')) {
          const diff = this.getFileDiff(targetBranch, file);

          // anyの導入
          if (diff.includes('+ ') && diff.includes(': any')) {
            this.verdict.destructive.push({
              type: 'TYPE_SAFETY_DEGRADATION',
              reason: '型安全性の低下（any型の導入）',
              file: file,
              severity: 'medium',
              justification: 'MasterMaker機能追加で型安全性を犠牲にする理由なし'
            });
          }
        }

        // 既存コンポーネントの変更
        if (file.includes('components/') && !file.includes('mastermaker')) {
          this.verdict.suspicious.push({
            type: 'UNRELATED_COMPONENT_CHANGE',
            reason: 'MasterMaker機能と無関係なコンポーネント変更',
            file: file,
            question: 'なぜこの変更が必要？'
          });
        }
      } else {
        this.verdict.justified.push({
          file: file,
          reason: justification
        });
      }
    });

    // 削除ファイルの正当性チェック
    const deletedFiles = this.getDeletedFiles(targetBranch);
    deletedFiles.forEach(file => {
      // MasterMakerと無関係なファイルの削除
      if (!file.includes('mastermaker')) {
        const dependents = this.findDependents(file);

        if (dependents.length > 0) {
          this.verdict.destructive.push({
            type: 'BREAKING_DELETION',
            reason: '依存されているファイルの削除',
            file: file,
            dependents: dependents,
            severity: 'blocker'
          });
        }
      }
    });
  }

  /**
   * 5. 文脈を考慮した最終判定
   */
  contextualVerdict() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 文脈認識型分析結果');
    console.log('='.repeat(60));

    // 破壊的変更の表示
    if (this.verdict.destructive.length > 0) {
      console.log('\n🚨 破壊的変更（正当化されない）:');
      this.verdict.destructive.forEach(item => {
        console.log(`\n  [${item.severity.toUpperCase()}] ${item.type}`);
        console.log(`  理由: ${item.reason}`);
        if (item.evidence) {
          console.log(`  証拠:`, item.evidence);
        }
      });
    }

    // 疑わしい変更
    if (this.verdict.suspicious.length > 0) {
      console.log('\n⚠️ 疑わしい変更:');
      this.verdict.suspicious.forEach(item => {
        console.log(`  • ${item.type}: ${item.reason}`);
      });
    }

    // 正当化された変更
    if (this.verdict.justified.length > 0) {
      console.log('\n✅ 正当化された変更: ${this.verdict.justified.length}件');
    }

    // 判定ロジック
    const blockers = this.verdict.destructive.filter(d => d.severity === 'blocker');
    const highRisk = this.verdict.destructive.filter(d => d.severity === 'high');

    let decision;
    let explanation;

    if (blockers.length > 0) {
      decision = '🚫 マージ禁止';
      explanation = `既存機能を破壊する正当化されない変更があります。特にMigration削除は致命的です。`;
    } else if (highRisk.length > 3) {
      decision = '❌ 却下推奨';
      explanation = '多数の不必要な破壊的変更が含まれています。';
    } else if (this.verdict.suspicious.length > 5) {
      decision = '🔍 詳細レビュー必要';
      explanation = '変更の必要性が不明確な箇所が多数あります。';
    } else {
      decision = '✅ マージ可能';
      explanation = '問題となる変更は検出されませんでした。';
    }

    console.log(`\n📊 判定: ${decision}`);
    console.log(`💭 説明: ${explanation}`);

    // 核心的な問題の指摘
    if (blockers.length > 0) {
      console.log('\n❗ 核心的な問題:');
      console.log('  MasterMaker機能を追加するだけなのに、なぜ：');
      console.log('  • Migration履歴を削除する必要があるのか？');
      console.log('  • 既存の正常なテストをmock化する必要があるのか？');
      console.log('  • 無関係な設定ファイルを変更する必要があるのか？');
      console.log('\n  これらの変更に正当な理由がありません。');
    }

    console.log('='.repeat(60));

    return {
      decision,
      destructive: this.verdict.destructive.length,
      suspicious: this.verdict.suspicious.length,
      justified: this.verdict.justified.length,
      canMerge: blockers.length === 0 && highRisk.length < 2
    };
  }

  // === ヘルパーメソッド ===

  getDeletedFiles(targetBranch) {
    try {
      return execSync(`git diff ${targetBranch}...HEAD --diff-filter=D --name-only`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  getAddedFiles(targetBranch) {
    try {
      return execSync(`git diff ${targetBranch}...HEAD --diff-filter=A --name-only`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  getChangedFiles(targetBranch) {
    try {
      return execSync(`git diff ${targetBranch}...HEAD --name-only`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  getFileDiff(targetBranch, file) {
    try {
      return execSync(`git diff ${targetBranch}...HEAD -- "${file}"`, { encoding: 'utf8' });
    } catch {
      return '';
    }
  }

  hasSchemaChanges(targetBranch) {
    const diff = this.getFileDiff(targetBranch, '**/schema.prisma');
    return diff.includes('model ') || diff.includes('enum ');
  }

  getTestDiffs(targetBranch) {
    const testFiles = this.getChangedFiles(targetBranch)
      .filter(f => f.includes('.test.') || f.includes('.spec.'));

    return testFiles.map(file => ({
      file,
      diff: this.getFileDiff(targetBranch, file)
    }));
  }

  analyzeTestChange(diff) {
    const result = {
      realTestRemoved: false,
      mockAdded: false,
      testDeleted: false,
      removedAssertions: 0,
      addedMocks: 0
    };

    // 削除された実テスト
    const removedExpects = (diff.diff.match(/-.*expect\(/g) || []).length;
    const removedIts = (diff.diff.match(/-.*it\(/g) || []).length;
    result.removedAssertions = removedExpects + removedIts;
    result.realTestRemoved = result.removedAssertions > 3;

    // 追加されたmock
    const addedMocks = (diff.diff.match(/\+.*mock/gi) || []).length;
    result.addedMocks = addedMocks;
    result.mockAdded = addedMocks > 3;

    // ファイル自体が削除
    result.testDeleted = diff.diff.includes('deleted file mode');

    return result;
  }

  findRelatedCode(testFile) {
    // テストファイルから対応するコードファイルを推定
    return testFile
      .replace('.test.', '.')
      .replace('.spec.', '.')
      .replace('__tests__/', '')
      .replace('/tests/', '/');
  }

  isDeleted(file, targetBranch) {
    const deleted = this.getDeletedFiles(targetBranch);
    return deleted.includes(file);
  }

  getMockStatistics(targetBranch) {
    const testDiffs = this.getTestDiffs(targetBranch);
    let newMocks = 0;
    let removedRealTests = 0;

    testDiffs.forEach(diff => {
      const analysis = this.analyzeTestChange(diff);
      newMocks += analysis.addedMocks;
      removedRealTests += analysis.removedAssertions;
    });

    return { newMocks, removedRealTests };
  }

  getConfigChanges(targetBranch) {
    const configs = [
      'package.json', 'tsconfig.json', 'biome.json',
      '.eslintrc', 'webpack.config', 'vite.config',
      'docker-compose.yml', 'compose.yml'
    ];

    const changes = [];
    configs.forEach(config => {
      const added = this.getAddedFiles(targetBranch).filter(f => f.includes(config));
      const modified = this.getChangedFiles(targetBranch).filter(f => f.includes(config));

      added.forEach(f => changes.push({ file: f, type: 'added' }));
      modified.forEach(f => changes.push({ file: f, type: 'modified' }));
    });

    return changes;
  }

  assessRelevance(change, feature) {
    // ファイル名に機能名が含まれているか
    if (change.file.includes(feature)) return 1.0;

    // 差分に機能名が含まれているか
    const diff = this.getFileDiff('develop', change.file);
    const mentions = (diff.match(new RegExp(feature, 'gi')) || []).length;

    // 言及回数に基づく関連性スコア
    return Math.min(mentions / 10, 1.0);
  }

  findJustification(file, featureFiles) {
    // 共通モジュールの更新
    if (file.includes('shared/') || file.includes('common/')) {
      // featureFilesがこのファイルをimportしているか
      for (const ff of featureFiles) {
        if (this.imports(ff, file)) {
          return `MasterMaker機能が${file}を使用するため`;
        }
      }
    }

    // 型定義の拡張
    if (file.includes('types/') && file.endsWith('.d.ts')) {
      const diff = this.getFileDiff('develop', file);
      if (diff.includes('+ ') && !diff.includes(': any')) {
        return '新機能用の型定義追加';
      }
    }

    return null;
  }

  imports(sourceFile, targetFile) {
    if (!fs.existsSync(sourceFile)) return false;
    const content = fs.readFileSync(sourceFile, 'utf8');
    const targetName = path.basename(targetFile, path.extname(targetFile));
    return content.includes(targetName);
  }

  findDependents(file) {
    // 簡易的な依存検索
    try {
      const basename = path.basename(file, path.extname(file));
      const grep = execSync(
        `grep -r "${basename}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" | head -20`,
        { encoding: 'utf8', cwd: process.cwd() }
      );
      return grep.split('\n').filter(Boolean).map(line => line.split(':')[0]);
    } catch {
      return [];
    }
  }
}

// 実行
if (require.main === module) {
  const analyzer = new ContextAwareAnalyzer();
  analyzer.analyzeForRealIssues(process.argv[2] || 'develop');
}

module.exports = ContextAwareAnalyzer;