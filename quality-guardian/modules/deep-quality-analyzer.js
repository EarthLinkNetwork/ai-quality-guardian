#!/usr/bin/env node

/**
 * 深層品質分析システム
 * テストの「中身」を検証し、形だけのテストを検出
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class DeepQualityAnalyzer {
  constructor() {
    this.testExecutionTraces = new Map();
    this.codeExecutionPaths = new Map();
    this.mutationResults = new Map();
  }

  /**
   * テストの実質的な品質を多角的に検証
   */
  async analyzeTestQuality(testFile) {
    console.log(`🔬 深層品質分析: ${testFile}\n`);

    const quality = {
      // 1. 実行パス網羅性
      pathCoverage: await this.analyzePathCoverage(testFile),

      // 2. アサーションの強度
      assertionStrength: await this.analyzeAssertionStrength(testFile),

      // 3. ミューテーションテスト
      mutationSurvival: await this.performMutationTesting(testFile),

      // 4. データ多様性
      dataVariety: await this.analyzeDataVariety(testFile),

      // 5. 副作用検証
      sideEffectVerification: await this.analyzeSideEffects(testFile),

      // 6. エラーケース網羅
      errorHandling: await this.analyzeErrorHandling(testFile)
    };

    return this.calculateQualityScore(quality);
  }

  /**
   * 1. 実行パス網羅性分析
   * 単にテストが通るだけでなく、コードの分岐を実際に通っているか
   */
  async analyzePathCoverage(testFile) {
    const analysis = {
      totalPaths: 0,
      coveredPaths: 0,
      deadPaths: [],
      superficialPaths: []
    };

    // テスト対象のソースファイルを特定
    const sourceFile = this.findSourceFile(testFile);
    if (!sourceFile) return analysis;

    // ソースコードの制御フローグラフを構築
    const cfg = this.buildControlFlowGraph(sourceFile);
    analysis.totalPaths = cfg.paths.length;

    // テスト実行時のトレースを取得
    const traces = await this.traceTestExecution(testFile);

    // 各パスが実際に実行されたか確認
    cfg.paths.forEach(path => {
      const executed = traces.some(trace =>
        this.pathMatches(path, trace)
      );

      if (executed) {
        analysis.coveredPaths++;

        // 表面的な実行（すぐreturnなど）を検出
        if (this.isSuperficialExecution(path, traces)) {
          analysis.superficialPaths.push(path);
        }
      } else {
        analysis.deadPaths.push(path);
      }
    });

    return analysis;
  }

  /**
   * 2. アサーションの強度分析
   * 「意味のある」検証をしているか
   */
  async analyzeAssertionStrength(testFile) {
    const content = fs.readFileSync(testFile, 'utf8');
    const analysis = {
      totalAssertions: 0,
      strongAssertions: 0,
      weakAssertions: 0,
      tautologies: 0,
      patterns: []
    };

    // アサーションを抽出して分析
    const assertions = this.extractAssertions(content);

    for (const assertion of assertions) {
      analysis.totalAssertions++;

      const strength = this.evaluateAssertionStrength(assertion);

      if (strength.isTautology) {
        analysis.tautologies++;
        analysis.patterns.push({
          type: 'TAUTOLOGY',
          assertion: assertion.code,
          reason: strength.reason
        });
      } else if (strength.score < 0.3) {
        analysis.weakAssertions++;
        analysis.patterns.push({
          type: 'WEAK',
          assertion: assertion.code,
          reason: strength.reason
        });
      } else if (strength.score > 0.7) {
        analysis.strongAssertions++;
      }
    }

    return analysis;
  }

  /**
   * アサーションの強度を評価
   */
  evaluateAssertionStrength(assertion) {
    const code = assertion.code;
    let score = 1.0;
    let reason = '';

    // トートロジー（常に真）の検出
    const tautologies = [
      { pattern: /expect\(true\)\.toBe\(true\)/, reason: '定数同士の比較' },
      { pattern: /expect\(1\)\.toBe\(1\)/, reason: '同一値の比較' },
      { pattern: /expect\(x\)\.toBe\(x\)/, reason: '同一変数の比較' },
      { pattern: /expect\(\[\]\)\.toEqual\(\[\]\)/, reason: '空配列の比較' },
      { pattern: /expect\(\{\}\)\.toEqual\(\{\}\)/, reason: '空オブジェクトの比較' }
    ];

    for (const t of tautologies) {
      if (t.pattern.test(code)) {
        return { isTautology: true, score: 0, reason: t.reason };
      }
    }

    // 弱いアサーションパターン
    const weakPatterns = [
      { pattern: /\.toBeDefined\(\)/, penalty: 0.7, reason: '存在確認のみ' },
      { pattern: /\.toBeTruthy\(\)/, penalty: 0.6, reason: '真偽値確認のみ' },
      { pattern: /\.not\.toBeNull\(\)/, penalty: 0.7, reason: 'null確認のみ' },
      { pattern: /\.toHaveBeenCalled\(\)/, penalty: 0.5, reason: '呼び出し確認のみ' },
      { pattern: /\.length\)\.toBe\(0\)/, penalty: 0.5, reason: '空確認のみ' }
    ];

    for (const wp of weakPatterns) {
      if (wp.pattern.test(code)) {
        score *= wp.penalty;
        reason = wp.reason;
      }
    }

    // 強いアサーションパターン
    const strongPatterns = [
      { pattern: /toMatchObject\(.*\{.*:.*\}/, bonus: 1.3, reason: '構造検証' },
      { pattern: /toThrow\(.*Error/, bonus: 1.2, reason: 'エラー検証' },
      { pattern: /toHaveBeenCalledWith\(.+\)/, bonus: 1.2, reason: '引数検証' },
      { pattern: /toMatchSnapshot\(\)/, bonus: 1.1, reason: 'スナップショット' }
    ];

    for (const sp of strongPatterns) {
      if (sp.pattern.test(code)) {
        score *= sp.bonus;
        reason = sp.reason;
      }
    }

    return { isTautology: false, score: Math.min(1, score), reason };
  }

  /**
   * 3. ミューテーションテスティング
   * コードを変更してもテストが失敗するか
   */
  async performMutationTesting(testFile) {
    const sourceFile = this.findSourceFile(testFile);
    if (!sourceFile) return { score: 0 };

    const mutations = [];
    const content = fs.readFileSync(sourceFile, 'utf8');

    // ミューテーション生成
    const mutants = [
      // 条件反転
      { pattern: /===/, replacement: '!==', type: 'CONDITION_FLIP' },
      { pattern: />/, replacement: '<=', type: 'COMPARISON_FLIP' },
      { pattern: /</, replacement: '>=', type: 'COMPARISON_FLIP' },

      // 返り値変更
      { pattern: /return true/, replacement: 'return false', type: 'RETURN_FLIP' },
      { pattern: /return (\w+)/, replacement: 'return null', type: 'RETURN_NULL' },

      // 演算子変更
      { pattern: /\+/, replacement: '-', type: 'OPERATOR_FLIP' },
      { pattern: /\*/, replacement: '/', type: 'OPERATOR_FLIP' },

      // 境界値変更
      { pattern: /(\d+)/, replacement: (m) => String(parseInt(m) + 1), type: 'BOUNDARY_SHIFT' }
    ];

    // 各ミュータントでテストを実行
    for (const mutant of mutants) {
      const mutatedContent = content.replace(mutant.pattern, mutant.replacement);

      // 一時的にファイルを書き換え
      const backupContent = fs.readFileSync(sourceFile, 'utf8');
      fs.writeFileSync(sourceFile, mutatedContent);

      try {
        // テスト実行
        const testPassed = await this.runTest(testFile);

        mutations.push({
          type: mutant.type,
          killed: !testPassed,  // テストが失敗 = ミュータント殺傷成功
          survived: testPassed   // テストが成功 = ミュータント生存（問題）
        });
      } finally {
        // ファイルを復元
        fs.writeFileSync(sourceFile, backupContent);
      }
    }

    // ミューテーションスコア計算
    const killed = mutations.filter(m => m.killed).length;
    const total = mutations.length;

    return {
      score: total > 0 ? killed / total : 0,
      killed,
      survived: total - killed,
      mutations
    };
  }

  /**
   * 4. データ多様性分析
   * 様々なケースでテストしているか
   */
  async analyzeDataVariety(testFile) {
    const content = fs.readFileSync(testFile, 'utf8');
    const analysis = {
      uniqueValues: new Set(),
      edgeCases: 0,
      randomData: 0,
      hardcodedData: 0,
      dataPatterns: []
    };

    // テストデータを抽出
    const testData = this.extractTestData(content);

    testData.forEach(data => {
      // ユニーク性
      const serialized = JSON.stringify(data.value);
      analysis.uniqueValues.add(serialized);

      // エッジケース検出
      if (this.isEdgeCase(data.value)) {
        analysis.edgeCases++;
        analysis.dataPatterns.push({
          type: 'EDGE_CASE',
          value: data.value
        });
      }

      // ランダムデータ検出
      if (this.isRandomData(data.code)) {
        analysis.randomData++;
      }

      // ハードコードデータ検出
      if (this.isHardcoded(data.code)) {
        analysis.hardcodedData++;
        analysis.dataPatterns.push({
          type: 'HARDCODED',
          value: data.value
        });
      }
    });

    // 多様性スコア計算
    const varietyScore =
      (analysis.uniqueValues.size / testData.length) * 0.4 +
      (analysis.edgeCases / testData.length) * 0.3 +
      (analysis.randomData / testData.length) * 0.3;

    return {
      ...analysis,
      varietyScore
    };
  }

  /**
   * 5. 副作用検証分析
   * 状態変化を適切に検証しているか
   */
  async analyzeSideEffects(testFile) {
    const content = fs.readFileSync(testFile, 'utf8');
    const analysis = {
      stateVerifications: 0,
      dbVerifications: 0,
      apiVerifications: 0,
      unverifiedCalls: [],
      patterns: []
    };

    // 副作用を起こす操作を検出
    const sideEffectOps = this.extractSideEffectOperations(content);

    sideEffectOps.forEach(op => {
      // 対応する検証があるか確認
      const hasVerification = this.findVerification(op, content);

      if (hasVerification) {
        switch (op.type) {
          case 'STATE_CHANGE':
            analysis.stateVerifications++;
            break;
          case 'DB_OPERATION':
            analysis.dbVerifications++;
            break;
          case 'API_CALL':
            analysis.apiVerifications++;
            break;
        }
      } else {
        analysis.unverifiedCalls.push({
          operation: op.code,
          type: op.type,
          line: op.line
        });
      }
    });

    return analysis;
  }

  /**
   * 6. エラーハンドリング検証
   * エラーケースを適切にテストしているか
   */
  async analyzeErrorHandling(testFile) {
    const content = fs.readFileSync(testFile, 'utf8');
    const analysis = {
      errorTests: 0,
      throwTests: 0,
      catchTests: 0,
      edgeErrorTests: 0,
      uncoveredErrors: []
    };

    // エラーテストパターンを検出
    const errorPatterns = [
      { pattern: /\.toThrow/, type: 'THROW_TEST' },
      { pattern: /\.rejects/, type: 'REJECT_TEST' },
      { pattern: /catch\s*\(/, type: 'CATCH_TEST' },
      { pattern: /expect.*Error/, type: 'ERROR_ASSERTION' },
      { pattern: /should.*fail/, type: 'FAILURE_TEST' }
    ];

    errorPatterns.forEach(pattern => {
      const matches = content.match(new RegExp(pattern.pattern, 'g')) || [];
      analysis.errorTests += matches.length;

      if (pattern.type === 'THROW_TEST') {
        analysis.throwTests += matches.length;
      }
    });

    // ソースコードのエラーハンドリング箇所を検出
    const sourceFile = this.findSourceFile(testFile);
    if (sourceFile && fs.existsSync(sourceFile)) {
      const sourceContent = fs.readFileSync(sourceFile, 'utf8');
      const errorHandlers = this.findErrorHandlers(sourceContent);

      // 各エラーハンドラーがテストされているか確認
      errorHandlers.forEach(handler => {
        const tested = this.isErrorHandlerTested(handler, content);
        if (!tested) {
          analysis.uncoveredErrors.push({
            handler: handler.code,
            line: handler.line,
            type: handler.type
          });
        }
      });
    }

    return analysis;
  }

  /**
   * テスト実行トレース取得
   */
  async traceTestExecution(testFile) {
    // V8のコードカバレッジAPIを使用
    try {
      const result = execSync(
        `node --experimental-vm-modules --trace-uncaught ${testFile}`,
        { encoding: 'utf8' }
      );

      return this.parseExecutionTrace(result);
    } catch (e) {
      return [];
    }
  }

  /**
   * 制御フローグラフ構築
   */
  buildControlFlowGraph(sourceFile) {
    const content = fs.readFileSync(sourceFile, 'utf8');
    const cfg = {
      nodes: [],
      edges: [],
      paths: []
    };

    // 簡易的なCFG構築
    const lines = content.split('\n');
    let currentBlock = [];

    lines.forEach((line, index) => {
      // 分岐点を検出
      if (/\b(if|else|for|while|switch)\b/.test(line)) {
        if (currentBlock.length > 0) {
          cfg.nodes.push({
            id: cfg.nodes.length,
            lines: [...currentBlock],
            type: 'basic'
          });
          currentBlock = [];
        }

        cfg.nodes.push({
          id: cfg.nodes.length,
          lines: [line],
          lineNumber: index + 1,
          type: 'branch'
        });
      } else if (line.trim()) {
        currentBlock.push(line);
      }
    });

    // パスを生成
    cfg.paths = this.generatePaths(cfg);

    return cfg;
  }

  /**
   * テスト実行
   */
  async runTest(testFile) {
    try {
      execSync(`npm test -- ${testFile}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * テストデータ抽出
   */
  extractTestData(content) {
    const data = [];

    // テストデータパターン
    const patterns = [
      /const\s+(\w+)\s*=\s*([^;]+);/g,
      /let\s+(\w+)\s*=\s*([^;]+);/g,
      /\(([^)]+)\)/g  // 関数引数
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        try {
          // 値を評価
          const value = this.safeEval(match[2] || match[1]);
          data.push({
            code: match[0],
            value: value,
            line: content.substring(0, match.index).split('\n').length
          });
        } catch {
          // 評価できない場合はスキップ
        }
      }
    });

    return data;
  }

  /**
   * エッジケース判定
   */
  isEdgeCase(value) {
    const edgeCases = [
      null, undefined, '', 0, -1, Infinity, -Infinity, NaN,
      [], {}, Number.MAX_VALUE, Number.MIN_VALUE
    ];

    return edgeCases.includes(value) ||
           (Array.isArray(value) && value.length === 0) ||
           (typeof value === 'object' && Object.keys(value || {}).length === 0);
  }

  /**
   * ランダムデータ判定
   */
  isRandomData(code) {
    return /Math\.random|faker\.|chance\.|Date\.now/.test(code);
  }

  /**
   * ハードコード判定
   */
  isHardcoded(code) {
    return /["'][\w\s]+["']|\d{2,}/.test(code);
  }

  /**
   * 副作用操作の抽出
   */
  extractSideEffectOperations(content) {
    const operations = [];

    const patterns = [
      { pattern: /setState|setData|update/, type: 'STATE_CHANGE' },
      { pattern: /save|create|delete|update/, type: 'DB_OPERATION' },
      { pattern: /fetch|axios|post|put/, type: 'API_CALL' }
    ];

    const lines = content.split('\n');
    lines.forEach((line, index) => {
      patterns.forEach(p => {
        if (p.pattern.test(line)) {
          operations.push({
            code: line.trim(),
            type: p.type,
            line: index + 1
          });
        }
      });
    });

    return operations;
  }

  /**
   * 検証の存在確認
   */
  findVerification(operation, content) {
    // 操作の後に対応するexpectがあるか
    const afterOperation = content.substring(
      content.indexOf(operation.code) + operation.code.length
    );

    return /expect|assert|should/.test(afterOperation.substring(0, 200));
  }

  /**
   * エラーハンドラー検出
   */
  findErrorHandlers(content) {
    const handlers = [];
    const patterns = [
      { pattern: /catch\s*\([^)]*\)\s*\{/, type: 'CATCH_BLOCK' },
      { pattern: /\.catch\(/, type: 'PROMISE_CATCH' },
      { pattern: /throw\s+/, type: 'THROW_STATEMENT' }
    ];

    const lines = content.split('\n');
    lines.forEach((line, index) => {
      patterns.forEach(p => {
        if (p.pattern.test(line)) {
          handlers.push({
            code: line.trim(),
            type: p.type,
            line: index + 1
          });
        }
      });
    });

    return handlers;
  }

  /**
   * エラーハンドラーのテスト確認
   */
  isErrorHandlerTested(handler, testContent) {
    // ハンドラーに関連するテストがあるか
    return testContent.includes('throw') ||
           testContent.includes('rejects') ||
           testContent.includes('Error');
  }

  /**
   * 品質スコア計算
   */
  calculateQualityScore(quality) {
    const weights = {
      pathCoverage: 0.2,
      assertionStrength: 0.25,
      mutationSurvival: 0.25,
      dataVariety: 0.1,
      sideEffectVerification: 0.1,
      errorHandling: 0.1
    };

    let totalScore = 0;

    // 各指標のスコアを計算
    if (quality.pathCoverage.totalPaths > 0) {
      const pathScore = quality.pathCoverage.coveredPaths /
                       quality.pathCoverage.totalPaths;
      totalScore += pathScore * weights.pathCoverage;
    }

    if (quality.assertionStrength.totalAssertions > 0) {
      const assertionScore = quality.assertionStrength.strongAssertions /
                            quality.assertionStrength.totalAssertions;
      totalScore += assertionScore * weights.assertionStrength;
    }

    totalScore += quality.mutationSurvival.score * weights.mutationSurvival;
    totalScore += (quality.dataVariety.varietyScore || 0) * weights.dataVariety;

    const sideEffectScore = quality.sideEffectVerification.unverifiedCalls.length === 0 ? 1 : 0.5;
    totalScore += sideEffectScore * weights.sideEffectVerification;

    const errorScore = quality.errorHandling.uncoveredErrors.length === 0 ? 1 : 0.5;
    totalScore += errorScore * weights.errorHandling;

    return {
      score: Math.round(totalScore * 100),
      details: quality,
      verdict: this.getVerdict(totalScore)
    };
  }

  /**
   * 判定
   */
  getVerdict(score) {
    if (score < 0.3) return 'POOR - 形だけのテスト';
    if (score < 0.5) return 'WEAK - 不十分なテスト';
    if (score < 0.7) return 'FAIR - 改善の余地あり';
    if (score < 0.9) return 'GOOD - 良質なテスト';
    return 'EXCELLENT - 優れたテスト';
  }

  // ユーティリティメソッド

  findSourceFile(testFile) {
    // テストファイルから対応するソースファイルを推定
    const sourcePath = testFile
      .replace('.test.', '.')
      .replace('.spec.', '.')
      .replace('__tests__/', '')
      .replace('/tests/', '/');

    return fs.existsSync(sourcePath) ? sourcePath : null;
  }

  extractAssertions(content) {
    const assertions = [];
    const patterns = [
      /expect\([^)]*\)\.[a-zA-Z]+\([^)]*\)/g,
      /assert[A-Z]\w*\([^)]*\)/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        assertions.push({
          code: match[0],
          index: match.index,
          line: content.substring(0, match.index).split('\n').length
        });
      }
    });

    return assertions;
  }

  pathMatches(path, trace) {
    // パスとトレースの一致確認
    return path.some(node => trace.includes(node.lineNumber));
  }

  isSuperficialExecution(path, traces) {
    // 表面的な実行（すぐreturn等）の検出
    const pathTrace = traces.find(t => this.pathMatches(path, t));
    return pathTrace && pathTrace.length < 3;
  }

  parseExecutionTrace(output) {
    // 実行トレースのパース
    const traces = [];
    const lines = output.split('\n');

    lines.forEach(line => {
      const match = line.match(/at .* \(.*:(\d+):(\d+)\)/);
      if (match) {
        traces.push({
          line: parseInt(match[1]),
          column: parseInt(match[2])
        });
      }
    });

    return traces;
  }

  generatePaths(cfg) {
    // CFGからパスを生成
    const paths = [];
    const visited = new Set();

    function dfs(nodeId, currentPath) {
      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      currentPath.push(cfg.nodes[nodeId]);

      const edges = cfg.edges.filter(e => e.from === nodeId);
      if (edges.length === 0) {
        paths.push([...currentPath]);
      } else {
        edges.forEach(edge => {
          dfs(edge.to, [...currentPath]);
        });
      }
    }

    if (cfg.nodes.length > 0) {
      dfs(0, []);
    }

    return paths;
  }

  safeEval(code) {
    // 安全な評価
    try {
      const sandbox = { Math, Number, String, Array, Object };
      return vm.runInNewContext(code, sandbox, { timeout: 100 });
    } catch {
      return code;
    }
  }
}

// CLI実行
if (require.main === module) {
  const analyzer = new DeepQualityAnalyzer();
  const testFile = process.argv[2];

  if (!testFile) {
    console.log('使用方法: node deep-quality-analyzer.js <test-file>');
    process.exit(1);
  }

  analyzer.analyzeTestQuality(testFile).then(result => {
    console.log('\n' + '='.repeat(60));
    console.log('🔬 深層品質分析結果');
    console.log('='.repeat(60));
    console.log(`\nスコア: ${result.score}/100`);
    console.log(`判定: ${result.verdict}`);

    const details = result.details;

    // パスカバレッジ
    if (details.pathCoverage.totalPaths > 0) {
      console.log(`\n📊 パスカバレッジ:`);
      console.log(`  実行パス: ${details.pathCoverage.coveredPaths}/${details.pathCoverage.totalPaths}`);
      if (details.pathCoverage.superficialPaths.length > 0) {
        console.log(`  ⚠️ 表面的実行: ${details.pathCoverage.superficialPaths.length}箇所`);
      }
    }

    // アサーション強度
    if (details.assertionStrength.totalAssertions > 0) {
      console.log(`\n💪 アサーション強度:`);
      console.log(`  強: ${details.assertionStrength.strongAssertions}`);
      console.log(`  弱: ${details.assertionStrength.weakAssertions}`);
      if (details.assertionStrength.tautologies > 0) {
        console.log(`  ❌ トートロジー: ${details.assertionStrength.tautologies}`);
      }
    }

    // ミューテーションテスト
    if (details.mutationSurvival.score !== undefined) {
      console.log(`\n🧬 ミューテーションテスト:`);
      console.log(`  殺傷率: ${(details.mutationSurvival.score * 100).toFixed(1)}%`);
      console.log(`  生存: ${details.mutationSurvival.survived}個`);
    }

    // データ多様性
    if (details.dataVariety) {
      console.log(`\n📈 データ多様性:`);
      console.log(`  ユニーク値: ${details.dataVariety.uniqueValues.size}個`);
      console.log(`  エッジケース: ${details.dataVariety.edgeCases}個`);
    }

    console.log('='.repeat(60));
  });
}

module.exports = DeepQualityAnalyzer;