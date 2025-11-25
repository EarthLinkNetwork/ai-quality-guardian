/**
 * PM Orchestrator Enhancement - Basic Workflow Example
 *
 * 基本的なワークフロー例: シンプルなタスク実行
 */

import { PMOrchestrator } from '../src/orchestrator/pm-orchestrator';
import { ProgressTracker } from '../src/visualization/progress-tracker';
import { TerminalUI } from '../src/visualization/terminal-ui';

async function main() {
  // 初期化
  const orchestrator = new PMOrchestrator();
  const tracker = new ProgressTracker();
  const ui = new TerminalUI();

  // リスナー登録
  tracker.addListener(progress => {
    ui.displayProgress(progress);
  });

  console.log('Basic Workflow Example\n');
  console.log('='.repeat(60) + '\n');

  try {
    // タスクを実行
    const result = await orchestrator.executeTask({
      userInput: 'Add user authentication feature',
      detectedPattern: undefined
    });

    console.log('\n' + '='.repeat(60));
    console.log('Task Execution Complete');
    console.log('='.repeat(60));
    console.log(`Status: ${result.status}`);
    console.log(`Task ID: ${result.taskId}`);
    console.log(`Summary: ${result.summary}`);

    console.log('\nSubagents:');
    result.subagentResults.forEach(subagent => {
      console.log(`  - ${subagent.name}: ${subagent.status} (${subagent.duration}ms)`);
    });

    if (result.nextSteps.length > 0) {
      console.log('\nNext Steps:');
      result.nextSteps.forEach(step => console.log(`  - ${step}`));
    }
  } catch (error) {
    console.error('\nError:', (error as Error).message);
    process.exit(1);
  }
}

main();
