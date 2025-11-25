/**
 * Orchestrator Launcher Module
 *
 * PM Orchestratorの起動とタスク実行を管理します。
 */

import { PatternDetector, DetectionResult } from './pattern-detector';
import { SubagentResult } from '../types';

export interface LaunchOptions {
  userInput: string;
  detectionResult?: DetectionResult;
  forceAgents?: string[];
  skipPatternDetection?: boolean;
}

export interface LaunchResult {
  launched: boolean;
  agents: string[];
  results?: Map<string, SubagentResult>;
  error?: string;
}

export class OrchestratorLauncher {
  private detector: PatternDetector;
  private isRunning: boolean = false;

  constructor() {
    this.detector = new PatternDetector();
  }

  /**
   * PM Orchestratorを起動すべきか判定
   */
  shouldLaunch(userInput: string): DetectionResult {
    return this.detector.detect(userInput);
  }

  /**
   * 起動推奨メッセージを生成
   */
  generateLaunchPrompt(userInput: string): string {
    const result = this.detector.detect(userInput);

    if (!result.shouldUsePM) {
      return '';
    }

    const recommendation = this.detector.generateRecommendation(result);
    const complexityScore = this.detector.calculateComplexityScore(userInput, result.matches);
    const recommendedAgents = this.detector.getRecommendedAgents(result.matches);

    const lines: string[] = [
      recommendation,
      '',
      `複雑度スコア: ${complexityScore}/100`,
      '',
      '推奨されるサブエージェント:',
      ...recommendedAgents.map(agent => `  - ${agent}`),
      ''
    ];

    return lines.join('\n');
  }

  /**
   * PM Orchestratorを起動
   */
  async launch(options: LaunchOptions): Promise<LaunchResult> {
    if (this.isRunning) {
      return {
        launched: false,
        agents: [],
        error: 'PM Orchestrator is already running'
      };
    }

    this.isRunning = true;

    try {
      // パターン検出
      let detectionResult: DetectionResult;

      if (options.skipPatternDetection && options.forceAgents) {
        // パターン検出をスキップし、強制的に指定されたエージェントを使用
        detectionResult = {
          matches: [],
          shouldUsePM: true
        };
      } else {
        detectionResult = options.detectionResult || this.detector.detect(options.userInput);
      }

      // 使用するエージェントを決定
      const agents = options.forceAgents || this.detector.getRecommendedAgents(detectionResult.matches);

      // Task toolでpm-orchestratorを起動する指示を生成
      const launchInstruction = this.generateTaskToolInstruction(options.userInput, agents);

      return {
        launched: true,
        agents,
        results: undefined // 実際の実行結果はTask toolから返される
      };

    } catch (error) {
      return {
        launched: false,
        agents: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Task tool起動指示を生成
   */
  private generateTaskToolInstruction(userInput: string, agents: string[]): string {
    const lines: string[] = [
      'Task toolを使用してpm-orchestratorサブエージェントを起動してください:',
      '',
      '```',
      'subagent_type: "pm-orchestrator"',
      'description: "Complex task orchestration"',
      'prompt: |',
      `  ユーザー入力: ${userInput}`,
      '',
      '  このタスクを分析し、以下のサブエージェントを順番に起動してください:',
      ...agents.map((agent, index) => `  ${index + 1}. ${agent}`),
      '',
      '  各サブエージェントの結果を集約し、最終レポートを作成してください。',
      '```'
    ];

    return lines.join('\n');
  }

  /**
   * 起動状態を確認
   */
  isLaunched(): boolean {
    return this.isRunning;
  }

  /**
   * 自動起動が推奨されるか確認
   */
  recommendsAutoLaunch(userInput: string): boolean {
    const result = this.detector.detect(userInput);
    const complexityScore = this.detector.calculateComplexityScore(userInput, result.matches);

    // 複雑度スコアが60以上、またはshouldUsePMがtrueの場合、自動起動を推奨
    return result.shouldUsePM || complexityScore >= 60;
  }

  /**
   * 起動準備が整っているか確認
   */
  canLaunch(): boolean {
    return !this.isRunning;
  }

  /**
   * 起動前チェック
   */
  validateLaunch(options: LaunchOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // ユーザー入力チェック
    if (!options.userInput || options.userInput.trim().length === 0) {
      errors.push('User input is empty');
    }

    // 既に実行中かチェック
    if (this.isRunning) {
      errors.push('PM Orchestrator is already running');
    }

    // 強制エージェント指定チェック
    if (options.forceAgents && options.forceAgents.length === 0) {
      errors.push('forceAgents is empty');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 起動履歴を記録
   */
  logLaunch(options: LaunchOptions, result: LaunchResult): void {
    const timestamp = new Date().toISOString();
    const status = result.launched ? 'LAUNCHED' : 'FAILED';

    console.log(`[${timestamp}] PM Orchestrator ${status}`);
    console.log(`  User Input: ${options.userInput.substring(0, 100)}...`);
    console.log(`  Agents: ${result.agents.join(', ')}`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  /**
   * Main AIへの指示を生成
   */
  generateMainAIInstruction(userInput: string): string {
    const result = this.detector.detect(userInput);

    if (!result.shouldUsePM) {
      return ''; // 起動不要
    }

    const agents = this.detector.getRecommendedAgents(result.matches);
    const complexityScore = this.detector.calculateComplexityScore(userInput, result.matches);

    const lines: string[] = [
      '🎯 **PM Orchestrator 起動**',
      '',
      'Main AIへ: Task tool で pm-orchestrator を起動してください',
      '',
      '**検出されたパターン:**',
      ...result.matches.map(m => {
        const confidence = (m.confidence * 100).toFixed(0);
        return `- ${m.pattern} (${confidence}%)`;
      }),
      '',
      `**複雑度スコア:** ${complexityScore}/100`,
      '',
      '**推奨サブエージェント:**',
      ...agents.map((agent, index) => `${index + 1}. ${agent}`),
      '',
      '**起動手順:**',
      '```',
      'Task tool:',
      '  subagent_type: pm-orchestrator',
      '  description: Complex task orchestration',
      '  prompt: |',
      `    ユーザー入力: "${userInput}"`,
      '',
      '    タスク分析:',
      ...result.matches.map(m => `    - ${m.pattern} detected`),
      '',
      '    実行順序:',
      ...agents.map((agent, index) => `    ${index + 1}. ${agent}`),
      '```'
    ];

    return lines.join('\n');
  }
}
