/**
 * PM Orchestrator Enhancement - RetryStrategy Unit Tests
 */

import { RetryStrategy } from '../../../src/error/retry-strategy';

describe('RetryStrategy', () => {
  it('should execute task successfully on first attempt', async () => {
    const strategy = new RetryStrategy({
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 100
    });

    const task = jest.fn().mockResolvedValue('success');

    const result = await strategy.executeWithRetry(task);

    expect(result).toBe('success');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const strategy = new RetryStrategy({
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 100
    });

    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockResolvedValue('success');

    const result = await strategy.executeWithRetry(task);

    expect(result).toBe('success');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max attempts', async () => {
    const strategy = new RetryStrategy({
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 50
    });

    const task = jest.fn().mockRejectedValue(new Error('Task failed'));

    await expect(strategy.executeWithRetry(task)).rejects.toThrow('Task failed');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('should apply backoff delay between retries', async () => {
    const strategy = new RetryStrategy({
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 100
    });

    const startTime = Date.now();
    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockResolvedValue('success');

    await strategy.executeWithRetry(task);

    const duration = Date.now() - startTime;

    // 1回目のリトライ: 100ms待機
    // 2回目のリトライ: 200ms待機
    // 合計約300ms以上の待機時間
    expect(duration).toBeGreaterThanOrEqual(250);
  });

  it('should return correct max attempts', () => {
    const strategy = new RetryStrategy({
      maxAttempts: 5,
      backoffMultiplier: 2,
      initialDelay: 100
    });

    expect(strategy.getMaxAttempts()).toBe(5);
  });

  it('should return correct backoff multiplier', () => {
    const strategy = new RetryStrategy({
      maxAttempts: 3,
      backoffMultiplier: 3,
      initialDelay: 100
    });

    expect(strategy.getBackoffMultiplier()).toBe(3);
  });

  it('should return correct initial delay', () => {
    const strategy = new RetryStrategy({
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 500
    });

    expect(strategy.getInitialDelay()).toBe(500);
  });

  it('should use default config when not provided', async () => {
    const strategy = new RetryStrategy();

    expect(strategy.getMaxAttempts()).toBe(3);
    expect(strategy.getBackoffMultiplier()).toBe(2);
    expect(strategy.getInitialDelay()).toBe(1000);
  });
});
