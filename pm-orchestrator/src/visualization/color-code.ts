/**
 * ANSI Color Code Module
 *
 * サブエージェントごとに色分けされた表示を提供します。
 */

export enum AgentColor {
  PM_ORCHESTRATOR = '\x1b[33m',      // Yellow
  RULE_CHECKER = '\x1b[31m',         // Red
  CODE_ANALYZER = '\x1b[35m',        // Magenta
  DESIGNER = '\x1b[95m',             // Bright Magenta
  IMPLEMENTER = '\x1b[32m',          // Green
  TESTER = '\x1b[96m',               // Bright Cyan
  QA = '\x1b[36m',                   // Cyan
  CICD_ENGINEER = '\x1b[34m',        // Blue
  REPORTER = '\x1b[94m',             // Bright Blue
  RESET = '\x1b[0m'
}

export class ColorCode {
  /**
   * エージェント名に対応する色コードを取得
   */
  static getColor(agentName: string): string {
    const colorMap: Record<string, AgentColor> = {
      'pm-orchestrator': AgentColor.PM_ORCHESTRATOR,
      'rule-checker': AgentColor.RULE_CHECKER,
      'code-analyzer': AgentColor.CODE_ANALYZER,
      'designer': AgentColor.DESIGNER,
      'implementer': AgentColor.IMPLEMENTER,
      'tester': AgentColor.TESTER,
      'qa': AgentColor.QA,
      'cicd-engineer': AgentColor.CICD_ENGINEER,
      'reporter': AgentColor.REPORTER
    };

    return colorMap[agentName] || '';
  }

  /**
   * エージェント名を色付きで表示
   */
  static colorize(agentName: string, text: string): string {
    const color = this.getColor(agentName);
    return `${color}${text}${AgentColor.RESET}`;
  }

  /**
   * エージェント識別子を色付きで表示
   */
  static formatAgentName(agentName: string): string {
    const emoji = this.getEmoji(agentName);
    const displayName = this.getDisplayName(agentName);
    return this.colorize(agentName, `${emoji} ${displayName}`);
  }

  /**
   * エージェントに対応する絵文字を取得
   */
  private static getEmoji(agentName: string): string {
    const emojiMap: Record<string, string> = {
      'pm-orchestrator': '🎯',
      'rule-checker': '🔴',
      'code-analyzer': '🟣',
      'designer': '🟣',
      'implementer': '🟢',
      'tester': '🔵',
      'qa': '🔵',
      'cicd-engineer': '🔵',
      'reporter': '🔵'
    };

    return emojiMap[agentName] || '⚪';
  }

  /**
   * エージェントの表示名を取得
   */
  private static getDisplayName(agentName: string): string {
    const nameMap: Record<string, string> = {
      'pm-orchestrator': 'PM Orchestrator',
      'rule-checker': 'Rule Checker',
      'code-analyzer': 'Code Analyzer',
      'designer': 'Designer',
      'implementer': 'Implementer',
      'tester': 'Tester',
      'qa': 'QA',
      'cicd-engineer': 'CI/CD Engineer',
      'reporter': 'Reporter'
    };

    return nameMap[agentName] || agentName;
  }

  /**
   * 進捗状況を色付きで表示
   */
  static formatStatus(status: 'pending' | 'running' | 'completed' | 'error'): string {
    const statusMap: Record<string, { color: string; text: string }> = {
      'pending': { color: '\x1b[90m', text: '⏳ Pending' },
      'running': { color: '\x1b[33m', text: '▶️  Running' },
      'completed': { color: '\x1b[32m', text: '✅ Completed' },
      'error': { color: '\x1b[31m', text: '❌ Error' }
    };

    const { color, text } = statusMap[status];
    return `${color}${text}${AgentColor.RESET}`;
  }

  /**
   * ツール呼び出しを色付きで表示
   */
  static formatToolCall(toolName: string, description: string): string {
    const toolColor = '\x1b[36m'; // Cyan
    return `${toolColor}🔧 ${toolName}${AgentColor.RESET}: ${description}`;
  }
}
