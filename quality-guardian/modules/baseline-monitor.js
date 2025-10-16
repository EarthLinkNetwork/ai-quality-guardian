// EventSystemプロジェクトのbaseline-monitor.jsをベースに汎用化
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BaselineMonitor {
  static async capture(projectRoot) {
    // 汎用的なベースライン取得
    return {
      tests: await this.captureTestMetrics(projectRoot),
      coverage: await this.captureCoverage(projectRoot),
      quality: await this.captureQuality(projectRoot),
      timestamp: new Date().toISOString()
    };
  }

  static async compare(projectRoot, baselineFile) {
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    const current = await this.capture(projectRoot);

    // 比較ロジック
    return {
      changes: this.calculateChanges(baseline.metrics, current),
      score: this.calculateScore(baseline.metrics, current)
    };
  }

  static async captureTestMetrics(projectRoot) {
    // テストメトリクス取得（プロジェクト非依存）
    const testFiles = this.findTestFiles(projectRoot);

    return {
      totalTests: testFiles.length,
      // 他の汎用メトリクス
    };
  }

  static findTestFiles(projectRoot) {
    try {
      const glob = require('glob');
      return glob.sync('**/*.{test,spec}.{ts,tsx,js,jsx}', {
        cwd: projectRoot,
        ignore: ['node_modules/**']
      });
    } catch {
      return [];
    }
  }

  static async captureCoverage(projectRoot) {
    // カバレッジ情報を取得（汎用的に）
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
      );

      // カバレッジコマンドがある場合のみ実行
      if (packageJson.scripts && packageJson.scripts['test:coverage']) {
        const output = execSync('npm run test:coverage -- --passWithNoTests', {
          cwd: projectRoot,
          encoding: 'utf8',
          stdio: 'pipe'
        });

        // カバレッジ結果をパース（簡易版）
        return {
          available: true,
          summary: 'カバレッジ取得成功'
        };
      }

      return {
        available: false,
        reason: 'カバレッジコマンドが設定されていません'
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }

  static async captureQuality(projectRoot) {
    // 品質メトリクスを取得
    const results = {
      lint: { passed: false, errors: 0 },
      typeCheck: { passed: false, errors: 0 },
      build: { passed: false, errors: 0 }
    };

    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
      );

      // Lint チェック
      if (packageJson.scripts && packageJson.scripts.lint) {
        try {
          execSync('npm run lint', {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: 'pipe'
          });
          results.lint.passed = true;
        } catch (error) {
          results.lint.errors = 1;
        }
      }

      // 型チェック（TypeScript）
      if (fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
        try {
          execSync('npx tsc --noEmit', {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: 'pipe'
          });
          results.typeCheck.passed = true;
        } catch (error) {
          results.typeCheck.errors = 1;
        }
      }

      // ビルドチェック
      if (packageJson.scripts && packageJson.scripts.build) {
        try {
          execSync('npm run build', {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: 'pipe'
          });
          results.build.passed = true;
        } catch (error) {
          results.build.errors = 1;
        }
      }

      return results;
    } catch (error) {
      return {
        error: error.message,
        results
      };
    }
  }

  static calculateChanges(baseline, current) {
    // ベースラインとの差分を計算
    const changes = [];

    if (baseline && current) {
      // テスト数の変化
      if (baseline.tests && current.tests) {
        const testDiff = current.tests.totalTests - baseline.tests.totalTests;
        if (testDiff !== 0) {
          changes.push({
            type: 'tests',
            change: testDiff,
            description: `テストファイル数: ${testDiff > 0 ? '+' : ''}${testDiff}`
          });
        }
      }

      // 品質の変化
      if (baseline.quality && current.quality) {
        const qualityChecks = ['lint', 'typeCheck', 'build'];
        qualityChecks.forEach(check => {
          if (baseline.quality[check] && current.quality[check]) {
            const wasGood = baseline.quality[check].passed;
            const isGood = current.quality[check].passed;
            if (wasGood !== isGood) {
              changes.push({
                type: 'quality',
                check,
                degraded: wasGood && !isGood,
                description: `${check}: ${isGood ? '改善' : '劣化'}`
              });
            }
          }
        });
      }
    }

    return changes;
  }

  static calculateScore(baseline, current) {
    // 品質スコアを計算（0-100）
    let score = 100;

    if (current.quality) {
      const checks = ['lint', 'typeCheck', 'build'];
      const passedChecks = checks.filter(
        check => current.quality[check] && current.quality[check].passed
      ).length;

      score = Math.round((passedChecks / checks.length) * 100);
    }

    return score;
  }
}

module.exports = BaselineMonitor;