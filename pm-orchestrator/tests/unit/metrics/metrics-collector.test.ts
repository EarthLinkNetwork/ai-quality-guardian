/**
 * PM Orchestrator Enhancement - MetricsCollector Unit Tests
 */

import { promises as fs } from 'fs';
import path from 'path';
import { MetricsCollector } from '../../../src/metrics/metrics-collector';
import { ExecutionLogger } from '../../../src/logger/execution-logger';
import { SubagentStatus } from '../../../src/types';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  let logger: ExecutionLogger;
  let testBaseDir: string;
  let testMetricsDir: string;

  beforeEach(async () => {
    // テストごとにユニークなディレクトリを使用
    testBaseDir = path.join(process.cwd(), `.pm-orchestrator-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    testMetricsDir = path.join(testBaseDir, '.pm-orchestrator', 'metrics');

    collector = new MetricsCollector(testBaseDir);
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

  describe('saveDailySummary', () => {
    it('should save daily summary with metrics', async () => {
      // テストデータを作成
      const today = new Date();
      today.setHours(12, 0, 0, 0);

      // タスク1: 成功
      logger.startTask('Task 1', 'feature', 'simple');
      logger.recordSubagent('rule-checker', SubagentStatus.COMPLETED, {});
      await logger.completeTask('success', 95);

      // タスク2: エラー
      logger.startTask('Task 2', 'bugfix', 'medium');
      logger.recordSubagent('implementer', SubagentStatus.FAILED, {});
      await logger.completeTask('error', 50, 'TEST_FAILURE');

      // 日次サマリーを保存
      await collector.saveDailySummary(today);

      // ファイルが作成されたことを確認
      const dateStr = today.toISOString().split('T')[0];
      const fileName = `daily-summary-${dateStr}.json`;
      const filePath = path.join(testMetricsDir, fileName);

      const content = await fs.readFile(filePath, 'utf-8');
      const summary = JSON.parse(content);

      expect(summary.date).toBe(dateStr);
      expect(summary.logCount).toBe(2);
      expect(summary.metrics.totalTasks).toBe(2);
      expect(summary.metrics.successRate).toBe(50); // 1 success out of 2
    });

    it('should save empty summary when no logs exist', async () => {
      const today = new Date();

      await collector.saveDailySummary(today);

      const dateStr = today.toISOString().split('T')[0];
      const fileName = `daily-summary-${dateStr}.json`;
      const filePath = path.join(testMetricsDir, fileName);

      const content = await fs.readFile(filePath, 'utf-8');
      const summary = JSON.parse(content);

      expect(summary.logCount).toBe(0);
      expect(summary.metrics.totalTasks).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should calculate metrics correctly', async () => {
      // テストデータを作成
      const today = new Date();
      today.setHours(12, 0, 0, 0);

      // タスク1: 成功、品質スコア95
      logger.startTask('Task 1', 'feature', 'simple');
      logger.recordSubagent('rule-checker', SubagentStatus.COMPLETED, {});
      logger.recordSubagent('implementer', SubagentStatus.COMPLETED, {});
      await new Promise(resolve => setTimeout(resolve, 10));
      await logger.completeTask('success', 95);

      // タスク2: 成功、品質スコア100
      logger.startTask('Task 2', 'feature', 'medium');
      logger.recordSubagent('designer', SubagentStatus.COMPLETED, {});
      await new Promise(resolve => setTimeout(resolve, 10));
      await logger.completeTask('success', 100);

      // タスク3: エラー、品質スコア50
      logger.startTask('Task 3', 'bugfix', 'complex');
      logger.recordSubagent('implementer', SubagentStatus.FAILED, {});
      await logger.completeTask('error', 50, 'TEST_FAILURE');

      // メトリクスを取得
      const startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);

      const metrics = await collector.getMetrics(startDate, endDate);

      // 総タスク数
      expect(metrics.totalTasks).toBe(3);

      // 成功率: 2成功 / 3タスク = 66.67%
      expect(metrics.successRate).toBeCloseTo(66.67, 1);

      // 平均品質スコア: (95 + 100 + 50) / 3 = 81.67
      expect(metrics.averageQualityScore).toBeCloseTo(81.67, 1);

      // 平均実行時間（ms）
      expect(metrics.averageDuration).toBeGreaterThanOrEqual(0);

      // エラー分布
      expect(metrics.errorDistribution).toEqual({
        TEST_FAILURE: 1
      });

      // サブエージェント使用回数
      expect(metrics.subagentUsage).toEqual({
        'rule-checker': 1,
        'implementer': 2,
        'designer': 1
      });
    });

    it('should return empty metrics when no logs exist', async () => {
      const startDate = new Date();
      const endDate = new Date();

      const metrics = await collector.getMetrics(startDate, endDate);

      expect(metrics.totalTasks).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.averageDuration).toBe(0);
      expect(metrics.averageQualityScore).toBe(0);
      expect(metrics.errorDistribution).toEqual({});
      expect(metrics.subagentUsage).toEqual({});
    });

    it('should filter logs by date range', async () => {
      // 過去のタスク（範囲外）
      logger.startTask('Old task');
      await logger.completeTask('success', 100);

      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      const startDate = new Date();

      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 10));

      // 新しいタスク（範囲内）
      logger.startTask('New task 1');
      await logger.completeTask('success', 95);

      logger.startTask('New task 2');
      await logger.completeTask('success', 90);

      const endDate = new Date(Date.now() + 1000);

      const metrics = await collector.getMetrics(startDate, endDate);

      // 範囲内の2タスクのみ
      expect(metrics.totalTasks).toBe(2);
      expect(metrics.successRate).toBe(100);
    });
  });
});
