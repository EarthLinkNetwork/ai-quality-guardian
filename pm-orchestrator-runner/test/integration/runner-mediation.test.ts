/**
 * Runner Mediation Tests (Property 8, 15, 19)
 *
 * Validates that Runner is the sole completion authority and all Claude Code
 * output is untrusted until verified by Runner.
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md:
 * - Property 8: Completion Validation Authority (Runner only)
 * - Property 15: Output Control and Validation (Claude output untrusted)
 * - Property 19: Communication Mediation (no direct Claude-user communication)
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RunnerCore } from '../../src/core/runner-core';
import {
  IExecutor,
  ExecutorTask,
  ExecutorResult,
} from '../../src/executor/claude-code-executor';

// Test fixtures
let tempDir: string;
let projectDir: string;
let evidenceDir: string;

function setupClaudeDir(): void {
  const claudeDir = path.join(projectDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
  fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Project');
  fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'agents', 'pm-orchestrator.md'), '# PM');
  fs.mkdirSync(path.join(claudeDir, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'rules', 'project-rules.md'), '# Rules');
}

describe('REPL Natural Language Task Mediation', function () {
  this.timeout(30000);

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-mediation-'));
    projectDir = tempDir;
    evidenceDir = path.join(tempDir, 'evidence');
    setupClaudeDir();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Property 8: Runner is sole completion authority', () => {
    it('should return NO_EVIDENCE when Claude claims success but no files exist', async () => {
      // Mock: Claude claims "I created README.md" but Runner finds no file
      class MockClaudeClaimsSuccess implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          return {
            executed: true,
            output: 'I have successfully created README.md with the requested content.',
            files_modified: [],
            duration_ms: 100,
            status: 'NO_EVIDENCE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockClaudeClaimsSuccess(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'test-task-1',
        description: 'Create README',
        naturalLanguageTask: 'READMEを作って',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.strictEqual(results.length, 1);
      // Runner must NOT return COMPLETE based on Claude's claim alone
      assert.notStrictEqual(results[0].status, 'COMPLETE');

      await runner.shutdown();
    });

    it('should return COMPLETE only when Runner verifies files exist on disk', async () => {
      // Mock: Claude creates file AND Runner can verify it exists
      class MockClaudeCreatesFile implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          const filepath = path.join(projectDir, 'README.md');
          fs.writeFileSync(filepath, '# My Project\n');

          return {
            executed: true,
            output: 'Created README.md',
            files_modified: ['README.md'],
            duration_ms: 100,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'README.md', exists: true, size: 13 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockClaudeCreatesFile(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'test-task-2',
        description: 'Create README',
        naturalLanguageTask: 'READMEを作って',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'COMPLETED');

      // Verify Runner actually checked the file
      const readmePath = path.join(projectDir, 'README.md');
      assert.ok(fs.existsSync(readmePath), 'README.md should exist on disk');

      await runner.shutdown();
    });

    it('should return NO_EVIDENCE when Claude output is print-only (no file writes)', async () => {
      class MockClaudePrintOnly implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          return {
            executed: true,
            output: 'Here is how you can create a README:\n1. Use touch README.md',
            files_modified: [],
            duration_ms: 50,
            status: 'NO_EVIDENCE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockClaudePrintOnly(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'test-task-3',
        description: 'Create README',
        naturalLanguageTask: 'readmeを作って',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.strictEqual(results.length, 1);
      assert.notStrictEqual(results[0].status, 'COMPLETE');

      await runner.shutdown();
    });
  });

  describe('Property 15: Claude output is untrusted until verified', () => {
    it('should detect when Claude reports files_modified but files do not exist', async () => {
      class MockClaudeLies implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          return {
            executed: true,
            output: 'Successfully created README.md and CONTRIBUTING.md',
            files_modified: ['README.md', 'CONTRIBUTING.md'],
            duration_ms: 100,
            status: 'NO_EVIDENCE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: ['README.md', 'CONTRIBUTING.md'],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockClaudeLies(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'test-task-4',
        description: 'Create files',
        naturalLanguageTask: 'Create README',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      assert.strictEqual(results.length, 1);
      assert.notStrictEqual(results[0].status, 'COMPLETE');

      await runner.shutdown();
    });
  });

  describe('Property 19: Runner mediates all communication', () => {
    it('should format executor output through Runner (structured result)', async () => {
      class MockClaudeWithRawOutput implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          fs.writeFileSync(path.join(projectDir, 'test.txt'), 'hello');
          return {
            executed: true,
            output: 'Raw Claude output that should be mediated',
            files_modified: ['test.txt'],
            duration_ms: 50,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'test.txt', exists: true, size: 5 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockClaudeWithRawOutput(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'test-task-5',
        description: 'Create test file',
        naturalLanguageTask: 'Create test file',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Result is structured by Runner, not raw Claude output
      assert.strictEqual(results.length, 1);
      assert.ok(results[0].status !== undefined, 'Result must have status');
      assert.ok(results[0].evidence !== undefined, 'Result must have evidence');

      await runner.shutdown();
    });
  });

  describe('Natural language input handling', () => {
    it('should pass user prompt to executor as-is (no forced template)', async () => {
      class MockExecutor implements IExecutor {
        public receivedPrompt: string = '';

        async execute(task: ExecutorTask): Promise<ExecutorResult> {
          this.receivedPrompt = task.prompt;
          fs.writeFileSync(path.join(projectDir, 'README.md'), '# Project');
          return {
            executed: true,
            output: 'Created',
            files_modified: ['README.md'],
            duration_ms: 50,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'README.md', exists: true, size: 9 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const mockExecutor = new MockExecutor();
      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });
      await runner.initialize(projectDir);

      const userPrompt = 'readmeを作って';
      const task = {
        id: 'test-task-6',
        description: 'Create README',
        naturalLanguageTask: userPrompt,
      };

      await runner.executeTasksSequentially([task]);

      // User prompt is passed as-is (no forced template prepended)
      assert.strictEqual(mockExecutor.receivedPrompt, userPrompt);

      await runner.shutdown();
    });

    it('should not constrain user task content with fixed templates', async () => {
      class MockExecutor implements IExecutor {
        public receivedPrompt: string = '';

        async execute(task: ExecutorTask): Promise<ExecutorResult> {
          this.receivedPrompt = task.prompt;
          return {
            executed: true,
            output: '',
            files_modified: [],
            duration_ms: 50,
            status: 'NO_EVIDENCE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const mockExecutor = new MockExecutor();
      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: mockExecutor,
      });
      await runner.initialize(projectDir);

      const userPrompt = 'Create a fancy README with emojis and ASCII art';
      const task = {
        id: 'test-task-7',
        description: 'Create fancy README',
        naturalLanguageTask: userPrompt,
      };

      await runner.executeTasksSequentially([task]);

      // Prompt should NOT contain forced content constraints
      assert.ok(
        !mockExecutor.receivedPrompt.includes('You must create'),
        'Prompt should not have forced template'
      );
      assert.ok(
        !mockExecutor.receivedPrompt.includes('Hard requirements'),
        'Prompt should not have forced requirements'
      );
      assert.strictEqual(mockExecutor.receivedPrompt, userPrompt);

      await runner.shutdown();
    });
  });

  describe('Clarification (ambiguous input handling)', () => {
    it('should return INCOMPLETE and NOT call Executor when target file is unidentifiable', async () => {
      // Spy: Track if executor.execute was called
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          return {
            executed: true,
            output: 'Should NOT be called',
            files_modified: [],
            duration_ms: 0,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const spyExecutor = new SpyExecutor();
      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: spyExecutor,
      });
      await runner.initialize(projectDir);

      // Ambiguous input: file operation but no identifiable target
      const ambiguousPrompt = '何か作成して';
      const task = {
        id: 'clarification-test-1',
        description: 'Ambiguous task',
        naturalLanguageTask: ambiguousPrompt,
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Executor should NOT be called
      assert.strictEqual(executorCalled, false, 'Executor should NOT be called for ambiguous input');

      // Task status should be INCOMPLETE
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'INCOMPLETE');

      // Clarification fields should be set (structured signals, no conversational text)
      assert.strictEqual(results[0].clarification_needed, true);
      assert.ok(results[0].clarification_reason, 'clarification_reason should be set');
      // Reason should be a structured code (e.g., 'target_file_ambiguous')
      assert.ok(
        ['target_file_ambiguous', 'target_action_ambiguous', 'target_file_exists', 'missing_required_info'].includes(results[0].clarification_reason!),
        'clarification_reason should be a valid reason code'
      );

      await runner.shutdown();
    });

    it('should set next_action=true and clarification_reason when clarification needed', async () => {
      class MockExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          return {
            executed: false,
            output: '',
            files_modified: [],
            duration_ms: 0,
            status: 'NO_EVIDENCE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockExecutor(),
      });
      await runner.initialize(projectDir);

      // Ambiguous input
      const task = {
        id: 'clarification-test-2',
        description: 'Ambiguous create',
        naturalLanguageTask: 'ファイルを追加してください',
      };

      const result = await runner.execute({ tasks: [task] });

      // next_action should be true
      assert.strictEqual(result.next_action, true);

      // clarification_reason should be a structured code (no conversational text)
      assert.ok(result.clarification_reason, 'clarification_reason should be set');
      assert.ok(
        ['target_file_ambiguous', 'target_action_ambiguous', 'target_file_exists', 'missing_required_info'].includes(result.clarification_reason!),
        'clarification_reason should be a valid reason code'
      );

      await runner.shutdown();
    });

    it('should proceed with Executor when target file IS identifiable', async () => {
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          fs.writeFileSync(path.join(projectDir, 'README.md'), '# Test');
          return {
            executed: true,
            output: 'Created README.md',
            files_modified: ['README.md'],
            duration_ms: 100,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'README.md', exists: true, size: 6 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const spyExecutor = new SpyExecutor();
      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: spyExecutor,
      });
      await runner.initialize(projectDir);

      // Clear input: target file is identifiable (README.md)
      const clearPrompt = 'README.mdを作成して';
      const task = {
        id: 'clarification-test-3',
        description: 'Clear task',
        naturalLanguageTask: clearPrompt,
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Executor SHOULD be called
      assert.strictEqual(executorCalled, true, 'Executor should be called for clear input');

      // Task should complete
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'COMPLETED');
      assert.strictEqual(results[0].clarification_needed, undefined);

      await runner.shutdown();
    });

    it('should return different clarification_reason for "create" type vs "modify" type', async () => {
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          return {
            executed: true,
            output: 'Should NOT be called',
            files_modified: [],
            duration_ms: 0,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Test "create" type question
      const spyExecutor1 = new SpyExecutor();
      const runner1 = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: spyExecutor1,
      });
      await runner1.initialize(projectDir);

      const createTask = {
        id: 'create-type-test',
        description: 'Create type task',
        naturalLanguageTask: '何か作成して',
      };

      await runner1.executeTasksSequentially([createTask]);
      const createResults = runner1.getTaskResults();

      assert.strictEqual(createResults[0].clarification_needed, true);
      // Create type should have target_file_ambiguous reason
      assert.strictEqual(
        createResults[0].clarification_reason,
        'target_file_ambiguous',
        'Create type should have target_file_ambiguous reason'
      );

      await runner1.shutdown();

      // Test "modify" type question
      executorCalled = false;
      const spyExecutor2 = new SpyExecutor();
      const runner2 = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: spyExecutor2,
      });
      await runner2.initialize(projectDir);

      const modifyTask = {
        id: 'modify-type-test',
        description: 'Modify type task',
        naturalLanguageTask: '何か修正して',
      };

      await runner2.executeTasksSequentially([modifyTask]);
      const modifyResults = runner2.getTaskResults();

      assert.strictEqual(modifyResults[0].clarification_needed, true);
      // Modify type should have target_action_ambiguous reason
      assert.strictEqual(
        modifyResults[0].clarification_reason,
        'target_action_ambiguous',
        'Modify type should have target_action_ambiguous reason'
      );

      await runner2.shutdown();
    });
  });

  describe('Clarification for existing files (fail-closed)', () => {
    it('should return INCOMPLETE with clarification when README.md already exists', async () => {
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          return {
            executed: true,
            output: 'Should NOT be called',
            files_modified: [],
            duration_ms: 0,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Create README.md in project directory
      fs.writeFileSync(path.join(projectDir, 'README.md'), '# Existing README');

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new SpyExecutor(),
      });
      await runner.initialize(projectDir);

      // Task: create README.md (but it already exists)
      const task = {
        id: 'readme-exists-test',
        description: 'Create README',
        naturalLanguageTask: 'README.md を作って',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Should return INCOMPLETE with clarification (structured signals)
      assert.strictEqual(results[0].status, 'INCOMPLETE');
      assert.strictEqual(results[0].clarification_needed, true);
      assert.strictEqual(results[0].clarification_reason, 'target_file_exists');
      assert.strictEqual(results[0].target_file, 'README.md');

      // Executor should NOT be called (fail-closed: clarify first)
      assert.strictEqual(executorCalled, false, 'Executor should NOT be called when clarification needed');

      await runner.shutdown();
    });

    it('should call Executor when README.md does NOT exist', async () => {
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          // Simulate creating README.md
          fs.writeFileSync(path.join(projectDir, 'README.md'), '# New README');
          return {
            executed: true,
            output: 'Created README.md',
            files_modified: ['README.md'],
            duration_ms: 100,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'README.md', exists: true, size: 12 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Ensure README.md does NOT exist
      const readmePath = path.join(projectDir, 'README.md');
      if (fs.existsSync(readmePath)) {
        fs.unlinkSync(readmePath);
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new SpyExecutor(),
      });
      await runner.initialize(projectDir);

      // Task: create README.md (does not exist, should proceed)
      const task = {
        id: 'readme-not-exists-test',
        description: 'Create README',
        naturalLanguageTask: 'README.mdを作成して',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Should call Executor and complete
      assert.strictEqual(executorCalled, true, 'Executor should be called when README.md does not exist');
      assert.strictEqual(results[0].status, 'COMPLETED');
      assert.strictEqual(results[0].clarification_needed, undefined);

      await runner.shutdown();
    });

    it('should set next_action=true and clarification_reason when README.md exists', async () => {
      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          throw new Error('Executor should not be called');
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Create README.md in project directory
      fs.writeFileSync(path.join(projectDir, 'README.md'), '# Existing README');

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new SpyExecutor(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'readme-next-action-test',
        description: 'Create README',
        naturalLanguageTask: 'create README.md',
      };

      const result = await runner.execute({ tasks: [task] });

      // next_action should be true (clarification needed)
      assert.strictEqual(result.next_action, true);
      // clarification_reason should be structured (no conversational text)
      assert.strictEqual(result.clarification_reason, 'target_file_exists');
      assert.strictEqual(result.target_file, 'README.md');

      await runner.shutdown();
    });

    it('should return INCOMPLETE with clarification when docs/guide.md already exists', async () => {
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          return {
            executed: true,
            output: 'Should NOT be called',
            files_modified: [],
            duration_ms: 0,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Create docs/guide.md in project directory
      fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'docs/guide.md'), '# Existing Guide');

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new SpyExecutor(),
      });
      await runner.initialize(projectDir);

      // Task: create docs/guide.md (but it already exists)
      const task = {
        id: 'guide-exists-test',
        description: 'Create guide',
        naturalLanguageTask: 'docs/guide.md を作って',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Should return INCOMPLETE with clarification (structured signals)
      assert.strictEqual(results[0].status, 'INCOMPLETE');
      assert.strictEqual(results[0].clarification_needed, true);
      assert.strictEqual(results[0].clarification_reason, 'target_file_exists');
      assert.strictEqual(results[0].target_file, 'docs/guide.md');

      // Executor should NOT be called (fail-closed: clarify first)
      assert.strictEqual(executorCalled, false, 'Executor should NOT be called when clarification needed');

      await runner.shutdown();
    });

    it('should call Executor when docs/guide.md does NOT exist', async () => {
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          // Simulate creating docs/guide.md
          fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
          fs.writeFileSync(path.join(projectDir, 'docs/guide.md'), '# New Guide');
          return {
            executed: true,
            output: 'Created docs/guide.md',
            files_modified: ['docs/guide.md'],
            duration_ms: 100,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'docs/guide.md', exists: true, size: 12 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Ensure docs/guide.md does NOT exist
      const guidePath = path.join(projectDir, 'docs/guide.md');
      if (fs.existsSync(guidePath)) {
        fs.unlinkSync(guidePath);
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new SpyExecutor(),
      });
      await runner.initialize(projectDir);

      // Task: create docs/guide.md (does not exist, should proceed)
      const task = {
        id: 'guide-not-exists-test',
        description: 'Create guide',
        naturalLanguageTask: 'docs/guide.md を作成して',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Should call Executor and complete
      assert.strictEqual(executorCalled, true, 'Executor should be called when docs/guide.md does not exist');
      assert.strictEqual(results[0].status, 'COMPLETED');
      assert.strictEqual(results[0].clarification_needed, undefined);

      await runner.shutdown();
    });

    it('should handle src/utils.ts file existence check', async () => {
      let executorCalled = false;

      class SpyExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          executorCalled = true;
          return {
            executed: true,
            output: 'Should NOT be called',
            files_modified: [],
            duration_ms: 0,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Create src/utils.ts in project directory
      fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'src/utils.ts'), 'export const foo = 1;');

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new SpyExecutor(),
      });
      await runner.initialize(projectDir);

      // Task: create src/utils.ts (but it already exists)
      const task = {
        id: 'utils-exists-test',
        description: 'Create utils',
        naturalLanguageTask: 'src/utils.ts を作成してください',
      };

      await runner.executeTasksSequentially([task]);
      const results = runner.getTaskResults();

      // Should return INCOMPLETE with clarification (structured signals)
      assert.strictEqual(results[0].status, 'INCOMPLETE');
      assert.strictEqual(results[0].clarification_needed, true);
      assert.strictEqual(results[0].clarification_reason, 'target_file_exists');
      assert.strictEqual(results[0].target_file, 'src/utils.ts');

      // Executor should NOT be called
      assert.strictEqual(executorCalled, false, 'Executor should NOT be called when clarification needed');

      await runner.shutdown();
    });
  });

  describe('next_action rules', () => {
    it('should return next_action=true when overall_status is COMPLETE', async () => {
      class MockExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          fs.writeFileSync(path.join(projectDir, 'test.txt'), 'test');
          return {
            executed: true,
            output: 'Created test.txt',
            files_modified: ['test.txt'],
            duration_ms: 100,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'test.txt', exists: true, size: 4 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockExecutor(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'next-action-complete-test',
        description: 'Complete task',
        naturalLanguageTask: 'test.txtを作成して',
      };

      const result = await runner.execute({ tasks: [task] });

      assert.strictEqual(result.overall_status, 'COMPLETE');
      assert.strictEqual(result.next_action, true, 'COMPLETE status should have next_action=true');
      assert.strictEqual(result.clarification_reason, undefined, 'No clarification, no reason');

      await runner.shutdown();
    });

    it('should return next_action=true when overall_status is INCOMPLETE (with clarification)', async () => {
      class MockExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          // Should not be called when clarification is needed
          throw new Error('Executor should not be called');
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockExecutor(),
      });
      await runner.initialize(projectDir);

      // Use ambiguous task that triggers clarification
      // "ファイルを作成して" has create-type keyword but no identifiable target
      const task = {
        id: 'next-action-incomplete-test',
        description: 'Ambiguous task',
        naturalLanguageTask: 'ファイルを作成して',
      };

      const result = await runner.execute({ tasks: [task] });

      // Status should be INCOMPLETE (clarification needed, no error)
      assert.strictEqual(result.overall_status, 'INCOMPLETE', 'Clarification results in INCOMPLETE');
      assert.strictEqual(result.next_action, true, 'INCOMPLETE with clarification should have next_action=true');
      assert.ok(result.clarification_reason, 'Should have clarification_reason for clarification');

      await runner.shutdown();
    });

    it('should return next_action=false when overall_status is ERROR', async () => {
      class ErrorExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          return {
            executed: false,
            output: '',
            error: 'Critical error occurred',
            files_modified: [],
            duration_ms: 100,
            status: 'ERROR',
            cwd: projectDir,
            verified_files: [],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new ErrorExecutor(),
      });
      await runner.initialize(projectDir);

      const task = {
        id: 'next-action-error-test',
        description: 'Error task',
        naturalLanguageTask: 'test.txtを作成して',
      };

      const result = await runner.execute({ tasks: [task] });

      assert.strictEqual(result.overall_status, 'ERROR');
      assert.strictEqual(result.next_action, false, 'ERROR status should have next_action=false');

      await runner.shutdown();
    });

    it('should set clarification_reason only when clarification exists', async () => {
      class MockExecutor implements IExecutor {
        async execute(_task: ExecutorTask): Promise<ExecutorResult> {
          fs.writeFileSync(path.join(projectDir, 'test.txt'), 'test');
          return {
            executed: true,
            output: 'Created',
            files_modified: ['test.txt'],
            duration_ms: 100,
            status: 'COMPLETE',
            cwd: projectDir,
            verified_files: [{ path: 'test.txt', exists: true, size: 4 }],
            unverified_files: [],
          };
        }
        async isClaudeCodeAvailable(): Promise<boolean> {
          return true;
        }
      }

      // Test: No clarification → no next_action_reason
      const runner1 = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockExecutor(),
      });
      await runner1.initialize(projectDir);

      const clearTask = {
        id: 'no-clarification-test',
        description: 'Clear task',
        naturalLanguageTask: 'test.txtを作成して',
      };

      const result1 = await runner1.execute({ tasks: [clearTask] });
      assert.strictEqual(result1.clarification_reason, undefined, 'No clarification → no reason');

      await runner1.shutdown();

      // Test: Clarification → clarification_reason set
      const runner2 = new RunnerCore({
        evidenceDir,
        useClaudeCode: true,
        executor: new MockExecutor(),
      });
      await runner2.initialize(projectDir);

      const ambiguousTask = {
        id: 'clarification-reason-test',
        description: 'Ambiguous task',
        naturalLanguageTask: '何か追加して',
      };

      const result2 = await runner2.execute({ tasks: [ambiguousTask] });
      assert.ok(result2.clarification_reason, 'Clarification → reason should be set');
      // Reason should be a structured code (no conversational text)
      assert.strictEqual(
        result2.clarification_reason,
        'target_file_ambiguous',
        'Reason should be target_file_ambiguous for ambiguous create task'
      );

      await runner2.shutdown();
    });
  });
});
