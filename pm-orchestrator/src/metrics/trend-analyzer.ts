/**
 * PM Orchestrator Enhancement - Trend Analyzer
 *
 * メトリクスのトレンド分析と改善提案を担当します。
 */

import { promises as fs } from 'fs';
import path from 'path';
import { TrendAnalysis, Trend, Suggestion, Metrics } from '../types';
import { MetricsCollector } from './metrics-collector';

/**
 * TrendAnalyzerクラス
 *
 * 指定期間のメトリクスを分析し、トレンドと改善提案を生成します。
 */
export class TrendAnalyzer {
  private collector: MetricsCollector;
  private analysisDir: string;

  /**
   * コンストラクタ
   *
   * @param baseDir 分析ディレクトリのベースパス（デフォルト: カレントディレクトリ）
   */
  constructor(baseDir: string = process.cwd()) {
    this.collector = new MetricsCollector(baseDir);
    this.analysisDir = path.join(baseDir, '.pm-orchestrator', 'analysis');
  }

  /**
   * 指定日数分のトレンド分析を実行します
   *
   * @param days 分析対象の日数
   * @returns トレンド分析結果
   */
  public async analyzeTrends(days: number): Promise<TrendAnalysis> {
    // 分析期間を設定
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 現在のメトリクスを取得
    const currentMetrics = await this.collector.getMetrics(startDate, endDate);

    // 過去のメトリクスを取得（比較用）
    const pastEndDate = new Date(startDate);
    pastEndDate.setDate(pastEndDate.getDate() - 1);
    const pastStartDate = new Date(pastEndDate);
    pastStartDate.setDate(pastStartDate.getDate() - days);

    const pastMetrics = await this.collector.getMetrics(pastStartDate, pastEndDate);

    // トレンドを分析
    const trends = this.calculateTrends(pastMetrics, currentMetrics);

    // 改善提案を生成
    const suggestions = this.generateSuggestions(currentMetrics, trends);

    return {
      analyzed: true,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      trends,
      suggestions
    };
  }

  /**
   * トレンド分析結果を保存します
   *
   * @param analysis トレンド分析結果
   */
  public async saveAnalysis(analysis: TrendAnalysis): Promise<void> {
    // 分析ディレクトリを作成
    await fs.mkdir(this.analysisDir, { recursive: true });

    // ファイル名を生成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `trend-analysis-${timestamp}.json`;
    const filePath = path.join(this.analysisDir, fileName);

    // JSON形式で保存
    await fs.writeFile(
      filePath,
      JSON.stringify(analysis, null, 2),
      'utf-8'
    );
  }

  /**
   * トレンドを計算します（プライベートメソッド）
   *
   * @param pastMetrics 過去のメトリクス
   * @param currentMetrics 現在のメトリクス
   * @returns トレンドの配列
   */
  private calculateTrends(pastMetrics: Metrics, currentMetrics: Metrics): Trend[] {
    const trends: Trend[] = [];

    // 成功率のトレンド
    if (pastMetrics.totalTasks > 0 && currentMetrics.totalTasks > 0) {
      const successRateChange = currentMetrics.successRate - pastMetrics.successRate;
      trends.push({
        metric: 'successRate',
        direction: this.getDirection(successRateChange),
        change: successRateChange,
        significance: this.getSignificance(Math.abs(successRateChange))
      });
    }

    // 平均実行時間のトレンド
    if (pastMetrics.totalTasks > 0 && currentMetrics.totalTasks > 0) {
      const durationChange = currentMetrics.averageDuration - pastMetrics.averageDuration;
      const durationChangePercent = (durationChange / pastMetrics.averageDuration) * 100;
      trends.push({
        metric: 'averageDuration',
        direction: this.getDirection(-durationChange), // 実行時間は減少が良い
        change: durationChangePercent,
        significance: this.getSignificance(Math.abs(durationChangePercent))
      });
    }

    // 品質スコアのトレンド
    if (pastMetrics.totalTasks > 0 && currentMetrics.totalTasks > 0) {
      const qualityChange = currentMetrics.averageQualityScore - pastMetrics.averageQualityScore;
      trends.push({
        metric: 'averageQualityScore',
        direction: this.getDirection(qualityChange),
        change: qualityChange,
        significance: this.getSignificance(Math.abs(qualityChange))
      });
    }

    return trends;
  }

  /**
   * 変化の方向を判定します
   *
   * @param change 変化量
   * @returns 方向（increasing/decreasing/stable）
   */
  private getDirection(change: number): 'increasing' | 'decreasing' | 'stable' {
    if (change > 1) return 'increasing';
    if (change < -1) return 'decreasing';
    return 'stable';
  }

  /**
   * 変化の重要度を判定します
   *
   * @param absChange 変化量の絶対値
   * @returns 重要度（high/medium/low）
   */
  private getSignificance(absChange: number): 'high' | 'medium' | 'low' {
    if (absChange >= 10) return 'high';
    if (absChange >= 5) return 'medium';
    return 'low';
  }

  /**
   * 改善提案を生成します（プライベートメソッド）
   *
   * @param metrics メトリクス
   * @param trends トレンドの配列
   * @returns 改善提案の配列
   */
  private generateSuggestions(metrics: Metrics, trends: Trend[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // 成功率が低い場合の提案
    if (metrics.successRate < 80) {
      suggestions.push({
        priority: 'high',
        title: '成功率の改善が必要',
        description: `現在の成功率は ${metrics.successRate.toFixed(1)}% です。80%以上を目標にしましょう。`,
        actions: [
          'エラーログを確認し、頻出エラーを特定する',
          'テストカバレッジを向上させる',
          'コードレビュープロセスを強化する'
        ]
      });
    }

    // 実行時間が長い場合の提案
    if (metrics.averageDuration > 300000) { // 5分以上
      suggestions.push({
        priority: 'medium',
        title: '実行時間の短縮を検討',
        description: `平均実行時間は ${(metrics.averageDuration / 1000).toFixed(1)}秒 です。`,
        actions: [
          '並行実行可能なサブエージェントを特定する',
          'ボトルネックとなっているサブエージェントを最適化する',
          'キャッシュ機構の導入を検討する'
        ]
      });
    }

    // 品質スコアが低い場合の提案
    if (metrics.averageQualityScore < 70) {
      suggestions.push({
        priority: 'high',
        title: '品質スコアの向上が必要',
        description: `現在の平均品質スコアは ${metrics.averageQualityScore.toFixed(1)} です。`,
        actions: [
          'Lintルールを厳格化する',
          'コードフォーマットを統一する',
          'テストカバレッジを90%以上にする'
        ]
      });
    }

    // 成功率が下降トレンドの場合の提案
    const successRateTrend = trends.find(t => t.metric === 'successRate');
    if (successRateTrend && successRateTrend.direction === 'decreasing' && successRateTrend.significance === 'high') {
      suggestions.push({
        priority: 'high',
        title: '成功率が低下傾向',
        description: `成功率が ${Math.abs(successRateTrend.change).toFixed(1)}% 低下しています。`,
        actions: [
          '最近の変更内容をレビューする',
          'テスト環境の安定性を確認する',
          'リグレッションテストを強化する'
        ]
      });
    }

    return suggestions;
  }
}
