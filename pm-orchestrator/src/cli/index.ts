#!/usr/bin/env node
/**
 * PM Orchestrator Enhancement - CLI
 *
 * コマンドラインインターフェース
 */

import { PMOrchestrator } from '../orchestrator/pm-orchestrator';
// import { ExecutionLogger } from '../logger/execution-logger';
import { ProgressTracker, TerminalUI } from '../visualization';
import { runSelfCheck, formatResult } from '../install/selfCheck';
import { execSync } from 'child_process';
import * as path from 'path';

const VERSION = '1.0.3';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`PM Orchestrator Enhancement v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'install':
      runInstall(args.slice(1));
      break;
    case 'uninstall':
      runUninstall(args.slice(1));
      break;
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
    case 'selfcheck':
      await runSelfCheckCommand(args.slice(1));
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
  install     Install PM Orchestrator to a project (.claude/ directory)
  uninstall   Remove PM Orchestrator from a project
  selfcheck   Verify installation integrity (8 checks)
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
  pm-orchestrator install              Install to current directory
  pm-orchestrator install ./my-project Install to specific directory
  pm-orchestrator uninstall            Remove from current directory
  pm-orchestrator execute --task "Add user authentication"
  pm-orchestrator analyze --files "src/**/*.ts" --type quality
  pm-orchestrator design --requirements "User management system"
  pm-orchestrator implement --design design.md --files src/
  pm-orchestrator test --type unit --coverage 80
  pm-orchestrator qa --checks lint,test,typecheck,build

For more information, visit: https://github.com/pm-orchestrator/pm-orchestrator-enhancement
`);
}

function runInstall(args: string[]) {
  const targetDir = args[0] || '.';
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'install.sh');

  console.log(`Installing PM Orchestrator to ${targetDir}...`);

  try {
    execSync(`bash "${scriptPath}" "${targetDir}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Installation failed');
    process.exit(1);
  }
}

function runUninstall(args: string[]) {
  const targetDir = args[0] || '.';
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'uninstall.sh');

  console.log(`Uninstalling PM Orchestrator from ${targetDir}...`);

  try {
    execSync(`bash "${scriptPath}" "${targetDir}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Uninstallation failed');
    process.exit(1);
  }
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

async function runSelfCheckCommand(args: string[]) {
  const targetDir = args[0] || '.';
  console.log(`Running self-check on ${targetDir}...\n`);

  const result = await runSelfCheck(targetDir);
  console.log(formatResult(result));

  process.exit(result.success ? 0 : 1);
}

// Run CLI
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
