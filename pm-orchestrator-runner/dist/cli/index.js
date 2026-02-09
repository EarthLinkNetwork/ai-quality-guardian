#!/usr/bin/env node
"use strict";
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
exports.buildTaskContext = buildTaskContext;
exports.injectTaskContext = injectTaskContext;
exports.stripPmOrchestratorBlocks = stripPmOrchestratorBlocks;
const path = __importStar(require("path"));
const cli_interface_1 = require("./cli-interface");
const repl_interface_1 = require("../repl/repl-interface");
const server_1 = require("../web/server");
const index_1 = require("../queue/index");
const in_memory_queue_store_1 = require("../queue/in-memory-queue-store");
const file_queue_store_1 = require("../queue/file-queue-store");
const auto_resolve_executor_1 = require("../executor/auto-resolve-executor");
const test_incomplete_executor_1 = require("../executor/test-incomplete-executor");
const deterministic_executor_1 = require("../executor/deterministic-executor");
const namespace_1 = require("../config/namespace");
const global_config_1 = require("../config/global-config");
const api_key_onboarding_1 = require("../keys/api-key-onboarding");
const background_1 = require("../web/background");
const dist_freshness_1 = require("../utils/dist-freshness");
const selftest_runner_1 = require("../selftest/selftest-runner");
const question_detector_1 = require("../utils/question-detector");
const executor_preflight_1 = require("../diagnostics/executor-preflight");
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
  selftest               Run selftest mode with AI judge
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
const VERSION = require('../../package.json').version;
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
        autoDerive: true,
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
        // Background mode (per spec/19_WEB_UI.md lines 361-398)
        else if (arg === '--background') {
            result.background = true;
        }
        // No DynamoDB mode - use in-memory queue store (legacy flag)
        else if (arg === '--no-dynamodb') {
            result.noDynamodb = true;
            result.storeMode = 'memory';
        }
        // DynamoDB mode - use DynamoDB queue store
        else if (arg === '--dynamodb') {
            result.storeMode = 'dynamodb';
        }
        // In-memory mode - use non-persistent in-memory store
        else if (arg === '--in-memory') {
            result.storeMode = 'memory';
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
 * Build TaskContext block from QueueItem metadata.
 * This gives the LLM access to "what the UI screen shows" so users can
 * ask it to transcribe IDs, timestamps, etc.
 *
 * SECURITY: Never include raw API key strings. Only boolean flags.
 */
/** @internal Exported for testing only */
function buildTaskContext(item) {
    // Use centralized getApiKey() for DI compliance - no direct process.env access
    const openaiKey = (0, global_config_1.getApiKey)('openai');
    const hasOpenAIKey = !!(openaiKey && openaiKey.length > 0);
    const hasRunnerDevDir = require('fs').existsSync(path.join(process.cwd(), '.claude'));
    const lines = [
        '[TaskContext]',
        `status: ${item.status}`,
        `taskId: ${item.task_id}`,
        `taskGroupId: ${item.task_group_id}`,
        `sessionId: ${item.session_id}`,
        `createdAt: ${item.created_at}`,
        `updatedAt: ${item.updated_at}`,
        `taskType: ${item.task_type || 'READ_INFO'}`,
        `hasOpenAIKey: ${hasOpenAIKey}`,
        `hasRunnerDevDir: ${hasRunnerDevDir}`,
        '[/TaskContext]',
    ];
    return lines.join('\n');
}
/**
 * Inject TaskContext and output-format rules into the prompt
 * before passing to executor.
 *
 * The TaskContext block is prepended as reference data.
 * Output rules ensure the executor never inserts meta-blocks
 * (e.g. "PM Orchestrator 起動ルール") into its response.
 */
/** @internal Exported for testing only */
function injectTaskContext(originalPrompt, item) {
    const taskContext = buildTaskContext(item);
    const outputRules = [
        '[OutputRules]',
        'You are running inside a Web Chat executor.',
        'CRITICAL: Your response will be shown directly to the user in a Task Detail panel.',
        '- Do NOT prepend any meta-blocks such as "PM Orchestrator 起動ルール" or status bars.',
        '- Do NOT add decorative separators (━━━) or rule-display blocks.',
        '- If the user specifies an output format, follow it EXACTLY. The first line of your output must match the first line the user requested.',
        '- You may reference values from [TaskContext] above when the user asks about IDs, status, timestamps, etc.',
        '- Never output raw API keys or secrets. Only use the boolean flags (hasOpenAIKey, hasRunnerDevDir).',
        '- Do NOT fabricate evidence (e.g. "I read .env" or "I queried DynamoDB"). Only cite TaskContext or execution logs as evidence.',
        '[/OutputRules]',
    ];
    return taskContext + '\n\n' + outputRules.join('\n') + '\n\n' + originalPrompt;
}
/**
 * Strip PM Orchestrator meta-blocks from executor output.
 * These blocks are injected by CLAUDE.md rules but must not appear
 * in Web Chat results (AC1).
 *
 * Strips everything between "━━━" fence lines that contain
 * "PM Orchestrator" or "起動ルール".
 */
/** @internal Exported for testing only */
function stripPmOrchestratorBlocks(output) {
    if (!output)
        return output;
    // Pattern: block starting with ━━━ line, containing PM Orchestrator text, ending with ━━━ line
    // This handles the every_chat block that CLAUDE.md forces
    const fenceBlockPattern = /━━+[\s\S]*?━━+\n*/g;
    let cleaned = output.replace(fenceBlockPattern, '');
    // Also strip any leftover lines that are clearly PM Orchestrator artifacts
    const pmLines = /^【(表示ルール|PM Orchestrator|禁止事項|Task Tool|重要).*\n?/gm;
    cleaned = cleaned.replace(pmLines, '');
    // Remove leading whitespace/newlines left after stripping
    cleaned = cleaned.replace(/^\s*\n+/, '');
    return cleaned;
}
/**
 * Create a TaskExecutor that uses AutoResolvingExecutor
 *
 * AutoResolvingExecutor automatically resolves clarification requests using LLM
 * instead of asking the user. This is critical for headless execution (Web UI, queue).
 *
 * Per user insight: "LLM Layer should answer clarification questions"
 */
function createTaskExecutor(projectPath) {
    return async (item) => {
        console.log(`[Runner] Executing task: ${item.task_id}`);
        console.log(`[Runner] Prompt: ${item.prompt.substring(0, 100)}${item.prompt.length > 100 ? '...' : ''}`);
        // Inject TaskContext and OutputRules into the prompt for all Web Chat tasks
        const enrichedPrompt = injectTaskContext(item.prompt, item);
        try {
            // Check for test executor mode (for E2E testing of INCOMPLETE handling)
            const testMode = (0, test_incomplete_executor_1.getTestExecutorMode)();
            if (testMode !== 'passthrough') {
                console.log(`[Runner] Test executor mode: ${testMode}`);
                // Create a test executor that returns controlled status
                const stubExecutor = new deterministic_executor_1.DeterministicExecutor();
                const testExecutor = new test_incomplete_executor_1.TestIncompleteExecutor(stubExecutor, testMode);
                const result = await testExecutor.execute({
                    id: item.task_id,
                    prompt: enrichedPrompt,
                    workingDir: projectPath,
                    taskType: item.task_type || 'READ_INFO', // Default to READ_INFO for chat messages
                });
                console.log(`[Runner] Test executor returned status: ${result.status}`);
                // Post-process: strip PM Orchestrator blocks from output
                const cleanOutput = stripPmOrchestratorBlocks(result.output || '');
                // Handle test executor results
                // For READ_INFO/REPORT tasks with INCOMPLETE + output, treat as COMPLETE
                const taskType = item.task_type || 'READ_INFO';
                const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';
                const hasOutput = cleanOutput && cleanOutput.trim().length > 0;
                if (result.status === 'COMPLETE') {
                    // Per COMPLETION_JUDGMENT.md: Check for unanswered questions in output
                    // Questions in output -> AWAITING_RESPONSE (not COMPLETE)
                    if (isReadInfoOrReport && hasOutput && (0, question_detector_1.hasUnansweredQuestions)(cleanOutput)) {
                        console.log(`[Runner] READ_INFO/REPORT COMPLETE but has questions -> AWAITING_RESPONSE`);
                        return {
                            status: 'ERROR',
                            errorMessage: 'AWAITING_CLARIFICATION:' + cleanOutput,
                            output: cleanOutput,
                        };
                    }
                    // Return output for visibility in UI (AC-CHAT-001, AC-CHAT-002)
                    return { status: 'COMPLETE', output: cleanOutput || undefined };
                }
                else if (result.status === 'ERROR') {
                    return { status: 'ERROR', errorMessage: result.error || 'Task failed' };
                }
                else if (isReadInfoOrReport) {
                    // READ_INFO/REPORT: INCOMPLETE / NO_EVIDENCE / BLOCKED -> unified handling
                    if (hasOutput) {
                        // Per COMPLETION_JUDGMENT.md: Check for questions before marking COMPLETE
                        if ((0, question_detector_1.hasUnansweredQuestions)(cleanOutput)) {
                            console.log(`[Runner] READ_INFO/REPORT ${result.status} with questions -> AWAITING_RESPONSE`);
                            return {
                                status: 'ERROR',
                                errorMessage: 'AWAITING_CLARIFICATION:' + cleanOutput,
                                output: cleanOutput,
                            };
                        }
                        console.log(`[Runner] READ_INFO/REPORT ${result.status} with output -> COMPLETE`);
                        return { status: 'COMPLETE', output: cleanOutput };
                    }
                    else {
                        console.log(`[Runner] READ_INFO/REPORT ${result.status} without output -> needs clarification`);
                        return {
                            status: 'ERROR',
                            errorMessage: 'AWAITING_CLARIFICATION:' + generateClarificationMessage(item.prompt),
                        };
                    }
                }
                else {
                    // IMPLEMENTATION / other: non-COMPLETE -> ERROR
                    return { status: 'ERROR', errorMessage: `Task ended with status: ${result.status}` };
                }
            }
            // Use AutoResolvingExecutor to automatically resolve clarification requests
            // When Claude Code asks "where should I save the file?", LLM decides automatically
            const executor = new auto_resolve_executor_1.AutoResolvingExecutor({
                projectPath,
                timeout: 10 * 60 * 1000, // 10 minutes
                softTimeoutMs: 60 * 1000,
                hardTimeoutMs: 120 * 1000,
                maxRetries: 2, // Allow 2 retry attempts for auto-resolution
            });
            const result = await executor.execute({
                id: item.task_id,
                prompt: enrichedPrompt,
                workingDir: projectPath,
                taskType: item.task_type, // Propagate task type for READ_INFO/REPORT handling
            });
            console.log(`[Runner] Task ${item.task_id} completed with status: ${result.status}`);
            // Post-process: strip PM Orchestrator blocks from output
            const cleanOutput = stripPmOrchestratorBlocks(result.output || '');
            // Unified READ_INFO/REPORT handling for non-COMPLETE/non-ERROR statuses
            // (INCOMPLETE, NO_EVIDENCE, BLOCKED all follow the same logic)
            const taskType = item.task_type || 'READ_INFO';
            const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';
            const hasOutput = cleanOutput && cleanOutput.trim().length > 0;
            if (result.status === 'COMPLETE') {
                // Per COMPLETION_JUDGMENT.md: Check for unanswered questions in output
                // Questions in output -> AWAITING_RESPONSE (not COMPLETE)
                if (isReadInfoOrReport && hasOutput && (0, question_detector_1.hasUnansweredQuestions)(cleanOutput)) {
                    console.log(`[Runner] READ_INFO/REPORT COMPLETE but has questions -> AWAITING_RESPONSE`);
                    return {
                        status: 'ERROR',
                        errorMessage: 'AWAITING_CLARIFICATION:' + cleanOutput,
                        output: cleanOutput,
                    };
                }
                // Return output for visibility in UI (AC-CHAT-001, AC-CHAT-002)
                return { status: 'COMPLETE', output: cleanOutput || undefined };
            }
            else if (result.status === 'ERROR') {
                return { status: 'ERROR', errorMessage: result.error || 'Task failed', output: cleanOutput || undefined };
            }
            else if (isReadInfoOrReport) {
                // READ_INFO/REPORT: output is the deliverable, not file evidence
                // INCOMPLETE / NO_EVIDENCE / BLOCKED all route here
                if (hasOutput) {
                    // Per COMPLETION_JUDGMENT.md: Check for questions before marking COMPLETE
                    if ((0, question_detector_1.hasUnansweredQuestions)(cleanOutput)) {
                        console.log(`[Runner] READ_INFO/REPORT ${result.status} with questions -> AWAITING_RESPONSE`);
                        return {
                            status: 'ERROR',
                            errorMessage: 'AWAITING_CLARIFICATION:' + cleanOutput,
                            output: cleanOutput,
                        };
                    }
                    // Output exists, no questions -> task succeeded (COMPLETE)
                    console.log(`[Runner] READ_INFO/REPORT ${result.status} with output -> COMPLETE`);
                    return { status: 'COMPLETE', output: cleanOutput };
                }
                else {
                    // No output -> needs clarification (AWAITING_RESPONSE, never ERROR)
                    const clarificationMsg = generateClarificationMessage(item.prompt);
                    const fallbackOutput = `INCOMPLETE: Task could not produce results.\n${clarificationMsg}`;
                    console.log(`[Runner] READ_INFO/REPORT ${result.status} without output -> AWAITING_RESPONSE`);
                    return {
                        status: 'ERROR',
                        errorMessage: 'AWAITING_CLARIFICATION:' + clarificationMsg,
                        output: fallbackOutput,
                    };
                }
            }
            else {
                // IMPLEMENTATION / other task types: non-COMPLETE -> ERROR, preserve output
                console.log(`[Runner] ${taskType} ${result.status} -> ERROR (output preserved: ${hasOutput})`);
                return {
                    status: 'ERROR',
                    errorMessage: `Task ended with status: ${result.status}`,
                    output: cleanOutput || undefined,
                };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Runner] Task ${item.task_id} failed:`, errorMessage);
            return { status: 'ERROR', errorMessage };
        }
    };
}
/**
 * Generate clarification message for INCOMPLETE READ_INFO tasks
 */
function generateClarificationMessage(prompt) {
    const isSummaryRequest = /(?:要約|まとめ|サマリ|summary|summarize|overview)/i.test(prompt);
    const isStatusRequest = /(?:状態|状況|ステータス|status|state|current)/i.test(prompt);
    const isAnalysisRequest = /(?:分析|解析|analyze|analysis|check|調べ|確認)/i.test(prompt);
    if (isSummaryRequest) {
        return '要約する対象を具体的に教えてください。例: 「このプロジェクトのREADMEを要約してください」';
    }
    else if (isStatusRequest) {
        return '確認したい状態の対象を教えてください。例: 「gitの状態を確認してください」「テストの状態を確認してください」';
    }
    else if (isAnalysisRequest) {
        return '分析対象を具体的に指定してください。例: 「src/index.tsのコードを分析してください」';
    }
    return 'リクエストをより具体的にしてください。何を確認または分析すべきか教えてください。';
}
/**
 * Start Web UI server in background mode
 * Per spec/19_WEB_UI.md lines 361-398
 */
async function startWebServerBackground(webArgs) {
    const projectPath = process.cwd();
    // Build namespace configuration
    const namespaceConfig = (0, namespace_1.buildNamespaceConfig)({
        autoDerive: true,
        namespace: webArgs.namespace,
        projectRoot: projectPath,
        port: webArgs.port,
    });
    const port = webArgs.port || namespaceConfig.port;
    const serverProcess = new background_1.WebServerProcess({
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
async function startWebServer(webArgs) {
    // Handle background mode
    if (webArgs.background) {
        return startWebServerBackground(webArgs);
    }
    const projectPath = process.cwd();
    // Ensure dist is fresh before starting server (auto-rebuild if needed)
    // This guarantees src changes are reflected without manual user intervention
    const packageJsonPath = path.join(projectPath, 'package.json');
    const isRunningFromPackage = require.main?.filename?.includes('dist/cli/index.js');
    if (isRunningFromPackage) {
        // We're running from dist, check freshness
        const projectRoot = path.resolve(projectPath);
        const freshnessResult = (0, dist_freshness_1.ensureDistFresh)(projectRoot, { silent: false, copyPublic: true });
        if (!freshnessResult.fresh && freshnessResult.error) {
            console.error('[Web] Failed to ensure dist freshness:', freshnessResult.error);
            process.exit(1);
        }
        if (freshnessResult.rebuilt) {
            console.log('[Web] dist rebuilt successfully, continuing with fresh build');
        }
        // Ensure public files are copied
        if (!(0, dist_freshness_1.checkPublicFilesCopied)(projectRoot)) {
            console.log('[Web] Public files not found, copying...');
            const { execSync } = require('child_process');
            try {
                execSync('cp -r src/web/public dist/web/', { cwd: projectRoot, stdio: 'pipe' });
            }
            catch (e) {
                console.warn('[Web] Warning: Could not copy public files:', e);
            }
        }
    }
    // Build namespace configuration
    const namespaceConfig = (0, namespace_1.buildNamespaceConfig)({
        autoDerive: true,
        namespace: webArgs.namespace,
        projectRoot: projectPath,
        port: webArgs.port,
    });
    const port = webArgs.port || namespaceConfig.port;
    // E2E isolation: override stateDir if PM_E2E_STATE_DIR is set
    // This prevents E2E tests from polluting real user state
    // Must be defined BEFORE queue store creation since FileQueueStore uses it
    const effectiveStateDir = process.env.PM_E2E_STATE_DIR || namespaceConfig.stateDir;
    const isE2eMode = !!process.env.PM_E2E_STATE_DIR;
    // Determine queue store mode (priority: CLI flag > env var > default 'file')
    let storeMode = 'file'; // Default to file-based persistent store
    if (webArgs.storeMode) {
        storeMode = webArgs.storeMode;
    }
    else if (process.env.PM_WEB_STORE_MODE) {
        const envMode = process.env.PM_WEB_STORE_MODE.toLowerCase();
        if (envMode === 'dynamodb' || envMode === 'file' || envMode === 'memory') {
            storeMode = envMode;
        }
    }
    else if (webArgs.noDynamodb || process.env.PM_WEB_NO_DYNAMODB === '1') {
        // Legacy support for --no-dynamodb flag
        storeMode = 'memory';
    }
    else if (process.env.PM_WEB_DYNAMODB === '1') {
        // Legacy support for PM_WEB_DYNAMODB env var
        storeMode = 'dynamodb';
    }
    // Create appropriate queue store based on mode
    let queueStore;
    let queueStoreType;
    if (storeMode === 'memory') {
        console.log('[QueueStore] Using in-memory store (non-persistent)');
        queueStore = new in_memory_queue_store_1.InMemoryQueueStore({
            namespace: namespaceConfig.namespace,
        });
        queueStoreType = 'memory';
    }
    else if (storeMode === 'dynamodb') {
        // Try to create DynamoDB-based store with fallback to file on connection error
        try {
            const dynamoStore = new index_1.QueueStore({
                namespace: namespaceConfig.namespace,
            });
            await dynamoStore.ensureTable();
            queueStore = dynamoStore;
            queueStoreType = 'dynamodb';
            console.log(`[QueueStore] Using DynamoDB: ${dynamoStore.getEndpoint()}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
                console.warn('[QueueStore] DynamoDB connection failed, falling back to file store');
                console.warn('[QueueStore] To use DynamoDB, start DynamoDB Local: docker-compose up -d dynamodb');
                const fileStore = new file_queue_store_1.FileQueueStore({
                    namespace: namespaceConfig.namespace,
                    stateDir: effectiveStateDir,
                });
                await fileStore.ensureTable();
                queueStore = fileStore;
                queueStoreType = 'file';
                console.log(`[QueueStore] Using file store: ${fileStore.getEndpoint()}`);
            }
            else {
                throw error;
            }
        }
    }
    else {
        // Default: file-based persistent store
        const fileStore = new file_queue_store_1.FileQueueStore({
            namespace: namespaceConfig.namespace,
            stateDir: effectiveStateDir,
        });
        await fileStore.ensureTable();
        queueStore = fileStore;
        queueStoreType = 'file';
        console.log(`[QueueStore] Using file store: ${fileStore.getEndpoint()}`);
    }
    // =========================================================================
    // PREFLIGHT CHECK: Fail-fast executor configuration validation
    // Per spec: All auth/config issues must fail fast, not timeout
    // =========================================================================
    console.log('[Preflight] Running executor preflight checks...');
    // Default to 'auto' mode: check what executors are available
    const preflightReport = (0, executor_preflight_1.runPreflightChecks)('auto');
    if (!preflightReport.can_proceed) {
        // FATAL: No executor configured
        console.error('');
        console.error('='.repeat(60));
        console.error('  EXECUTOR PREFLIGHT FAILED');
        console.error('='.repeat(60));
        console.error('');
        console.error('  No executor is configured. At least one of the following is required:');
        console.error('');
        console.error('  Option 1: Claude Code CLI');
        console.error('    $ npm install -g @anthropic-ai/claude-code');
        console.error('    $ claude login');
        console.error('');
        console.error('  Option 2: OpenAI API Key');
        console.error('    $ export OPENAI_API_KEY=sk-...');
        console.error('');
        console.error('  Option 3: Anthropic API Key');
        console.error('    $ export ANTHROPIC_API_KEY=sk-ant-...');
        console.error('');
        for (const err of preflightReport.fatal_errors) {
            console.error(`  [${err.code}] ${err.message}`);
            if (err.fix_hint) {
                console.error(`    Fix: ${err.fix_hint}`);
            }
        }
        console.error('');
        console.error('='.repeat(60));
        console.error('');
        process.exit(1);
    }
    // Log successful checks
    for (const check of preflightReport.checks) {
        if (check.ok) {
            console.log(`[Preflight] [OK] ${check.message}`);
        }
    }
    console.log('[Preflight] Executor preflight checks passed');
    console.log('');
    // Create TaskExecutor and QueuePoller
    const taskExecutor = createTaskExecutor(projectPath);
    const poller = new index_1.QueuePoller(queueStore, taskExecutor, {
        pollIntervalMs: 1000,
        recoverOnStartup: true,
        projectRoot: projectPath,
    });
    // Set up poller event listeners
    poller.on('started', () => {
        console.log('[Runner] Queue poller started');
    });
    poller.on('claimed', (item) => {
        console.log(`[Runner] Claimed task: ${item.task_id}`);
    });
    poller.on('completed', (item) => {
        console.log(`[Runner] Completed task: ${item.task_id}`);
    });
    poller.on('error', (item, error) => {
        console.error(`[Runner] Task ${item.task_id} error:`, error.message);
    });
    poller.on('stale-recovered', (count) => {
        console.log(`[Runner] Recovered ${count} stale tasks`);
    });
    const server = new server_1.WebServer({
        port,
        queueStore,
        sessionId: generateWebSessionId(),
        namespace: namespaceConfig.namespace,
        projectRoot: projectPath,
        stateDir: effectiveStateDir,
        queueStoreType,
    });
    console.log(`Starting Web UI server on port ${port}...`);
    console.log(`Namespace: ${namespaceConfig.namespace}`);
    if (isE2eMode) {
        console.log(`[E2E MODE] State directory: ${effectiveStateDir}`);
    }
    else {
        console.log(`State directory: ${effectiveStateDir}`);
    }
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
    // Self-test mode: PM_AUTO_SELFTEST=true
    if (process.env.PM_AUTO_SELFTEST === 'true') {
        console.log('[selftest] PM_AUTO_SELFTEST=true detected. Running self-test mode...');
        const sessionId = `selftest-${Date.now()}`;
        const { report, exitCode } = await (0, selftest_runner_1.runSelftest)(queueStore, sessionId, projectPath);
        // Graceful shutdown after selftest
        await poller.stop();
        await server.stop();
        console.log(`[selftest] Self-test complete. Exiting with code ${exitCode}.`);
        process.exit(exitCode);
        return; // unreachable but satisfies type checker
    }
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
 * Parse web-stop arguments
 */
function parseWebStopArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--namespace' && args[i + 1]) {
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
 * Stop background Web UI server
 * Per spec/19_WEB_UI.md lines 400-432
 */
async function stopWebServer(args) {
    const projectPath = process.cwd();
    // Build namespace configuration
    const namespaceConfig = (0, namespace_1.buildNamespaceConfig)({
        autoDerive: true,
        namespace: args.namespace,
        projectRoot: projectPath,
    });
    const pidManager = new background_1.PidFileManager(projectPath);
    const stopCmd = new background_1.WebStopCommand(pidManager);
    console.log(`Stopping Web UI server (namespace: ${namespaceConfig.namespace})...`);
    const result = await stopCmd.execute(namespaceConfig.namespace);
    switch (result.exitCode) {
        case background_1.WebStopExitCode.SUCCESS:
            console.log(result.message);
            if (result.pid) {
                console.log(`PID: ${result.pid}`);
            }
            process.exit(0);
            break;
        case background_1.WebStopExitCode.PID_FILE_NOT_FOUND:
            console.error(result.message);
            console.error(`PID file location: ${pidManager.getPidFilePath(namespaceConfig.namespace)}`);
            process.exit(1);
            break;
        case background_1.WebStopExitCode.FORCE_KILLED:
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
            case 'web-stop': {
                // Per spec/19_WEB_UI.md lines 400-432
                const webStopArgs = parseWebStopArgs(restArgs);
                await stopWebServer(webStopArgs);
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
            case 'selftest': {
                // Run selftest mode per SELFTEST_AI_JUDGE.md specification
                const ciMode = restArgs.includes('--ci');
                const baseDir = process.cwd();
                console.log(`\n[selftest] Starting selftest mode (${ciMode ? 'CI' : 'Full'})...\n`);
                // Use InMemoryQueueStore for selftest isolation
                const queueStore = new in_memory_queue_store_1.InMemoryQueueStore({
                    namespace: `selftest-${Date.now()}`,
                });
                try {
                    const { report, exitCode, jsonPath, mdPath } = await (0, selftest_runner_1.runSelftestWithAIJudge)(queueStore, { ci: ciMode, baseDir });
                    console.log(`\n[selftest] JSON report: ${jsonPath}`);
                    console.log(`[selftest] Markdown report: ${mdPath}`);
                    process.exit(exitCode);
                }
                catch (error) {
                    console.error(`[selftest] Error: ${error.message}`);
                    process.exit(1);
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