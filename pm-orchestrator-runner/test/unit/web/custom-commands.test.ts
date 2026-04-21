/**
 * Custom Command Registry - Unit Tests
 *
 * Tests:
 * 1. parseCommand correctly identifies slash commands
 * 2. Built-in commands execute properly (/help, /status, /clear, /run, /task, /model)
 * 3. Unknown commands return appropriate error
 * 4. Custom commands can be registered and executed
 * 5. Passthrough commands include the transformed prompt
 * 6. Command context is passed to handlers
 * 7. Error handling in command execution
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  parseCommand,
  CustomCommandRegistry,
  getCommandRegistry,
  resetCommandRegistry,
  CommandContext,
  CommandResult,
} from '../../../src/web/services/custom-command-registry';

describe('Custom Command Registry', () => {
  describe('parseCommand', () => {
    it('should detect a simple slash command', () => {
      const result = parseCommand('/help');
      assert.equal(result.isCommand, true);
      assert.equal(result.name, 'help');
      assert.equal(result.args, '');
    });

    it('should detect a command with arguments', () => {
      const result = parseCommand('/run fix the bug in server.ts');
      assert.equal(result.isCommand, true);
      assert.equal(result.name, 'run');
      assert.equal(result.args, 'fix the bug in server.ts');
    });

    it('should detect a command with multiline arguments', () => {
      const result = parseCommand('/run line one\nline two');
      assert.equal(result.isCommand, true);
      assert.equal(result.name, 'run');
      assert.equal(result.args, 'line one\nline two');
    });

    it('should return isCommand=false for non-command input', () => {
      const result = parseCommand('Hello world');
      assert.equal(result.isCommand, false);
      assert.equal(result.name, '');
      assert.equal(result.args, '');
    });

    it('should return isCommand=false for empty input', () => {
      const result = parseCommand('');
      assert.equal(result.isCommand, false);
    });

    it('should return isCommand=false for "/" alone', () => {
      const result = parseCommand('/');
      assert.equal(result.isCommand, false);
    });

    it('should return isCommand=false for "/ space"', () => {
      const result = parseCommand('/ space');
      assert.equal(result.isCommand, false);
    });

    it('should return isCommand=false for "/123" (starts with number)', () => {
      const result = parseCommand('/123');
      assert.equal(result.isCommand, false);
    });

    it('should handle leading/trailing whitespace', () => {
      const result = parseCommand('  /help  ');
      assert.equal(result.isCommand, true);
      assert.equal(result.name, 'help');
    });

    it('should normalize command name to lowercase', () => {
      const result = parseCommand('/Help');
      assert.equal(result.isCommand, true);
      assert.equal(result.name, 'help');
    });

    it('should handle hyphenated command names', () => {
      const result = parseCommand('/my-command args');
      assert.equal(result.isCommand, true);
      assert.equal(result.name, 'my-command');
      assert.equal(result.args, 'args');
    });

    it('should handle underscore command names', () => {
      const result = parseCommand('/my_command args');
      assert.equal(result.isCommand, true);
      assert.equal(result.name, 'my_command');
      assert.equal(result.args, 'args');
    });
  });

  describe('CustomCommandRegistry', () => {
    let registry: CustomCommandRegistry;

    beforeEach(() => {
      registry = new CustomCommandRegistry();
    });

    describe('built-in commands', () => {
      it('should have /help registered', () => {
        assert.equal(registry.has('help'), true);
      });

      it('should have /status registered', () => {
        assert.equal(registry.has('status'), true);
      });

      it('should have /clear registered', () => {
        assert.equal(registry.has('clear'), true);
      });

      it('should have /run registered', () => {
        assert.equal(registry.has('run'), true);
      });

      it('should have /task registered', () => {
        assert.equal(registry.has('task'), true);
      });

      it('should have /model registered', () => {
        assert.equal(registry.has('model'), true);
      });
    });

    describe('/help command', () => {
      it('should list all available commands', async () => {
        const ctx: CommandContext = { projectId: 'test-project' };
        const result = await registry.execute('help', '', ctx);
        assert.equal(result.success, true);
        assert.equal(result.passthrough, false);
        assert.ok(result.output.includes('/help'));
        assert.ok(result.output.includes('/status'));
        assert.ok(result.output.includes('/clear'));
        assert.ok(result.output.includes('/run'));
        assert.ok(result.output.includes('/task'));
        assert.ok(result.output.includes('/model'));
      });
    });

    describe('/status command', () => {
      it('should show project info from context', async () => {
        const ctx: CommandContext = {
          projectId: 'proj-123',
          projectPath: '/home/user/project',
          sessionId: 'sess-456',
        };
        const result = await registry.execute('status', '', ctx);
        assert.equal(result.success, true);
        assert.equal(result.passthrough, false);
        assert.ok(result.output.includes('proj-123'));
        assert.ok(result.output.includes('/home/user/project'));
        assert.ok(result.output.includes('sess-456'));
      });

      it('should show N/A for missing context fields', async () => {
        const ctx: CommandContext = { projectId: 'proj-123' };
        const result = await registry.execute('status', '', ctx);
        assert.ok(result.output.includes('N/A'));
      });
    });

    describe('/clear command', () => {
      it('should return clear_conversation action in metadata', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('clear', '', ctx);
        assert.equal(result.success, true);
        assert.equal(result.passthrough, false);
        assert.equal(result.metadata?.action, 'clear_conversation');
      });
    });

    describe('/run command', () => {
      it('should passthrough the prompt to Claude Code', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('run', 'fix the bug in index.ts', ctx);
        assert.equal(result.success, true);
        assert.equal(result.passthrough, true);
        assert.equal(result.passthroughPrompt, 'fix the bug in index.ts');
      });

      it('should fail when no args provided', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('run', '', ctx);
        assert.equal(result.success, false);
        assert.equal(result.passthrough, false);
        assert.ok(result.output.includes('Usage'));
      });

      it('should fail when args is only whitespace', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('run', '   ', ctx);
        assert.equal(result.success, false);
        assert.equal(result.passthrough, false);
      });
    });

    describe('/task command', () => {
      it('should passthrough with explicit task type', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('task', 'READ_INFO explain the architecture', ctx);
        assert.equal(result.success, true);
        assert.equal(result.passthrough, true);
        assert.equal(result.passthroughPrompt, 'explain the architecture');
        assert.equal(result.metadata?.taskType, 'READ_INFO');
      });

      it('should accept IMPLEMENTATION task type', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('task', 'IMPLEMENTATION add a new endpoint', ctx);
        assert.equal(result.success, true);
        assert.equal(result.metadata?.taskType, 'IMPLEMENTATION');
        assert.equal(result.passthroughPrompt, 'add a new endpoint');
      });

      it('should accept case-insensitive task type', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('task', 'read_info explain X', ctx);
        assert.equal(result.success, true);
        assert.equal(result.metadata?.taskType, 'READ_INFO');
      });

      it('should fail with invalid task type', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('task', 'INVALID explain X', ctx);
        assert.equal(result.success, false);
        assert.ok(result.output.includes('Valid types'));
      });

      it('should fail with no arguments', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('task', '', ctx);
        assert.equal(result.success, false);
      });

      it('should fail with only task type and no prompt', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('task', 'READ_INFO', ctx);
        assert.equal(result.success, false);
      });
    });

    describe('/model command', () => {
      it('should show current model when no args', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('model', '', ctx);
        assert.equal(result.success, true);
        assert.equal(result.metadata?.action, 'show_model');
      });

      it('should set model when args provided', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('model', 'gpt-4', ctx);
        assert.equal(result.success, true);
        assert.equal(result.metadata?.action, 'set_model');
        assert.equal(result.metadata?.model, 'gpt-4');
      });
    });

    describe('unknown command', () => {
      it('should passthrough unregistered command as slash command', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('nonexistent', '', ctx);
        assert.equal(result.success, true);
        assert.equal(result.passthrough, true);
        assert.equal(result.passthroughPrompt, '/nonexistent');
        assert.equal(result.metadata?.isSlashCommand, true);
      });

      it('should passthrough unregistered command with args', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('nonexistent', 'some args', ctx);
        assert.equal(result.success, true);
        assert.equal(result.passthrough, true);
        assert.equal(result.passthroughPrompt, '/nonexistent some args');
      });
    });

    describe('custom command registration', () => {
      it('should allow registering a new command', async () => {
        registry.register({
          name: 'ping',
          description: 'Ping pong',
          handler: async () => ({
            success: true,
            output: 'pong',
            passthrough: false,
          }),
        });

        assert.equal(registry.has('ping'), true);
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('ping', '', ctx);
        assert.equal(result.success, true);
        assert.equal(result.output, 'pong');
      });

      it('should include custom commands in /help output', async () => {
        registry.register({
          name: 'custom',
          description: 'A custom command',
          handler: async () => ({
            success: true,
            output: 'custom output',
            passthrough: false,
          }),
        });

        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('help', '', ctx);
        assert.ok(result.output.includes('/custom'));
        assert.ok(result.output.includes('A custom command'));
      });

      it('should handle errors in command handlers gracefully', async () => {
        registry.register({
          name: 'broken',
          description: 'A broken command',
          handler: async () => {
            throw new Error('Something went wrong');
          },
        });

        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('broken', '', ctx);
        assert.equal(result.success, false);
        assert.ok(result.output.includes('Something went wrong'));
      });

      it('should pass args and context to handler', async () => {
        let capturedArgs = '';
        let capturedContext: CommandContext | null = null;

        registry.register({
          name: 'capture',
          description: 'Captures args and context',
          handler: async (args, context) => {
            capturedArgs = args;
            capturedContext = context;
            return { success: true, output: 'captured', passthrough: false };
          },
        });

        const ctx: CommandContext = {
          projectId: 'proj-1',
          projectPath: '/path',
          sessionId: 'sess-1',
        };
        await registry.execute('capture', 'hello world', ctx);
        assert.equal(capturedArgs, 'hello world');
        assert.deepEqual(capturedContext, ctx);
      });
    });

    describe('list()', () => {
      it('should return all registered commands', () => {
        const commands = registry.list();
        const names = commands.map(c => c.name);
        assert.ok(names.includes('help'));
        assert.ok(names.includes('status'));
        assert.ok(names.includes('clear'));
        assert.ok(names.includes('run'));
        assert.ok(names.includes('task'));
        assert.ok(names.includes('model'));
      });
    });

    describe('case insensitivity', () => {
      it('should find commands case-insensitively', () => {
        assert.equal(registry.has('HELP'), true);
        assert.equal(registry.has('Help'), true);
        assert.equal(registry.has('help'), true);
      });

      it('should execute commands case-insensitively', async () => {
        const ctx: CommandContext = { projectId: 'test' };
        const result = await registry.execute('HELP', '', ctx);
        assert.equal(result.success, true);
      });
    });
  });

  describe('Singleton management', () => {
    beforeEach(() => {
      resetCommandRegistry();
    });

    it('should return the same instance on repeated calls', () => {
      const a = getCommandRegistry();
      const b = getCommandRegistry();
      assert.strictEqual(a, b);
    });

    it('should return a new instance after reset', () => {
      const a = getCommandRegistry();
      resetCommandRegistry();
      const b = getCommandRegistry();
      assert.notStrictEqual(a, b);
    });
  });
});
