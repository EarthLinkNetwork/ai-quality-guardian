/**
 * PM Orchestrator Enhancement - Metrics Collector
 *
 * タスク実行メトリクスの収集と集計を担当します。
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ExecutionLog, Metrics } from '../types';
import { ExecutionLogger } from '../logger/execution-logger';

/**
 * MetricsCollectorクラス
 *
 * ExecutionLoggerが記録した実行ログからメトリクスを収集・集計します。
 * 日次サマリーの保存とメトリクスの取得機能を提供します。
 */
export class MetricsCollector {
  private logger: ExecutionLogger;
  private metricsDir: string;

  /**
   * コンストラクタ
   *
   * @param baseDir メトリクスディレクトリのベースパス（デフォルト: カレントディレクトリ）
   */
  constructor(baseDir: string = process.cwd()) {
    this.logger = new ExecutionLogger(baseDir);
    this.metricsDir = path.join(baseDir, '.pm-orchestrator', 'metrics');
  }

  /**
   * 指定日の日次サマリーを保存します
   *
   * @param date サマリーの対象日
   */
  public async saveDailySummary(date: Date): Promise<void> {
    // 対象日の開始・終了時刻を設定
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // 対象日のログを取得
    const logs = await this.logger.getLogsBetween(startOfDay, endOfDay);

    // メトリクスを計算
    const metrics = this.calculateMetrics(logs);

    // メトリクスディレクトリを作成
    await fs.mkdir(this.metricsDir, { recursive: true });

    // 日次サマリーをファイルに保存
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `daily-summary-${dateStr}.json`;
    const filePath = path.join(this.metricsDir, fileName);

    const summary = {
      date: dateStr,
      metrics,
      logCount: logs.length
    };

    await fs.writeFile(
      filePath,
      JSON.stringify(summary, null, 2),
      'utf-8'
    );
  }

  /**
   * 指定期間のメトリクスを取得します
   *
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns メトリクス
   */
  public async getMetrics(startDate: Date, endDate: Date): Promise<Metrics> {
    // 指定期間のログを取得
    const logs = await this.logger.getLogsBetween(startDate, endDate);

    // メトリクスを計算
    return this.calculateMetrics(logs);
  }

  /**
   * ログからメトリクスを計算します（プライベートメソッド）
   *
   * @param logs 実行ログの配列
   * @returns メトリクス
   */
  private calculateMetrics(logs: ExecutionLog[]): Metrics {
    if (logs.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        averageDuration: 0,
        averageQualityScore: 0,
        errorDistribution: {},
        subagentUsage: {}
      };
    }

    // 総タスク数
    const totalTasks = logs.length;

    // 成功率の計算
    const successCount = logs.filter(log => log.status === 'success').length;
    const successRate = (successCount / totalTasks) * 100;

    // 平均実行時間の計算
    const totalDuration = logs.reduce((sum, log) => sum + log.duration, 0);
    const averageDuration = totalDuration / totalTasks;

    // 平均品質スコアの計算
    const totalQualityScore = logs.reduce((sum, log) => sum + log.qualityScore, 0);
    const averageQualityScore = totalQualityScore / totalTasks;

    // エラー分布の計算
    const errorDistribution: Record<string, number> = {};
    logs.forEach(log => {
      if (log.errorType) {
        errorDistribution[log.errorType] = (errorDistribution[log.errorType] || 0) + 1;
      }
    });

    // サブエージェント使用回数の計算
    const subagentUsage: Record<string, number> = {};
    logs.forEach(log => {
      log.subagents.forEach(subagent => {
        subagentUsage[subagent.name] = (subagentUsage[subagent.name] || 0) + 1;
      });
    });

    return {
      totalTasks,
      successRate,
      averageDuration,
      averageQualityScore,
      errorDistribution,
      subagentUsage
    };
  }
}
