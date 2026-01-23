/**
 * PromptAssembler Unit Tests
 * Per spec/17_PROMPT_TEMPLATE.md
 *
 * Test Requirements:
 * - Prompt must be 5-stage assembly with fixed order
 * - Fail-closed when user input is empty
 * - task group prelude switches by task_group_id (no context mixing)
 * - Previous task result reflected in prelude
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PromptAssembler,
  PromptAssemblerConfig,
  PromptAssemblerError,
  TaskGroupPreludeInput,
  AssemblyResult,
  ModificationPromptInput,
  DEFAULT_MANDATORY_RULES,
  DEFAULT_MODIFICATION_TEMPLATE,
} from '../../../src/prompt/prompt-assembler';
import { TaskResult } from '../../../src/models/task-group';

describe('PromptAssembler (spec/17_PROMPT_TEMPLATE.md)', () => {
  let tempDir: string;
  let templateDir: string;
  let assembler: PromptAssembler;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-assembler-test-'));
    templateDir = path.join(tempDir, '.claude', 'prompt-templates');
    fs.mkdirSync(templateDir, { recursive: true });

    assembler = new PromptAssembler({
      projectPath: tempDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('5-Stage Assembly Order (spec/17 L18-23)', () => {
    it('should assemble prompt in fixed 5-stage order', () => {
      // Create all template files
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '# Global Rules');
      fs.writeFileSync(path.join(templateDir, 'project-prelude.md'), '# Project Constraints');
      fs.writeFileSync(path.join(templateDir, 'output-epilogue.md'), '# Output Format');

      const taskGroupContext: TaskGroupPreludeInput = {
        task_group_id: 'tg-001',
        conversation_history: [],
        working_files: ['file1.ts'],
        last_task_result: null,
      };

      const result = assembler.assemble('User Task Input', taskGroupContext);

      // Verify order: global -> project -> task group -> user -> epilogue
      const promptParts = result.prompt.split('\n\n');

      // Global prelude should come first
      assert.ok(result.prompt.indexOf('# Global Rules') < result.prompt.indexOf('# Project Constraints'),
        'Global prelude should come before project prelude');

      // Project prelude should come before task group
      assert.ok(result.prompt.indexOf('# Project Constraints') < result.prompt.indexOf('## Task Group Context'),
        'Project prelude should come before task group prelude');

      // Task group should come before user input
      assert.ok(result.prompt.indexOf('## Task Group Context') < result.prompt.indexOf('User Task Input'),
        'Task group prelude should come before user input');

      // User input should come before epilogue
      assert.ok(result.prompt.indexOf('User Task Input') < result.prompt.indexOf('# Output Format'),
        'User input should come before output epilogue');
    });

    it('should include all 5 sections in result.sections', () => {
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '# Global');
      fs.writeFileSync(path.join(templateDir, 'project-prelude.md'), '# Project');
      fs.writeFileSync(path.join(templateDir, 'output-epilogue.md'), '# Output');

      const taskGroupContext: TaskGroupPreludeInput = {
        task_group_id: 'tg-002',
        conversation_history: [],
        working_files: [],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', taskGroupContext);

      // globalPrelude should include mandatory rules + custom template
      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'),
        'Should include Mandatory Rules');
      assert.ok(result.sections.globalPrelude.includes('# Global'),
        'Should include custom global prelude');
      assert.equal(result.sections.projectPrelude, '# Project');
      assert.ok(result.sections.taskGroupPrelude.includes('tg-002'));
      assert.equal(result.sections.userInput, 'User Input');
      assert.equal(result.sections.outputEpilogue, '# Output');
    });

    it('should work without template files but include mandatory rules', () => {
      // No template files created - but mandatory rules are always included
      const result = assembler.assemble('User Input Only');

      // Mandatory rules are always injected per spec/17 L69-95
      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'),
        'Should include Mandatory Rules even without template files');
      assert.equal(result.sections.projectPrelude, '');
      assert.equal(result.sections.taskGroupPrelude, '');
      assert.equal(result.sections.userInput, 'User Input Only');
      assert.equal(result.sections.outputEpilogue, '');
      // Prompt should contain mandatory rules + user input
      assert.ok(result.prompt.includes('User Input Only'));
      assert.ok(result.prompt.includes('絶対厳守ルール'));
    });
  });

  describe('Fail-Closed Behavior (spec/17 L33-35)', () => {
    it('should throw PromptAssemblerError when user input is empty', () => {
      assert.throws(
        () => assembler.assemble(''),
        PromptAssemblerError,
        'Should throw PromptAssemblerError for empty input'
      );
    });

    it('should throw PromptAssemblerError when user input is whitespace only', () => {
      assert.throws(
        () => assembler.assemble('   '),
        PromptAssemblerError,
        'Should throw PromptAssemblerError for whitespace-only input'
      );
    });

    it('should throw PromptAssemblerError when user input is newlines only', () => {
      assert.throws(
        () => assembler.assemble('\n\n\n'),
        PromptAssemblerError,
        'Should throw PromptAssemblerError for newlines-only input'
      );
    });

    it('should trim user input in result', () => {
      const result = assembler.assemble('  Valid Input  ');
      assert.equal(result.sections.userInput, 'Valid Input');
    });

    it('error message should indicate fail-closed behavior', () => {
      try {
        assembler.assemble('');
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error instanceof PromptAssemblerError);
        assert.ok((error as Error).message.includes('fail-closed'));
      }
    });
  });

  describe('Task Group Prelude by task_group_id (spec/17 L24-28)', () => {
    it('should include task_group_id in prelude', () => {
      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-unique-123',
        conversation_history: [],
        working_files: [],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', context);

      assert.ok(result.sections.taskGroupPrelude.includes('tg-unique-123'),
        'Prelude should contain task_group_id');
    });

    it('should generate different preludes for different task_group_ids', () => {
      const context1: TaskGroupPreludeInput = {
        task_group_id: 'tg-alpha',
        conversation_history: [],
        working_files: ['alpha.ts'],
        last_task_result: null,
      };

      const context2: TaskGroupPreludeInput = {
        task_group_id: 'tg-beta',
        conversation_history: [],
        working_files: ['beta.ts'],
        last_task_result: null,
      };

      const result1 = assembler.assemble('User Input', context1);
      const result2 = assembler.assemble('User Input', context2);

      // Different task groups should produce different preludes
      assert.notEqual(result1.sections.taskGroupPrelude, result2.sections.taskGroupPrelude);

      // Each should contain its own task_group_id
      assert.ok(result1.sections.taskGroupPrelude.includes('tg-alpha'));
      assert.ok(!result1.sections.taskGroupPrelude.includes('tg-beta'));

      assert.ok(result2.sections.taskGroupPrelude.includes('tg-beta'));
      assert.ok(!result2.sections.taskGroupPrelude.includes('tg-alpha'));
    });

    it('should not mix context between different task groups', () => {
      const context1: TaskGroupPreludeInput = {
        task_group_id: 'tg-isolated-1',
        conversation_history: [{ entry_id: 'ce_1', role: 'user', content: 'Message for group 1', timestamp: new Date().toISOString() }],
        working_files: ['file-for-group-1.ts'],
        last_task_result: null,
      };

      const context2: TaskGroupPreludeInput = {
        task_group_id: 'tg-isolated-2',
        conversation_history: [{ entry_id: 'ce_2', role: 'user', content: 'Message for group 2', timestamp: new Date().toISOString() }],
        working_files: ['file-for-group-2.ts'],
        last_task_result: null,
      };

      const result1 = assembler.assemble('User Input', context1);
      const result2 = assembler.assemble('User Input', context2);

      // Group 1 should not contain group 2's context
      assert.ok(!result1.sections.taskGroupPrelude.includes('file-for-group-2.ts'));
      assert.ok(!result1.sections.taskGroupPrelude.includes('Message for group 2'));

      // Group 2 should not contain group 1's context
      assert.ok(!result2.sections.taskGroupPrelude.includes('file-for-group-1.ts'));
      assert.ok(!result2.sections.taskGroupPrelude.includes('Message for group 1'));
    });
  });

  describe('Previous Task Result in Prelude (spec/17 L29-32)', () => {
    it('should include last_task_result in prelude when present', () => {
      const lastResult: TaskResult = {
        task_id: 'task-prev-001',
        status: 'COMPLETED',
        summary: 'Previous task completed successfully',
        files_modified: ['modified.ts', 'updated.ts'],
        completed_at: new Date().toISOString(),
      };

      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-with-prev',
        conversation_history: [],
        working_files: [],
        last_task_result: lastResult,
      };

      const result = assembler.assemble('User Input', context);

      // Prelude should contain previous task info
      assert.ok(result.sections.taskGroupPrelude.includes('task-prev-001'),
        'Should include previous task ID');
      assert.ok(result.sections.taskGroupPrelude.includes('COMPLETED'),
        'Should include previous task status');
      assert.ok(result.sections.taskGroupPrelude.includes('Previous task completed successfully'),
        'Should include previous task summary');
      assert.ok(result.sections.taskGroupPrelude.includes('modified.ts'),
        'Should include files modified');
    });

    it('should include error in prelude when previous task failed', () => {
      const lastResult: TaskResult = {
        task_id: 'task-failed-001',
        status: 'FAILED',
        summary: 'Task failed due to error',
        files_modified: [],
        completed_at: new Date().toISOString(),
        error: 'Connection timeout occurred',
      };

      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-with-error',
        conversation_history: [],
        working_files: [],
        last_task_result: lastResult,
      };

      const result = assembler.assemble('User Input', context);

      assert.ok(result.sections.taskGroupPrelude.includes('FAILED'),
        'Should include FAILED status');
      assert.ok(result.sections.taskGroupPrelude.includes('Connection timeout occurred'),
        'Should include error message');
    });

    it('should not include previous task section when last_task_result is null', () => {
      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-no-prev',
        conversation_history: [],
        working_files: [],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', context);

      assert.ok(!result.sections.taskGroupPrelude.includes('Previous Task Result'),
        'Should not include Previous Task Result section when null');
    });
  });

  describe('Working Files in Prelude (spec/16_TASK_GROUP.md L103)', () => {
    it('should include working_files in prelude', () => {
      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-files',
        conversation_history: [],
        working_files: ['src/main.ts', 'src/utils.ts', 'test/main.test.ts'],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', context);

      assert.ok(result.sections.taskGroupPrelude.includes('src/main.ts'),
        'Should include working file 1');
      assert.ok(result.sections.taskGroupPrelude.includes('src/utils.ts'),
        'Should include working file 2');
      assert.ok(result.sections.taskGroupPrelude.includes('test/main.test.ts'),
        'Should include working file 3');
    });

    it('should not include Working Files section when array is empty', () => {
      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-no-files',
        conversation_history: [],
        working_files: [],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', context);

      assert.ok(!result.sections.taskGroupPrelude.includes('### Working Files'),
        'Should not include Working Files section when empty');
    });
  });

  describe('Conversation History in Prelude (spec/16_TASK_GROUP.md L101)', () => {
    it('should include recent conversation history in prelude', () => {
      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-conv',
        conversation_history: [
          { entry_id: 'ce_1', role: 'user', content: 'First message from user', timestamp: new Date().toISOString() },
          { entry_id: 'ce_2', role: 'assistant', content: 'Response from assistant', timestamp: new Date().toISOString() },
          { entry_id: 'ce_3', role: 'user', content: 'Follow-up question', timestamp: new Date().toISOString() },
        ],
        working_files: [],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', context);

      assert.ok(result.sections.taskGroupPrelude.includes('Recent Conversation'),
        'Should include Recent Conversation section');
      assert.ok(result.sections.taskGroupPrelude.includes('First message from user'),
        'Should include first message');
      assert.ok(result.sections.taskGroupPrelude.includes('Response from assistant'),
        'Should include assistant response');
    });

    it('should limit conversation history to last 5 entries', () => {
      const entries = [];
      for (let i = 1; i <= 10; i++) {
        entries.push({
          entry_id: `ce_${i}`,
          role: 'user' as const,
          content: `[MSG-${String(i).padStart(2, '0')}] Content here`,
          timestamp: new Date().toISOString(),
        });
      }

      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-many-conv',
        conversation_history: entries,
        working_files: [],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', context);

      // Should include messages 06-10 (last 5)
      assert.ok(result.sections.taskGroupPrelude.includes('[MSG-06]'),
        'Should include message 6');
      assert.ok(result.sections.taskGroupPrelude.includes('[MSG-10]'),
        'Should include message 10');

      // Should NOT include messages 01-05 (older than last 5)
      assert.ok(!result.sections.taskGroupPrelude.includes('[MSG-01]'),
        'Should NOT include message 1');
      assert.ok(!result.sections.taskGroupPrelude.includes('[MSG-05]'),
        'Should NOT include message 5');
    });

    it('should truncate long conversation entries', () => {
      const longMessage = 'A'.repeat(200);
      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-long',
        conversation_history: [
          { entry_id: 'ce_1', role: 'user', content: longMessage, timestamp: new Date().toISOString() },
        ],
        working_files: [],
        last_task_result: null,
      };

      const result = assembler.assemble('User Input', context);

      // Should be truncated to ~100 chars + "..."
      const prelude = result.sections.taskGroupPrelude;
      assert.ok(prelude.includes('...'), 'Long content should be truncated with ...');
      assert.ok(!prelude.includes(longMessage), 'Full long message should not be in prelude');
    });
  });

  describe('Template File Loading (spec/17 L36-45)', () => {
    it('should load global-prelude.md from template directory and prepend mandatory rules', () => {
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '# Global Rules\nNo profanity.');

      const result = assembler.assemble('User Input');

      // Mandatory rules should be prepended, then custom prelude follows
      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'),
        'Should include Mandatory Rules');
      assert.ok(result.sections.globalPrelude.includes('# Global Rules\nNo profanity.'),
        'Should include custom global prelude');
      // Verify order: mandatory rules before custom prelude
      const mandatoryIndex = result.sections.globalPrelude.indexOf('絶対厳守ルール');
      const customIndex = result.sections.globalPrelude.indexOf('# Global Rules');
      assert.ok(mandatoryIndex < customIndex, 'Mandatory rules should come before custom prelude');
    });

    it('should load project-prelude.md from template directory', () => {
      fs.writeFileSync(path.join(templateDir, 'project-prelude.md'), '# Project: TypeScript\nUse strict mode.');

      const result = assembler.assemble('User Input');

      assert.equal(result.sections.projectPrelude, '# Project: TypeScript\nUse strict mode.');
    });

    it('should load output-epilogue.md from template directory', () => {
      fs.writeFileSync(path.join(templateDir, 'output-epilogue.md'), '## Output Format\nReturn JSON.');

      const result = assembler.assemble('User Input');

      assert.equal(result.sections.outputEpilogue, '## Output Format\nReturn JSON.');
    });

    it('should include mandatory rules even when template files are missing', () => {
      // No template files created - but mandatory rules are always injected
      const result = assembler.assemble('User Input');

      // globalPrelude should contain mandatory rules even without template
      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'),
        'Should include Mandatory Rules');
      assert.equal(result.sections.projectPrelude, '');
      assert.equal(result.sections.outputEpilogue, '');
    });

    it('should trim template file content', () => {
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '  \n# Global\n  ');

      const result = assembler.assemble('User Input');

      // Should include mandatory rules + trimmed custom prelude
      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'));
      assert.ok(result.sections.globalPrelude.includes('# Global'));
      // Should not have extra whitespace around custom prelude
      assert.ok(!result.sections.globalPrelude.includes('  \n# Global'));
    });
  });

  describe('Custom Template Directory (spec/17 L37)', () => {
    it('should use custom template directory when specified', () => {
      const customDir = path.join(tempDir, 'custom-templates');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(path.join(customDir, 'global-prelude.md'), '# Custom Global');

      const customAssembler = new PromptAssembler({
        projectPath: tempDir,
        templateDir: 'custom-templates',
      });

      const result = customAssembler.assemble('User Input');

      // Should include both mandatory rules and custom prelude from custom directory
      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'),
        'Should include Mandatory Rules');
      assert.ok(result.sections.globalPrelude.includes('# Custom Global'),
        'Should include custom global prelude from custom directory');
    });
  });

  describe('No Caching Behavior (spec/17 L49-51)', () => {
    it('should rebuild prompt on every call (no caching)', () => {
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '# Version 1');

      const result1 = assembler.assemble('User Input');
      assert.ok(result1.sections.globalPrelude.includes('# Version 1'));

      // Modify template file
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '# Version 2');

      // Should read new content (no caching)
      const result2 = assembler.assemble('User Input');
      assert.ok(result2.sections.globalPrelude.includes('# Version 2'));
      assert.ok(!result2.sections.globalPrelude.includes('# Version 1'),
        'Should not contain old version (no caching)');
    });
  });

  describe('PromptAssemblerConfig Validation', () => {
    it('should require projectPath in config', () => {
      const config: PromptAssemblerConfig = {
        projectPath: tempDir,
      };
      const validAssembler = new PromptAssembler(config);
      assert.ok(validAssembler);
    });

    it('should use default templateDir when not specified', () => {
      // Default is .claude/prompt-templates/
      const defaultAssembler = new PromptAssembler({ projectPath: tempDir });

      // Create file in default location
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '# Default Location');

      const result = defaultAssembler.assemble('User Input');
      // Should include both mandatory rules and custom prelude
      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'));
      assert.ok(result.sections.globalPrelude.includes('# Default Location'));
    });
  });

  describe('Mandatory Rules Auto-Injection (spec/17 L69-95)', () => {
    it('should export DEFAULT_MANDATORY_RULES constant', () => {
      assert.ok(DEFAULT_MANDATORY_RULES);
      assert.ok(typeof DEFAULT_MANDATORY_RULES === 'string');
      assert.ok(DEFAULT_MANDATORY_RULES.length > 0);
    });

    it('should include all 5 mandatory rules in DEFAULT_MANDATORY_RULES', () => {
      // Per spec/17 L69-95: 5 mandatory rules
      assert.ok(DEFAULT_MANDATORY_RULES.includes('省略禁止'),
        'Should include rule 1: No Omission');
      assert.ok(DEFAULT_MANDATORY_RULES.includes('不完全禁止'),
        'Should include rule 2: No Incomplete');
      assert.ok(DEFAULT_MANDATORY_RULES.includes('証跡必須'),
        'Should include rule 3: Evidence Required');
      assert.ok(DEFAULT_MANDATORY_RULES.includes('早期終了禁止'),
        'Should include rule 4: No Early Termination');
      assert.ok(DEFAULT_MANDATORY_RULES.includes('Fail-Closed'),
        'Should include rule 5: Fail-Closed');
    });

    it('should always inject mandatory rules into global prelude', () => {
      // Without any template files
      const result = assembler.assemble('User Input');

      assert.ok(result.sections.globalPrelude.includes('絶対厳守ルール'),
        'Should include Mandatory Rules header');
      assert.ok(result.sections.globalPrelude.includes('省略禁止'),
        'Should include No Omission rule');
    });

    it('should prepend mandatory rules before custom global prelude', () => {
      fs.writeFileSync(path.join(templateDir, 'global-prelude.md'), '# Custom Project Rules');

      const result = assembler.assemble('User Input');

      // Mandatory rules should come first
      const mandatoryIndex = result.sections.globalPrelude.indexOf('絶対厳守ルール');
      const customIndex = result.sections.globalPrelude.indexOf('# Custom Project Rules');

      assert.ok(mandatoryIndex >= 0, 'Should contain mandatory rules');
      assert.ok(customIndex >= 0, 'Should contain custom rules');
      assert.ok(mandatoryIndex < customIndex,
        'Mandatory rules should be prepended before custom prelude');
    });

    it('should include mandatory rules in final assembled prompt', () => {
      const result = assembler.assemble('My Task');

      // Final prompt should contain mandatory rules
      assert.ok(result.prompt.includes('省略禁止'));
      assert.ok(result.prompt.includes('不完全禁止'));
      assert.ok(result.prompt.includes('証跡必須'));

      // Mandatory rules should come before user input
      const mandatoryIndex = result.prompt.indexOf('省略禁止');
      const userInputIndex = result.prompt.indexOf('My Task');
      assert.ok(mandatoryIndex < userInputIndex,
        'Mandatory rules should appear before user input in assembled prompt');
    });
  });

  describe('Modification Prompt Template (spec/17 L105-124)', () => {
    it('should export DEFAULT_MODIFICATION_TEMPLATE constant', () => {
      assert.ok(DEFAULT_MODIFICATION_TEMPLATE);
      assert.ok(typeof DEFAULT_MODIFICATION_TEMPLATE === 'string');
    });

    it('should contain {{detected_issues}} placeholder', () => {
      assert.ok(DEFAULT_MODIFICATION_TEMPLATE.includes('{{detected_issues}}'),
        'Should have detected_issues placeholder');
    });

    it('should contain {{original_task}} placeholder', () => {
      assert.ok(DEFAULT_MODIFICATION_TEMPLATE.includes('{{original_task}}'),
        'Should have original_task placeholder');
    });

    it('should contain modification request section', () => {
      assert.ok(DEFAULT_MODIFICATION_TEMPLATE.includes('修正要求'),
        'Should have modification request section');
    });
  });

  describe('buildModificationPrompt() (spec/17 L109-124)', () => {
    it('should replace {{detected_issues}} with formatted issues', () => {
      const input: ModificationPromptInput = {
        detectedIssues: ['Issue 1', 'Issue 2', 'Issue 3'],
        originalTask: 'Original task description',
      };

      const result = assembler.buildModificationPrompt(input);

      assert.ok(result.includes('- Issue 1'));
      assert.ok(result.includes('- Issue 2'));
      assert.ok(result.includes('- Issue 3'));
    });

    it('should replace {{original_task}} with original task', () => {
      const input: ModificationPromptInput = {
        detectedIssues: ['Some issue'],
        originalTask: 'Create a TypeScript function',
      };

      const result = assembler.buildModificationPrompt(input);

      assert.ok(result.includes('Create a TypeScript function'));
    });

    it('should use custom template when modification-template.md exists', () => {
      fs.writeFileSync(
        path.join(templateDir, 'modification-template.md'),
        '## Custom Modification\n\nIssues:\n{{detected_issues}}\n\nOriginal:\n{{original_task}}'
      );

      const input: ModificationPromptInput = {
        detectedIssues: ['Custom issue'],
        originalTask: 'Custom task',
      };

      const result = assembler.buildModificationPrompt(input);

      assert.ok(result.includes('## Custom Modification'),
        'Should use custom template header');
      assert.ok(result.includes('- Custom issue'),
        'Should include formatted issues');
      assert.ok(result.includes('Custom task'),
        'Should include original task');
    });

    it('should fall back to default template when no custom template exists', () => {
      const input: ModificationPromptInput = {
        detectedIssues: ['Fallback issue'],
        originalTask: 'Fallback task',
      };

      const result = assembler.buildModificationPrompt(input);

      assert.ok(result.includes('前回の出力に問題が検出されました'),
        'Should use default template header');
    });
  });

  describe('assembleWithModification() (spec/17 L102-124)', () => {
    it('should include modification prompt in assembled result', () => {
      const modification: ModificationPromptInput = {
        detectedIssues: ['Q3: Omission detected'],
        originalTask: 'Implement feature X',
      };

      const result = assembler.assembleWithModification('Retry task', modification);

      // Should have modificationPrompt in sections
      assert.ok(result.sections.modificationPrompt);
      assert.ok(result.sections.modificationPrompt.includes('Q3: Omission detected'));
    });

    it('should insert modification prompt before user input in final prompt', () => {
      const modification: ModificationPromptInput = {
        detectedIssues: ['TODO left in code'],
        originalTask: 'Fix the bug',
      };

      const result = assembler.assembleWithModification('Please fix', modification);

      // Per spec/17 L102-103: Modification prompt before user input
      const modificationIndex = result.prompt.indexOf('TODO left in code');
      const userInputIndex = result.prompt.indexOf('Please fix');

      assert.ok(modificationIndex >= 0, 'Should contain modification prompt');
      assert.ok(userInputIndex >= 0, 'Should contain user input');
      assert.ok(modificationIndex < userInputIndex,
        'Modification prompt should appear before user input');
    });

    it('should include mandatory rules + modification prompt + user input', () => {
      const modification: ModificationPromptInput = {
        detectedIssues: ['Missing file'],
        originalTask: 'Create file',
      };

      const result = assembler.assembleWithModification('Retry', modification);

      // Verify order: mandatory rules < modification prompt < user input
      const mandatoryIndex = result.prompt.indexOf('省略禁止');
      const modificationIndex = result.prompt.indexOf('Missing file');
      const userInputIndex = result.prompt.indexOf('Retry');

      assert.ok(mandatoryIndex < modificationIndex,
        'Mandatory rules should come before modification prompt');
      assert.ok(modificationIndex < userInputIndex,
        'Modification prompt should come before user input');
    });

    it('should throw PromptAssemblerError when user input is empty', () => {
      const modification: ModificationPromptInput = {
        detectedIssues: ['Issue'],
        originalTask: 'Task',
      };

      assert.throws(
        () => assembler.assembleWithModification('', modification),
        PromptAssemblerError,
        'Should throw for empty user input'
      );
    });

    it('should include task group context when provided', () => {
      const modification: ModificationPromptInput = {
        detectedIssues: ['Issue'],
        originalTask: 'Task',
      };

      const context: TaskGroupPreludeInput = {
        task_group_id: 'tg-modification-test',
        conversation_history: [],
        working_files: ['file.ts'],
        last_task_result: null,
      };

      const result = assembler.assembleWithModification('Retry', modification, context);

      assert.ok(result.sections.taskGroupPrelude.includes('tg-modification-test'));
      assert.ok(result.prompt.includes('tg-modification-test'));
    });
  });
});
