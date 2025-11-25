/**
 * PM Orchestrator Enhancement - Retry Strategy
 *
 * リトライ戦略を実装します。バックオフアルゴリズムを使用して、リトライ間隔を徐々に増やします。
 */

export interface RetryConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelay: number;
}

/**
 * RetryStrategyクラス
 *
 * リトライロジックを提供します。
 */
export class RetryStrategy {
  private maxAttempts: number;
  private backoffMultiplier: number;
  private initialDelay: number;

  /**
   * コンストラクタ
   *
   * @param config リトライ設定
   */
  constructor(config: RetryConfig = {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelay: 1000
  }) {
    this.maxAttempts = config.maxAttempts;
    this.backoffMultiplier = config.backoffMultiplier;
    this.initialDelay = config.initialDelay;
  }

  /**
   * タスクをリトライ付きで実行します
   *
   * @param task 実行するタスク
   * @returns タスクの実行結果
   */
  public async executeWithRetry<T>(task: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await task();
      } catch (error) {
        lastError = error as Error;

        // 最後の試行の場合はエラーをスロー
        if (attempt === this.maxAttempts) {
          throw lastError;
        }

        // バックオフ待機
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    // 実行されないパスだが、TypeScriptの型チェックのため
    throw lastError || new Error('Retry failed');
  }

  /**
   * リトライ間隔を計算します（バックオフアルゴリズム）
   *
   * @param attempt 試行回数
   * @returns 待機時間（ミリ秒）
   */
  private calculateDelay(attempt: number): number {
    return this.initialDelay * Math.pow(this.backoffMultiplier, attempt - 1);
  }

  /**
   * 指定時間だけ待機します
   *
   * @param ms 待機時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 最大試行回数を取得します
   *
   * @returns 最大試行回数
   */
  public getMaxAttempts(): number {
    return this.maxAttempts;
  }

  /**
   * バックオフ倍率を取得します
   *
   * @returns バックオフ倍率
   */
  public getBackoffMultiplier(): number {
    return this.backoffMultiplier;
  }

  /**
   * 初期遅延時間を取得します
   *
   * @returns 初期遅延時間（ミリ秒）
   */
  public getInitialDelay(): number {
    return this.initialDelay;
  }
}
