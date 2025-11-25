/**
 * PM Orchestrator Enhancement - Terminal UI
 *
 * ターミナルUIを表示します
 */

import { TaskProgress } from './progress-tracker';

export class TerminalUI {
  private currentTaskId?: string;

  /**
   * 進捗を表示します
   */
  public displayProgress(progress: TaskProgress): void {
    this.currentTaskId = progress.taskId;

    console.log('\n' + '='.repeat(60));
    console.log(`Task: ${progress.taskName}`);
    console.log(`Status: ${this.formatStatus(progress.status)}`);
    console.log(`Progress: ${this.formatProgressBar(progress.progress)}`);

    if (progress.currentSubagent) {
      console.log(`Current: ${progress.currentSubagent}`);
    }

    if (progress.startTime) {
      console.log(`Started: ${new Date(progress.startTime).toLocaleString()}`);
    }

    if (progress.endTime) {
      const duration = this.calculateDuration(
        progress.startTime!,
        progress.endTime
      );
      console.log(`Completed: ${new Date(progress.endTime).toLocaleString()}`);
      console.log(`Duration: ${duration}ms`);
    }

    console.log('='.repeat(60));
  }

  /**
   * サマリーを表示します
   */
  public displaySummary(allProgress: TaskProgress[]): void {
    console.log('\n' + '='.repeat(60));
    console.log('Task Execution Summary');
    console.log('='.repeat(60));

    const completed = allProgress.filter(p => p.status === 'completed').length;
    const failed = allProgress.filter(p => p.status === 'failed').length;
    const inProgress = allProgress.filter(p => p.status === 'in_progress').length;
    const pending = allProgress.filter(p => p.status === 'pending').length;

    console.log(`Completed: ${completed}`);
    console.log(`Failed: ${failed}`);
    console.log(`In Progress: ${inProgress}`);
    console.log(`Pending: ${pending}`);
    console.log('='.repeat(60));
  }

  /**
   * ステータスをフォーマット（プライベート）
   */
  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      pending: '⏳ Pending',
      in_progress: '🔄 In Progress',
      completed: '✅ Completed',
      failed: '❌ Failed'
    };

    return statusMap[status] || status;
  }

  /**
   * プログレスバーをフォーマット（プライベート）
   */
  private formatProgressBar(progress: number): string {
    const barLength = 40;
    const filledLength = Math.round((progress / 100) * barLength);
    const emptyLength = barLength - filledLength;

    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);

    return `[${filled}${empty}] ${progress.toFixed(1)}%`;
  }

  /**
   * 期間を計算（プライベート）
   */
  private calculateDuration(startTime: string, endTime: string): number {
    return new Date(endTime).getTime() - new Date(startTime).getTime();
  }
}
