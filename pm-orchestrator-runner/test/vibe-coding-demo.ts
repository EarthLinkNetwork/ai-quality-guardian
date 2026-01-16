#!/usr/bin/env npx ts-node
/**
 * Vibe Coding Acceptance Demo
 *
 * This script demonstrates the 6-step verification process:
 * 1. REPL で「〇〇を作って」と入力
 * 2. RunnerCore が ClaudeCodeExecutor を呼び出し
 * 3. ClaudeCodeExecutor が claude CLI を spawn
 * 4. Claude Code が実際にファイルを生成
 * 5. files_modified にファイル名が記録
 * 6. 成果物 0 件なら INCOMPLETE（fail-closed）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunnerCore } from '../src/core/runner-core';
import { ClaudeCodeExecutor } from '../src/executor/claude-code-executor';

async function runDemo() {
  console.log('='.repeat(60));
  console.log('Vibe Coding Acceptance Demo');
  console.log('='.repeat(60));

  // Create temp directory for the test
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-demo-'));
  console.log(`\nTest directory: ${tempDir}`);

  // Create project structure with minimal .claude config (no hooks to avoid interference)
  const projectDir = tempDir;
  fs.mkdirSync(path.join(projectDir, '.claude'));
  // Minimal CLAUDE.md with no PM Orchestrator hooks
  fs.writeFileSync(path.join(projectDir, '.claude', 'CLAUDE.md'), `# Demo Project

This is a minimal demo project for vibe coding test.
`);
  // Empty settings with no hooks
  fs.writeFileSync(path.join(projectDir, '.claude', 'settings.json'), JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    permissions: {},
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, 'pm-orchestrator.yaml'), 'tasks: []');

  console.log('\n--- Step 1: Check Claude Code CLI availability ---');
  const executor = new ClaudeCodeExecutor({ projectPath: projectDir, timeout: 30000 });
  const available = await executor.isClaudeCodeAvailable();
  console.log(`Claude Code CLI available: ${available}`);

  if (!available) {
    console.log('\n[SKIP] Claude Code CLI not available - cannot demo actual execution');
    console.log('The integration is implemented, but requires Claude Code CLI to be installed.');
    fs.rmSync(tempDir, { recursive: true, force: true });
    return;
  }

  console.log('\n--- Step 2: Create RunnerCore with useClaudeCode: true ---');
  const runner = new RunnerCore({
    evidenceDir: path.join(tempDir, 'evidence'),
    useClaudeCode: true,
    claudeCodeTimeout: 180000, // 3 minutes (Claude Code may take time)
  });

  await runner.initialize(projectDir);
  console.log(`Session ID: ${runner.getSessionId()}`);

  console.log('\n--- Step 3: Submit natural language task ---');
  const task = {
    id: 'vibe-demo-1',
    description: 'Create a hello file',
    naturalLanguageTask: 'Create a file named hello-vibe.txt containing "Hello from Vibe Coding Demo"',
  };
  console.log(`Task: ${task.naturalLanguageTask}`);

  console.log('\n--- Step 4: Execute task (Claude Code spawned) ---');
  try {
    await runner.executeTasksSequentially([task]);
    console.log('Task execution completed');
  } catch (err) {
    console.log(`Task execution error: ${(err as Error).message}`);
  }

  console.log('\n--- Step 5: Check results ---');
  const results = runner.getTaskResults();
  console.log(`Task results count: ${results.length}`);
  if (results.length > 0) {
    const result = results[0];
    console.log(`Task ID: ${result.task_id}`);
    console.log(`Status: ${result.status}`);
    console.log(`Evidence: ${JSON.stringify(result.evidence, null, 2)}`);
  }

  console.log('\n--- Step 6: Verify file was created ---');
  const helloPath = path.join(projectDir, 'hello-vibe.txt');
  const fileExists = fs.existsSync(helloPath);
  console.log(`File exists: ${fileExists}`);
  if (fileExists) {
    const content = fs.readFileSync(helloPath, 'utf-8');
    console.log(`File content: ${content.substring(0, 100)}`);
  }

  // List all files in project to show what was created
  console.log('\n--- Files in project after execution ---');
  const files = fs.readdirSync(projectDir);
  for (const file of files) {
    console.log(`  ${file}`);
  }

  // Cleanup
  await runner.shutdown();
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('\n' + '='.repeat(60));
  console.log('Demo completed');
  console.log('='.repeat(60));
}

// Run the demo
runDemo().catch(console.error);
