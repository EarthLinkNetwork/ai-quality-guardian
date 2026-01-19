#!/usr/bin/env node
"use strict";
/**
 * PM Orchestrator Runner - CLI Entry Point
 *
 * Usage:
 *   pm [options]                              - Start interactive REPL (default)
 *   pm repl [--project <path>]               - Start interactive REPL
 *   pm web [--port <number>]                 - Start Web UI server
 *   pm start <path> [options]                - Start a new session (per spec 05_CLI.md L20)
 *   pm continue <session-id>                 - Continue a session
 *   pm status <session-id>                   - Get session status
 *   pm validate <path>                       - Validate project structure (per spec 05_CLI.md L23)
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
const server_1 = require("../web/server");
const queue_1 = require("../queue");
const namespace_1 = require("../config/namespace");
const api_key_onboarding_1 = require("../keys/api-key-onboarding");
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
  --port <number>        Web UI port (default: 3000 for 'default'/'stable', 3001 for 'dev')

Web Options:
  --port <number>        Web UI port (default: 3000)
  --namespace <name>     Namespace for state separation

General Options:
  --help, -h             Show this help message
  --version, -v          Show version

Examples:
  pm                                    # Start REPL in current directory
  pm --project ./my-project             # Start REPL with specific project
  pm repl --namespace stable            # Start REPL with stable namespace
  pm web --port 3000                    # Start Web UI on port 3000
  pm start ./my-project --dry-run       # Start session with dry-run
  pm continue session-2025-01-15-abc123 # Continue a session

Web UI Verification:
  1. Start Web UI:    pm web --port 3000
  2. Health check:    curl http://localhost:3000/api/health
  3. Submit task:     curl -X POST http://localhost:3000/api/tasks \\
                        -H "Content-Type: application/json" \\
                        -d '{"task_group_id":"test","prompt":"hello"}'
  4. View tasks:      curl http://localhost:3000/api/task-groups
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
            }
            else {
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
            const error = (0, namespace_1.validateNamespace)(ns);
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
            }
            else if (provider === 'api-key' || provider === 'openai' || provider === 'anthropic') {
                // openai and anthropic both use api-key mode
                result.authMode = 'api-key';
            }
            else {
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
async function startRepl(replArgs) {
    // CRITICAL: evidenceDir must use projectPath, not process.cwd()
    // This ensures files are created in the project directory, not where the CLI was invoked
    const projectPath = replArgs.projectPath || process.cwd();
    // API Key Onboarding Flow (unless --no-auth is specified)
    // This runs BEFORE .claude initialization check
    if (!replArgs.noAuth && !replArgs.nonInteractive) {
        if ((0, api_key_onboarding_1.isOnboardingRequired)(replArgs.noAuth)) {
            // Interactive mode: run onboarding flow
            const onboardingResult = await (0, api_key_onboarding_1.runApiKeyOnboarding)(true);
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
    }
    else if (!replArgs.noAuth && replArgs.nonInteractive) {
        // Non-interactive mode: fail-closed if no API key
        if ((0, api_key_onboarding_1.isOnboardingRequired)(replArgs.noAuth)) {
            console.error('ERROR: No API key configured.');
            console.error('In non-interactive mode, API key must be pre-configured.');
            console.error('Set environment variable: OPENAI_API_KEY or ANTHROPIC_API_KEY');
            console.error('Or use --no-auth option to bypass API key requirement.');
            process.exit(1);
        }
    }
    // Build namespace configuration (per spec/21_STABLE_DEV.md)
    // Fail-closed: buildNamespaceConfig throws on invalid namespace
    const namespaceConfig = (0, namespace_1.buildNamespaceConfig)({
        namespace: replArgs.namespace,
        projectRoot: projectPath,
        port: replArgs.port,
    });
    const repl = new repl_interface_1.REPLInterface({
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
 * Parse Web-specific arguments
 */
function parseWebArgs(args) {
    const result = {};
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
            const error = (0, namespace_1.validateNamespace)(ns);
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
 * Generate a simple session ID for web server
 */
function generateWebSessionId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const random = Math.random().toString(36).substring(2, 8);
    return `web-${dateStr}-${random}`;
}
/**
 * Start Web UI server
 */
async function startWebServer(webArgs) {
    const projectPath = process.cwd();
    // Build namespace configuration
    const namespaceConfig = (0, namespace_1.buildNamespaceConfig)({
        namespace: webArgs.namespace,
        projectRoot: projectPath,
        port: webArgs.port,
    });
    const port = webArgs.port || namespaceConfig.port;
    const queueStore = (0, queue_1.createNamespacedQueueStore)({
        namespace: namespaceConfig.namespace,
        tableName: namespaceConfig.tableName,
    });
    const server = new server_1.WebServer({
        port,
        queueStore,
        sessionId: generateWebSessionId(),
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
    await server.start();
}
/**
 * Check if argument looks like an option (starts with -)
 */
function isOption(arg) {
    return arg.startsWith('-');
}
/**
 * Main entry point
 */
async function main() {
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
    let command;
    let restArgs;
    if (args.length === 0 || isOption(args[0])) {
        // No command specified or first arg is an option -> default to REPL
        command = 'repl';
        restArgs = args;
    }
    else {
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