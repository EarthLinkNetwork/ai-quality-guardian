#!/usr/bin/env node
"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const cli_interface_1 = require("./cli-interface");
const repl_interface_1 = require("../repl/repl-interface");
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
  pm-orchestrator start ./my-project --dry-run
  pm-orchestrator continue session-2025-01-15-abc123
`;
/**
 * Version
 */
const VERSION = '0.1.0';
/**
 * Parse REPL-specific arguments
 */
function parseReplArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--project' || args[i] === '-p') && args[i + 1]) {
            result.projectPath = args[++i];
        }
        else if ((args[i] === '--evidence' || args[i] === '-e') && args[i + 1]) {
            result.evidenceDir = args[++i];
        }
    }
    return result;
}
/**
 * Main entry point
 */
async function main() {
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
                const repl = new repl_interface_1.REPLInterface({
                    projectPath: replArgs.projectPath || process.cwd(),
                    evidenceDir: replArgs.evidenceDir || path.join(process.cwd(), '.claude', 'evidence'),
                    authMode: 'claude-code',
                });
                await repl.start();
                break;
            }
            case 'start': // Per spec 05_CLI.md L20
            case 'continue':
            case 'status':
            case 'validate': { // Per spec 05_CLI.md L23
                // Use existing CLI interface for these commands
                const cli = new cli_interface_1.CLI({
                    evidenceDir: path.join(process.cwd(), '.claude', 'evidence'),
                });
                const result = await cli.run(args);
                // Output result
                if (result.help) {
                    console.log(result.help);
                }
                else if (result.version) {
                    console.log(result.version);
                }
                else {
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
    }
    catch (err) {
        if (err instanceof cli_interface_1.CLIError) {
            console.error(JSON.stringify({
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                },
            }, null, 2));
            process.exit(1);
        }
        else {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    }
}
// Run main
main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map