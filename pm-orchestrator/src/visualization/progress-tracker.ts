/**
 * PM Orchestrator Enhancement - Progress Tracker
 *
 * リアルタイム進捗を追跡します
 * ColorCode統合とテストAPI対応
 */

import { ColorCode } from './color-code';

export interface TaskProgress {
  taskId: string;
  taskName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  startTime?: string;
  endTime?: string;
  currentSubagent?: string;
}

export class ProgressTracker {
  private tasks: Map<string, TaskProgress> = new Map();
  private listeners: Array<(progress: TaskProgress) => void> = [];

  /**
   * タスクを開始します（第3引数追加: currentSubagent）
   */
  public startTask(taskId: string, taskName: string, currentSubagent?: string): void {
    const task: TaskProgress = {
      taskId,
      taskName,
      status: 'in_progress',
      progress: 0,
      startTime: new Date().toISOString(),
      currentSubagent
    };

    this.tasks.set(taskId, task);
    this.notifyListeners(task);
  }

  /**
   * タスクの進捗を更新します
   */
  public updateProgress(
    taskId: string,
    progress: number,
    currentSubagent?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.progress = Math.min(100, Math.max(0, progress));
    if (currentSubagent) {
      task.currentSubagent = currentSubagent;
    }

    this.tasks.set(taskId, task);
    this.notifyListeners(task);
  }

  /**
   * タスクを完了します
   */
  public completeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'completed';
    task.progress = 100;
    task.endTime = new Date().toISOString();

    this.tasks.set(taskId, task);
    this.notifyListeners(task);
  }

  /**
   * タスクを失敗させます
   */
  public failTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'failed';
    task.endTime = new Date().toISOString();

    this.tasks.set(taskId, task);
    this.notifyListeners(task);
  }

  /**
   * 進捗リスナーを追加します
   */
  public addListener(listener: (progress: TaskProgress) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 進捗リスナーを削除します
   */
  public removeListener(listener: (progress: TaskProgress) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 全タスクの進捗を取得します
   */
  public getAllProgress(): TaskProgress[] {
    return Array.from(this.tasks.values());
  }

  /**
   * タスクの進捗を取得します
   */
  public getProgress(taskId: string): TaskProgress | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * タスクの進捗を取得します（エイリアス）
   */
  public getTask(taskId: string): TaskProgress | undefined {
    return this.getProgress(taskId);
  }

  /**
   * タスクを失敗させます（エイリアス）
   */
  public errorTask(taskId: string): void {
    this.failTask(taskId);
  }

  /**
   * 進捗を表示します（TerminalUI統合）
   */
  public displayProgress(): string {
    const tasks = Array.from(this.tasks.values());
    if (tasks.length === 0) {
      return 'No tasks in progress.';
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('━'.repeat(60));
    lines.push('📊 PM Orchestrator 実行状況');
    lines.push('━'.repeat(60));
    lines.push('');

    for (const task of tasks) {
      const statusIcon = this.getStatusIcon(task.status);
      const agentName = task.currentSubagent || 'unknown';
      const coloredAgent = ColorCode.colorize(agentName, agentName);
      
      lines.push(`${statusIcon} ${coloredAgent.padEnd(20)} - ${task.taskName} (${task.progress.toFixed(0)}%)`);
    }

    lines.push('');
    lines.push('━'.repeat(60));
    lines.push(`Summary: ${tasks.length} task(s)`);
    lines.push('━'.repeat(60));

    return lines.join('\n');
  }

  /**
   * ステータスアイコンを取得
   */
  private getStatusIcon(status: string): string {
    const iconMap: Record<string, string> = {
      'pending': '⏳',
      'in_progress': '🔄',
      'completed': '✅',
      'failed': '❌'
    };
    return iconMap[status] || '⚪';
  }

  /**
   * リスナーに通知します（プライベート）
   */
  private notifyListeners(progress: TaskProgress): void {
    this.listeners.forEach(listener => {
      try {
        listener(progress);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }
}
