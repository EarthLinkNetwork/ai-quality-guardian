/**
 * Pattern Detector Module
 *
 * ユーザー入力からタスクパターンを検出し、適切なワークフローを推奨します。
 */

import { WorkflowDefinition } from '../workflow/workflow-config';

export interface PatternMatch {
  pattern: string;
  confidence: number; // 0-1
  workflow?: WorkflowDefinition;
  reasons: string[];
}

export interface DetectionResult {
  matches: PatternMatch[];
  recommendation?: WorkflowDefinition;
  shouldUsePM: boolean;
}

export class PatternDetector {
  private patterns: Map<string, RegExp[]> = new Map();

  constructor() {
    this.initializePatterns();
  }

  /**
   * パターンの初期化
   */
  private initializePatterns(): void {
    // PRレビュー対応パターン
    this.patterns.set('pr-review', [
      /pr\s*review/i,
      /coderabbit/i,
      /review\s*comment/i,
      /address\s*review/i,
      /fix\s*review/i
    ]);

    // バージョン更新パターン
    this.patterns.set('version-update', [
      /version\s*update/i,
      /bump\s*version/i,
      /update\s*version/i,
      /version\s*\d+\.\d+\.\d+/i
    ]);

    // 品質チェックパターン
    this.patterns.set('quality-check', [
      /run\s*lint/i,
      /run\s*test/i,
      /quality\s*check/i,
      /run\s*build/i,
      /type\s*check/i
    ]);

    // 複雑な実装パターン
    this.patterns.set('complex-implementation', [
      /implement\s*feature/i,
      /add\s*new\s*feature/i,
      /create\s*module/i,
      /refactor/i,
      /architecture/i
    ]);

    // 一覧修正パターン
    this.patterns.set('list-modification', [
      /update\s*all/i,
      /fix\s*all/i,
      /replace\s*all/i,
      /modify\s*all/i,
      /\d+\s*(?:files|places|locations)/i
    ]);

    // Git操作パターン
    this.patterns.set('git-operation', [
      /git\s*commit/i,
      /git\s*push/i,
      /create\s*pr/i,
      /merge\s*branch/i,
      /git\s*rebase/i
    ]);

    // ドキュメント作成パターン
    this.patterns.set('documentation', [
      /write\s*doc/i,
      /create\s*readme/i,
      /update\s*doc/i,
      /document/i
    ]);

    // テスト作成パターン
    this.patterns.set('test-creation', [
      /write\s*test/i,
      /create\s*test/i,
      /add\s*test/i,
      /test\s*coverage/i
    ]);

    // デバッグパターン
    this.patterns.set('debugging', [
      /debug/i,
      /fix\s*bug/i,
      /error/i,
      /not\s*working/i,
      /broken/i
    ]);

    // セキュリティパターン
    this.patterns.set('security', [
      /security/i,
      /vulnerability/i,
      /permission/i,
      /authentication/i,
      /authorization/i
    ]);
  }

  /**
   * ユーザー入力からパターンを検出
   */
  detect(userInput: string): DetectionResult {
    const matches: PatternMatch[] = [];

    // 各パターンカテゴリをチェック
    for (const [category, patterns] of this.patterns.entries()) {
      const matchCount = patterns.filter(p => p.test(userInput)).length;

      if (matchCount > 0) {
        const confidence = matchCount / patterns.length;
        const reasons = this.getMatchReasons(userInput, patterns);

        matches.push({
          pattern: category,
          confidence,
          reasons
        });
      }
    }

    // 信頼度でソート
    matches.sort((a, b) => b.confidence - a.confidence);

    // PM Orchestrator使用を推奨すべきか判定
    const shouldUsePM = this.shouldRecommendPM(userInput, matches);

    return {
      matches,
      shouldUsePM
    };
  }

  /**
   * マッチ理由を取得
   */
  private getMatchReasons(input: string, patterns: RegExp[]): string[] {
    const reasons: string[] = [];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        reasons.push(`Matched: "${match[0]}"`);
      }
    }

    return reasons;
  }

  /**
   * PM Orchestrator使用を推奨すべきか判定
   */
  private shouldRecommendPM(input: string, matches: PatternMatch[]): boolean {
    // 複数パターンマッチ
    if (matches.length >= 2) {
      return true;
    }

    // 高信頼度マッチ
    if (matches.some(m => m.confidence >= 0.8)) {
      return true;
    }

    // 複雑さのキーワード
    const complexityKeywords = [
      /multiple\s*files/i,
      /several\s*steps/i,
      /\d+\s*tasks/i,
      /complex/i,
      /comprehensive/i
    ];

    if (complexityKeywords.some(k => k.test(input))) {
      return true;
    }

    // ファイル数の検出
    const fileCountMatch = input.match(/(\d+)\s*files?/i);
    if (fileCountMatch && parseInt(fileCountMatch[1]) >= 5) {
      return true;
    }

    // ステップ数の検出
    const stepCountMatch = input.match(/(\d+)\s*steps?/i);
    if (stepCountMatch && parseInt(stepCountMatch[1]) >= 3) {
      return true;
    }

    return false;
  }

  /**
   * 推奨メッセージを生成
   */
  generateRecommendation(result: DetectionResult): string {
    if (!result.shouldUsePM) {
      return '';
    }

    const lines: string[] = [
      '📊 複雑なタスクを検出しました',
      '',
      'このタスクはPM Orchestratorによる管理が推奨されます:',
      '- 複数ステップの調整',
      '- サブエージェント間の連携',
      '- 品質チェックの自動化',
      ''
    ];

    if (result.matches.length > 0) {
      lines.push('検出されたパターン:');
      for (const match of result.matches) {
        const confidence = (match.confidence * 100).toFixed(0);
        lines.push(`  - ${match.pattern} (信頼度: ${confidence}%)`);
      }
      lines.push('');
    }

    lines.push('PM Orchestratorを起動しますか？');

    return lines.join('\n');
  }

  /**
   * カスタムパターンを追加
   */
  addPattern(category: string, pattern: RegExp): void {
    const existing = this.patterns.get(category) || [];
    existing.push(pattern);
    this.patterns.set(category, existing);
  }

  /**
   * パターンカテゴリを削除
   */
  removePattern(category: string): boolean {
    return this.patterns.delete(category);
  }

  /**
   * 全パターンカテゴリを取得
   */
  getAllPatterns(): Map<string, RegExp[]> {
    return new Map(this.patterns);
  }

  /**
   * 複雑度スコアを計算
   */
  calculateComplexityScore(input: string, matches: PatternMatch[]): number {
    let score = 0;

    // パターンマッチ数
    score += matches.length * 10;

    // 信頼度の合計
    score += matches.reduce((sum, m) => sum + m.confidence * 20, 0);

    // 入力長
    if (input.length > 200) {
      score += 10;
    }

    // キーワード密度
    const keywords = ['implement', 'create', 'update', 'fix', 'test', 'deploy'];
    const keywordCount = keywords.filter(k => input.toLowerCase().includes(k)).length;
    score += keywordCount * 5;

    // ファイル数
    const fileMatch = input.match(/(\d+)\s*files?/i);
    if (fileMatch) {
      score += Math.min(parseInt(fileMatch[1]) * 2, 30);
    }

    return Math.min(score, 100); // 最大100
  }

  /**
   * 推奨されるサブエージェントを取得
   */
  getRecommendedAgents(matches: PatternMatch[]): string[] {
    const agents: Set<string> = new Set();

    for (const match of matches) {
      switch (match.pattern) {
        case 'pr-review':
          agents.add('rule-checker');
          agents.add('implementer');
          agents.add('qa');
          break;

        case 'version-update':
          agents.add('implementer');
          break;

        case 'quality-check':
          agents.add('qa');
          break;

        case 'complex-implementation':
          agents.add('designer');
          agents.add('implementer');
          agents.add('qa');
          break;

        case 'test-creation':
          agents.add('implementer');
          agents.add('qa');
          break;

        case 'security':
          agents.add('rule-checker');
          agents.add('implementer');
          break;

        default:
          agents.add('implementer');
      }
    }

    // 常にreporterを追加
    agents.add('reporter');

    return Array.from(agents);
  }
}
