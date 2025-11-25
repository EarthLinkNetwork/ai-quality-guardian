/**
 * PM Orchestrator Enhancement - Parallel Executor
 *
 * サブエージェントの並行実行を制御します。
 */

/**
 * Semaphoreクラス
 *
 * 同時実行数を制限するためのセマフォ実装です。
 */
export class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  /**
   * コンストラクタ
   *
   * @param permits 同時実行可能な数
   */
  constructor(permits: number) {
    this.permits = permits;
  }

  /**
   * セマフォを取得します（非同期）
   */
  public async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.waiting.push(resolve);
    });
  }

  /**
   * セマフォを解放します
   */
  public release(): void {
    this.permits++;

    const resolve = this.waiting.shift();
    if (resolve) {
      this.permits--;
      resolve();
    }
  }
}

/**
 * ParallelExecutorクラス
 *
 * 並行実行を制御し、タスクを並行して実行します。
 */
export class ParallelExecutor {
  private semaphore: Semaphore;

  /**
   * コンストラクタ
   *
   * @param maxConcurrent 最大同時実行数
   */
  constructor(maxConcurrent: number = 3) {
    this.semaphore = new Semaphore(maxConcurrent);
  }

  /**
   * タスクを並行実行します
   *
   * @param tasks 実行するタスクの配列
   * @param timeout タイムアウト時間（ミリ秒）
   * @returns タスク実行結果の配列
   */
  public async executeParallel<T>(
    tasks: Array<() => Promise<T>>,
    timeout?: number
  ): Promise<T[]> {
    const promises = tasks.map(task =>
      this.executeWithSemaphore(task, timeout)
    );

    return Promise.all(promises);
  }

  /**
   * セマフォ付きでタスクを実行します（プライベートメソッド）
   *
   * @param task 実行するタスク
   * @param timeout タイムアウト時間（ミリ秒）
   * @returns タスク実行結果
   */
  private async executeWithSemaphore<T>(
    task: () => Promise<T>,
    timeout?: number
  ): Promise<T> {
    await this.semaphore.acquire();

    try {
      if (timeout) {
        return await this.executeWithTimeout(task, timeout);
      } else {
        return await task();
      }
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * タイムアウト付きでタスクを実行します（プライベートメソッド）
   *
   * @param task 実行するタスク
   * @param timeout タイムアウト時間（ミリ秒）
   * @returns タスク実行結果
   */
  private async executeWithTimeout<T>(
    task: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      task(),
      this.createTimeoutPromise<T>(timeout)
    ]);
  }

  /**
   * タイムアウトPromiseを作成します（プライベートメソッド）
   *
   * @param timeout タイムアウト時間（ミリ秒）
   * @returns タイムアウトPromise
   */
  private createTimeoutPromise<T>(timeout: number): Promise<T> {
    return new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);
    });
  }
}
