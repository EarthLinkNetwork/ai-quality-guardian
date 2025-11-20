/**
 * Trend Analyzer - トレンド分析・改善提案
 *
 * 実行ログを分析し、品質の傾向を検出して改善提案を生成する。
 */

const fs = require('fs');
const path = require('path');

class TrendAnalyzer {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.logsDir = path.join(projectRoot, '.quality-guardian/logs');
  }

  /**
   * 最近のログを読み込み
   */
  loadRecentLogs(days = 7) {
    if (!fs.existsSync(this.logsDir)) {
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const files = fs.readdirSync(this.logsDir)
      .filter(f => f.startsWith('pm-orchestrator-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(this.logsDir, f),
        mtime: fs.statSync(path.join(this.logsDir, f)).mtime
      }))
      .filter(f => f.mtime >= cutoffDate)
      .sort((a, b) => b.mtime - a.mtime);

    return files.map(f => JSON.parse(fs.readFileSync(f.path, 'utf8')));
  }

  /**
   * エラー率の傾向を検出
   */
  detectErrorRateTrend(logs) {
    if (logs.length < 10) {
      return {
        detected: false,
        message: 'データ不足（最低10タスク必要）'
      };
    }

    // 最近の半分と前半分を比較
    const midpoint = Math.floor(logs.length / 2);
    const recentLogs = logs.slice(0, midpoint);
    const olderLogs = logs.slice(midpoint);

    const recentErrorRate = recentLogs.filter(l => l.status === 'error').length / recentLogs.length;
    const olderErrorRate = olderLogs.filter(l => l.status === 'error').length / olderLogs.length;

    const increase = recentErrorRate - olderErrorRate;

    if (increase > 0.1) {
      return {
        detected: true,
        severity: 'high',
        recentErrorRate: (recentErrorRate * 100).toFixed(1),
        olderErrorRate: (olderErrorRate * 100).toFixed(1),
        increase: (increase * 100).toFixed(1),
        message: `エラー率が${(increase * 100).toFixed(1)}%上昇しています`
      };
    }

    if (increase > 0.05) {
      return {
        detected: true,
        severity: 'medium',
        recentErrorRate: (recentErrorRate * 100).toFixed(1),
        olderErrorRate: (olderErrorRate * 100).toFixed(1),
        increase: (increase * 100).toFixed(1),
        message: `エラー率が${(increase * 100).toFixed(1)}%上昇しています`
      };
    }

    return {
      detected: false,
      recentErrorRate: (recentErrorRate * 100).toFixed(1),
      olderErrorRate: (olderErrorRate * 100).toFixed(1),
      message: 'エラー率は安定しています'
    };
  }

  /**
   * 問題のあるパターンを検出
   */
  findProblematicPatterns(logs) {
    if (logs.length < 5) {
      return [];
    }

    const patternStats = {};

    logs.forEach(log => {
      const pattern = log.detectedPattern;

      if (!patternStats[pattern]) {
        patternStats[pattern] = {
          total: 0,
          errors: 0,
          rollbacks: 0
        };
      }

      patternStats[pattern].total += 1;

      if (log.status === 'error') {
        patternStats[pattern].errors += 1;
      }

      if (log.rollbackExecuted) {
        patternStats[pattern].rollbacks += 1;
      }
    });

    const problematic = [];

    Object.keys(patternStats).forEach(pattern => {
      const stats = patternStats[pattern];
      const errorRate = stats.errors / stats.total;
      const rollbackRate = stats.rollbacks / stats.total;

      if (errorRate > 0.3 || rollbackRate > 0.2) {
        problematic.push({
          pattern,
          total: stats.total,
          errors: stats.errors,
          rollbacks: stats.rollbacks,
          errorRate: (errorRate * 100).toFixed(1),
          rollbackRate: (rollbackRate * 100).toFixed(1),
          severity: errorRate > 0.5 ? 'high' : 'medium'
        });
      }
    });

    return problematic.sort((a, b) => parseFloat(b.errorRate) - parseFloat(a.errorRate));
  }

  /**
   * 遅いサブエージェントを検出
   */
  findSlowSubagents(logs) {
    if (logs.length < 5) {
      return [];
    }

    const subagentStats = {};

    logs.forEach(log => {
      log.subagents.forEach(sub => {
        if (!subagentStats[sub.name]) {
          subagentStats[sub.name] = {
            count: 0,
            totalDuration: 0,
            maxDuration: 0
          };
        }

        subagentStats[sub.name].count += 1;
        subagentStats[sub.name].totalDuration += sub.duration;
        subagentStats[sub.name].maxDuration = Math.max(
          subagentStats[sub.name].maxDuration,
          sub.duration
        );
      });
    });

    const slow = [];

    Object.keys(subagentStats).forEach(name => {
      const stats = subagentStats[name];
      const averageDuration = stats.totalDuration / stats.count;

      // 平均実行時間が30秒以上、または最大実行時間が60秒以上
      if (averageDuration > 30000 || stats.maxDuration > 60000) {
        slow.push({
          name,
          count: stats.count,
          averageDuration: (averageDuration / 1000).toFixed(1),
          maxDuration: (stats.maxDuration / 1000).toFixed(1),
          severity: averageDuration > 60000 ? 'high' : 'medium'
        });
      }
    });

    return slow.sort((a, b) => parseFloat(b.averageDuration) - parseFloat(a.averageDuration));
  }

  /**
   * 自動修正成功率の低下を検出
   */
  detectAutoFixTrend(logs) {
    if (logs.length < 10) {
      return {
        detected: false,
        message: 'データ不足（最低10タスク必要）'
      };
    }

    const midpoint = Math.floor(logs.length / 2);
    const recentLogs = logs.slice(0, midpoint);
    const olderLogs = logs.slice(midpoint);

    const recentAttempts = recentLogs.filter(l => l.autoFixAttempted).length;
    const recentSuccesses = recentLogs.filter(l => l.autoFixSuccess).length;
    const recentRate = recentAttempts > 0 ? recentSuccesses / recentAttempts : 0;

    const olderAttempts = olderLogs.filter(l => l.autoFixAttempted).length;
    const olderSuccesses = olderLogs.filter(l => l.autoFixSuccess).length;
    const olderRate = olderAttempts > 0 ? olderSuccesses / olderAttempts : 0;

    const decrease = olderRate - recentRate;

    if (decrease > 0.2) {
      return {
        detected: true,
        severity: 'high',
        recentRate: (recentRate * 100).toFixed(1),
        olderRate: (olderRate * 100).toFixed(1),
        decrease: (decrease * 100).toFixed(1),
        message: `自動修正成功率が${(decrease * 100).toFixed(1)}%低下しています`
      };
    }

    if (decrease > 0.1) {
      return {
        detected: true,
        severity: 'medium',
        recentRate: (recentRate * 100).toFixed(1),
        olderRate: (olderRate * 100).toFixed(1),
        decrease: (decrease * 100).toFixed(1),
        message: `自動修正成功率が${(decrease * 100).toFixed(1)}%低下しています`
      };
    }

    return {
      detected: false,
      recentRate: (recentRate * 100).toFixed(1),
      message: '自動修正成功率は安定しています'
    };
  }

  /**
   * 改善提案を生成
   */
  generateSuggestions(trends) {
    const suggestions = [];

    // エラー率上昇
    if (trends.errorRateIncreasing.detected) {
      if (trends.errorRateIncreasing.severity === 'high') {
        suggestions.push({
          priority: 'high',
          category: 'error_rate',
          title: 'エラー率が大幅に上昇しています',
          description: trends.errorRateIncreasing.message,
          actions: [
            'Rule Checker のルールを追加・強化してください',
            '最近のエラーログを詳細に分析してください',
            'Designer サブエージェントの分析精度を向上させてください'
          ]
        });
      } else {
        suggestions.push({
          priority: 'medium',
          category: 'error_rate',
          title: 'エラー率が上昇傾向にあります',
          description: trends.errorRateIncreasing.message,
          actions: [
            'エラーパターンを分析してください',
            '必要に応じて Rule Checker を強化してください'
          ]
        });
      }
    }

    // 問題のあるパターン
    if (trends.problematicPatterns.length > 0) {
      trends.problematicPatterns.forEach(pattern => {
        suggestions.push({
          priority: pattern.severity,
          category: 'pattern',
          title: `パターン「${pattern.pattern}」でエラーが多発しています`,
          description: `エラー率: ${pattern.errorRate}%, ロールバック率: ${pattern.rollbackRate}%`,
          actions: [
            `パターン検出ロジックを改善してください（${pattern.pattern}）`,
            'このパターン専用の対策を追加してください',
            'Implementer サブエージェントの自動修正ロジックを強化してください'
          ]
        });
      });
    }

    // 遅いサブエージェント
    if (trends.slowSubagents.length > 0) {
      trends.slowSubagents.forEach(sub => {
        suggestions.push({
          priority: sub.severity,
          category: 'performance',
          title: `サブエージェント「${sub.name}」が遅いです`,
          description: `平均実行時間: ${sub.averageDuration}秒, 最大実行時間: ${sub.maxDuration}秒`,
          actions: [
            `${sub.name} サブエージェントの処理を最適化してください`,
            '並列実行の導入を検討してください',
            'タイムアウト設定を見直してください'
          ]
        });
      });
    }

    // 自動修正成功率の低下
    if (trends.autoFixDegrading.detected) {
      suggestions.push({
        priority: trends.autoFixDegrading.severity,
        category: 'auto_fix',
        title: '自動修正成功率が低下しています',
        description: trends.autoFixDegrading.message,
        actions: [
          'Auto-fix ロジックを見直してください',
          '新しいエラーパターンに対応してください',
          'Implementer サブエージェントを強化してください'
        ]
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * 全体的な分析を実行
   */
  analyzeTrends(days = 7) {
    const logs = this.loadRecentLogs(days);

    if (logs.length === 0) {
      return {
        analyzed: false,
        message: 'ログが見つかりませんでした'
      };
    }

    const trends = {
      errorRateIncreasing: this.detectErrorRateTrend(logs),
      problematicPatterns: this.findProblematicPatterns(logs),
      slowSubagents: this.findSlowSubagents(logs),
      autoFixDegrading: this.detectAutoFixTrend(logs)
    };

    const suggestions = this.generateSuggestions(trends);

    return {
      analyzed: true,
      period: `過去${days}日間`,
      totalLogs: logs.length,
      trends,
      suggestions
    };
  }

  /**
   * 分析結果をファイルに保存
   */
  saveAnalysis(analysis) {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `trend-analysis-${timestamp}.json`;
    const filepath = path.join(this.logsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(analysis, null, 2));
  }
}

module.exports = TrendAnalyzer;
