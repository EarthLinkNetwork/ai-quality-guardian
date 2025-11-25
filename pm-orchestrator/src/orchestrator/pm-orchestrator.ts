/**
 * PM Orchestrator Enhancement - PM Orchestrator Core
 *
 * タスク分析、サブエージェント起動、結果集約を担当するコア機能です。
 */

import { ExecutionLogger } from '../logger/execution-logger';
import {
  PMOrchestratorInput,
  PMOrchestratorOutput,
  SubagentResult,
  SubagentStatus
} from '../types';

/**
 * PMOrchestratorクラス
 *
 * ユーザー入力を分析し、適切なサブエージェントを起動して結果を集約します。
 */
export class PMOrchestrator {
  private logger: ExecutionLogger;
  private baseDir: string;

  /**
   * コンストラクタ
   *
   * @param baseDir ベースディレクトリ（デフォルト: カレントディレクトリ）
   */
  constructor(baseDir: string = process.cwd()) {
    this.logger = new ExecutionLogger(baseDir);
    this.baseDir = baseDir;
  }

  /**
   * タスクを実行します
   *
   * @param input PM Orchestratorへの入力
   * @returns PM Orchestratorからの出力
   */
  public async executeTask(input: PMOrchestratorInput): Promise<PMOrchestratorOutput> {
    // タスクを開始
    const { taskId } = this.logger.startTask(
      input.userInput,
      'unknown', // タスクタイプは分析で決定
      'medium',  // 複雑度は分析で決定
      input.detectedPattern || 'none'
    );

    try {
      // タスクを分析
      const taskAnalysis = this.analyzeTask(input);

      // 必要なサブエージェントを決定
      const subagents = this.selectSubagents(taskAnalysis);

      // サブエージェントを実行
      const subagentResults: SubagentResult[] = [];
      for (const subagent of subagents) {
        const result = await this.executeSubagent(subagent, input);
        subagentResults.push(result);

        // 実行を記録
        this.logger.recordSubagent(
          subagent,
          result.status === 'success' ? SubagentStatus.COMPLETED : SubagentStatus.FAILED,
          result.output,
          result.error
        );

        // エラーが発生した場合は中断
        if (result.status === 'error') {
          break;
        }
      }

      // タスクを完了
      const allSuccess = subagentResults.every(r => r.status === 'success');
      const qualityScore = this.calculateQualityScore(subagentResults);

      const executionLog = await this.logger.completeTask(
        allSuccess ? 'success' : 'error',
        qualityScore
      );

      // 結果を返す
      return {
        taskId,
        status: allSuccess ? 'success' : 'partial',
        subagentResults,
        executionLog,
        summary: this.generateSummary(subagentResults),
        nextSteps: this.generateNextSteps(subagentResults)
      };
    } catch (error) {
      // エラー処理
      const executionLog = await this.logger.completeTask(
        'error',
        0,
        'EXECUTION_ERROR'
      );

      return {
        taskId,
        status: 'error',
        subagentResults: [],
        executionLog,
        summary: `タスク実行中にエラーが発生しました: ${error}`,
        nextSteps: ['エラーログを確認してください']
      };
    }
  }

  /**
   * タスクを分析します（プライベートメソッド）
   *
   * @param input PM Orchestratorへの入力
   * @returns タスク分析結果
   */
  private analyzeTask(input: PMOrchestratorInput): TaskAnalysis {
    const userInput = input.userInput.toLowerCase();

    // タスクタイプの判定
    let taskType = 'unknown';
    if (userInput.includes('pr') || userInput.includes('review')) {
      taskType = 'pr_review';
    } else if (userInput.includes('implement') || userInput.includes('feature')) {
      taskType = 'implementation';
    } else if (userInput.includes('test')) {
      taskType = 'testing';
    } else if (userInput.includes('fix') || userInput.includes('bug')) {
      taskType = 'bugfix';
    }

    // 複雑度の判定
    let complexity: 'simple' | 'medium' | 'complex' = 'medium';
    if (userInput.includes('simple') || userInput.includes('small')) {
      complexity = 'simple';
    } else if (userInput.includes('complex') || userInput.includes('large')) {
      complexity = 'complex';
    }

    return {
      taskType,
      complexity,
      detectedPattern: input.detectedPattern || 'none'
    };
  }

  /**
   * 必要なサブエージェントを選択します（プライベートメソッド）
   *
   * @param analysis タスク分析結果
   * @returns サブエージェント名の配列
   */
  private selectSubagents(analysis: TaskAnalysis): string[] {
    const subagents: string[] = [];

    // 全てのタスクでルールチェックを実行
    subagents.push('rule-checker');

    // タスクタイプに応じてサブエージェントを追加
    switch (analysis.taskType) {
      case 'pr_review':
        subagents.push('code-analyzer', 'qa', 'reporter');
        break;

      case 'implementation':
        if (analysis.complexity === 'complex') {
          subagents.push('designer');
        }
        subagents.push('implementer', 'tester', 'qa', 'reporter');
        break;

      case 'testing':
        subagents.push('tester', 'qa', 'reporter');
        break;

      case 'bugfix':
        subagents.push('code-analyzer', 'implementer', 'qa', 'reporter');
        break;

      default:
        // 不明なタスクの場合は基本的なサブエージェントのみ
        subagents.push('reporter');
    }

    return subagents;
  }

  /**
   * サブエージェントを実行します（プライベートメソッド）
   *
   * @param subagent サブエージェント名
   * @param input PM Orchestratorへの入力
   * @returns サブエージェント実行結果
   */
  private async executeSubagent(
    subagent: string,
    input: PMOrchestratorInput
  ): Promise<SubagentResult> {
    const startTime = Date.now();

    try {
      // 実際の実装では、Task toolを使用してサブエージェントを起動します
      // ここではモック実装として、成功を返します
      const output = {
        message: `${subagent} executed successfully`,
        input: input.userInput
      };

      const duration = Date.now() - startTime;

      return {
        name: subagent,
        status: 'success',
        duration,
        output
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        name: subagent,
        status: 'error',
        duration,
        output: null,
        error: String(error)
      };
    }
  }

  /**
   * 品質スコアを計算します（プライベートメソッド）
   *
   * @param results サブエージェント実行結果の配列
   * @returns 品質スコア（0-100）
   */
  private calculateQualityScore(results: SubagentResult[]): number {
    if (results.length === 0) return 0;

    const successCount = results.filter(r => r.status === 'success').length;
    return (successCount / results.length) * 100;
  }

  /**
   * サマリーを生成します（プライベートメソッド）
   *
   * @param results サブエージェント実行結果の配列
   * @returns サマリー文字列
   */
  private generateSummary(results: SubagentResult[]): string {
    const successCount = results.filter(r => r.status === 'success').length;
    const totalCount = results.length;

    return `${totalCount}個のサブエージェントのうち${successCount}個が成功しました。`;
  }

  /**
   * 次のステップを生成します（プライベートメソッド）
   *
   * @param results サブエージェント実行結果の配列
   * @returns 次のステップの配列
   */
  private generateNextSteps(results: SubagentResult[]): string[] {
    const failedSubagents = results.filter(r => r.status === 'error');

    if (failedSubagents.length === 0) {
      return ['全てのサブエージェントが正常に完了しました'];
    }

    return failedSubagents.map(
      s => `${s.name}のエラーを確認してください: ${s.error}`
    );
  }
}

/**
 * タスク分析結果の型定義（内部使用）
 */
interface TaskAnalysis {
  taskType: string;
  complexity: 'simple' | 'medium' | 'complex';
  detectedPattern: string;
}
