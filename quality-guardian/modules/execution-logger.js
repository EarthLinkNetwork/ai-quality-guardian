/**
 * Execution Logger - PM Orchestrator実行ログ記録
 *
 * 各タスク実行の詳細なログを記録し、品質メトリクスを収集する。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ExecutionLogger {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.logsDir = path.join(projectRoot, '.quality-guardian/logs');
    this.currentLog = null;
    this.taskStartTime = null;
  }

  /**
   * ログディレクトリを初期化
   */
  ensureLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * タスクIDを生成
   */
  generateTaskId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}-${random}`;
  }

  /**
   * タスク種別を分析
   */
  analyzeTaskType(userInput) {
    const input = userInput.toLowerCase();

    if (input.includes('bug') || input.includes('fix') || input.includes('修正')) {
      return 'bug_fix';
    }
    if (input.includes('refactor') || input.includes('リファクタ')) {
      return 'refactoring';
    }
    if (input.includes('pr') || input.includes('review') || input.includes('レビュー')) {
      return 'pr_review';
    }

    return 'new_feature';
  }

  /**
   * 複雑度を分析
   */
  analyzeComplexity(userInput) {
    const words = userInput.split(/\s+/).length;

    if (words < 10) return 'simple';
    if (words < 30) return 'medium';
    return 'complex';
  }

  /**
   * パターンを検出
   */
  detectPattern(userInput) {
    const input = userInput.toLowerCase();

    if (input.includes('coderabbit') || input.includes('コメント') && input.includes('解決')) {
      return 'CODERABBIT_RESOLVE';
    }
    if (input.includes('リスト') || input.includes('list')) {
      return 'LIST_MODIFICATION';
    }
    if (input.includes('pr') && input.includes('review')) {
      return 'PR_REVIEW_RESPONSE';
    }

    return 'GENERAL';
  }

  /**
   * タスク開始
   */
  startTask(userInput) {
    this.ensureLogsDir();

    const taskId = this.generateTaskId();
    const startTime = new Date().toISOString();
    this.taskStartTime = Date.now();

    this.currentLog = {
      // 基本情報
      taskId,
      startTime,
      endTime: '',
      duration: 0,

      // タスク情報
      userInput: userInput.substring(0, 200),
      taskType: this.analyzeTaskType(userInput),
      complexity: this.analyzeComplexity(userInput),
      detectedPattern: this.detectPattern(userInput),

      // サブエージェント実行記録
      subagents: [],

      // 結果
      status: 'success',
      errorType: null,
      autoFixAttempted: false,
      autoFixSuccess: false,
      retryCount: 0,
      rollbackExecuted: false,

      // 品質メトリクス
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
      testsAdded: 0,
      qualityScore: 0
    };

    return { taskId, log: this.currentLog };
  }

  /**
   * サブエージェント実行を記録
   */
  recordSubagent(name, status, output, error = null) {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    const now = new Date().toISOString();
    const subagentStart = this.currentLog.subagents.length > 0
      ? this.currentLog.subagents[this.currentLog.subagents.length - 1].endTime
      : this.currentLog.startTime;

    const duration = new Date(now).getTime() - new Date(subagentStart).getTime();

    const subagentExecution = {
      name,
      startTime: subagentStart,
      endTime: now,
      duration,
      status,
      errorMessage: error,
      outputSummary: output ? output.substring(0, 500) : ''
    };

    this.currentLog.subagents.push(subagentExecution);
  }

  /**
   * Git統計を収集
   */
  collectGitStats() {
    try {
      const { execSync } = require('child_process');

      // 変更ファイル数
      const filesChanged = execSync('git diff --name-only | wc -l', { encoding: 'utf8' }).trim();

      // 追加・削除行数
      const diffStat = execSync('git diff --shortstat', { encoding: 'utf8' });
      const addedMatch = diffStat.match(/(\d+) insertion/);
      const deletedMatch = diffStat.match(/(\d+) deletion/);

      return {
        filesChanged: parseInt(filesChanged) || 0,
        linesAdded: addedMatch ? parseInt(addedMatch[1]) : 0,
        linesDeleted: deletedMatch ? parseInt(deletedMatch[1]) : 0
      };
    } catch (error) {
      return {
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0
      };
    }
  }

  /**
   * テスト追加数をカウント
   */
  countAddedTests() {
    try {
      const { execSync } = require('child_process');

      // .test. または .spec. を含む新規ファイルをカウント
      const testFiles = execSync(
        'git diff --name-only --diff-filter=A | grep -E "\\.(test|spec)\\." | wc -l',
        { encoding: 'utf8' }
      ).trim();

      return parseInt(testFiles) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * タスク完了
   */
  completeTask(status, qualityScore = 0, errorType = null) {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    const endTime = new Date().toISOString();
    const duration = Date.now() - this.taskStartTime;

    // Git統計を収集
    const gitStats = this.collectGitStats();
    const testsAdded = this.countAddedTests();

    // ログを更新
    this.currentLog.endTime = endTime;
    this.currentLog.duration = duration;
    this.currentLog.status = status;
    this.currentLog.errorType = errorType;
    this.currentLog.filesChanged = gitStats.filesChanged;
    this.currentLog.linesAdded = gitStats.linesAdded;
    this.currentLog.linesDeleted = gitStats.linesDeleted;
    this.currentLog.testsAdded = testsAdded;
    this.currentLog.qualityScore = qualityScore;

    // ログをファイルに保存
    this.saveLog();

    const completedLog = this.currentLog;
    this.currentLog = null;
    this.taskStartTime = null;

    return completedLog;
  }

  /**
   * 自動修正の試行を記録
   */
  recordAutoFix(attempted, success) {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    this.currentLog.autoFixAttempted = attempted;
    this.currentLog.autoFixSuccess = success;
  }

  /**
   * リトライを記録
   */
  recordRetry() {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    this.currentLog.retryCount += 1;
  }

  /**
   * ロールバックを記録
   */
  recordRollback() {
    if (!this.currentLog) {
      throw new Error('No active task. Call startTask() first.');
    }

    this.currentLog.rollbackExecuted = true;
  }

  /**
   * ログをファイルに保存
   */
  saveLog() {
    if (!this.currentLog) {
      throw new Error('No log to save.');
    }

    const timestamp = new Date(this.currentLog.startTime)
      .toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '');

    const filename = `pm-orchestrator-${timestamp}.json`;
    const filepath = path.join(this.logsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.currentLog, null, 2));
  }

  /**
   * 最近のログを読み込み
   */
  loadRecentLogs(days = 7) {
    this.ensureLogsDir();

    const files = fs.readdirSync(this.logsDir)
      .filter(f => f.startsWith('pm-orchestrator-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(this.logsDir, f),
        mtime: fs.statSync(path.join(this.logsDir, f)).mtime
      }))
      .filter(f => {
        const ageInDays = (Date.now() - f.mtime.getTime()) / (1000 * 60 * 60 * 24);
        return ageInDays <= days;
      })
      .sort((a, b) => b.mtime - a.mtime);

    return files.map(f => JSON.parse(fs.readFileSync(f.path, 'utf8')));
  }
}

module.exports = ExecutionLogger;
