#!/usr/bin/env node
/**
 * PM Orchestrator Enhancement - CLI
 *
 * コマンドラインインターフェース
 */

import { PMOrchestrator } from '../orchestrator/pm-orchestrator';
// import { ExecutionLogger } from '../logger/execution-logger';
import { ProgressTracker, TerminalUI } from '../visualization';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('PM Orchestrator Enhancement v1.0.0');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'execute':
      await executeTask(args.slice(1));
      break;
    case 'analyze':
      await analyzeCode(args.slice(1));
      break;
    case 'design':
      await createDesign(args.slice(1));
      break;
    case 'implement':
      await implementFeature(args.slice(1));
      break;
    case 'test':
      await runTests(args.slice(1));
      break;
    case 'qa':
      await runQA(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "pm-orchestrator --help" for usage information');
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
PM Orchestrator Enhancement - Multi-Agent Development Orchestration System

Usage:
  pm-orchestrator <command> [options]

Commands:
  execute     Execute a complete task with automatic subagent selection
  analyze     Analyze code quality, similarity, or architecture
  design      Create design documents based on requirements
  implement   Implement features based on design
  test        Create and run tests
  qa          Run quality checks (lint, test, typecheck, build)

Options:
  -h, --help     Show this help message
  -v, --version  Show version information

Examples:
  pm-orchestrator execute --task "Add user authentication"
  pm-orchestrator analyze --files "src/**/*.ts" --type quality
  pm-orchestrator design --requirements "User management system"
  pm-orchestrator implement --design design.md --files src/
  pm-orchestrator test --type unit --coverage 80
  pm-orchestrator qa --checks lint,test,typecheck,build

For more information, visit: https://github.com/pm-orchestrator/pm-orchestrator-enhancement
`);
}

async function executeTask(args: string[]) {
  const tracker = new ProgressTracker();
  const ui = new TerminalUI();
  const orchestrator = new PMOrchestrator();

  // リスナー登録
  tracker.addListener(progress => {
    ui.displayProgress(progress);
  });

  const taskDescription = args.join(' ') || 'Unnamed task';

  console.log(`Executing task: ${taskDescription}\n`);

  try {
    const result = await orchestrator.executeTask({
      userInput: taskDescription,
      detectedPattern: undefined
    });

    console.log('\n' + '='.repeat(60));
    console.log('Task Execution Complete');
    console.log('='.repeat(60));
    console.log(`Status: ${result.status}`);
    console.log(`Subagents: ${result.subagentResults.map(r => r.name).join(', ')}`);
    console.log(`Summary: ${result.summary}`);

    if (result.nextSteps.length > 0) {
      console.log('\nNext Steps:');
      result.nextSteps.forEach((step: string) => console.log(`  - ${step}`));
    }
  } catch (error) {
    console.error('\nError executing task:', (error as Error).message);
    process.exit(1);
  }
}

async function analyzeCode(args: string[]) {
  console.log('Code analysis feature coming soon...');
  console.log('Arguments:', args);
}

async function createDesign(args: string[]) {
  console.log('Design creation feature coming soon...');
  console.log('Arguments:', args);
}

async function implementFeature(args: string[]) {
  console.log('Implementation feature coming soon...');
  console.log('Arguments:', args);
}

async function runTests(args: string[]) {
  console.log('Test execution feature coming soon...');
  console.log('Arguments:', args);
}

async function runQA(args: string[]) {
  console.log('QA checks feature coming soon...');
  console.log('Arguments:', args);
}

// Run CLI
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
