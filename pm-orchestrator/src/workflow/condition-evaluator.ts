/**
 * Condition Evaluator Module
 *
 * ワークフローステップの条件評価エンジンを提供します。
 */

import { SubagentResult } from '../types';

export class ConditionEvaluator {
  /**
   * 条件式を評価
   *
   * 例:
   * - "implementer.status == 'success'"
   * - "qa.output.qualityScore > 80"
   * - "rule-checker.findings.length == 0"
   */
  evaluate(condition: string, context: Map<string, SubagentResult>): boolean {
    try {
      // 安全な評価環境を構築
      const safeContext = this.buildSafeContext(context);

      // 条件式を評価
      const result = this.evaluateExpression(condition, safeContext);

      return Boolean(result);
    } catch (error) {
      console.error(`Failed to evaluate condition: ${condition}`, error);
      return false;
    }
  }

  /**
   * 安全な評価コンテキストを構築
   */
  private buildSafeContext(context: Map<string, SubagentResult>): Record<string, any> {
    const safeContext: Record<string, any> = {};

    for (const [agentName, result] of context.entries()) {
      safeContext[agentName] = {
        status: result.status,
        duration: result.duration,
        output: result.output,
        error: result.error,
        // メタデータ
        findings: (result.output as any)?.findings || [],
        qualityScore: (result.output as any)?.qualityScore,
        metrics: (result.output as any)?.metrics
      };
    }

    return safeContext;
  }

  /**
   * 式を評価（安全な実装）
   */
  private evaluateExpression(expression: string, context: Record<string, any>): any {
    // シンプルな式のパース
    const tokens = this.tokenize(expression);

    // 左辺値を取得
    const leftValue = this.resolveValue(tokens[0], context);

    // 演算子がない場合は真偽値として評価
    if (tokens.length === 1) {
      return leftValue;
    }

    // 演算子を取得
    const operator = tokens[1];

    // 右辺値を取得
    const rightValue = this.parseValue(tokens[2]);

    // 演算を実行
    return this.performOperation(leftValue, operator, rightValue);
  }

  /**
   * 式をトークンに分割
   */
  private tokenize(expression: string): string[] {
    // 演算子で分割
    const operators = ['==', '!=', '>', '<', '>=', '<=', '&&', '||'];
    let tokens: string[] = [expression];

    for (const op of operators) {
      const newTokens: string[] = [];

      for (const token of tokens) {
        if (token.includes(op)) {
          const parts = token.split(op);
          newTokens.push(parts[0].trim(), op, parts[1].trim());
        } else {
          newTokens.push(token);
        }
      }

      tokens = newTokens;
    }

    return tokens;
  }

  /**
   * 値を解決（ドット記法をサポート）
   */
  private resolveValue(path: string, context: Record<string, any>): any {
    const parts = path.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * 文字列を適切な型にパース
   */
  private parseValue(value: string): any {
    // 文字列リテラル
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // 数値
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }

    // 真偽値
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;

    // その他はそのまま返す
    return value;
  }

  /**
   * 演算を実行
   */
  private performOperation(left: any, operator: string, right: any): boolean {
    switch (operator) {
      case '==':
        return left == right;
      case '!=':
        return left != right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      case '&&':
        return left && right;
      case '||':
        return left || right;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * 複数の条件を評価（AND結合）
   */
  evaluateAll(conditions: string[], context: Map<string, SubagentResult>): boolean {
    return conditions.every(condition => this.evaluate(condition, context));
  }

  /**
   * 複数の条件を評価（OR結合）
   */
  evaluateAny(conditions: string[], context: Map<string, SubagentResult>): boolean {
    return conditions.some(condition => this.evaluate(condition, context));
  }
}
