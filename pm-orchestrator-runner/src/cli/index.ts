#!/usr/bin/env node
/**
 * PM Orchestrator Runner - CLI Entry Point
 *
 * Usage:
 *   pm [options]                              - Start interactive REPL (default)
 *   pm repl [--project <path>]               - Start interactive REPL
 *   pm web [--port <number>] [--background]  - Start Web UI server
 *   pm web-stop [--namespace <name>]         - Stop background Web UI server
 *   pm start <path> [options]                - Start a new session (per spec 05_CLI.md L20)
 *   pm continue <session-id>                 - Continue a session
 *   pm status <session-id>                   - Get session status
 *   pm validate <path>                       - Validate project structure (per spec 05_CLI.md L23)
 */

import * as path from 'path';
import { CLI, CLIError } from './cli-interface';
import { REPLInterface, ProjectMode } from '../repl/repl-interface';
import { WebServer } from '../web/server';
import { QueueStore, QueuePoller, QueueItem, TaskExecutor } from '../queue';
import { AutoResolvingExecutor } from '../executor/auto-resolve-executor';
import {
  validateNamespace,
  buildNamespaceConfig,
} from '../config/namespace';
import { runApiKeyOnboarding, isOnboardingRequired } from '../keys/api-key-onboarding';
import {
  PidFileManager,
  WebServerProcess,
  WebStopCommand,
  WebStopExitCode,
} from '../web/background';

/**
 * Help text
 */
const HELP_TEXT = `
PM Orchestrator Runner - CLI

Usage:
  pm [options]                    Start interactive REPL (default)
  pm <command> [options]          Run a specific command

Commands:
  repl                   Start interactive REPL mode (default if no command)
  web                    Start Web UI server for task queue management
  web-stop               Stop background Web UI server
  start <path>           Start a new session on a project
  continue <session-id>  Continue a paused session
  status <session-id>    Get session status
  validate <path>        Validate project structure

REPL Options:
  --project <path>       Project path (default: current directory)
  --evidence <path>      Evidence directory
  --provider <provider>  API provider (default: requires API key setup)
                         - openai: Use OpenAI API (requires API key)
                         - anthropic: Use Anthropic API (requires API key)
                         - claude-code: Use Claude Code CLI (requires login)
  --no-auth              Skip API key requirement (use Claude Code CLI only)
                         WARNING: This bypasses the API key onboarding flow.
                         Requires Claude Code CLI to be installed and logged in.
  --non-interactive      Force non-interactive mode (no TTY prompts)
  --exit-on-eof          Exit when EOF is received (for piped input)
  --project-mode <mode>  Project mode: 'temp' (default) or 'fixed'
  --project-root <path>  Verification root directory (required if --project-mode=fixed)
  --print-project-path   Print PROJECT_PATH=<path> on startup
  --namespace <name>     Namespace for state separation (default: 'default')
                         Examples: 'stable', 'dev', 'test-1'
  --port <number>        Web UI port (default: 5678 for 'default'/'stable', 5679 for 'dev')

Web Options:
  --port <number>        Web UI port (default: 5678)
  --namespace <name>     Namespace for state separation
  --background           Start server in background (detached) mode

Web-Stop Options:
  --namespace <name>     Namespace of server to stop

General Options:
  --help, -h             Show this help message
  --version, -v          Show version

Examples:
  pm                                    # Start REPL in current directory
  pm --project ./my-project             # Start REPL with specific project
  pm repl --namespace stable            # Start REPL with stable namespace
  pm web --port 5678                    # Start Web UI on port 5678
  pm web --port 5678 --background       # Start Web UI in background
  pm web-stop --namespace stable        # Stop background Web UI server
  pm start ./my-project --dry-run       # Start session with dry-run
  pm continue session-2025-01-15-abc123 # Continue a session

Web UI Verification:
  1. Start Web UI:    pm web --port 5678
  2. Health check:    curl http://localhost:5678/api/health
  3. Submit task:     curl -X POST http://localhost:5678/api/tasks \\
                        -H "Content-Type: application/json" \\
                        -d '{"task_group_id":"test","prompt":"hello"}'
  4. View tasks:      curl http://localhost:5678/api/task-groups
`;

/**
 * Version - read from package.json
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VERSION: string = require('../../package.json').version;

/**
 * REPL arguments interface
 */
interface ReplArguments {
  projectPath?: string;
  evidenceDir?: string;
  nonInteractive?: boolean;
  exitOnEof?: boolean;
  projectMode?: ProjectMode;
  projectRoot?: string;
  printProjectPath?: boolean;
  namespace?: string;
  port?: number;
  authMode?: 'api-key' | 'claude-code';
  noAuth?: boolean;
}

/**
 * Parse REPL-specific arguments
 */
function parseReplArgs(args: string[]): ReplArguments {
  const result: ReplArguments = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Project path
    if ((arg === '--project' || arg === '-p') && args[i + 1]) {
      result.projectPath = args[++i];
    }
    // Evidence directory
    else if ((arg === '--evidence' || arg === '-e') && args[i + 1]) {
      result.evidenceDir = args[++i];
    }
    // Non-interactive mode
    else if (arg === '--non-interactive') {
      result.nonInteractive = true;
    }
    // Exit on EOF
    else if (arg === '--exit-on-eof') {
      result.exitOnEof = true;
    }
    // Project mode
    else if (arg === '--project-mode' && args[i + 1]) {
      const mode = args[++i];
      if (mode === 'temp' || mode === 'fixed') {
        result.projectMode = mode;
      } else {
        console.error(`Invalid project mode: ${mode}. Use 'temp' or 'fixed'.`);
        process.exit(1);
      }
    }
    // Project root
    else if (arg === '--project-root' && args[i + 1]) {
      result.projectRoot = args[++i];
    }
    // Print project path
    else if (arg === '--print-project-path') {
      result.printProjectPath = true;
    }
    // Namespace (per spec/21_STABLE_DEV.md)
    else if (arg === '--namespace' && args[i + 1]) {
      const ns = args[++i];
      // Fail-closed: validate namespace immediately
      const error = validateNamespace(ns);
      if (error) {
        console.error(`Invalid namespace: ${error}`);
        process.exit(1);
      }
      result.namespace = ns;
    }
    // Port
    else if (arg === '--port' && args[i + 1]) {
      const portStr = args[++i];
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${portStr}. Must be a number between 1 and 65535.`);
        process.exit(1);
      }
      result.port = port;
    }
    // Provider / auth mode
    else if (arg === '--provider' && args[i + 1]) {
      const provider = args[++i];
      if (provider === 'claude-code') {
        result.authMode = 'claude-code';
      } else if (provider === 'api-key' || provider === 'openai' || provider === 'anthropic') {
        // openai and anthropic both use api-key mode
        result.authMode = 'api-key';
      } else {
        console.error(`Invalid provider: ${provider}. Use 'openai', 'anthropic', or 'claude-code'.`);
        process.exit(1);
      }
    }
    // No-auth mode (skip API key requirement)
    else if (arg === '--no-auth') {
      result.noAuth = true;
      // --no-auth implies claude-code auth mode
      result.authMode = 'claude-code';
    }
  }

  return result;
}

/**
 * Start REPL with given arguments
 */
async function startRepl(replArgs: ReplArguments): Promise<void> {
  // CRITICAL: evidenceDir must use projectPath, not process.cwd()
  // This ensures files are created in the project directory, not where the CLI was invoked
  const projectPath = replArgs.projectPath || process.cwd();

  // API Key Onboarding Flow (unless --no-auth is specified)
  // This runs BEFORE .claude initialization check
  if (!replArgs.noAuth && !replArgs.nonInteractive) {
    if (isOnboardingRequired(replArgs.noAuth)) {
      // Interactive mode: run onboarding flow
      const onboardingResult = await runApiKeyOnboarding(true);

      if (!onboardingResult.success && !onboardingResult.skipped) {
        // Onboarding failed (user cancelled or error)
        console.error('API key setup cancelled or failed.');
        console.error('Use --no-auth option to bypass API key requirement.');
        process.exit(1);
      }

      if (onboardingResult.skipped && !onboardingResult.success) {
        // User explicitly chose to skip
        console.error('');
        console.error('No API key configured. Cannot start REPL.');
        console.error('Options:');
        console.error('  1. Set environment variable: OPENAI_API_KEY or ANTHROPIC_API_KEY');
        console.error('  2. Run again and enter an API key');
        console.error('  3. Use --no-auth option (requires Claude Code CLI)');
        console.error('');
        process.exit(1);
      }
    }
  } else if (!replArgs.noAuth && replArgs.nonInteractive) {
    // Non-interactive mode: fail-closed if no API key
    if (isOnboardingRequired(replArgs.noAuth)) {
      console.error('ERROR: No API key configured.');
      console.error('In non-interactive mode, API key must be pre-configured.');
      console.error('Set environment variable: OPENAI_API_KEY or ANTHROPIC_API_KEY');
      console.error('Or use --no-auth option to bypass API key requirement.');
      process.exit(1);
    }
  }

  // Build namespace configuration (per spec/21_STABLE_DEV.md)
  // Fail-closed: buildNamespaceConfig throws on invalid namespace
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: replArgs.namespace,
    projectRoot: projectPath,
    port: replArgs.port,
  });

  const repl = new REPLInterface({
    projectPath,
    evidenceDir: replArgs.evidenceDir || path.join(namespaceConfig.stateDir, 'evidence'),
    // Default to 'api-key' mode (requires OpenAI/Anthropic API key)
    // Use --provider claude-code to use Claude Code CLI directly
    authMode: replArgs.authMode || 'api-key',
    forceNonInteractive: replArgs.nonInteractive,
    projectMode: replArgs.projectMode,
    projectRoot: replArgs.projectRoot,
    printProjectPath: replArgs.printProjectPath,
    namespace: namespaceConfig.namespace,
    namespaceConfig,
  });

  // Start REPL and wait for it to complete
  // CRITICAL: Don't use setTimeout to force exit - let REPL handle EOF properly
  // The REPL's start() returns a Promise that resolves after queue drain
  await repl.start();

  // After REPL completes, exit with appropriate code
  if (replArgs.exitOnEof || replArgs.nonInteractive) {
    process.exit(repl.getExitCode());
  }
}

/**
 * Web server arguments interface
 */
interface WebArguments {
  port?: number;
  namespace?: string;
  background?: boolean;
}

/**
 * Parse Web-specific arguments
 */
function parseWebArgs(args: string[]): WebArguments {
  const result: WebArguments = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Port
    if (arg === '--port' && args[i + 1]) {
      const portStr = args[++i];
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${portStr}. Must be a number between 1 and 65535.`);
        process.exit(1);
      }
      result.port = port;
    }
    // Namespace
    else if (arg === '--namespace' && args[i + 1]) {
      const ns = args[++i];
      const error = validateNamespace(ns);
      if (error) {
        console.error(`Invalid namespace: ${error}`);
        process.exit(1);
      }
      result.namespace = ns;
    }
    // Background mode (per spec/19_WEB_UI.md lines 361-398)
    else if (arg === '--background') {
      result.background = true;
    }
  }

  return result;
}

/**
 * Generate a simple session ID for web server
 */
function generateWebSessionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const random = Math.random().toString(36).substring(2, 8);
  return `web-${dateStr}-${random}`;
}

/**
 * Create a TaskExecutor that uses AutoResolvingExecutor
 *
 * AutoResolvingExecutor automatically resolves clarification requests using LLM
 * instead of asking the user. This is critical for headless execution (Web UI, queue).
 *
 * Per user insight: "LLM Layer should answer clarification questions"
 */
function createTaskExecutor(projectPath: string): TaskExecutor {
  return async (item: QueueItem): Promise<{ status: 'COMPLETE' | 'ERROR'; errorMessage?: string }> => {
    console.log(`[Runner] Executing task: ${item.task_id}`);
    console.log(`[Runner] Prompt: ${item.prompt.substring(0, 100)}${item.prompt.length > 100 ? '...' : ''}`);

    try {
      // Use AutoResolvingExecutor to automatically resolve clarification requests
      // When Claude Code asks "where should I save the file?", LLM decides automatically
      const executor = new AutoResolvingExecutor({
        projectPath,
        timeout: 10 * 60 * 1000, // 10 minutes
        softTimeoutMs: 60 * 1000,
        hardTimeoutMs: 120 * 1000,
        maxRetries: 2, // Allow 2 retry attempts for auto-resolution
      });

      const result = await executor.execute({
        id: item.task_id,
        prompt: item.prompt,
        workingDir: projectPath,
      });

      console.log(`[Runner] Task ${item.task_id} completed with status: ${result.status}`);

      if (result.status === 'COMPLETE') {
        return { status: 'COMPLETE' };
      } else if (result.status === 'ERROR') {
        return { status: 'ERROR', errorMessage: result.error || 'Task failed' };
      } else {
        // INCOMPLETE, NO_EVIDENCE, BLOCKED -> treat as ERROR for queue purposes
        return { status: 'ERROR', errorMessage: `Task ended with status: ${result.status}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Runner] Task ${item.task_id} failed:`, errorMessage);
      return { status: 'ERROR', errorMessage };
    }
  };
}

/**
 * Start Web UI server in background mode
 * Per spec/19_WEB_UI.md lines 361-398
 */
async function startWebServerBackground(webArgs: WebArguments): Promise<void> {
  const projectPath = process.cwd();

  // Build namespace configuration
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: webArgs.namespace,
    projectRoot: projectPath,
    port: webArgs.port,
  });

  const port = webArgs.port || namespaceConfig.port;

  const serverProcess = new WebServerProcess({
    projectRoot: projectPath,
    namespace: namespaceConfig.namespace,
    port,
  });

  const result = await serverProcess.spawnBackground();

  if (!result.success) {
    console.error(`Failed to start background server: ${result.error}`);
    process.exit(1);
  }

  console.log(`Web UI server started in background (PID: ${result.pid})`);
  console.log(`Namespace: ${namespaceConfig.namespace}`);
  console.log(`Port: ${port}`);
  console.log(`PID file: ${serverProcess.getPidManager().getPidFilePath(namespaceConfig.namespace)}`);
  console.log(`Log file: ${serverProcess.getPidManager().getLogFilePath(namespaceConfig.namespace)}`);
  console.log('');
  console.log(`To stop: pm web-stop --namespace ${namespaceConfig.namespace}`);
  console.log(`Health check: curl http://localhost:${port}/api/health`);

  process.exit(0);
}

/**
 * Start Web UI server (foreground)
 */
async function startWebServer(webArgs: WebArguments): Promise<void> {
  // Handle background mode
  if (webArgs.background) {
    return startWebServerBackground(webArgs);
  }

  const projectPath = process.cwd();

  // Build namespace configuration
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: webArgs.namespace,
    projectRoot: projectPath,
    port: webArgs.port,
  });

  const port = webArgs.port || namespaceConfig.port;
  const queueStore = new QueueStore({
    namespace: namespaceConfig.namespace,
  });
  await queueStore.ensureTable();

  // Create TaskExecutor and QueuePoller
  const taskExecutor = createTaskExecutor(projectPath);
  const poller = new QueuePoller(queueStore, taskExecutor, {
    pollIntervalMs: 1000,
    recoverOnStartup: true,
    projectRoot: projectPath,
  });

  // Set up poller event listeners
  poller.on('started', () => {
    console.log('[Runner] Queue poller started');
  });
  poller.on('claimed', (item: QueueItem) => {
    console.log(`[Runner] Claimed task: ${item.task_id}`);
  });
  poller.on('completed', (item: QueueItem) => {
    console.log(`[Runner] Completed task: ${item.task_id}`);
  });
  poller.on('error', (item: QueueItem, error: Error) => {
    console.error(`[Runner] Task ${item.task_id} error:`, error.message);
  });
  poller.on('stale-recovered', (count: number) => {
    console.log(`[Runner] Recovered ${count} stale tasks`);
  });

  const server = new WebServer({
    port,
    queueStore,
    sessionId: generateWebSessionId(),
    namespace: namespaceConfig.namespace,
    projectRoot: projectPath,
  });

  console.log(`Starting Web UI server on port ${port}...`);
  console.log(`Namespace: ${namespaceConfig.namespace}`);
  console.log(`State directory: ${namespaceConfig.stateDir}`);
  console.log('');
  console.log('Verification steps:');
  console.log(`  1. Health check:  curl http://localhost:${port}/api/health`);
  console.log(`  2. Submit task:   curl -X POST http://localhost:${port}/api/tasks \\`);
  console.log('                      -H "Content-Type: application/json" \\');
  console.log('                      -d \'{"task_group_id":"test","prompt":"hello"}\'');
  console.log(`  3. View tasks:    curl http://localhost:${port}/api/task-groups`);
  console.log('');

  // Start both web server and poller
  await server.start();
  await poller.start();

  console.log('[Runner] Web server and queue poller are running');
  console.log('[Runner] Press Ctrl+C to stop');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[Runner] Shutting down...');
    await poller.stop();
    await server.stop();
    console.log('[Runner] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Web-stop arguments interface
 */
interface WebStopArguments {
  namespace?: string;
}

/**
 * Parse web-stop arguments
 */
function parseWebStopArgs(args: string[]): WebStopArguments {
  const result: WebStopArguments = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--namespace' && args[i + 1]) {
      const ns = args[++i];
      const error = validateNamespace(ns);
      if (error) {
        console.error(`Invalid namespace: ${error}`);
        process.exit(1);
      }
      result.namespace = ns;
    }
  }

  return result;
}

/**
 * Stop background Web UI server
 * Per spec/19_WEB_UI.md lines 400-432
 */
async function stopWebServer(args: WebStopArguments): Promise<void> {
  const projectPath = process.cwd();

  // Build namespace configuration
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: args.namespace,
    projectRoot: projectPath,
  });

  const pidManager = new PidFileManager(projectPath);
  const stopCmd = new WebStopCommand(pidManager);

  console.log(`Stopping Web UI server (namespace: ${namespaceConfig.namespace})...`);

  const result = await stopCmd.execute(namespaceConfig.namespace);

  switch (result.exitCode) {
    case WebStopExitCode.SUCCESS:
      console.log(result.message);
      if (result.pid) {
        console.log(`PID: ${result.pid}`);
      }
      process.exit(0);
      break;

    case WebStopExitCode.PID_FILE_NOT_FOUND:
      console.error(result.message);
      console.error(`PID file location: ${pidManager.getPidFilePath(namespaceConfig.namespace)}`);
      process.exit(1);
      break;

    case WebStopExitCode.FORCE_KILLED:
      console.warn(result.message);
      if (result.pid) {
        console.warn(`PID: ${result.pid}`);
      }
      process.exit(2);
      break;
  }
}

/**
 * Check if argument looks like an option (starts with -)
 */
function isOption(arg: string): boolean {
  return arg.startsWith('-');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for help (explicit request only)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Check for version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  // Determine command and arguments
  // If no args or first arg is an option, default to REPL
  let command: string;
  let restArgs: string[];

  if (args.length === 0 || isOption(args[0])) {
    // No command specified or first arg is an option -> default to REPL
    command = 'repl';
    restArgs = args;
  } else {
    command = args[0];
    restArgs = args.slice(1);
  }

  try {
    switch (command) {
      case 'repl': {
        const replArgs = parseReplArgs(restArgs);
        await startRepl(replArgs);
        break;
      }

      case 'web': {
        const webArgs = parseWebArgs(restArgs);
        await startWebServer(webArgs);
        break;
      }

      case 'web-stop': {
        // Per spec/19_WEB_UI.md lines 400-432
        const webStopArgs = parseWebStopArgs(restArgs);
        await stopWebServer(webStopArgs);
        break;
      }

      case 'start':  // Per spec 05_CLI.md L20
      case 'continue':
      case 'status':
      case 'validate': {  // Per spec 05_CLI.md L23
        // Use existing CLI interface for these commands
        const cli = new CLI({
          evidenceDir: path.join(process.cwd(), '.claude', 'evidence'),
        });

        const result = await cli.run(args);

        // Output result
        if (result.help) {
          console.log(result.help);
        } else if (result.version) {
          console.log(result.version);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }

        // Set exit code based on status
        if (result.overall_status) {
          process.exit(cli.getExitCodeForStatus(result.overall_status));
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP_TEXT);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof CLIError) {
      console.error(JSON.stringify({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      }, null, 2));
      process.exit(1);
    } else {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}

// Run main
main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
