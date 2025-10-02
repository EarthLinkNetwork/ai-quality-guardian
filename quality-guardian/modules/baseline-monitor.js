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
}

module.exports = BaselineMonitor;