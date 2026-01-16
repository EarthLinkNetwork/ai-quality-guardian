#!/usr/bin/env node
/**
 * PM Orchestrator Runner - CLI Entry Point
 *
 * Usage:
 *   pm-orchestrator repl [--project <path>]   - Start interactive REPL
 *   pm-orchestrator start <path> [options]    - Start a new session (per spec 05_CLI.md L20)
 *   pm-orchestrator continue <session-id>     - Continue a session
 *   pm-orchestrator status <session-id>       - Get session status
 *   pm-orchestrator validate <path>           - Validate project structure (per spec 05_CLI.md L23)
 */

import * as path from 'path';
import { CLI, parseArgs, CLIError } from './cli-interface';
import { REPLInterface, ProjectMode } from '../repl/repl-interface';

/**
 * Help text
 */
const HELP_TEXT = `
PM Orchestrator Runner - CLI

Usage:
  pm-orchestrator <command> [options]

Commands:
  repl                   Start interactive REPL mode
  start <path>           Start a new session on a project (per spec 05_CLI.md L20)
  continue <session-id>  Continue a paused session
  status <session-id>    Get session status
  validate <path>        Validate project structure (per spec 05_CLI.md L23)

REPL Options:
  --project <path>       Project path (default: current directory)
  --evidence <path>      Evidence directory
  --non-interactive      Force non-interactive mode (no TTY prompts)
  --exit-on-eof          Exit when EOF is received (for piped input)
  --project-mode <mode>  Project mode: 'temp' (default) or 'fixed'
  --project-root <path>  Verification root directory (required if --project-mode=fixed)
  --print-project-path   Print PROJECT_PATH=<path> on startup

Run Options:
  --config <path>        Path to config file
  --dry-run              Validate without executing
  --max-files <n>        Maximum files limit
  --max-tests <n>        Maximum tests limit
  --max-seconds <n>      Maximum seconds limit
  --verbose              Verbose output
  --quiet                Minimal output
  --stream               Stream progress events
  --format <type>        Output format (json, compact)

General Options:
  --help, -h             Show this help message
  --version, -v          Show version

Examples:
  pm-orchestrator repl
  pm-orchestrator repl --project ./my-project
  pm-orchestrator repl --non-interactive --exit-on-eof
  pm-orchestrator repl --project-mode fixed --project-root /path/to/project
  pm-orchestrator start ./my-project --dry-run
  pm-orchestrator continue session-2025-01-15-abc123
`;

/**
 * Version
 */
const VERSION = '0.1.0';

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
  }

  return result;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Check for version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args[0];
  const restArgs = args.slice(1);

  try {
    switch (command) {
      case 'repl': {
        const replArgs = parseReplArgs(restArgs);
        // CRITICAL: evidenceDir must use projectPath, not process.cwd()
        // This ensures files are created in the project directory, not where the CLI was invoked
        const projectPath = replArgs.projectPath || process.cwd();
        const repl = new REPLInterface({
          projectPath,
          evidenceDir: replArgs.evidenceDir || path.join(projectPath, '.claude', 'evidence'),
          authMode: 'claude-code',
          forceNonInteractive: replArgs.nonInteractive,
          projectMode: replArgs.projectMode,
          projectRoot: replArgs.projectRoot,
          printProjectPath: replArgs.printProjectPath,
        });
        
        // Start REPL and wait for it to complete
        // CRITICAL: Don't use setTimeout to force exit - let REPL handle EOF properly
        // The REPL's start() returns a Promise that resolves after queue drain
        await repl.start();

        // After REPL completes, exit with appropriate code
        if (replArgs.exitOnEof || replArgs.nonInteractive) {
          process.exit(repl.getExitCode());
        }
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
