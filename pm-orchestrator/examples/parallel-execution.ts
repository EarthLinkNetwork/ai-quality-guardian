/**
 * PM Orchestrator Enhancement - Parallel Execution Example
 *
 * 並列実行の例: 複数のタスクを同時に実行
 */

import { ParallelExecutor } from '../src/workflow/parallel-executor';
import { ProgressTracker } from '../src/visualization/progress-tracker';
import { TerminalUI } from '../src/visualization/terminal-ui';

async function main() {
  // 初期化
  const executor = new ParallelExecutor(3); // 最大3並列
  const tracker = new ProgressTracker();
  const ui = new TerminalUI();

  // リスナー登録
  tracker.addListener(progress => {
    ui.displayProgress(progress);
  });

  console.log('Parallel Execution Example\n');
  console.log('='.repeat(60) + '\n');

  // 実行するタスク
  const tasks = [
    {
      id: 'task-1',
      name: 'Analyze Code Quality',
      fn: async () => {
        console.log('Analyzing code quality...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { status: 'success', message: 'Code quality is good' };
      }
    },
    {
      id: 'task-2',
      name: 'Run Unit Tests',
      fn: async () => {
        console.log('Running unit tests...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { status: 'success', message: 'All tests passed' };
      }
    },
    {
      id: 'task-3',
      name: 'Check Dependencies',
      fn: async () => {
        console.log('Checking dependencies...');
        await new Promise(resolve => setTimeout(resolve, 800));
        return { status: 'success', message: 'Dependencies are up to date' };
      }
    },
    {
      id: 'task-4',
      name: 'Lint Code',
      fn: async () => {
        console.log('Linting code...');
        await new Promise(resolve => setTimeout(resolve, 1200));
        return { status: 'success', message: 'No lint errors' };
      }
    }
  ];

  try {
    // タスクを追加
    tasks.forEach(task => {
      tracker.startTask(task.id, task.name);
      executor.addTask(task.id, task.fn, 5000); // 5秒タイムアウト
    });

    console.log('Executing tasks in parallel (max 3 concurrent)...\n');

    // 全タスクを実行
    const results = await executor.waitAll();

    console.log('\n' + '='.repeat(60));
    console.log('All Tasks Complete');
    console.log('='.repeat(60));

    results.forEach((result, index) => {
      const task = tasks[index];
      tracker.completeTask(task.id);

      if (result.status === 'fulfilled') {
        console.log(`✓ ${task.name}: ${result.value.message}`);
      } else {
        console.log(`✗ ${task.name}: ${result.reason}`);
      }
    });

    // サマリー表示
    console.log('\n');
    ui.displaySummary(tracker.getAllProgress());
  } catch (error) {
    console.error('\nError:', (error as Error).message);
    process.exit(1);
  }
}

main();
