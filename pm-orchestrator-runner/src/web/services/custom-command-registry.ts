/**
 * Custom Command Registry
 *
 * Provides a registry for custom slash commands that can be used in the chat interface.
 * Commands are prefixed with "/" and are intercepted before being sent to the LLM layer.
 *
 * Architecture:
 *   Chat UI → /command detected → CommandRegistry.execute() → result
 *   Chat UI → normal message → LLM Layer → Claude Code
 *
 * Commands can be:
 * - "local": Handled entirely within the runner (e.g., /status, /help)
 * - "passthrough": Forwarded to Claude Code with special formatting
 */

/**
 * Result from executing a custom command
 */
export interface CommandResult {
  /** Whether the command executed successfully */
  success: boolean;
  /** Output message to display in the chat */
  output: string;
  /** Whether this command should also be queued for Claude Code execution */
  passthrough: boolean;
  /** If passthrough, the transformed prompt to send to Claude Code */
  passthroughPrompt?: string;
  /** Additional metadata for the response */
  metadata?: Record<string, unknown>;
}

/**
 * Command handler function signature
 */
export type CommandHandler = (
  args: string,
  context: CommandContext
) => Promise<CommandResult>;

/**
 * Context passed to command handlers
 */
export interface CommandContext {
  projectId: string;
  projectPath?: string;
  sessionId?: string;
}

/**
 * Command definition
 */
export interface CommandDefinition {
  /** Command name (without the "/" prefix) */
  name: string;
  /** Brief description for /help */
  description: string;
  /** The handler function */
  handler: CommandHandler;
}

/**
 * Parse a chat message to detect if it's a custom command
 */
export function parseCommand(input: string): { isCommand: boolean; name: string; args: string } {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { isCommand: false, name: '', args: '' };
  }

  // Extract command name and args: "/command arg1 arg2"
  // Use [\s\S]* instead of .* with /s flag for compatibility with older targets
  const match = trimmed.match(/^\/([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+([\s\S]*))?$/);
  if (!match) {
    return { isCommand: false, name: '', args: '' };
  }

  return {
    isCommand: true,
    name: match[1].toLowerCase(),
    args: (match[2] || '').trim(),
  };
}

/**
 * Custom Command Registry
 *
 * Holds registered commands and dispatches execution.
 */
export class CustomCommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();

  constructor() {
    this.registerBuiltinCommands();
  }

  /**
   * Register a command
   */
  register(definition: CommandDefinition): void {
    this.commands.set(definition.name.toLowerCase(), definition);
  }

  /**
   * Check if a command is registered
   */
  has(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  /**
   * Get all registered commands
   */
  list(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  /**
   * Execute a command by name
   */
  async execute(name: string, args: string, context: CommandContext): Promise<CommandResult> {
    const definition = this.commands.get(name.toLowerCase());
    if (!definition) {
      return {
        success: false,
        output: `Unknown command: /${name}. Type /help to see available commands.`,
        passthrough: false,
      };
    }

    try {
      return await definition.handler(args, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Command /${name} failed: ${message}`,
        passthrough: false,
      };
    }
  }

  /**
   * Register built-in commands
   */
  private registerBuiltinCommands(): void {
    // /help - List available commands
    this.register({
      name: 'help',
      description: 'List available custom commands',
      handler: async () => {
        const lines = ['**Available Commands:**', ''];
        for (const cmd of this.list()) {
          lines.push(`- \`/${cmd.name}\` - ${cmd.description}`);
        }
        return {
          success: true,
          output: lines.join('\n'),
          passthrough: false,
        };
      },
    });

    // /status - Show project/runner status
    this.register({
      name: 'status',
      description: 'Show current project and runner status',
      handler: async (_args, context) => {
        const lines = [
          '**Status:**',
          '',
          `- Project: ${context.projectId}`,
          `- Path: ${context.projectPath || 'N/A'}`,
          `- Session: ${context.sessionId || 'N/A'}`,
        ];
        return {
          success: true,
          output: lines.join('\n'),
          passthrough: false,
        };
      },
    });

    // /clear - Signal to clear conversation (handled by the chat route)
    this.register({
      name: 'clear',
      description: 'Clear conversation history',
      handler: async () => {
        return {
          success: true,
          output: 'Conversation history cleared.',
          passthrough: false,
          metadata: { action: 'clear_conversation' },
        };
      },
    });

    // /run - Pass a command directly to Claude Code
    this.register({
      name: 'run',
      description: 'Execute a prompt directly via Claude Code',
      handler: async (args) => {
        if (!args.trim()) {
          return {
            success: false,
            output: 'Usage: `/run <prompt>` - Provide a prompt to execute.',
            passthrough: false,
          };
        }
        return {
          success: true,
          output: `Executing: ${args}`,
          passthrough: true,
          passthroughPrompt: args,
        };
      },
    });

    // /task - Create a task with explicit type
    this.register({
      name: 'task',
      description: 'Create a task with explicit type (e.g., /task READ_INFO explain X)',
      handler: async (args) => {
        const parts = args.trim().split(/\s+/);
        const validTypes = ['READ_INFO', 'REPORT', 'LIGHT_EDIT', 'IMPLEMENTATION', 'REVIEW_RESPONSE', 'CONFIG_CI_CHANGE', 'DANGEROUS_OP'];

        if (parts.length < 2 || !validTypes.includes(parts[0].toUpperCase())) {
          return {
            success: false,
            output: `Usage: \`/task <TYPE> <prompt>\`\nValid types: ${validTypes.join(', ')}`,
            passthrough: false,
          };
        }

        const taskType = parts[0].toUpperCase();
        const prompt = parts.slice(1).join(' ');

        return {
          success: true,
          output: `Task [${taskType}]: ${prompt}`,
          passthrough: true,
          passthroughPrompt: prompt,
          metadata: { taskType },
        };
      },
    });

    // /model - Show or set the model for the session
    this.register({
      name: 'model',
      description: 'Show or set the LLM model (e.g., /model gpt-4)',
      handler: async (args) => {
        if (!args.trim()) {
          return {
            success: true,
            output: 'Current model: (use /model <name> to change)',
            passthrough: false,
            metadata: { action: 'show_model' },
          };
        }
        return {
          success: true,
          output: `Model set to: ${args.trim()}`,
          passthrough: false,
          metadata: { action: 'set_model', model: args.trim() },
        };
      },
    });
  }
}

/**
 * Singleton registry instance
 */
let registryInstance: CustomCommandRegistry | null = null;

/**
 * Get or create the singleton command registry
 */
export function getCommandRegistry(): CustomCommandRegistry {
  if (!registryInstance) {
    registryInstance = new CustomCommandRegistry();
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing)
 */
export function resetCommandRegistry(): void {
  registryInstance = null;
}
