/**
 * Metrics Collector - メトリクス集計
 *
 * 実行ログから日次・週次・月次のメトリクスを集計する。
 */

const fs = require('fs');
const path = require('path');

class MetricsCollector {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.logsDir = path.join(projectRoot, '.quality-guardian/logs');
  }

  /**
   * ログファイルを読み込み
   */
  loadLogs(startDate, endDate) {
    if (!fs.existsSync(this.logsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.logsDir)
      .filter(f => f.startsWith('pm-orchestrator-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(this.logsDir, f),
        mtime: fs.statSync(path.join(this.logsDir, f)).mtime
      }))
      .filter(f => {
        const date = new Date(f.mtime);
        return date >= startDate && date <= endDate;
      });

    return files.map(f => JSON.parse(fs.readFileSync(f.path, 'utf8')));
  }

  /**
   * 日次サマリーを生成
   */
  generateDailySummary(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = this.loadLogs(startOfDay, endOfDay);

    if (logs.length === 0) {
      return null;
    }

    // 基本統計
    const totalTasks = logs.length;
    const successTasks = logs.filter(l => l.status === 'success').length;
    const errorTasks = logs.filter(l => l.status === 'error').length;
    const rollbackTasks = logs.filter(l => l.rollbackExecuted).length;

    // 平均値
    const totalDuration = logs.reduce((sum, l) => sum + l.duration, 0);
    const averageDuration = totalDuration / totalTasks;

    const totalQuality = logs.reduce((sum, l) => sum + l.qualityScore, 0);
    const averageQualityScore = totalQuality / totalTasks;

    // エラー統計
    const errorTypes = {};
    logs.filter(l => l.errorType).forEach(l => {
      errorTypes[l.errorType] = (errorTypes[l.errorType] || 0) + 1;
    });

    const autoFixAttempts = logs.filter(l => l.autoFixAttempted).length;
    const autoFixSuccesses = logs.filter(l => l.autoFixSuccess).length;
    const autoFixSuccessRate = autoFixAttempts > 0
      ? (autoFixSuccesses / autoFixAttempts) * 100
      : 0;

    const retriedTasks = logs.filter(l => l.retryCount > 0).length;
    const retrySuccessRate = retriedTasks > 0
      ? (logs.filter(l => l.retryCount > 0 && l.status === 'success').length / retriedTasks) * 100
      : 0;

    // パターン統計
    const patternDistribution = {};
    logs.forEach(l => {
      patternDistribution[l.detectedPattern] = (patternDistribution[l.detectedPattern] || 0) + 1;
    });

    const complexityDistribution = {};
    logs.forEach(l => {
      complexityDistribution[l.complexity] = (complexityDistribution[l.complexity] || 0) + 1;
    });

    // サブエージェント統計
    const subagentUsage = {};
    const subagentTotalDuration = {};
    const subagentCount = {};

    logs.forEach(log => {
      log.subagents.forEach(sub => {
        subagentUsage[sub.name] = (subagentUsage[sub.name] || 0) + 1;
        subagentTotalDuration[sub.name] = (subagentTotalDuration[sub.name] || 0) + sub.duration;
        subagentCount[sub.name] = (subagentCount[sub.name] || 0) + 1;
      });
    });

    const subagentAverageDuration = {};
    Object.keys(subagentTotalDuration).forEach(name => {
      subagentAverageDuration[name] = subagentTotalDuration[name] / subagentCount[name];
    });

    return {
      date: date.toISOString().split('T')[0],
      totalTasks,
      successTasks,
      errorTasks,
      rollbackTasks,
      averageDuration,
      averageQualityScore,
      errorTypes,
      autoFixSuccessRate,
      retrySuccessRate,
      patternDistribution,
      complexityDistribution,
      subagentUsage,
      subagentAverageDuration
    };
  }

  /**
   * 週次サマリーを生成
   */
  generateWeeklySummary(startDate) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const logs = this.loadLogs(startDate, endDate);

    if (logs.length === 0) {
      return null;
    }

    // 日次サマリーと同じロジックで集計
    return this.aggregateLogs(logs, startDate, endDate, 'week');
  }

  /**
   * 月次サマリーを生成
   */
  generateMonthlySummary(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const logs = this.loadLogs(startDate, endDate);

    if (logs.length === 0) {
      return null;
    }

    return this.aggregateLogs(logs, startDate, endDate, 'month');
  }

  /**
   * ログを集計（週次・月次用の共通ロジック）
   */
  aggregateLogs(logs, startDate, endDate, period) {
    const totalTasks = logs.length;
    const successTasks = logs.filter(l => l.status === 'success').length;
    const errorTasks = logs.filter(l => l.status === 'error').length;
    const rollbackTasks = logs.filter(l => l.rollbackExecuted).length;

    const totalDuration = logs.reduce((sum, l) => sum + l.duration, 0);
    const averageDuration = totalDuration / totalTasks;

    const totalQuality = logs.reduce((sum, l) => sum + l.qualityScore, 0);
    const averageQualityScore = totalQuality / totalTasks;

    const errorTypes = {};
    logs.filter(l => l.errorType).forEach(l => {
      errorTypes[l.errorType] = (errorTypes[l.errorType] || 0) + 1;
    });

    const autoFixAttempts = logs.filter(l => l.autoFixAttempted).length;
    const autoFixSuccesses = logs.filter(l => l.autoFixSuccess).length;
    const autoFixSuccessRate = autoFixAttempts > 0
      ? (autoFixSuccesses / autoFixAttempts) * 100
      : 0;

    const retriedTasks = logs.filter(l => l.retryCount > 0).length;
    const retrySuccessRate = retriedTasks > 0
      ? (logs.filter(l => l.retryCount > 0 && l.status === 'success').length / retriedTasks) * 100
      : 0;

    const patternDistribution = {};
    logs.forEach(l => {
      patternDistribution[l.detectedPattern] = (patternDistribution[l.detectedPattern] || 0) + 1;
    });

    const complexityDistribution = {};
    logs.forEach(l => {
      complexityDistribution[l.complexity] = (complexityDistribution[l.complexity] || 0) + 1;
    });

    const subagentUsage = {};
    const subagentTotalDuration = {};
    const subagentCount = {};

    logs.forEach(log => {
      log.subagents.forEach(sub => {
        subagentUsage[sub.name] = (subagentUsage[sub.name] || 0) + 1;
        subagentTotalDuration[sub.name] = (subagentTotalDuration[sub.name] || 0) + sub.duration;
        subagentCount[sub.name] = (subagentCount[sub.name] || 0) + 1;
      });
    });

    const subagentAverageDuration = {};
    Object.keys(subagentTotalDuration).forEach(name => {
      subagentAverageDuration[name] = subagentTotalDuration[name] / subagentCount[name];
    });

    return {
      period,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalTasks,
      successTasks,
      errorTasks,
      rollbackTasks,
      averageDuration,
      averageQualityScore,
      errorTypes,
      autoFixSuccessRate,
      retrySuccessRate,
      patternDistribution,
      complexityDistribution,
      subagentUsage,
      subagentAverageDuration
    };
  }

  /**
   * サマリーをファイルに保存
   */
  saveSummary(summary, filename) {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    const filepath = path.join(this.logsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
  }

  /**
   * 日次サマリーを生成して保存
   */
  saveDailySummary(date) {
    const summary = this.generateDailySummary(date);

    if (!summary) {
      return null;
    }

    const filename = `summary-${summary.date}.json`;
    this.saveSummary(summary, filename);

    return summary;
  }

  /**
   * 週次サマリーを生成して保存
   */
  saveWeeklySummary(startDate) {
    const summary = this.generateWeeklySummary(startDate);

    if (!summary) {
      return null;
    }

    const filename = `summary-week-${summary.startDate}.json`;
    this.saveSummary(summary, filename);

    return summary;
  }

  /**
   * 月次サマリーを生成して保存
   */
  saveMonthlySummary(year, month) {
    const summary = this.generateMonthlySummary(year, month);

    if (!summary) {
      return null;
    }

    const paddedMonth = String(month).padStart(2, '0');
    const filename = `summary-month-${year}-${paddedMonth}.json`;
    this.saveSummary(summary, filename);

    return summary;
  }
}

module.exports = MetricsCollector;
