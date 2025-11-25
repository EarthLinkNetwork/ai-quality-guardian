/**
 * PM Orchestrator Enhancement - TrendAnalyzer Unit Tests
 */

import { promises as fs } from 'fs';
import path from 'path';
import { TrendAnalyzer } from '../../../src/metrics/trend-analyzer';
import { ExecutionLogger } from '../../../src/logger/execution-logger';
import { SubagentStatus } from '../../../src/types';

describe('TrendAnalyzer', () => {
  let analyzer: TrendAnalyzer;
  let logger: ExecutionLogger;
  let testBaseDir: string;
  let testAnalysisDir: string;

  beforeEach(async () => {
    // テストごとにユニークなディレクトリを使用
    testBaseDir = path.join(process.cwd(), `.pm-orchestrator-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    testAnalysisDir = path.join(testBaseDir, '.pm-orchestrator', 'analysis');

    analyzer = new TrendAnalyzer(testBaseDir);
    logger = new ExecutionLogger(testBaseDir);

    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  afterEach(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('analyzeTrends', () => {
    it('should analyze trends and generate suggestions', async () => {
      // テストデータを作成（現在期間）
      logger.startTask('Task 1');
      logger.recordSubagent('rule-checker', SubagentStatus.COMPLETED, {});
      await logger.completeTask('success', 95);

      logger.startTask('Task 2');
      logger.recordSubagent('implementer', SubagentStatus.COMPLETED, {});
      await logger.completeTask('success', 90);

      logger.startTask('Task 3');
      await logger.completeTask('error', 60, 'TEST_FAILURE');

      // トレンド分析を実行
      const analysis = await analyzer.analyzeTrends(7);

      expect(analysis.analyzed).toBe(true);
      expect(analysis.period.start).toBeTruthy();
      expect(analysis.period.end).toBeTruthy();
      expect(analysis.trends).toBeInstanceOf(Array);
      expect(analysis.suggestions).toBeInstanceOf(Array);
    });

    it('should calculate success rate trend', async () => {
      // テストデータを作成（現在期間）
      logger.startTask('Task 1');
      await logger.completeTask('success', 100);

      logger.startTask('Task 2');
      await logger.completeTask('success', 100);

      logger.startTask('Task 3');
      await logger.completeTask('success', 100);

      // トレンド分析を実行
      const analysis = await analyzer.analyzeTrends(7);

      // 成功率100%なので、トレンドは安定または増加
      const successRateTrend = analysis.trends.find(t => t.metric === 'successRate');
      if (successRateTrend) {
        expect(['increasing', 'stable']).toContain(successRateTrend.direction);
      }
    });

    it('should generate suggestions for low success rate', async () => {
      // テストデータを作成（低成功率）
      logger.startTask('Task 1');
      await logger.completeTask('error', 50, 'TEST_FAILURE');

      logger.startTask('Task 2');
      await logger.completeTask('error', 60, 'LINT_ERROR');

      logger.startTask('Task 3');
      await logger.completeTask('success', 100);

      // トレンド分析を実行
      const analysis = await analyzer.analyzeTrends(7);

      // 成功率33%なので、改善提案が含まれる
      const successRateSuggestion = analysis.suggestions.find(s =>
        s.title.includes('成功率')
      );
      expect(successRateSuggestion).toBeDefined();
      expect(successRateSuggestion?.priority).toBe('high');
    });

    it('should generate suggestions for low quality score', async () => {
      // テストデータを作成（低品質スコア）
      logger.startTask('Task 1');
      await logger.completeTask('success', 50);

      logger.startTask('Task 2');
      await logger.completeTask('success', 60);

      logger.startTask('Task 3');
      await logger.completeTask('success', 70);

      // トレンド分析を実行
      const analysis = await analyzer.analyzeTrends(7);

      // 平均品質スコア60なので、改善提案が含まれる
      const qualitySuggestion = analysis.suggestions.find(s =>
        s.title.includes('品質')
      );
      expect(qualitySuggestion).toBeDefined();
      expect(qualitySuggestion?.priority).toBe('high');
    });
  });

  describe('saveAnalysis', () => {
    it('should save analysis to file', async () => {
      // テストデータを作成
      logger.startTask('Task 1');
      await logger.completeTask('success', 100);

      // トレンド分析を実行
      const analysis = await analyzer.analyzeTrends(7);

      // 分析結果を保存
      await analyzer.saveAnalysis(analysis);

      // ファイルが作成されたことを確認
      const files = await fs.readdir(testAnalysisDir);
      expect(files.length).toBeGreaterThan(0);

      const analysisFile = files.find(f => f.startsWith('trend-analysis-'));
      expect(analysisFile).toBeDefined();

      // ファイル内容を確認
      const filePath = path.join(testAnalysisDir, analysisFile!);
      const content = await fs.readFile(filePath, 'utf-8');
      const savedAnalysis = JSON.parse(content);

      expect(savedAnalysis.analyzed).toBe(true);
      expect(savedAnalysis.period).toEqual(analysis.period);
    });
  });
});
