/**
 * Tool Visualizer Module
 *
 * Read、Edit、Bash等のツール呼び出しを可視化します。
 */

import { ColorCode, AgentColor } from './color-code';

export interface ToolCall {
  tool: string;
  description: string;
  result?: 'success' | 'error';
  output?: string;
  timestamp: Date;
}

export class ToolVisualizer {
  private toolCalls: ToolCall[] = [];

  /**
   * ツール呼び出しを記録
   */
  recordToolCall(tool: string, description: string): void {
    this.toolCalls.push({
      tool,
      description,
      timestamp: new Date()
    });
  }

  /**
   * ツール呼び出しの結果を記録
   */
  recordToolResult(result: 'success' | 'error', output?: string): void {
    const lastCall = this.toolCalls[this.toolCalls.length - 1];
    if (lastCall) {
      lastCall.result = result;
      lastCall.output = output;
    }
  }

  /**
   * ツール呼び出しを表示
   */
  displayToolCall(toolCall: ToolCall): string {
    const header = ColorCode.formatToolCall(toolCall.tool, toolCall.description);

    if (!toolCall.result) {
      return header;
    }

    const resultIcon = toolCall.result === 'success' ? '✅' : '❌';
    const resultColor = toolCall.result === 'success' ? '\x1b[32m' : '\x1b[31m';
    const resultText = `${resultColor}${resultIcon} ${toolCall.result}${AgentColor.RESET}`;

    let output = `${header}\n  ${resultText}`;

    if (toolCall.output) {
      const preview = this.truncateOutput(toolCall.output);
      output += `\n  Output: ${preview}`;
    }

    return output;
  }

  /**
   * 全てのツール呼び出しを表示
   */
  displayAll(): string {
    if (this.toolCalls.length === 0) {
      return 'No tool calls recorded.';
    }

    const lines = this.toolCalls.map(call => this.displayToolCall(call));
    return lines.join('\n\n');
  }

  /**
   * ツール呼び出しのサマリーを表示
   */
  displaySummary(): string {
    const total = this.toolCalls.length;
    const successful = this.toolCalls.filter(c => c.result === 'success').length;
    const failed = this.toolCalls.filter(c => c.result === 'error').length;

    const toolCounts = this.countToolUsage();
    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => `  - ${tool}: ${count}`)
      .join('\n');

    return `
Tool Call Summary:
  Total: ${total}
  Successful: ${successful}
  Failed: ${failed}

Top Tools:
${topTools}
    `.trim();
  }

  /**
   * ツール使用頻度をカウント
   */
  private countToolUsage(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const call of this.toolCalls) {
      counts[call.tool] = (counts[call.tool] || 0) + 1;
    }

    return counts;
  }

  /**
   * 出力を切り詰める
   */
  private truncateOutput(output: string, maxLength: number = 100): string {
    if (output.length <= maxLength) {
      return output;
    }

    return `${output.substring(0, maxLength)}... (${output.length} chars total)`;
  }

  /**
   * ツール呼び出し履歴をクリア
   */
  clear(): void {
    this.toolCalls = [];
  }

  /**
   * ツール呼び出し履歴を取得
   */
  getToolCalls(): ToolCall[] {
    return [...this.toolCalls];
  }
}
