/**
 * PM Orchestrator Enhancement - ParallelExecutor Unit Tests
 */

import { ParallelExecutor, Semaphore } from '../../../src/workflow/parallel-executor';

describe('Semaphore', () => {
  it('should acquire and release permits', async () => {
    const semaphore = new Semaphore(2);

    await semaphore.acquire();
    await semaphore.acquire();

    // 3つ目のacquireは待機状態になるはず
    let thirdAcquired = false;
    const thirdAcquire = semaphore.acquire().then(() => {
      thirdAcquired = true;
    });

    // まだ3つ目は取得できていない
    expect(thirdAcquired).toBe(false);

    // 1つ解放
    semaphore.release();

    // 3つ目が取得できる
    await thirdAcquire;
    expect(thirdAcquired).toBe(true);
  });

  it('should handle multiple waiting tasks', async () => {
    const semaphore = new Semaphore(1);

    await semaphore.acquire();

    const acquired: number[] = [];

    const task1 = semaphore.acquire().then(() => acquired.push(1));
    const task2 = semaphore.acquire().then(() => acquired.push(2));
    const task3 = semaphore.acquire().then(() => acquired.push(3));

    // まだ誰も取得できていない
    expect(acquired.length).toBe(0);

    // 解放すると順番に取得
    semaphore.release();
    await task1;
    expect(acquired).toEqual([1]);

    semaphore.release();
    await task2;
    expect(acquired).toEqual([1, 2]);

    semaphore.release();
    await task3;
    expect(acquired).toEqual([1, 2, 3]);
  });
});

describe('ParallelExecutor', () => {
  it('should execute tasks in parallel', async () => {
    const executor = new ParallelExecutor(3);

    const startTime = Date.now();
    const results = await executor.executeParallel([
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'task1';
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'task2';
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'task3';
      }
    ]);
    const duration = Date.now() - startTime;

    expect(results).toEqual(['task1', 'task2', 'task3']);
    // 並行実行なので、約100msで完了するはず（直列なら300ms）
    expect(duration).toBeLessThan(200);
  });

  it('should respect concurrency limit', async () => {
    const executor = new ParallelExecutor(2);

    let concurrent = 0;
    let maxConcurrent = 0;

    const createTask = () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(resolve => setTimeout(resolve, 50));
      concurrent--;
      return 'done';
    };

    await executor.executeParallel([
      createTask(),
      createTask(),
      createTask(),
      createTask()
    ]);

    // 最大同時実行数は2であるべき
    expect(maxConcurrent).toBe(2);
  });

  it('should handle task errors', async () => {
    const executor = new ParallelExecutor(3);

    await expect(
      executor.executeParallel([
        async () => 'task1',
        async () => {
          throw new Error('Task failed');
        },
        async () => 'task3'
      ])
    ).rejects.toThrow('Task failed');
  });

  it('should handle timeout', async () => {
    const executor = new ParallelExecutor(3);

    await expect(
      executor.executeParallel(
        [
          async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
            return 'task1';
          }
        ],
        100 // 100ms timeout
      )
    ).rejects.toThrow('Task timeout after 100ms');
  });

  it('should complete fast tasks before timeout', async () => {
    const executor = new ParallelExecutor(3);

    const results = await executor.executeParallel(
      [
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'task1';
        },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 30));
          return 'task2';
        }
      ],
      100 // 100ms timeout
    );

    expect(results).toEqual(['task1', 'task2']);
  });

  it('should execute empty task list', async () => {
    const executor = new ParallelExecutor(3);

    const results = await executor.executeParallel([]);

    expect(results).toEqual([]);
  });

  it('should execute single task', async () => {
    const executor = new ParallelExecutor(3);

    const results = await executor.executeParallel([
      async () => 'single-task'
    ]);

    expect(results).toEqual(['single-task']);
  });
});
