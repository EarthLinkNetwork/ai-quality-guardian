/**
 * PM Orchestrator Enhancement - Metrics Type Definitions
 *
 * メトリクス収集とトレンド分析の型定義を提供します。
 */

import { ExecutionLog } from './core';

// ============================================================================
// Metrics Collector
// ============================================================================

/**
 * メトリクスデータ
 */
export interface Metrics {
  totalTasks: number;
  successRate: number;
  averageDuration: number;
  averageQualityScore: number;
  errorDistribution: Record<string, number>;
  subagentUsage: Record<string, number>;
}

/**
 * 日次サマリー
 */
export interface DailySummary {
  date: string;
  metrics: Metrics;
  logs: ExecutionLog[];
}

// ============================================================================
// Trend Analyzer
// ============================================================================

/**
 * トレンド分析結果
 */
export interface TrendAnalysis {
  analyzed: boolean;
  period: {
    start: string;
    end: string;
  };
  trends: Trend[];
  suggestions: Suggestion[];
}

/**
 * トレンド
 */
export interface Trend {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  change: number;
  significance: 'high' | 'medium' | 'low';
}

/**
 * 改善提案
 */
export interface Suggestion {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actions: string[];
}
