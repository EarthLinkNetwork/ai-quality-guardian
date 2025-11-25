/**
 * PM Orchestrator Enhancement - Execution Logger
 *
 * タスク実行の詳細を記録し、ログファイルとして保存します。
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ExecutionLog, SubagentExecution } from '../types';

/**
 * ExecutionLoggerクラス
 *
 * タスク実行の開始から完了までの全ての情報を記録します。
 * ログは `.pm-orchestrator/logs/` ディレクトリに保存されます。
 */
export class ExecutionLogger {
  private currentLog: ExecutionLog | null = null;
  private logDir: string;

  /**
   * コンストラクタ
   *
   * @param baseDir ログディレクトリのベースパス（デフォルト: カレントディレクトリ）
   */
  constructor(baseDir: string = process.cwd()) {
    this.logDir = path.join(baseDir, '.pm-orchestrator', 'logs');
  }

  /**
   * タスクを開始し、新しい実行ログを作成します
   *
   * @param userInput ユーザーの入力
   * @param taskType タスクの種類（オプション）
   * @param complexity タスクの複雑度（オプション）
   * @param detectedPattern 検出されたパターン（オプション）
   * @returns タスクIDと初期化されたログ
   */
  public startTask(
    userInput: string,
    taskType: string = 'unknown',
    complexity: string = 'medium',
    detectedPattern: string = 'none'
  ): { taskId: string; log: ExecutionLog } {
    const now = new Date().toISOString();
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.currentLog = {
      taskId,
      startTime: now,
      endTime: '',
      duration: 0,
      userInput,
      taskType,
      complexity,
      detectedPattern,
      subagents: [],
      status: 'success',
      autoFixAttempted: false,
      autoFixSuccess: false,
      retryCount: 0,
      rollbackExecuted: false,
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
      testsAdded: 0,
      qualityScore: 0
    };

    return {
      taskId,
      log: { ...this.currentLog }
    };
  }

  /**
   * サブエージェントの実行を記録します
   *
   * @param name サブエージェント名
   * @param status 実行状態
   * @param output 実行結果の出力
   * @param error エラーメッセージ（オプション）
   * @param toolsUsed 使用したツールのリスト（オプション）
   */
  public recordSubagent(
    name: string,
    status: string,
    output: any,
    error?: string,
    toolsUsed: any[] = []
  ): void {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    const now = new Date().toISOString();
    const startTime = this.currentLog.subagents.find(s => s.name === name)?.startTime || now;
    const duration = new Date(now).getTime() - new Date(startTime).getTime();

    const subagentExecution: SubagentExecution = {
      name,
      startTime,
      endTime: now,
      duration,
      status: status as any,
      toolsUsed,
      output,
      error
    };

    // 既存のサブエージェント記録を更新または新規追加
    const existingIndex = this.currentLog.subagents.findIndex(s => s.name === name);
    if (existingIndex >= 0) {
      this.currentLog.subagents[existingIndex] = subagentExecution;
    } else {
      this.currentLog.subagents.push(subagentExecution);
    }
  }

  /**
   * 自動修正の試行を記録します
   *
   * @param attempted 自動修正を試行したか
   * @param success 自動修正が成功したか
   */
  public recordAutoFix(attempted: boolean, success: boolean): void {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    this.currentLog.autoFixAttempted = attempted;
    this.currentLog.autoFixSuccess = success;
  }

  /**
   * リトライの実行を記録します
   */
  public recordRetry(): void {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    this.currentLog.retryCount += 1;
  }

  /**
   * ロールバックの実行を記録します
   */
  public recordRollback(): void {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    this.currentLog.rollbackExecuted = true;
    this.currentLog.status = 'rollback';
  }

  /**
   * ファイル変更の統計を記録します
   *
   * @param filesChanged 変更されたファイルの数
   * @param linesAdded 追加された行数
   * @param linesDeleted 削除された行数
   * @param testsAdded 追加されたテストの数
   */
  public recordFileChanges(
    filesChanged: number,
    linesAdded: number,
    linesDeleted: number,
    testsAdded: number = 0
  ): void {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    this.currentLog.filesChanged = filesChanged;
    this.currentLog.linesAdded = linesAdded;
    this.currentLog.linesDeleted = linesDeleted;
    this.currentLog.testsAdded = testsAdded;
  }

  /**
   * タスクを完了し、最終的なログを保存します
   *
   * @param status タスクの最終状態
   * @param qualityScore 品質スコア
   * @param errorType エラータイプ（オプション）
   * @returns 完成したログ
   */
  public async completeTask(
    status: 'success' | 'error' | 'rollback',
    qualityScore: number,
    errorType?: string
  ): Promise<ExecutionLog> {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    const now = new Date().toISOString();
    this.currentLog.endTime = now;
    this.currentLog.status = status;
    this.currentLog.qualityScore = qualityScore;
    this.currentLog.duration =
      new Date(now).getTime() - new Date(this.currentLog.startTime).getTime();

    if (errorType) {
      this.currentLog.errorType = errorType;
    }

    // ログをファイルに保存
    await this.saveLogToFile(this.currentLog);

    const completedLog = { ...this.currentLog };
    this.currentLog = null;

    return completedLog;
  }

  /**
   * ログをファイルに保存します
   *
   * @param log 保存するログ
   */
  private async saveLogToFile(log: ExecutionLog): Promise<void> {
    // ログディレクトリが存在しない場合は作成
    await fs.mkdir(this.logDir, { recursive: true });

    // 日付ベースのファイル名を生成
    const date = new Date(log.startTime);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `${dateStr}_${log.taskId}.json`;
    const filePath = path.join(this.logDir, fileName);

    // JSON形式で保存
    await fs.writeFile(
      filePath,
      JSON.stringify(log, null, 2),
      'utf-8'
    );
  }

  /**
   * 特定期間のログを読み込みます
   *
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns 該当期間のログの配列
   */
  public async getLogsBetween(
    startDate: Date,
    endDate: Date
  ): Promise<ExecutionLog[]> {
    const logs: ExecutionLog[] = [];

    // ログディレクトリが存在しない場合は空配列を返す
    try {
      await fs.access(this.logDir);
    } catch {
      return logs;
    }

    // ログファイルを読み込み
    const files = await fs.readdir(this.logDir);
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(this.logDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const log: ExecutionLog = JSON.parse(content);

      const logDate = new Date(log.startTime);
      if (logDate >= startDate && logDate <= endDate) {
        logs.push(log);
      }
    }

    return logs.sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }

  /**
   * 現在のアクティブなログを取得します（主にテスト用）
   *
   * @returns 現在のログ、またはnull
   */
  public getCurrentLog(): ExecutionLog | null {
    return this.currentLog ? { ...this.currentLog } : null;
  }
}
