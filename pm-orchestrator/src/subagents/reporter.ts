/**
 * PM Orchestrator Enhancement - Reporter Subagent
 *
 * 全サブエージェントの結果を統合してユーザー向けレポートを作成します
 */

import { ReporterOutput, ReportDetails } from '../types';

export class Reporter {
  private version = '1.0.0';

  /**
   * レポートを作成します
   *
   * @param subagentResults サブエージェント結果
   * @param executionLog 実行ログ
   * @returns レポート
   */
  public async createReport(
    subagentResults: any[],
    executionLog: any
  ): Promise<ReporterOutput> {
    const status = this.determineStatus(subagentResults);
    const title = this.generateTitle(status, executionLog);
    const summary = this.generateSummary(subagentResults);
    const details = this.generateDetails(subagentResults, executionLog);
    const nextSteps = this.generateNextSteps(status, subagentResults);
    const userFriendlyMessage = this.generateUserFriendlyMessage(
      status,
      summary,
      nextSteps
    );

    return {
      status,
      title,
      summary,
      details,
      nextSteps,
      userFriendlyMessage
    };
  }

  /**
   * ステータスを決定（プライベート）
   */
  private determineStatus(
    subagentResults: any[]
  ): 'success' | 'warning' | 'error' {
    const hasError = subagentResults.some(
      result => result.status === 'error' || result.status === 'fail'
    );
    const hasWarning = subagentResults.some(
      result => result.status === 'warning'
    );

    if (hasError) return 'error';
    if (hasWarning) return 'warning';
    return 'success';
  }

  /**
   * タイトルを生成（プライベート）
   */
  private generateTitle(status: string, _executionLog: any): string {
    const statusEmoji = {
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    const emoji = statusEmoji[status as keyof typeof statusEmoji] || '';
    return `${emoji} Task Execution ${status.toUpperCase()}`;
  }

  /**
   * サマリーを生成（プライベート）
   */
  private generateSummary(subagentResults: any[]): string {
    const totalSubagents = subagentResults.length;
    const successCount = subagentResults.filter(
      r => r.status === 'success' || r.status === 'pass' || r.status === 'completed'
    ).length;

    return `Executed ${totalSubagents} subagents: ${successCount} successful, ${
      totalSubagents - successCount
    } failed or incomplete.`;
  }

  /**
   * 詳細を生成（プライベート）
   */
  private generateDetails(
    subagentResults: any[],
    executionLog: any
  ): ReportDetails {
    const taskOverview = this.generateTaskOverview(executionLog);
    const executedSteps = this.generateExecutedSteps(subagentResults);
    const changes = this.generateChanges(subagentResults);
    const verification = this.generateVerification(subagentResults);
    const warnings = this.generateWarnings(subagentResults);
    const errors = this.generateErrors(subagentResults);

    return {
      taskOverview,
      executedSteps,
      changes,
      verification,
      warnings,
      errors
    };
  }

  /**
   * タスク概要を生成（プライベート）
   */
  private generateTaskOverview(executionLog: any): string {
    return `Task: ${executionLog?.taskName || 'Unknown'}\nDuration: ${
      executionLog?.duration || 'N/A'
    }ms`;
  }

  /**
   * 実行ステップを生成（プライベート）
   */
  private generateExecutedSteps(subagentResults: any[]): string[] {
    return subagentResults.map(
      result => `${result.agent?.name || 'Unknown'}: ${result.status || 'Unknown'}`
    );
  }

  /**
   * 変更内容を生成（プライベート）
   */
  private generateChanges(subagentResults: any[]): string[] {
    const changes: string[] = [];

    subagentResults.forEach(result => {
      if (result.filesCreated) {
        changes.push(`Created: ${result.filesCreated.length} files`);
      }
      if (result.filesModified) {
        changes.push(`Modified: ${result.filesModified.length} files`);
      }
      if (result.filesDeleted) {
        changes.push(`Deleted: ${result.filesDeleted.length} files`);
      }
    });

    return changes;
  }

  /**
   * 検証内容を生成（プライベート）
   */
  private generateVerification(subagentResults: any[]): string[] {
    const verification: string[] = [];

    subagentResults.forEach(result => {
      if (result.lint) {
        verification.push(
          `Lint: ${result.lint.passed ? 'Passed' : 'Failed'}`
        );
      }
      if (result.test) {
        verification.push(
          `Test: ${result.test.passed ? 'Passed' : 'Failed'}`
        );
      }
      if (result.typecheck) {
        verification.push(
          `Typecheck: ${result.typecheck.passed ? 'Passed' : 'Failed'}`
        );
      }
      if (result.build) {
        verification.push(
          `Build: ${result.build.passed ? 'Passed' : 'Failed'}`
        );
      }
    });

    return verification;
  }

  /**
   * 警告を生成（プライベート）
   */
  private generateWarnings(subagentResults: any[]): string[] {
    const warnings: string[] = [];

    subagentResults.forEach(result => {
      if (result.recommendations) {
        warnings.push(...result.recommendations);
      }
    });

    return warnings;
  }

  /**
   * エラーを生成（プライベート）
   */
  private generateErrors(subagentResults: any[]): string[] {
    const errors: string[] = [];

    subagentResults.forEach(result => {
      if (result.errors) {
        errors.push(...result.errors);
      }
      if (result.violations) {
        errors.push(
          ...result.violations.map((v: any) => v.description || v.message)
        );
      }
    });

    return errors;
  }

  /**
   * 次のステップを生成（プライベート）
   */
  private generateNextSteps(
    status: string,
    _subagentResults: any[]
  ): string[] {
    const nextSteps: string[] = [];

    if (status === 'error') {
      nextSteps.push('Fix all errors before proceeding');
      nextSteps.push('Review error details in the report');
    } else if (status === 'warning') {
      nextSteps.push('Review warnings and address if necessary');
      nextSteps.push('Consider running additional checks');
    } else {
      nextSteps.push('All checks passed - ready to proceed');
      nextSteps.push('Consider creating a pull request');
    }

    return nextSteps;
  }

  /**
   * ユーザー向けメッセージを生成（プライベート）
   */
  private generateUserFriendlyMessage(
    status: string,
    summary: string,
    nextSteps: string[]
  ): string {
    let message = `## Task Execution Report\n\n`;
    message += `**Status:** ${status.toUpperCase()}\n\n`;
    message += `**Summary:**\n${summary}\n\n`;
    message += `**Next Steps:**\n`;
    nextSteps.forEach(step => {
      message += `- ${step}\n`;
    });

    return message;
  }
}
